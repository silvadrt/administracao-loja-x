// ============================================================
// Autenticação e autorização.
// ============================================================
import { verifyAccessToken } from "../lib/tokens.js";

// Rotas liberadas mesmo quando o usuário ainda precisa trocar a senha.
const LIBERADAS_NA_TROCA_DE_SENHA = new Set([
  "GET /api/me",
  "POST /api/auth/change-password",
  "POST /api/auth/logout",
]);

/**
 * Exige um token válido e confirma no banco que o usuário
 * continua ativo (conta desativada perde acesso na hora).
 */
export function auth({ pool }) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.replace(/^Bearer\s+/i, "");
      if (!token) return res.status(401).json({ error: "Autenticação necessária." });

      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch {
        return res.status(401).json({ error: "Sessão inválida ou expirada." });
      }

      const r = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.role, u.active, u.must_change_password,
                u.brother_id, b.full_name AS brother_name
           FROM app_users u
           LEFT JOIN brothers b ON b.id = u.brother_id
          WHERE u.id = $1`,
        [payload.sub],
      );
      const user = r.rows[0];
      if (!user || !user.active) {
        return res.status(401).json({ error: "Sessão inválida ou expirada." });
      }

      req.user = user;

      // req.originalUrl preserva o caminho completo (ex.: /api/me),
      // porque este middleware roda montado em /api.
      const rotaCompleta = `${req.method} ${req.originalUrl.split("?")[0]}`;
      if (user.must_change_password && !LIBERADAS_NA_TROCA_DE_SENHA.has(rotaCompleta)) {
        return res
          .status(403)
          .json({ error: "Troque a senha antes de continuar.", code: "password_change_required" });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Restringe a rota aos perfis informados. */
export const roles =
  (...permitidos) =>
  (req, res, next) =>
    permitidos.includes(req.user?.role) ? next() : res.status(403).json({ error: "Perfil sem permissão." });
