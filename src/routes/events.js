// ============================================================
// Eventos / Sessões e controle de presença.
// ============================================================
import { Router } from "express";
import { h, parseIntLimit } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { eventCreateSchema, eventUpdateSchema, attendanceBulkSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = ["title", "event_type", "starts_at", "location", "description"];

export function eventRoutes({ pool }) {
  const router = Router();

  // GET /api/events?from=ISO&to=ISO&upcoming=1&limit=100
  router.get(
    "/",
    h(async (req, res) => {
      // Datas de filtro: aceita o formato que o navegador entende, mas
      // normaliza para ISO antes de consultar — o banco é estrito e
      // devolvia erro 500 quando o texto não era uma data de verdade.
      const isoData = (v) => {
        if (typeof v !== "string") return null;
        const t = Date.parse(v);
        return Number.isNaN(t) ? null : new Date(t).toISOString();
      };
      const from = isoData(req.query.from);
      const to = isoData(req.query.to);
      const upcomingOnly = String(req.query.upcoming ?? "") === "1";
      const limit = parseIntLimit(req.query.limit, { min: 1, max: 300, fallback: 100 });

      const r = await pool.query(
        `SELECT e.id, e.title, e.event_type, e.starts_at, e.location, e.description, e.created_at,
                (SELECT count(*)::int FROM attendance a WHERE a.event_id = e.id AND a.status = 'presente') AS presentes
           FROM events e
          WHERE ($1::timestamptz IS NULL OR e.starts_at >= $1)
            AND ($2::timestamptz IS NULL OR e.starts_at < $2)
            AND ($3 = false OR e.starts_at >= now())
          ORDER BY e.starts_at DESC
          LIMIT $4`,
        [from, to, upcomingOnly, limit],
      );
      res.json({ items: r.rows });
    }),
  );

  // GET /api/events/:id
  router.get(
    "/:id",
    h(async (req, res) => {
      const r = await pool.query("SELECT * FROM events WHERE id = $1", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Evento não encontrado." });
      res.json({ item: r.rows[0] });
    }),
  );

  // POST /api/events
  router.post(
    "/",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const p = eventCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const r = await pool.query(
        `INSERT INTO events(title, event_type, starts_at, location, description, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [d.title, d.event_type, d.starts_at, d.location, d.description, req.user.id],
      );
      await audit(pool, req.user.id, "create", "event", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/events/:id
  router.patch(
    "/:id",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const p = eventUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const upd = buildUpdate("events", CAMPOS_ATUALIZAVEIS, p.data, "id", req.params.id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Evento não encontrado." });

      await audit(pool, req.user.id, "update", "event", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/events/:id
  router.delete(
    "/:id",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const r = await pool.query("DELETE FROM events WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Evento não encontrado." });
      await audit(pool, req.user.id, "delete", "event", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  // GET /api/events/:id/attendance — lista de presença do evento.
  router.get(
    "/:id/attendance",
    roles("admin", "veneravel", "secretario", "chanceler"),
    h(async (req, res) => {
      const evento = await pool.query("SELECT id, title, starts_at FROM events WHERE id = $1", [req.params.id]);
      if (!evento.rows[0]) return res.status(404).json({ error: "Evento não encontrado." });

      const r = await pool.query(
        `SELECT b.id AS brother_id, b.full_name, b.cim, b.status AS brother_status,
                a.status, a.notes, a.recorded_at
           FROM brothers b
           LEFT JOIN attendance a
                  ON a.brother_id = b.id AND a.event_id = $1
          WHERE b.status IN ('ativo','afastado')
          ORDER BY lower(b.full_name)`,
        [req.params.id],
      );
      res.json({ event: evento.rows[0], items: r.rows });
    }),
  );

  // PUT /api/events/:id/attendance — grava a lista de presença (lote).
  router.put(
    "/:id/attendance",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const p = attendanceBulkSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const evento = await pool.query("SELECT id FROM events WHERE id = $1", [req.params.id]);
      if (!evento.rows[0]) return res.status(404).json({ error: "Evento não encontrado." });

      for (const entrada of p.data.entries) {
        await pool.query(
          `INSERT INTO attendance(event_id, brother_id, status, notes, recorded_by, recorded_at)
           VALUES ($1,$2,$3,$4,$5, now())
           ON CONFLICT (event_id, brother_id)
           DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes,
                         recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
          [req.params.id, entrada.brother_id, entrada.status, entrada.notes, req.user.id],
        );
      }

      await audit(pool, req.user.id, "save_attendance", "event", req.params.id, req.ip);
      res.json({ message: `Presenças registradas (${p.data.entries.length}).` });
    }),
  );

  return router;
}
