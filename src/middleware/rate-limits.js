// ============================================================
// Limites de requisição (proteção contra abuso e força bruta).
// ============================================================
import rateLimit from "express-rate-limit";

/** Limite geral da API — folgado o bastante para o painel funcionar. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Aguarde alguns instantes e tente novamente." },
});

/** Limite específico do login: apenas tentativas malsucedidas contam. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente." },
});
