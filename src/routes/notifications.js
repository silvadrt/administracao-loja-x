// ============================================================
// Avisos internos entre ofícios.
// Ex.: a Fraternidade Feminina agenda um evento e a Secretaria
// recebe o aviso automaticamente. O aviso é destinado a um perfil
// (target_role); qualquer usuário daquele perfil pode marcar como
// ciente — o aviso some para todos quando alguém o confirma.
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { audit } from "../lib/audit.js";

export function notificationRoutes({ pool }) {
  const router = Router();

  // GET /api/notifications?pendentes=1 — avisos do perfil do usuário.
  router.get(
    "/",
    h(async (req, res) => {
      const somentePendentes = String(req.query.pendentes ?? "") === "1";
      const r = await pool.query(
        `SELECT n.id, n.title, n.message, n.page, n.ref_id, n.created_at, n.read_at,
                u.full_name AS created_by_name
           FROM notifications n
           LEFT JOIN app_users u ON u.id = n.created_by
          WHERE n.target_role = $1
            AND ($2 = false OR n.read_at IS NULL)
          ORDER BY n.read_at IS NULL DESC, n.created_at DESC
          LIMIT 100`,
        [req.user.role, somentePendentes],
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/notifications/:id/ciente — marca o aviso como visto.
  router.post(
    "/:id/ciente",
    h(async (req, res) => {
      const r = await pool.query(
        `UPDATE notifications
            SET read_at = now(), read_by = $2
          WHERE id = $1 AND target_role = $3 AND read_at IS NULL
          RETURNING id`,
        [req.params.id, req.user.id, req.user.role],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Aviso não encontrado ou já marcado como ciente." });
      await audit(pool, req.user.id, "read", "notification", req.params.id, req.ip);
      res.json({ message: "Aviso marcado como ciente." });
    }),
  );

  return router;
}
