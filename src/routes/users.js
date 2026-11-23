// ============================================================
// Gestão de usuários do sistema (somente admin).
// ============================================================
import { Router } from "express";
import bcrypt from "bcryptjs";
import { h } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { userCreateSchema, userUpdateSchema, resetPasswordSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = ["full_name", "role", "active", "brother_id"];

export function userRoutes({ pool }) {
  const router = Router();
  router.use(roles("admin"));

  // GET /api/users
  router.get(
    "/",
    h(async (_req, res) => {
      const r = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.role, u.active, u.must_change_password,
                u.last_login_at, u.created_at, u.brother_id, b.full_name AS brother_name
           FROM app_users u
           LEFT JOIN brothers b ON b.id = u.brother_id
          ORDER BY u.full_name`,
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/users
  router.post(
    "/",
    h(async (req, res) => {
      const p = userCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const hash = await bcrypt.hash(d.password, 12);
      const r = await pool.query(
        `INSERT INTO app_users(full_name, email, password_hash, role, must_change_password, brother_id)
         VALUES ($1,$2,$3,$4,true,$5)
         RETURNING id, full_name, email, role, active, must_change_password, brother_id, created_at`,
        [d.full_name, d.email.toLowerCase(), hash, d.role, d.brother_id ?? null],
      );
      await audit(pool, req.user.id, "create", "app_user", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/users/:id
  router.patch(
    "/:id",
    h(async (req, res) => {
      const p = userUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const { id } = req.params;

      // Proteções: não desativar a si mesmo, nem remover o último admin ativo.
      if (id === req.user.id && p.data.active === false) {
        return res.status(400).json({ error: "Você não pode desativar a própria conta." });
      }
      const alvo = await pool.query("SELECT role, active FROM app_users WHERE id = $1", [id]);
      if (!alvo.rows[0]) return res.status(404).json({ error: "Usuário não encontrado." });

      const deixaDeSerAdminAtivo =
        alvo.rows[0].role === "admin" &&
        alvo.rows[0].active &&
        (p.data.role !== undefined || p.data.active === false) &&
        (p.data.role !== "admin" || p.data.active === false);
      if (deixaDeSerAdminAtivo) {
        const admins = await pool.query(
          "SELECT count(*)::int AS n FROM app_users WHERE role = 'admin' AND active = true AND id <> $1",
          [id],
        );
        if (admins.rows[0].n === 0) {
          return res.status(400).json({ error: "É necessário manter pelo menos um administrador ativo." });
        }
      }

      const upd = buildUpdate("app_users", CAMPOS_ATUALIZAVEIS, p.data, "id", id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(
        upd.text.replace(
          "RETURNING *",
          "RETURNING id, full_name, email, role, active, must_change_password, last_login_at, brother_id",
        ),
        upd.values,
      );
      await audit(pool, req.user.id, "update", "app_user", id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // POST /api/users/:id/reset-password — define nova senha provisória.
  router.post(
    "/:id/reset-password",
    h(async (req, res) => {
      const p = resetPasswordSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const hash = await bcrypt.hash(p.data.new_password, 12);
      const r = await pool.query(
        "UPDATE app_users SET password_hash = $1, must_change_password = true WHERE id = $2 RETURNING id",
        [hash, req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Usuário não encontrado." });

      await pool.query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [req.params.id],
      );
      await audit(pool, req.user.id, "reset_password", "app_user", req.params.id, req.ip);
      res.json({ message: "Senha provisória definida. O usuário deverá trocá-la no próximo acesso." });
    }),
  );

  return router;
}
