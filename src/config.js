// ============================================================
// Configuração central do sistema.
// Lê o arquivo .env, valida tudo e avisa com clareza quando
// algo estiver faltando ou errado — antes do servidor subir.
// ============================================================
import "dotenv/config";
import { z } from "zod";

const raw = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: process.env.PORT ?? "3000",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.NODE_ENV === "test" ? "postgres://test:test@localhost:5432/test" : undefined),
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "30m",
  REFRESH_EXPIRES_IN: process.env.REFRESH_EXPIRES_IN ?? "7d",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "",
  TRUST_PROXY: process.env.TRUST_PROXY ?? "0",
};

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z
    .string({ required_error: "Configure DATABASE_URL no arquivo .env (veja o .env.example)." })
    .min(1),
  JWT_SECRET: z
    .string({ required_error: "Configure JWT_SECRET no arquivo .env." })
    .refine(
      (s) => Buffer.byteLength(s) >= 32,
      "JWT_SECRET precisa ter pelo menos 32 bytes. Gere um aleatório com: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    ),
  JWT_EXPIRES_IN: z.string().min(2),
  REFRESH_EXPIRES_IN: z.string().min(2),
  CORS_ORIGIN: z.string(),
  TRUST_PROXY: z.enum(["0", "1", "true", "false"]),
});

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const linhas = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "config"}: ${i.message}`)
    .join("\n");
  throw new Error(`Configuração inválida (verifique o arquivo .env):\n${linhas}`);
}

const d = parsed.data;

/** Converte "7d", "12h", "30m", "45s" em milissegundos. */
function duracaoParaMs(valor) {
  const m = /^(\d+)\s*(s|m|h|d)$/.exec(String(valor).trim());
  if (!m) throw new Error(`Duração inválida: "${valor}" (use algo como 7d, 12h ou 30m).`);
  const unidade = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return Number(m[1]) * unidade;
}

export const config = Object.freeze({
  nodeEnv: d.NODE_ENV,
  isProduction: d.NODE_ENV === "production",
  isTest: d.NODE_ENV === "test",
  port: d.PORT,
  databaseUrl: d.DATABASE_URL,
  jwtSecret: d.JWT_SECRET,
  accessExpiresIn: d.JWT_EXPIRES_IN,
  refreshExpiresIn: d.REFRESH_EXPIRES_IN,
  refreshExpiresMs: duracaoParaMs(d.REFRESH_EXPIRES_IN),
  corsOrigins: d.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: d.TRUST_PROXY === "1" || d.TRUST_PROXY === "true",
  useSsl: /sslmode=(require|verify-full|verify-ca)/.test(d.DATABASE_URL) || d.NODE_ENV === "production",
});
