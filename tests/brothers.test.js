import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { makePool, jsonResponse, erroPg, iniciarServidor } from "./helpers/fake-pool.js";

const SENHA = "senha-de-teste-com-14-caracteres";

function usuarioCom(role) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Usuário Teste",
    email: "usuario@teste.org",
    password_hash: bcrypt.hashSync(SENHA, 10),
    role,
    active: true,
    must_change_password: false,
  };
}

const IRMAO_EXISTENTE = {
  id: "33333333-3333-4333-8333-333333333333",
  full_name: "Irmão de Teste",
  cim: "LX-999",
  birth_date: null,
  degree: "Mestre",
  address: null,
  phone: null,
  email: null,
  status: "ativo",
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function poolBrothers({ duplicado = false, duplicadoNoPatch = false } = {}) {
  const usuario = usuarioCom("admin");
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/INSERT INTO brothers/, () => {
      if (duplicado) throw erroPg("23505");
      return jsonResponse([IRMAO_EXISTENTE]);
    }],
    [/UPDATE brothers/, () => {
      if (duplicadoNoPatch) throw erroPg("23505");
      return jsonResponse([{ ...IRMAO_EXISTENTE, full_name: "Nome Atualizado" }]);
    }],
    [/SELECT[\s\S]*FROM brothers WHERE id = \$1/, jsonResponse([IRMAO_EXISTENTE])],
    [/FROM brothers/, jsonResponse([IRMAO_EXISTENTE])],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
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

test("listar irmãos devolve itens", async () => {
  const app = createApp({ pool: poolBrothers() });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/brothers?q=teste`, { headers });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.items.length, 1);
    assert.equal(corpo.items[0].full_name, "Irmão de Teste");
  } finally {
    await fechar();
  }
});

test("criar irmão valida os dados e devolve 201", async () => {
  const app = createApp({ pool: poolBrothers() });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const headers = await entrar(base);

    const invalido = await fetch(`${base}/api/brothers`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "" }),
    });
    assert.equal(invalido.status, 400);

    const valido = await fetch(`${base}/api/brothers`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Irmão de Teste", cim: "LX-999", email: "" }),
    });
    assert.equal(valido.status, 201);
    const corpo = await valido.json();
    assert.equal(corpo.item.id, IRMAO_EXISTENTE.id);
  } finally {
    await fechar();
  }
});

test("criar irmão com CIM duplicado devolve 409", async () => {
  const app = createApp({ pool: poolBrothers({ duplicado: true }) });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/brothers`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Outro Irmão", cim: "LX-999" }),
    });
    assert.equal(r.status, 409);
  } finally {
    await fechar();
  }
});

test("perfil sem permissão não cria irmãos", async () => {
  const usuario = usuarioCom("fraternidade");
  const pool = makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
  ]);
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: usuario.email, password: SENHA }),
    });
    const { access_token } = await login.json();

    const r = await fetch(`${base}/api/brothers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Novo Irmão" }),
    });
    assert.equal(r.status, 403);
  } finally {
    await fechar();
  }
});

test("atualizar irmão inexistente devolve 404", async () => {
  const pool = makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuarioCom("admin")])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuarioCom("admin")])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE brothers/, { rows: [], rowCount: 0 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
  ]);
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "usuario@teste.org", password: SENHA }),
    });
    const { access_token } = await login.json();

    const r = await fetch(`${base}/api/brothers/44444444-4444-4444-8444-444444444444`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "Nome Novo" }),
    });
    assert.equal(r.status, 404);
  } finally {
    await fechar();
  }
});
