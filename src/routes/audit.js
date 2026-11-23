// ============================================================
// Auditoria: registro de atividades administrativas (somente admin).
// ============================================================
import { Router } from "express";
import { h, parseIntLimit } from "../lib/util.js";
import { roles } from "../middleware/auth.js";

export function auditRoutes({ pool }) {
  const router = Router();
  router.use(roles("admin"));

  // GET /api/audit?limit=100
  router.get(
    "/",
    h(async (req, res) => {
      const limit = parseIntLimit(req.query.limit, { min: 1, max: 300, fallback: 100 });
      const r = await pool.query(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.occurred_at, a.ip_address,
                COALESCE(a.user_name, u.full_name) AS user_name
           FROM audit_log a
           LEFT JOIN app_users u ON u.id = a.user_id
          ORDER BY a.occurred_at DESC
          LIMIT $1`,
        [limit],
      );
      res.json({ items: r.rows });
    }),
  );

  return router;
}
