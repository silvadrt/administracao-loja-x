// Testes do Financeiro (/api/contributions):
// o filtro por ano + mês busca o mês exato ("2026-11") — antes o servidor
// montava "2026-11-%" e a tabela vinha vazia. A escrita é permitida a
// admin, venerável e tesoureiro (como no Caixa); os demais perfis recebem 403.
import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { makePool, jsonResponse, iniciarServidor } from "./helpers/fake-pool.js";

const SENHA = "senha-de-teste-com-14-caracteres";
const HASH = bcrypt.hashSync(SENHA, 10);
const ID_EXISTENTE = "11111111-1111-4111-8111-111111111111";

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

function poolFinanceiro(usuario) {
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    [
      /FROM contributions c/,
      jsonResponse([
        {
          id: ID_EXISTENTE,
          contributor_name: "Irmão Teste",
          reference_month: "2026-11",
          contribution_type: "mensalidade",
          amount: 120,
          status: "pendente",
        },
      ]),
    ],
    [
      /INSERT INTO contributions/,
      jsonResponse([{ id: ID_EXISTENTE, reference_month: "2026-11" }]),
    ],
    [
      /DELETE FROM contributions WHERE id = \$1 RETURNING id/,
      (text, params) => (params[0] === ID_EXISTENTE ? jsonResponse([{ id: ID_EXISTENTE }]) : { rows: [], rowCount: 0 }),
    ],
    [/DELETE FROM contributions WHERE reference_month = \$1/, { rows: [], rowCount: 7 }],
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

async function comServidor(role, usar) {
  const pool = poolFinanceiro(usuarioCom(role));
  const app = createApp({ pool });
  const { base, fechar } = await iniciarServidor(app);
  try {
    await usar(base, pool);
  } finally {
    await fechar();
  }
}

test("filtro por ano + mês busca o mês exato e devolve os lançamentos", async () => {
  await comServidor("tesoureiro", async (base, pool) => {
    const headers = await entrar(base);

    const r = await fetch(`${base}/api/contributions?ano=2026&mes=11`, { headers });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.items.length, 1);
    assert.equal(corpo.items[0].reference_month, "2026-11");

    const consulta = pool.calls.filter((c) => c.text.includes("FROM contributions c")).at(-1);
    assert.ok(consulta, "consulta de contribuições executada");
    assert.equal(consulta.params[0], "2026", "o filtro de ano vai como prefixo");
    assert.equal(consulta.params[1], "2026-11", "o filtro de mês busca o mês exato");

    // Somente o ano continua trazendo o ano inteiro (mês vazio).
    const r2 = await fetch(`${base}/api/contributions?ano=2026`, { headers });
    assert.equal(r2.status, 200);
    const consulta2 = pool.calls.filter((c) => c.text.includes("FROM contributions c")).at(-1);
    assert.equal(consulta2.params[1], "", "sem mês escolhido, não filtra mês");
  });
});

test("venerável lança contribuição no Financeiro", async () => {
  await comServidor("veneravel", async (base) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/contributions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        contributor_name: "Irmão Teste",
        reference_month: "2026-11",
        contribution_type: "mensalidade",
        amount: 120,
        due_date: "2026-11-10",
      }),
    });
    assert.equal(r.status, 201);
  });
});

test("secretário não lança contribuição no Financeiro", async () => {
  await comServidor("secretario", async (base) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/contributions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        contributor_name: "Irmão Teste",
        reference_month: "2026-11",
        contribution_type: "mensalidade",
        amount: 120,
        due_date: "2026-11-10",
      }),
    });
    assert.equal(r.status, 403);
  });
});

test("o administrador exclui um lançamento do Financeiro", async () => {
  await comServidor("admin", async (base, pool) => {
    const headers = await entrar(base);

    const r = await fetch(`${base}/api/contributions/${ID_EXISTENTE}`, { method: "DELETE", headers });
    assert.equal(r.status, 204);

    const del = pool.calls.filter((c) => c.text.startsWith("DELETE FROM contributions")).at(-1);
    assert.ok(del, "DELETE executado no banco");
    assert.equal(del.params[0], ID_EXISTENTE);

    const aud = pool.calls.filter((c) => c.text.includes("INSERT INTO audit_log")).at(-1);
    assert.ok(aud, "exclusão registrada na auditoria");
    assert.equal(aud.params[1], "delete");
  });
});

