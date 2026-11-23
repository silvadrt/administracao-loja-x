// Testes da v0.5.0:
// correção financeira com aprovação do Venerável, pagamento parcial,
// atas só para Venerável/Secretário e travadas depois de arquivadas,
// frequência só de sessões e controle de envios ao GOB.
import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { makePool, jsonResponse, iniciarServidor } from "./helpers/fake-pool.js";

const SENHA = "senha-de-teste-com-14-caracteres";
const HASH = bcrypt.hashSync(SENHA, 10);
const ID = "55555555-5555-4555-8555-555555555555";

const CONTRIBUICAO = {
  id: ID, brother_id: null, contributor_name: "Irmão Teste", reference_month: "2026-10",
  contribution_type: "mensalidade", description: null, amount: 180, due_date: "2026-10-10", status: "pendente", notes: null,
};
const LANCAMENTO = {
  id: ID, kind: "saida", category: "luz", description: "Conta de luz", amount: 90,
  movement_date: "2026-10-05", reference_month: null, approval_ref: null, notes: null,
};

function montarPool(role, extras = []) {
  const usuario = {
    id: "66666666-6666-4666-8666-666666666666", full_name: "Usuário Teste", email: "usuario@teste.org",
    password_hash: HASH, role, active: true, must_change_password: false,
  };
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    ...extras,
    [/FROM contributions WHERE id = \$1/, jsonResponse([CONTRIBUICAO])],
    [/FROM cash_movements WHERE id = \$1/, jsonResponse([LANCAMENTO])],
    [/INSERT INTO financial_corrections/, jsonResponse([{ id: "77777777-7777-4777-8777-777777777777" }])],
    [/^UPDATE contributions SET/, jsonResponse([{ ...CONTRIBUICAO, status: "pago" }])],
    [/^UPDATE cash_movements SET/, jsonResponse([LANCAMENTO])],
  ]);
}

