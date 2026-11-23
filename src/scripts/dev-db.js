// ============================================================
// Banco PostgreSQL portátil para DESENVOLVIMENTO/TESTE local.
// Fica inteiro dentro da pasta .devdb/ — não instala nada no
// sistema e não interfere no PostgreSQL da nuvem (Neon).
//
// Uso: npm run dev:db   (deixe este terminal aberto)
// ============================================================
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORTA = Number(process.env.DEV_DB_PORT || 55433);
const dataDir = "./.devdb";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "lojax",
  password: "lojax-dev-123456",
  port: PORTA,
  persistent: true,
  // UTF-8 é obrigatório para caracteres acentuados e especiais.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const jaInicializado = existsSync(path.join(dataDir, "PG_VERSION"));

if (!jaInicializado) {
  console.log("Criando o PostgreSQL de desenvolvimento (primeira vez)...");
  await pg.initialise();
} else {
  console.log("✓ PostgreSQL de desenvolvimento já inicializado (reutilizando .devdb).");
}

await pg.start();

try {
  await pg.createDatabase("administracao_loja_x");
  console.log("✓ Banco 'administracao_loja_x' criado.");
} catch {
  console.log("✓ Banco 'administracao_loja_x' já existia.");
}

console.log("");
console.log(`✓ PostgreSQL de desenvolvimento rodando na porta ${PORTA}.`);
console.log(`  DATABASE_URL=postgres://lojax:lojax-dev-123456@localhost:${PORTA}/administracao_loja_x`);
console.log("  Deixe este terminal aberto. Ctrl+C para encerrar.");
console.log("");

async function encerrar() {
  console.log("\nEncerrando o PostgreSQL de desenvolvimento...");
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