test("lançamento inexistente devolve 404 na exclusão", async () => {
  await comServidor("admin", async (base) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/contributions/99999999-9999-4999-8999-999999999999`, {
      method: "DELETE",
      headers,
    });
    assert.equal(r.status, 404);
  });
});

test("venerável e tesoureiro não excluem lançamentos do Financeiro", async () => {
  for (const role of ["veneravel", "tesoureiro"]) {
    await comServidor(role, async (base, pool) => {
      const headers = await entrar(base);

      const r = await fetch(`${base}/api/contributions/${ID_EXISTENTE}`, { method: "DELETE", headers });
      assert.equal(r.status, 403, `perfil ${role} não pode excluir um lançamento`);

      const lote = await fetch(`${base}/api/contributions/remove-month`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reference_month: "2026-11" }),
      });
      assert.equal(lote.status, 403, `perfil ${role} não pode remover o mês`);

      assert.ok(
        pool.calls.every((c) => !c.text.startsWith("DELETE FROM contributions")),
        "nenhum DELETE chegou ao banco",
      );
    });
  }
});

test("o administrador remove as mensalidades do mês em lote", async () => {
  await comServidor("admin", async (base, pool) => {
    const headers = await entrar(base);

    const r = await fetch(`${base}/api/contributions/remove-month`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ reference_month: "2026-11" }),
    });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.removed, 7);

    const del = pool.calls.filter((c) => c.text.includes("AND contribution_type = 'mensalidade'")).at(-1);
    assert.ok(del, "DELETE em lote executado");
    assert.equal(del.params[0], "2026-11");

    const aud = pool.calls.filter((c) => c.text.includes("INSERT INTO audit_log")).at(-1);
    assert.equal(aud.params[1], "remove_month");
  });
});

test("a remoção do mês valida o formato e nada apaga com mês inválido", async () => {
  await comServidor("admin", async (base, pool) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/contributions/remove-month`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ reference_month: "2026-13" }),
    });
    assert.equal(r.status, 400);
    assert.ok(
      pool.calls.every((c) => !c.text.startsWith("DELETE FROM contributions")),
      "mês inválido não chega ao banco",
    );
  });
});

test("taxa extra é gerada em lote para todos os irmãos ativos", async () => {
  await comServidor("tesoureiro", async (base, pool) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/contributions/generate-charge`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        contribution_type: "taxa_extra",
        description: "Reforma do Templo",
        reference_month: "2026-11",
        amount: 50,
      }),
    });
    assert.equal(r.status, 201);
    const ins = pool.calls.find((c) => c.text.includes("INSERT INTO contributions") && c.text.includes("FROM brothers b"));
    assert.ok(ins, "INSERT em lote executado");
    assert.deepEqual(ins.params.slice(0, 4), ["2026-11", "taxa_extra", "Reforma do Templo", 50]);
    assert.equal(ins.params[6], null, "sem escolha, vale para todos os ativos");
  });
});

test("taxa extra pode ser gerada só para os irmãos escolhidos", async () => {
  await comServidor("tesoureiro", async (base, pool) => {
    const headers = await entrar(base);
    const corpo = {
      contribution_type: "taxa_extra",
      description: "Jantar",
      reference_month: "2026-11",
      amount: 30,
    };
    const vazio = await fetch(`${base}/api/contributions/generate-charge`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ...corpo, brother_ids: [] }),
    });
    assert.equal(vazio.status, 400, "lista vazia é recusada");

    const r = await fetch(`${base}/api/contributions/generate-charge`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ...corpo, brother_ids: [ID_EXISTENTE] }),
    });
    assert.equal(r.status, 201);
    const ins = pool.calls.filter((c) => c.text.includes("INSERT INTO contributions")).at(-1);
    assert.deepEqual(ins.params[6], [ID_EXISTENTE]);
  });
});

test("secretário não gera cobrança em lote", async () => {
  await comServidor("secretario", async (base) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/contributions/generate-charge`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ contribution_type: "taxa_extra", description: "X teste", reference_month: "2026-11", amount: 10 }),
    });
    assert.equal(r.status, 403);
  });
});

test("relatório de quem deve soma as pendências por irmão", async () => {
  await comServidor("tesoureiro", async (base, pool) => {
    const headers = await entrar(base);
    const r = await fetch(`${base}/api/contributions/devedores`, { headers });
    assert.equal(r.status, 200);
    const consulta = pool.calls.find((c) => c.text.includes("GROUP BY c.brother_id"));
    assert.ok(consulta, "consulta agrupada executada");
    assert.match(consulta.text, /WHERE c\.status = 'pendente'/);
  });
});
