// ============================================================
// Cria/verifica toda a estrutura do banco de dados.
// Uso: npm run db:init
// ============================================================
import { readFile } from "node:fs/promises";
import { pool } from "../db.js";

try {
  const sql = await readFile(new URL("../../sql/schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
  console.log("✓ Estrutura do banco criada/verificada com sucesso.");
} catch (err) {
  console.error("✗ Falha ao inicializar o banco:", err.message);
  if (/ECONNREFUSED|ENOTFOUND|timeout/i.test(err.message)) {
    console.error("  Verifique se o DATABASE_URL no arquivo .env está correto e se o banco está acessível.");
  }
  if (/password|authentication/i.test(err.message)) {
    console.error("  Usuário ou senha do banco incorretos no DATABASE_URL.");
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
