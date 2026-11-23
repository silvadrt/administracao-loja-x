import "./helpers/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  brotherCreateSchema,
  brotherUpdateSchema,
  CASH_CATEGORY_KEYS,
  cashCreateSchema,
  CARGO_KEYS,
  changePasswordSchema,
  contributionCreateSchema,
  fraternityEventSchema,
  generateMonthSchema,
  loginSchema,
  mandateCreateSchema,
  minuteCreateSchema,
  officerSetSchema,
  ROLES,
  userCreateSchema,
  visitCreateSchema,
} from "../src/schemas.js";

test("irmão: nome mínimo de 2 caracteres", () => {
  assert.equal(brotherCreateSchema.safeParse({ full_name: "A" }).success, false);
  assert.equal(brotherCreateSchema.safeParse({ full_name: "Jo" }).success, true);
});

test("irmão: campos vazios viram null e datas exigem formato AAAA-MM-DD", () => {
  const ok = brotherCreateSchema.safeParse({ full_name: "Irmão Teste", cim: "", email: "", birth_date: "1970-05-10" });
  assert.equal(ok.success, true);
  assert.equal(ok.data.cim, null);
  assert.equal(ok.data.email, null);

  const ruim = brotherCreateSchema.safeParse({ full_name: "Irmão Teste", birth_date: "10/05/1970" });
  assert.equal(ruim.success, false);
});

test("atualização parcial: campo não enviado não vira null", () => {
  const parcial = brotherUpdateSchema.safeParse({ phone: "(61) 99999-0000" });
  assert.equal(parcial.success, true);
  assert.equal(parcial.data.phone, "(61) 99999-0000");
  assert.equal("full_name" in parcial.data, false);
});

test("login exige e-mail válido", () => {
  assert.equal(loginSchema.safeParse({ email: "sem-arroba", password: "x" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "ok@teste.org", password: "x" }).success, true);
});

test("troca de senha exige 8+ caracteres, com letra, número e símbolo", () => {
  const ok = (new_password) =>
    changePasswordSchema.safeParse({ current_password: "antiga", new_password }).success;
  assert.equal(ok("curta"), false); // menos de 8
  assert.equal(ok("senhasemnumeros!"), false); // sem número
  assert.equal(ok("senha123"), false); // sem símbolo
  assert.equal(ok("123456!@"), false); // sem letra
  assert.equal(ok("LojaX2026!"), true); // atende a tudo
});

