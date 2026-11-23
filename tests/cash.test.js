// Testes do Caixa (/api/cash) — regra da v0.4.0 (decisão do responsável):
// o saldo total da Loja junta as contribuições pagas e os lançamentos
// avulsos, mas o Tronco de Beneficência tem saldo próprio (só sai pela
// beneficência) e o "disponível" da Loja é o fundo geral.
import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { makePool, jsonResponse, iniciarServidor } from "./helpers/fake-pool.js";

const SENHA = "senha-de-teste-com-14-caracteres";
const HASH = bcrypt.hashSync(SENHA, 10);
const ID_LANCAMENTO = "44444444-4444-4444-8444-444444444444";

function usuarioCom(role) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    full_name: "Usuário Teste",
    email: "usuario@teste.org",
    password_hash: HASH,
    role,
    active: true,
    must_change_password: false,
  };
}

// Saldos acumulados de exemplo:
//   fundo geral  = 3.000,00 (mensalidades) + 260,00 (entradas) − 2.366,35 (saídas) = 893,65
//   tronco       = 500,00 (tronco pago) − 120,00 (beneficência)                     = 380,00
const SALDOS = {
  contribuicoes_pagas: 3500,
  entradas_avulsas: 260,
  geral_entradas: 3260,
  geral_saidas: 2366.35,
  tronco_entradas: 500,
  tronco_saidas: 120,
};

