// Pool de banco falso para testes: responde conforme os padrões
// de SQL cadastrados, sem precisar de PostgreSQL de verdade.

export function makePool(rotas = []) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      for (const [padrao, resposta] of rotas) {
        if (padrao.test(text)) {
          return typeof resposta === "function" ? resposta(text, params) : resposta;
        }
      }
      return { rows: [], rowCount: 0 };
    },
    async end() {},
  };
}

export function jsonResponse(rows) {
  return { rows, rowCount: rows.length };
}

export function erroPg(code) {
  const err = new Error(`Erro PostgreSQL ${code}`);
  err.code = code;
  return err;
}

/** Inicia o app em porta aleatória e devolve a URL base + função de encerramento. */
export async function iniciarServidor(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    async fechar() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