test("contribuição: mês de referência no formato AAAA-MM e valor convertido", () => {
  assert.equal(
    contributionCreateSchema.safeParse({
      reference_month: "2026-13",
      contribution_type: "mensalidade",
      amount: 150,
    }).success,
    false,
  );

  const ok = contributionCreateSchema.safeParse({
    reference_month: "2026-10",
    contribution_type: "mensalidade",
    amount: "150.50",
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data.amount, 150.5);

  // Valor zero é recusado (decisão do pentest, F-4).
  assert.equal(
    contributionCreateSchema.safeParse({
      reference_month: "2026-10",
      contribution_type: "mensalidade",
      amount: 0,
    }).success,
    false,
  );
});

test("geração de mensalidades exige mês válido e valor maior que zero", () => {
  assert.equal(generateMonthSchema.safeParse({ reference_month: "2026-10", amount: 150 }).success, true);
  assert.equal(generateMonthSchema.safeParse({ reference_month: "outubro/2026", amount: 150 }).success, false);
  assert.equal(generateMonthSchema.safeParse({ reference_month: "2026-10" }).success, false);
  assert.equal(generateMonthSchema.safeParse({ reference_month: "2026-10", amount: 0 }).success, false);
});

test("visitação exige tipo, nome e data", () => {
  const ok = visitCreateSchema.safeParse({
    visit_type: "realizada",
    brother_name: "Irmão Exemplo",
    visit_date: "2026-10-01",
  });
  assert.equal(ok.success, true);

  const semTipo = visitCreateSchema.safeParse({
    visit_type: "qualquer",
    brother_name: "Irmão Exemplo",
    visit_date: "2026-10-01",
  });
  assert.equal(semTipo.success, false);
});

test("venerância: cargo precisa existir no catálogo e a data vem no formato AAAA-MM-DD", () => {
  const ok = officerSetSchema.safeParse({
    cargo: CARGO_KEYS[0],
    brother_id: "6f7b0d2c-1a44-4b0e-9a1e-0f9a3a6d5c11",
    term_start: "2026-01-01",
  });
  assert.equal(ok.success, true);

  assert.equal(officerSetSchema.safeParse({ cargo: "cargo_inexistente", term_start: "2026-01-01" }).success, false);
  assert.equal(
    officerSetSchema.safeParse({ cargo: CARGO_KEYS[0], term_start: "01/01/2026" }).success,
    false,
  );
});

test("venerância: troca de mandato exige nome e aceita data vazia", () => {
  const ok = mandateCreateSchema.safeParse({ label: "2026/2027", started_on: "" });
  assert.equal(ok.success, true);
  assert.equal(ok.data.started_on, null);

  assert.equal(mandateCreateSchema.safeParse({ label: "X" }).success, false);
});

test("secretaria: ata exige título e data da sessão, com situação do catálogo", () => {
  const ok = minuteCreateSchema.safeParse({
    number: "01/2026",
    title: "Sessão ordinária de instrução",
    session_date: "2026-10-10",
    status: "rascunho",
  });
  assert.equal(ok.success, true);

  assert.equal(minuteCreateSchema.safeParse({ title: "Sessão", session_date: "10/10/2026" }).success, false);
  assert.equal(
    minuteCreateSchema.safeParse({ title: "Sessão", session_date: "2026-10-10", status: "guardada" }).success,
    false,
  );
});

test("tesouraria: caixa aceita somente entrada/saída e motivo do catálogo", () => {
  const ok = cashCreateSchema.safeParse({
    kind: "saida",
    category: "luz",
    description: "Conta de luz do Templo",
    amount: "320.55",
    movement_date: "2026-10-05",
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data.amount, 320.55);
  assert.equal(CASH_CATEGORY_KEYS.includes("luz"), true);

  assert.equal(
    cashCreateSchema.safeParse({
      kind: "retirada",
      category: "luz",
      description: "X",
      amount: 10,
      movement_date: "2026-10-05",
    }).success,
    false,
  );
  assert.equal(
    cashCreateSchema.safeParse({
      kind: "saida",
      category: "condominio",
      description: "X",
      amount: 10,
      movement_date: "2026-10-05",
    }).success,
    false,
  );
  assert.equal(
    cashCreateSchema.safeParse({
      kind: "saida",
      category: "luz",
      description: "X",
      amount: -5,
      movement_date: "2026-10-05",
    }).success,
    false,
  );
});

test("perfis de acesso: sete perfis, com o novo perfil Irmão", () => {
  assert.equal(ROLES.length, 7);
  assert.equal(new Set(ROLES).size, ROLES.length); // sem repetidos
  assert.equal(ROLES.includes("irmao"), true);
  assert.equal(ROLES.includes("fraternidade"), true);
});

test("usuário: perfil do catálogo e vínculo opcional com o cadastro de irmão", () => {
  const ok = userCreateSchema.safeParse({
    full_name: "Irmão Teste",
    email: "irmao@teste.org",
    password: "LojaX2026!",
    role: "irmao",
    brother_id: "6f7b0d2c-1a44-4b0e-9a1e-0f9a3a6d5c11",
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data.brother_id, "6f7b0d2c-1a44-4b0e-9a1e-0f9a3a6d5c11");

  // sem vínculo: campo vazio vira null
  const semVinculo = userCreateSchema.safeParse({
    full_name: "Irmão Teste",
    email: "irmao@teste.org",
    password: "LojaX2026!",
    role: "irmao",
    brother_id: "",
  });
  assert.equal(semVinculo.success, true);
  assert.equal(semVinculo.data.brother_id, null);

  // perfil fora do catálogo é recusado
  assert.equal(
    userCreateSchema.safeParse({
      full_name: "Irmão Teste",
      email: "irmao@teste.org",
      password: "LojaX2026!",
      role: "mestre",
    }).success,
    false,
  );
});

test("fraternidade: evento exige título e data/hora com fuso", () => {
  const ok = fraternityEventSchema.safeParse({
    title: "Encontro da Fraternidade Feminina",
    starts_at: "2026-11-14T19:30:00-03:00",
    location: "Templo da Loja",
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data.location, "Templo da Loja");

  assert.equal(
    fraternityEventSchema.safeParse({ title: "", starts_at: "2026-11-14T19:30:00-03:00" }).success,
    false,
  );
  assert.equal(
    fraternityEventSchema.safeParse({ title: "Encontro", starts_at: "14/11/2026 19:30" }).success,
    false,
  );
});
