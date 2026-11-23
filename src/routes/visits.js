// ============================================================
// Visitações (realizadas e recebidas).
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { visitCreateSchema, visitUpdateSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = ["visit_type", "brother_name", "lodge_name", "power_name", "visit_date", "notes"];

export function visitRoutes({ pool }) {
  const router = Router();

  // GET /api/visits?type=realizada&year=2026
  router.get(
    "/",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const tipo = ["realizada", "recebida"].includes(String(req.query.type)) ? String(req.query.type) : "";
      const year = /^\d{4}$/.test(String(req.query.year)) ? Number(req.query.year) : null;

      const r = await pool.query(
        `SELECT v.id, v.visit_type, v.brother_name, v.lodge_name, v.power_name,
                v.visit_date, v.notes, v.created_at, u.full_name AS registrado_por
           FROM visits v
           LEFT JOIN app_users u ON u.id = v.created_by
          WHERE ($1 = '' OR v.visit_type = $1)
            AND ($2::int IS NULL OR date_part('year', v.visit_date) = $2)
          ORDER BY v.visit_date DESC
          LIMIT 500`,
        [tipo, year],
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/visits
  router.post(
    "/",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const p = visitCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const r = await pool.query(
        `INSERT INTO visits(visit_type, brother_name, lodge_name, power_name, visit_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, visit_type, brother_name, lodge_name, power_name, visit_date, notes, created_at`,
        [d.visit_type, d.brother_name, d.lodge_name, d.power_name, d.visit_date, d.notes, req.user.id],
      );
      await audit(pool, req.user.id, "create", "visit", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/visits/:id
  router.patch(
    "/:id",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const p = visitUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const upd = buildUpdate("visits", CAMPOS_ATUALIZAVEIS, p.data, "id", req.params.id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Visitação não encontrada." });

      await audit(pool, req.user.id, "update", "visit", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/visits/:id
  router.delete(
    "/:id",
    roles("admin", "veneravel"),
    h(async (req, res) => {
      const r = await pool.query("DELETE FROM visits WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Visitação não encontrada." });
      await audit(pool, req.user.id, "delete", "visit", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
