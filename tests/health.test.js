import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { makePool, jsonResponse, iniciarServidor } from "./helpers/fake-pool.js";

test("/health responde ok quando o banco está acessível", async () => {
  const pool = makePool([[/(SELECT 1|FROM)/, jsonResponse([{ ok: 1 }])]]);
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.status, "ok");
    assert.equal(corpo.db, "up");
    assert.equal(corpo.service, "administracao-loja-x");
  } finally {
    await fechar();
  }
});

test("/health responde degradado quando o banco está fora", async () => {
  const pool = makePool([
    [/SELECT 1/, () => {
      throw new Error("banco indisponível");
    }],
  ]);
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 503);
    const corpo = await r.json();
    assert.equal(corpo.status, "degraded");
    assert.equal(corpo.db, "down");
  } finally {
    await fechar();
  }
});

test("rota de API inexistente devolve 404 em JSON (com login válido)", async () => {
  const usuario = {
    id: "55555555-5555-4555-8555-555555555555",
    full_name: "Usuário Teste",
    email: "usuario@teste.org",
    role: "admin",
    active: true,
    must_change_password: false,
  };
  const pool = makePool([
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
  ]);
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    // Sem login: a API protege tudo e responde 401.
    const semLogin = await fetch(`${base}/api/nao-existe`);
    assert.equal(semLogin.status, 401);

    // Com um token válido: rota inexistente responde 404 em JSON.
    const token = signAccessToken(usuario);
    const comLogin = await fetch(`${base}/api/nao-existe`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(comLogin.status, 404);
    const corpo = await comLogin.json();
    assert.ok(corpo.error);
  } finally {
    await fechar();
  }
});
