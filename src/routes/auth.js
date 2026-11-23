// ============================================================
// Autenticação: login, renovação de sessão, troca de senha, saída.
// ============================================================
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "../config.js";
import { h } from "../lib/util.js";
import { signAccessToken, generateRefreshToken, hashRefreshToken } from "../lib/tokens.js";
import { audit } from "../lib/audit.js";
import { loginSchema, refreshSchema, changePasswordSchema, setupAdminSchema } from "../schemas.js";
import { loginLimiter } from "../middleware/rate-limits.js";

// Hash de referência para comparar quando o e-mail não existe,
// evitando vazar se um e-mail está cadastrado (ataque de tempo).
const HASH_REFERENCIA = bcrypt.hashSync("senha-inexistente-apenas-para-tempo", 12);

function respostaDeSessao(user, access, refresh) {
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: config.accessExpiresIn,
    refresh_token: refresh,
    refresh_expires_in: config.refreshExpiresIn,
    must_change_password: user.must_change_password,
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      brother_id: user.brother_id ?? null,
      brother_name: user.brother_name ?? null,
    },
  };
}

async function emitirTokens(pool, user, req, acao) {
  const access = signAccessToken(user);
  const refresh = generateRefreshToken();
  await pool.query(
    `INSERT INTO refresh_tokens(user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
    [user.id, hashRefreshToken(refresh), String(config.refreshExpiresMs)],
  );
  await audit(pool, user.id, acao, "app_user", user.id, req.ip);
  return respostaDeSessao(user, access, refresh);
}

// ---------------- Rotas públicas ----------------
export function publicAuthRoutes({ pool }) {
  const router = Router();

  // GET /api/auth/setup-status — informa se o sistema ainda não tem usuários.
  router.get(
    "/setup-status",
    h(async (_req, res) => {
      const r = await pool.query("SELECT count(*)::int AS n FROM app_users");
      res.json({ needs_setup: Number(r.rows[0]?.n ?? 0) === 0 });
    }),
  );

  // POST /api/auth/setup — cria o primeiro administrador quando o banco está vazio.
  router.post(
    "/setup",
    loginLimiter,
    h(async (req, res) => {
      const p = setupAdminSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const hash = await bcrypt.hash(d.password, 12);
      const sqlInsert = `INSERT INTO app_users(full_name, email, password_hash, role, active, must_change_password)
        SELECT $1, $2, $3, 'admin', true, false
         WHERE NOT EXISTS (SELECT 1 FROM app_users)
        RETURNING id, full_name, email, role, active, must_change_password, brother_id`;
      const params = [d.full_name, d.email.toLowerCase(), hash];

      let inserted;
      if (typeof pool.connect === "function") {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(90421001)");
          inserted = await client.query(sqlInsert, params);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      } else {
        inserted = await pool.query(sqlInsert, params);
      }

      const user = inserted.rows[0];
      if (!user) {
        return res.status(409).json({ error: "O primeiro acesso já foi configurado. Use a tela de login." });
      }

      await pool.query("UPDATE app_users SET last_login_at = now() WHERE id = $1", [user.id]);
      res.status(201).json(await emitirTokens(pool, user, req, "setup_first_admin"));
    }),
  );

  // POST /api/auth/login
  router.post(
    "/login",
    loginLimiter,
    h(async (req, res) => {
      const p = loginSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Informe e-mail e senha válidos." });

      const { email, password } = p.data;
      const r = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.active, u.must_change_password,
                u.brother_id, b.full_name AS brother_name
           FROM app_users u
           LEFT JOIN brothers b ON b.id = u.brother_id
          WHERE u.email = $1`,
        [email.toLowerCase()],
      );
      const user = r.rows[0];
      const senhaOk = await bcrypt.compare(password, user?.password_hash ?? HASH_REFERENCIA);

      if (!user || !user.active || !senhaOk) {
        await audit(pool, user?.id ?? null, "login_falha", "app_user", user?.id ?? null, req.ip);
        return res.status(401).json({ error: "E-mail ou senha incorretos." });
      }

      await pool.query("UPDATE app_users SET last_login_at = now() WHERE id = $1", [user.id]);
      res.json(await emitirTokens(pool, user, req, "login"));
    }),
  );

  // POST /api/auth/refresh — renova a sessão sem pedir senha de novo.
  router.post(
    "/refresh",
    h(async (req, res) => {
      const p = refreshSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Token de renovação ausente ou inválido." });

      const hash = hashRefreshToken(p.data.refresh_token);
      const r = await pool.query(
        `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
                u.full_name, u.email, u.role, u.active, u.must_change_password,
                u.brother_id, b.full_name AS brother_name
           FROM refresh_tokens rt
           JOIN app_users u ON u.id = rt.user_id
           LEFT JOIN brothers b ON b.id = u.brother_id
          WHERE rt.token_hash = $1`,
        [hash],
      );
      const row = r.rows[0];
      if (!row || row.revoked_at || new Date(row.expires_at) < new Date() || !row.active) {
        return res.status(401).json({ error: "Sessão expirada. Entre novamente." });
      }

      // Rotação: o token antigo é revogado e um novo é emitido.
      await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
      const user = {
        id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        must_change_password: row.must_change_password,
        brother_id: row.brother_id,
        brother_name: row.brother_name,
      };
      res.json(await emitirTokens(pool, user, req, "refresh"));
    }),
  );

  return router;
}

// ---------------- Rotas protegidas ----------------
// Montadas em /api: /me, /auth/change-password, /auth/logout
export function privateAuthRoutes({ pool }) {
  const router = Router();

  // GET /api/me — dados do usuário logado.
  router.get(
    "/me",
    h(async (req, res) => {
      res.json({
        user: {
          id: req.user.id,
          name: req.user.full_name,
          email: req.user.email,
          role: req.user.role,
          must_change_password: req.user.must_change_password,
          brother_id: req.user.brother_id ?? null,
          brother_name: req.user.brother_name ?? null,
        },
      });
    }),
  );

  // POST /api/auth/change-password — troca a senha e encerra as demais sessões.
  router.post(
    "/auth/change-password",
    h(async (req, res) => {
      const p = changePasswordSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const r = await pool.query("SELECT password_hash FROM app_users WHERE id = $1", [req.user.id]);
      const ok = await bcrypt.compare(p.data.current_password, r.rows[0].password_hash);
      if (!ok) return res.status(401).json({ error: "Senha atual incorreta." });

      const novoHash = await bcrypt.hash(p.data.new_password, 12);
      await pool.query(
        "UPDATE app_users SET password_hash = $1, must_change_password = false WHERE id = $2",
        [novoHash, req.user.id],
      );
      // Por segurança, todas as sessões de renovação são encerradas;
      // o usuário entra novamente com a senha nova.
      await pool.query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [req.user.id],
      );
      await audit(pool, req.user.id, "change_password", "app_user", req.user.id, req.ip);
      res.json({ message: "Senha alterada. Entre novamente com a nova senha." });
    }),
  );

  // POST /api/auth/logout — encerra a sessão de renovação informada.
  router.post(
    "/auth/logout",
    h(async (req, res) => {
      const parsed = z.object({ refresh_token: z.string().max(300).optional() }).safeParse(req.body ?? {});
      if (parsed.success && parsed.data.refresh_token) {
        await pool.query(
          "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
          [hashRefreshToken(parsed.data.refresh_token)],
        );
      }
      await audit(pool, req.user.id, "logout", "app_user", req.user.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
