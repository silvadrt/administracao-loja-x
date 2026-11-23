// ============================================================
// Ponto de entrada do servidor.
// Uso: npm start   (ou npm run dev para reiniciar sozinho)
// ============================================================
import { config } from "./config.js";
import { pool } from "./db.js";
import { createApp } from "./app.js";

const app = createApp({ pool });

const TITULO_CAIXA = "Administração Loja X — Sistema de Gestão";
const LARGURA_CAIXA = TITULO_CAIXA.length + 6; // 3 espaços de cada lado

const server = app.listen(config.port, () => {
  console.log("");
  console.log("  ╔" + "═".repeat(LARGURA_CAIXA) + "╗");
  console.log("  ║   " + TITULO_CAIXA + "   ║");
  console.log("  ╚" + "═".repeat(LARGURA_CAIXA) + "╝");
  console.log(`  Painel:  http://localhost:${config.port}`);
  console.log(`  Saúde:   http://localhost:${config.port}/health`);
  console.log("");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`A porta ${config.port} já está em uso. Feche o outro programa ou mude PORT no .env.`);
  } else {
    console.error("Falha ao iniciar o servidor:", err.message);
  }
  process.exit(1);
});

async function encerrar(sinal) {
  console.log(`\n${sinal} recebido: encerrando o servidor...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));
