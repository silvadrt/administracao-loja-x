// ============================================================
// Tratamento de rotas inexistentes e erros globais.
// ============================================================

export function notFound(_req, res) {
  res.status(404).json({ error: "Rota não encontrada." });
}

export function errorHandler(err, _req, res, _next) {
  // JSON malformado no corpo da requisição
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido no corpo da requisição." });
  }
  // Erros conhecidos do PostgreSQL
  if (err?.code === "23505") {
    return res.status(409).json({ error: "Já existe um registro com estes dados (duplicado)." });
  }
  if (err?.code === "23503") {
    return res.status(400).json({ error: "Referência inválida: o registro relacionado não existe." });
  }
  if (err?.code === "22P02") {
    return res.status(400).json({ error: "Um dos valores enviados está em formato inválido." });
  }

  console.error(err);
  res.status(500).json({ error: "Erro interno. Consulte o log do servidor." });
}
