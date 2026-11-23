import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { makePool, jsonResponse, iniciarServidor } from "./helpers/fake-pool.js";

const SENHA = "senha-de-teste-com-14-caracteres";
const HASH = bcrypt.hashSync(SENHA, 10);

const USUARIO = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Administrador Teste",
  email: "admin@teste.org",
  password_hash: HASH,
  role: "admin",
  active: true,
  must_change_password: false,
};

function poolPadrao(usuario = USUARIO) {
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, (text, params) => jsonResponse(params[0] === usuario.email ? [usuario] : [])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE refresh_tokens SET revoked_at/, { rows: [], rowCount: 1 }],
    [/SELECT password_hash FROM app_users/, jsonResponse([{ password_hash: HASH }])],
    [/UPDATE app_users SET password_hash/, { rows: [], rowCount: 1 }],
  ]);
}

test("login com credenciais válidas devolve tokens de sessão", async () => {
  const pool = poolPadrao();
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USUARIO.email, password: SENHA }),
    });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.ok(corpo.access_token, "deve retornar access_token");
    assert.ok(corpo.refresh_token, "deve retornar refresh_token");
    assert.equal(corpo.user.role, "admin");
    assert.equal(corpo.must_change_password, false);
  } finally {
    await fechar();
  }
});

test("login com senha errada é recusado", async () => {
  const pool = poolPadrao();
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USUARIO.email, password: "senha-errada-qualquer" }),
    });
    assert.equal(r.status, 401);
  } finally {
    await fechar();
  }
});

test("login com e-mail inexistente é recusado", async () => {
  const pool = poolPadrao();
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ninguem@teste.org", password: SENHA }),
    });
    assert.equal(r.status, 401);
  } finally {
    await fechar();
  }
});

test("rotas protegidas exigem token válido", async () => {
  const pool = poolPadrao();
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const semToken = await fetch(`${base}/api/me`);
    assert.equal(semToken.status, 401);

    const comTokenFalso = await fetch(`${base}/api/me`, { headers: { Authorization: "Bearer token.invalido.aqui" } });
    assert.equal(comTokenFalso.status, 401);
  } finally {
    await fechar();
  }
});

test("login → /api/me funciona com o token emitido", async () => {
  const pool = poolPadrao();
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USUARIO.email, password: SENHA }),
    });
    const { access_token } = await login.json();

    const me = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${access_token}` } });
    assert.equal(me.status, 200);
    const dados = await me.json();
    assert.equal(dados.user.email, USUARIO.email);
  } finally {
    await fechar();
  }
});

test("usuário com troca de senha pendente fica bloqueado nas demais rotas", async () => {
  const usuario = { ...USUARIO, must_change_password: true };
  const pool = poolPadrao(usuario);
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USUARIO.email, password: SENHA }),
    });
    const { access_token, must_change_password } = await login.json();
    assert.equal(must_change_password, true);

    const blocada = await fetch(`${base}/api/brothers`, { headers: { Authorization: `Bearer ${access_token}` } });
    assert.equal(blocada.status, 403);
    const corpo = await blocada.json();
    assert.equal(corpo.code, "password_change_required");

    const liberada = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${access_token}` } });
    assert.equal(liberada.status, 200);
  } finally {
    await fechar();
  }
});

test("troca de senha recusa senha atual incorreta e aceita a correta", async () => {
  const pool = poolPadrao();
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USUARIO.email, password: SENHA }),
    });
    const { access_token } = await login.json();

    const errada = await fetch(`${base}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ current_password: "senha-errada", new_password: "nova-senha-bem-forte-123" }),
    });
    assert.equal(errada.status, 401);

    const certa = await fetch(`${base}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ current_password: SENHA, new_password: "nova-senha-bem-forte-123" }),
    });
    assert.equal(certa.status, 200);
  } finally {
    await fechar();
  }
});

test("setup-status informa true quando não há usuários e false quando já existem", async () => {
  const vazio = makePool([[/SELECT count\(\*\)::int AS n FROM app_users/, jsonResponse([{ n: 0 }])]]);
  const s1 = await iniciarServidor(createApp({ pool: vazio }));
  try {
    const r = await fetch(`${s1.base}/api/auth/setup-status`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).needs_setup, true);
  } finally {
    await s1.fechar();
  }

  const populado = makePool([[/SELECT count\(\*\)::int AS n FROM app_users/, jsonResponse([{ n: 2 }])]]);
  const s2 = await iniciarServidor(createApp({ pool: populado }));
  try {
    const r = await fetch(`${s2.base}/api/auth/setup-status`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).needs_setup, false);
  } finally {
    await s2.fechar();
  }
});

test("setup cria primeiro administrador quando o banco está vazio e bloqueia quando já existe", async () => {
  const adminCriado = { ...USUARIO, full_name: "Admin Inicial", email: "admin@lojax.edu", must_change_password: false };
  const poolVazio = makePool([
    [/INSERT INTO app_users/, jsonResponse([adminCriado])],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
  ]);
  const s1 = await iniciarServidor(createApp({ pool: poolVazio }));
  try {
    const invalido = await fetch(`${s1.base}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Admin Inicial", email: "admin@lojax.edu", password: "fraca" }),
    });
    assert.equal(invalido.status, 400);

    const r = await fetch(`${s1.base}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Admin Inicial", email: "admin@lojax.edu", password: "SenhaForte@2026" }),
    });
    assert.equal(r.status, 201);
    const corpo = await r.json();
    assert.ok(corpo.access_token);
    assert.ok(corpo.refresh_token);
    assert.equal(corpo.user.role, "admin");
    assert.equal(corpo.must_change_password, false);
    const aud = poolVazio.calls.find((c) => c.text.includes("INSERT INTO audit_log"));
    assert.equal(aud.params[1], "setup_first_admin");
  } finally {
    await s1.fechar();
  }

  const poolOcupado = makePool([[ /INSERT INTO app_users/, { rows: [], rowCount: 0 } ]]);
  const s2 = await iniciarServidor(createApp({ pool: poolOcupado }));
  try {
    const r = await fetch(`${s2.base}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Outro Admin", email: "outro@lojax.edu", password: "SenhaForte@2026" }),
    });
    assert.equal(r.status, 409);
  } finally {
    await s2.fechar();
  }
});