function poolCaixa(role, extras = []) {
  const usuario = usuarioCom(role);
  return makePool([
    [/FROM app_users u[\s\S]*WHERE u\.email = \$1/, jsonResponse([usuario])],
    [/FROM app_users u[\s\S]*WHERE u\.id = \$1/, jsonResponse([usuario])],
    [/INSERT INTO audit_log/, { rows: [], rowCount: 1 }],
    [/UPDATE app_users SET last_login_at/, { rows: [], rowCount: 1 }],
    [/INSERT INTO refresh_tokens/, { rows: [], rowCount: 1 }],
    ...extras,
    [/AS lancamentos\s+FROM cash_movements/, jsonResponse([{ entradas: 200, saidas: 120, lancamentos: 3 }])],
    [/GROUP BY category, kind/, jsonResponse([{ category: "luz", kind: "saida", total: 120, n: 1 }])],
    [/AS tronco_saidas/, jsonResponse([SALDOS])],
    [/WHERE data < \$1::date/, jsonResponse([{ geral: 100, tronco: 50 }])],
    [
      /WHERE data BETWEEN \$1::date AND \$2::date\s+ORDER BY data, created_at/,
      jsonResponse([
        { origem: "contribuicao", kind: "entrada", category: "mensalidade", amount: 180, fundo: "geral", data: "2026-10-05" },
        { origem: "contribuicao", kind: "entrada", category: "tronco", amount: 40, fundo: "tronco", data: "2026-10-06" },
        { origem: "caixa", kind: "saida", category: "luz", amount: 90.5, fundo: "geral", data: "2026-10-10" },
        { origem: "caixa", kind: "saida", category: "beneficencia", amount: 30, fundo: "tronco", data: "2026-10-12" },
      ]),
    ],
    [/INSERT INTO cash_movements/, jsonResponse([{ id: ID_LANCAMENTO }])],
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

async function comServidor(role, usar, extras) {
  const pool = poolCaixa(role, extras);
  const { base, fechar } = await iniciarServidor(createApp({ pool }));
  try {
    await usar(base, await entrar(base), pool);
  } finally {
    await fechar();
  }
}

const json = (headers) => ({ ...headers, "Content-Type": "application/json" });

test("resumo separa o Tronco de Beneficência do disponível da Loja", async () => {
  await comServidor("tesoureiro", async (base, headers) => {
    const r = await fetch(`${base}/api/cash/resumo?ano=2026`, { headers });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.saldo, 80, "saldo das entradas/saídas avulsas do período");
    const a = corpo.acumulado;
    assert.equal(a.geral.saldo, 893.65);
    assert.equal(a.tronco.saldo, 380);
    assert.equal(a.total, 1273.65, "o total da Loja inclui o tronco");
    assert.equal(a.disponivel, 893.65, "o disponível é só o fundo geral");
    assert.equal(a.contribuicoes_pagas, 3500);
  });
});

test("extrato do período traz saldo anterior, movimento, saldo final e saldo por fundo", async () => {
  await comServidor("tesoureiro", async (base, headers) => {
    const r = await fetch(`${base}/api/cash/extrato?ano=2026&mes=10`, { headers });
    assert.equal(r.status, 200);
    const e = await r.json();
    assert.equal(e.de, "2026-10-01");
    assert.equal(e.ate, "2026-10-31");
    assert.equal(e.saldo_anterior, 150);
    assert.equal(e.entradas, 220);
    assert.equal(e.saidas, 120.5);
    assert.equal(e.saldo_final, 249.5);
    assert.deepEqual(e.fundos.tronco, { anterior: 50, entradas: 40, saidas: 30, final: 60 });
    assert.deepEqual(e.fundos.geral, { anterior: 100, entradas: 180, saidas: 90.5, final: 189.5 });
    // Mais recente primeiro; o saldo da linha é o saldo depois dela.
    assert.equal(e.items[0].category, "beneficencia");
    assert.equal(e.items[0].saldo, 249.5);
    assert.equal(e.items.at(-1).saldo, 330);
  });
});

test("retirada do saldo da Loja exige a ata que a aprovou", async () => {
  await comServidor("tesoureiro", async (base, headers, pool) => {
    const lancamento = {
      kind: "saida",
      category: "retirada",
      description: "Retirada para a reforma",
      amount: 500,
      movement_date: "2026-10-20",
    };
    const sem = await fetch(`${base}/api/cash`, { method: "POST", headers: json(headers), body: JSON.stringify(lancamento) });
    assert.equal(sem.status, 400);
    assert.ok(pool.calls.every((c) => !c.text.includes("INSERT INTO cash_movements")), "nada gravado sem a ata");

    const com = await fetch(`${base}/api/cash`, {
      method: "POST",
      headers: json(headers),
      body: JSON.stringify({ ...lancamento, approval_ref: "Ata nº 12/2026" }),
    });
    assert.equal(com.status, 201);
    const ins = pool.calls.find((c) => c.text.includes("INSERT INTO cash_movements"));
    assert.equal(ins.params[6], "Ata nº 12/2026");
  });
});

test("beneficência só sai e tronco só entra", async () => {
  await comServidor("tesoureiro", async (base, headers) => {
    const base1 = { description: "Teste", amount: 10, movement_date: "2026-10-20" };
    const r1 = await fetch(`${base}/api/cash`, {
      method: "POST",
      headers: json(headers),
      body: JSON.stringify({ ...base1, kind: "entrada", category: "beneficencia" }),
    });
    assert.equal(r1.status, 400);
    const r2 = await fetch(`${base}/api/cash`, {
      method: "POST",
      headers: json(headers),
      body: JSON.stringify({ ...base1, kind: "saida", category: "tronco" }),
    });
    assert.equal(r2.status, 400);
  });
});

test("editar uma retirada antiga para apagar a ata é recusado", async () => {
  await comServidor(
    "tesoureiro",
    async (base, headers, pool) => {
      const r = await fetch(`${base}/api/cash/${ID_LANCAMENTO}`, {
        method: "PATCH",
        headers: json(headers),
        body: JSON.stringify({ approval_ref: "" }),
      });
      assert.equal(r.status, 400);
      assert.ok(pool.calls.every((c) => !c.text.startsWith("UPDATE cash_movements")));
    },
    [[/FROM cash_movements WHERE id = \$1/,jsonResponse([{ kind: "saida", category: "retirada", approval_ref: "Ata 1", amount: 50 }])]],
  );
});

test("perfil sem acesso à tesouraria recebe 403 no resumo e no extrato", async () => {
  await comServidor("secretario", async (base, headers) => {
    assert.equal((await fetch(`${base}/api/cash/resumo`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/api/cash/extrato`, { headers })).status, 403);
  });
});

test("quando o disponível fica negativo, a Loja deve a diferença ao tronco", async () => {
  // Exemplo: tronco com R$ 3.000 e só R$ 2.000 no caixa → a Loja deve R$ 1.000.
  await comServidor(
    "tesoureiro",
    async (base, headers) => {
      const a = (await (await fetch(`${base}/api/cash/resumo`, { headers })).json()).acumulado;
      assert.equal(a.tronco.saldo, 3000, "o saldo do tronco não é limitado pelo caixa");
      assert.equal(a.total, 2000);
      assert.equal(a.disponivel, -1000);
      assert.equal(a.devido_ao_tronco, 1000);
    },
    [[/AS tronco_saidas/, jsonResponse([{ geral_entradas: 500, geral_saidas: 1500, tronco_entradas: 3000, tronco_saidas: 0 }])]],
  );
});

test("retirada do Tronco exige ata e só pode ser saída", async () => {
  await comServidor("tesoureiro", async (base, headers) => {
    const l = { kind: "saida", category: "retirada_tronco", description: "Ajuda aprovada", amount: 200, movement_date: "2026-10-20" };
    const sem = await fetch(`${base}/api/cash`, { method: "POST", headers: json(headers), body: JSON.stringify(l) });
    assert.equal(sem.status, 400);
    const entrada = await fetch(`${base}/api/cash`, {
      method: "POST",
      headers: json(headers),
      body: JSON.stringify({ ...l, kind: "entrada", approval_ref: "Ata 3" }),
    });
    assert.equal(entrada.status, 400);
    const ok = await fetch(`${base}/api/cash`, {
      method: "POST",
      headers: json(headers),
      body: JSON.stringify({ ...l, approval_ref: "Ata nº 3/2026" }),
    });
    assert.equal(ok.status, 201);
  });
});
