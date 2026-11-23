// Testes da agenda (/api/events):
// os filtros de data precisam ser normalizados antes de ir ao banco —
// antes, textos como "0" passavam pela checagem leniente e o PostgreSQL
// devolvia erro (HTTP 500). Datas ISO do calendário continuam funcionando.
import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { makePool, jsonResponse, iniciarServidor } from "./helpers/fake-pool.js";

const SENHA = "senha-de-teste-com-14-caracteres";
const HASH = bcrypt.hashSync(SENHA, 10);

function usuarioCom(role) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Usuário Teste",
    email: "usuario@teste.org",
    password_hash: HASH,
    role,
    active: true,
    must_change_password: false,
  };
}

function poolAgenda(usuario) {
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    [/FROM events e/, jsonResponse([{ id: "11111111-1111-4111-8111-111111111111", title: "Sessão", starts_at: "2026-10-20T22:00:00.000Z" }])],
  ]);
}

async function entrar(base) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "usuario@teste.org", password: SENHA }),
  });
  const { access_token } = await r.json();
  return { Authorization: `Bearer ${access_token}` };
}

async function comServidor(usar) {
  const pool = poolAgenda(usuarioCom("irmao"));
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    await usar(base, pool);
  } finally {
    await fechar();
  }
}

test("filtro de data ISO do calendário continua funcionando", async () => {
  await comServidor(async (base, pool) => {
    const headers = await entrar(base);
    const de = "2026-10-01T03:00:00.000Z";
    const ate = "2026-10-31T02:59:59.000Z";
    const r = await fetch(`${base}/api/events?from=${de}&to=${ate}`, { headers });
    assert.equal(r.status, 200);
    const consulta = pool.calls.filter((c) => c.text.includes("FROM events e")).at(-1);
    assert.equal(consulta.params[0], de, "data inicial repassada como veio");
    assert.equal(consulta.params[1], ate, "data final repassada como veio");
  });
});

test("valor inválido nunca chega cru ao banco (antes gerava erro 500)", async () => {
  await comServidor(async (base, pool) => {
    const headers = await entrar(base);
    for (const v of ["0", "%00", "a' OR '1'='1", "ontem", "2026-13-99"]) {
      const r = await fetch(`${base}/api/events?from=${encodeURIComponent(v)}`, { headers });
      assert.equal(r.status, 200, `from=${v} deve responder 200`);

      const consulta = pool.calls.filter((c) => c.text.includes("FROM events e")).at(-1);
      const p0 = consulta.params[0];
      assert.ok(
        p0 === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p0),
        `parâmetro deve ser nulo ou ISO normalizado (recebido: ${JSON.stringify(p0)})`,
      );
    }
  });
});
