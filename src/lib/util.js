// ============================================================
// Utilitários internos.
// ============================================================

/**
 * Envolve um manipulador de rota para que erros assíncronos
 * sejam encaminhados ao middleware de erro do Express.
 */
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Lê um inteiro de query string com limites. */
export function parseIntLimit(value, { min = 1, max = 500, fallback = 100 } = {}) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Sanitiza um texto de busca. */
export function cleanSearch(value, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Escapa um valor para CSV.
 * Valores iniciados por = + - @ (ou tabulação) recebem um apóstrofo para
 * virarem texto — impede que planilhas executem fórmulas (CSV injection).
 */
export function csvEscape(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  if (/[";\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/**
 * Gera CSV (separado por ponto e vírgula, formato amigável ao
 * Excel em português) a partir de linhas e definição de colunas.
 */
export function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(";");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(typeof c.value === "function" ? c.value(row) : row[c.key])).join(";"),
  );
  return "\uFEFF" + [header, ...lines].join("\r\n");
}
