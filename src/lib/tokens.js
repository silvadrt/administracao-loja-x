// ============================================================
// Tokens de sessão.
// - Token de acesso: JWT curto (padrão 30 min).
// - Token de renovação: aleatório, guardado no banco apenas
//   como hash SHA-256 (mesmo que o banco vaze, não dá pra usar).
// ============================================================
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const ISSUER = "administracao-loja-x";
const AUDIENCE = "administracao-loja-x-app";

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.full_name ?? user.name,
    },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: config.accessExpiresIn, issuer: ISSUER, audience: AUDIENCE },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/** Gera um token de renovação aleatório (nunca é gravado em claro). */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

/** Hash SHA-256 usado para localizar/validar o token de renovação no banco. */
export function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
