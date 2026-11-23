// Testes dos utilitários (src/lib/util.js).
import test from "node:test";
import assert from "node:assert/strict";
import { csvEscape, toCsv, parseIntLimit, cleanSearch } from "../src/lib/util.js";

test("csvEscape neutraliza fórmulas de planilha (CSV injection)", () => {
  assert.equal(csvEscape("=1+1"), "'=1+1");
  assert.equal(csvEscape("+55 61 90000-0000"), "'+55 61 90000-0000");
  assert.equal(csvEscape("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvEscape("-2+3"), "'-2+3");
  assert.equal(csvEscape("\tcmd"), "'\tcmd");
});

test("csvEscape mantém valores comuns e aplica aspas quando preciso", () => {
  assert.equal(csvEscape("Mensalidade"), "Mensalidade");
  assert.equal(csvEscape(120), "120");
  assert.equal(csvEscape("2026-10"), "2026-10");
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
  assert.equal(csvEscape('diz "oi"'), '"diz ""oi"""');
  assert.equal(csvEscape("a;b"), '"a;b"');
});

test("toCsv monta cabeçalho e linhas com escape", () => {
  const csv = toCsv([{ nome: "=1+1" }], [{ key: "nome", label: "Nome" }]);
  assert.ok(csv.includes("Nome"), "cabeçalho presente");
  assert.ok(csv.includes("'=1+1"), "célula neutralizada");
});

test("parseIntLimit limita pelos extremos e usa valor padrão", () => {
  assert.equal(parseIntLimit("99999", { min: 1, max: 500, fallback: 100 }), 500);
  assert.equal(parseIntLimit("-3", { min: 1, max: 500, fallback: 100 }), 1);
  assert.equal(parseIntLimit("", { fallback: 42 }), 42);
});

test("cleanSearch apara espaços e corta o tamanho", () => {
  assert.equal(cleanSearch("  ab  "), "ab");
  assert.equal(cleanSearch("x".repeat(200), 100).length, 100);
});