async function comServidor(role, usar, extras) {
  const pool = montarPool(role, extras);
  const { base, fechar } = await iniciarServidor(createApp({ pool }));
  try {
    const r = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "usuario@teste.org", password: SENHA }),
    });
    const { access_token } = await r.json();
    const headers = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
    const api = (metodo, caminho, corpo) =>
      fetch(`${base}/api${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
    await usar(api, pool);
  } finally {
    await fechar();
  }
}

const gravou = (pool, re) => pool.calls.some((c) => re.test(c.text));

// ---------- Correção financeira ----------

test("tesoureiro marca como pago direto (rotina, sem aprovação)", async () => {
  await comServidor("tesoureiro", async (api, pool) => {
    const r = await api("PATCH", `/contributions/${ID}`, { status: "pago" });
    assert.equal(r.status, 200);
    assert.ok(gravou(pool, /^UPDATE contributions SET/));
    assert.ok(!gravou(pool, /INSERT INTO financial_corrections/));
  });
});

test("tesoureiro mudando o valor gera pedido para o Venerável e não altera o lançamento", async () => {
  await comServidor("tesoureiro", async (api, pool) => {
    const sem = await api("PATCH", `/contributions/${ID}`, { amount: 150 });
    assert.equal(sem.status, 400, "sem motivo é recusado");

    const r = await api("PATCH", `/contributions/${ID}`, { amount: 150, motivo_correcao: "Valor lançado errado" });
    assert.equal(r.status, 202);
    assert.equal((await r.json()).pendente_aprovacao, true);
    assert.ok(gravou(pool, /INSERT INTO financial_corrections/));
    assert.ok(gravou(pool, /INSERT INTO notifications[\s\S]*'veneravel'/), "Venerável é avisado");
    assert.ok(!gravou(pool, /^UPDATE contributions SET/), "o lançamento não muda antes da aprovação");
  });
});

test("tesoureiro excluindo um lançamento avulso também vira pedido", async () => {
  await comServidor("tesoureiro", async (api, pool) => {
    const r = await api("DELETE", `/cash/${ID}?motivo=${encodeURIComponent("Lançado em duplicidade")}`);
    assert.equal(r.status, 202);
    assert.ok(!gravou(pool, /^DELETE FROM cash_movements/));
  });
});

test("Venerável corrige direto, sem pedido", async () => {
  await comServidor("veneravel", async (api, pool) => {
    const r = await api("PATCH", `/cash/${ID}`, { amount: 95 });
    assert.equal(r.status, 200);
    assert.ok(gravou(pool, /^UPDATE cash_movements SET/));
    assert.ok(!gravou(pool, /INSERT INTO financial_corrections/));
  });
});

test("Venerável aprova o pedido e a correção é aplicada; tesoureiro não aprova", async () => {
  const pedido = [
    /SELECT \* FROM financial_corrections WHERE id = \$1/,
    jsonResponse([{ id: ID, entity_type: "cash_movement", entity_id: ID, action: "update", changes: { amount: 95 }, status: "pendente" }]),
  ];
  await comServidor(
    "tesoureiro",
    async (api) => {
      assert.equal((await api("POST", `/corrections/${ID}/aprovar`, {})).status, 403);
    },
    [pedido],
  );
  await comServidor(
    "veneravel",
    async (api, pool) => {
      const r = await api("POST", `/corrections/${ID}/aprovar`, {});
      assert.equal(r.status, 200);
      const upd = pool.calls.find((c) => /^UPDATE cash_movements SET/.test(c.text));
      assert.ok(upd, "correção aplicada");
      assert.equal(upd.params[0], 95);
      assert.ok(gravou(pool, /UPDATE financial_corrections[\s\S]*SET status = \$2/));
    },
    [pedido],
  );
});

// ---------- Pagamento parcial ----------

test("pagamento parcial quita uma parte e deixa o restante pendente", async () => {
  await comServidor(
    "tesoureiro",
    async (api, pool) => {
      const total = await api("POST", `/contributions/${ID}/parcial`, { amount_paid: 180 });
      assert.equal(total.status, 400, "valor igual ao total é recusado");
      const r = await api("POST", `/contributions/${ID}/parcial`, { amount_paid: 100 });
      assert.equal(r.status, 201);
      const sql = pool.calls.find((c) => c.text.includes("WITH orig AS"));
      assert.equal(sql.params[1], 100);
    },
    [
      [/SELECT id, amount, status FROM contributions/, jsonResponse([{ id: ID, amount: "180.00", status: "pendente" }])],
      [/WITH orig AS/, jsonResponse([{ pago: { id: ID, amount: 100 }, restante: { id: "x", amount: 80 } }])],
    ],
  );
});

// ---------- Atas ----------

test("atas: somente Venerável e Secretário (admin e tesoureiro recebem 403)", async () => {
  for (const role of ["admin", "tesoureiro", "chanceler"]) {
    await comServidor(role, async (api) => {
      assert.equal((await api("GET", "/minutes")).status, 403, `perfil ${role}`);
    });
  }
});

test("ata arquivada não pode ser editada nem excluída", async () => {
  await comServidor(
    "veneravel",
    async (api, pool) => {
      assert.equal((await api("PATCH", `/minutes/${ID}`, { title: "Novo título" })).status, 409);
      assert.equal((await api("DELETE", `/minutes/${ID}`)).status, 409);
      assert.ok(!gravou(pool, /^UPDATE minutes SET|^DELETE FROM minutes/));
    },
    [[/SELECT status FROM minutes WHERE id = \$1/, jsonResponse([{ status: "arquivada" }])]],
  );
});

// ---------- Frequência ----------

test("frequência conta só as sessões em loja", async () => {
  await comServidor(
    "chanceler",
    async (api, pool) => {
      assert.equal((await api("GET", "/reports/frequency?year=2026")).status, 200);
      const consultas = pool.calls.filter((c) => /FROM attendance a|FROM events/.test(c.text));
      assert.ok(consultas.length >= 2);
      for (const c of consultas) assert.match(c.text, /event_type ILIKE 'Sess%'/);
    },
    [
      [/count\(\*\)::int AS n FROM events/, jsonResponse([{ n: 3 }])],
      [/FROM attendance a/, jsonResponse([])],
    ],
  );
});

// ---------- Envios ao GOB ----------

test("secretário registra envio ao GOB; tesoureiro não acessa", async () => {
  await comServidor(
    "secretario",
    async (api) => {
      const r = await api("POST", "/gob", { doc_type: "iniciacao", title: "Pedido de iniciação — candidato X", due_date: "2026-11-10" });
      assert.equal(r.status, 201);
    },
    [[/INSERT INTO gob_submissions/, jsonResponse([{ id: ID }])]],
  );
  await comServidor("tesoureiro", async (api) => {
    assert.equal((await api("GET", "/gob")).status, 403);
  });
});
