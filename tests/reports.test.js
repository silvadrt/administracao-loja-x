// Testes do relatório individual de contribuições (/api/reports/irmao/:id):
// somente admin, venerável e tesoureiro veem qualquer irmão; o perfil "Irmão"
// vê apenas o próprio; os demais perfis recebem 403.
import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { makePool, jsonResponse, iniciarServidor } from "./helpers/fake-pool.js";

const SENHA = "senha-de-teste-com-14-caracteres";
const HASH = bcrypt.hashSync(SENHA, 10);

const IRMAO_ID = "33333333-3333-4333-8333-333333333333";
const OUTRO_ID = "44444444-4444-4444-8444-444444444444";

function usuarioCom(role, extra = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Usuário Teste",
    email: "usuario@teste.org",
    password_hash: HASH,
    role,
    active: true,
    must_change_password: false,
    ...extra,
  };
}

function poolRelatorio(usuario) {
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    [/FROM contributions c[\s\S]*WHERE c\.brother_id/, jsonResponse([])],
    [/FROM contributions/, jsonResponse([{ pago: 450, pendente: 0, isento: 0, meses_abertos: 0 }])],
    [
      /FROM brothers WHERE id = \$1/,
      jsonResponse([{ id: IRMAO_ID, full_name: "Irmão de Teste", cim: "LX-999", status: "ativo" }]),
    ],
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

async function comServidor(role, extra, usar) {
  const pool = poolRelatorio(usuarioCom(role, extra));
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    await usar(base);
  } finally {
    await fechar();
  }
}

test("secretário não abre o relatório individual de um irmão", async () => {
  await comServidor("secretario", {}, async (base) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/reports/irmao/${IRMAO_ID}?ano=2026`, { headers });
    assert.equal(r.status, 403);
  });
});

test("chanceler e fraternidade também não abrem o relatório de outro irmão", async () => {
  for (const role of ["chanceler", "fraternidade"]) {
    await comServidor(role, {}, async (base) => {
      const headers = await entrar(base);
      const r = await fetch(`${base}/api/reports/irmao/${IRMAO_ID}?ano=2026`, { headers });
      assert.equal(r.status, 403, `perfil ${role}`);
    });
  }
});

test("tesoureiro abre o relatório de qualquer irmão", async () => {
  await comServidor("tesoureiro", {}, async (base) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/reports/irmao/${IRMAO_ID}?ano=2026`, { headers });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.irmao.full_name, "Irmão de Teste");
    assert.equal(corpo.totais.pago, 450);
    assert.equal(corpo.ano, 2026);
  });
});

test("perfil Irmão vê somente o próprio relatório", async () => {
  await comServidor("irmao", { brother_id: IRMAO_ID }, async (base) => {
    const headers = await entrar(base);

    const proprio = await fetch(`${base}/api/reports/irmao/${IRMAO_ID}?ano=2026`, { headers });
    assert.equal(proprio.status, 200);

    const outro = await fetch(`${base}/api/reports/irmao/${OUTRO_ID}?ano=2026`, { headers });
    assert.equal(outro.status, 403);
  });
});
