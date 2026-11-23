// ============================================================
// Conexão com o PostgreSQL.
// ============================================================
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export function createPool() {
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.useSsl ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });
}

export const pool = createPool();

/** Verifica se o banco está respondendo (usado pelo /health). */
export async function ping(target = pool) {
  await target.query("SELECT 1");
  return true;
}
