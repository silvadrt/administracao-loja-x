// Testes da Venerância (/api/officers): o quadro de oficiais traz nome,
// CIM e telefone dos irmãos em exercício — leitura restrita a admin e
// venerável. Antes, qualquer perfil autenticado conseguia ler as três
// rotas; as escritas já eram restritas.
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

function poolVenerancia(usuario) {
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    [/FROM lodge_officers lo/, jsonResponse([])],
    [/FROM mandates[\s\S]*WHERE ended_on IS NULL/, jsonResponse([])],
    [/FROM mandates m/, jsonResponse([])],
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

async function comPerfil(role, usar) {
  const pool = poolVenerancia(usuarioCom(role));
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    await usar(base, pool);
  } finally {
    await fechar();
  }
}

const ROTAS = ["/api/officers", "/api/officers/cargos", "/api/officers/mandato"];

test("venerância é leitura restrita: irmão recebe 403 nas três rotas", async () => {
  await comPerfil("irmao", async (base) => {
    const headers = await entrar(base);
    for (const rota of ROTAS) {
      const r = await fetch(base + rota, { headers });
      assert.equal(r.status, 403, `${rota} deve negar o perfil irmão`);
    }
  });
});

test("admin e venerável continuam lendo a venerância", async () => {
  for (const role of ["admin", "veneravel"]) {
    await comPerfil(role, async (base) => {
      const headers = await entrar(base);
      for (const rota of ROTAS) {
        const r = await fetch(base + rota, { headers });
        assert.equal(r.status, 200, `${rota} deve liberar o perfil ${role}`);
      }
    });
  }
});
