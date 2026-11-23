// ============================================================
// Fraternidade Feminina: membros e agendamento de eventos.
// Os eventos criados aqui entram no calendário da Loja e geram um
// aviso automático para a Secretaria.
// ============================================================
import { Router } from "express";
import { h, cleanSearch } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { fraternityCreateSchema, fraternityUpdateSchema, fraternityEventSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = ["full_name", "birth_date", "phone", "email", "role_name", "related_brother_id", "active"];

// Tipo gravado na agenda para identificar os eventos da Fraternidade.
const TIPO_EVENTO = "Fraternidade Feminina";

export function fraternityRoutes({ pool }) {
  const router = Router();
  const ACESSO = roles("admin", "veneravel", "fraternidade");

  // GET /api/fraternity?q=texto&active=1
  router.get(
    "/",
    ACESSO,
    h(async (req, res) => {
      const q = cleanSearch(req.query.q);
      const apenasAtivas = String(req.query.active ?? "") === "1";
      const r = await pool.query(
        `SELECT f.id, f.full_name, f.birth_date, f.phone, f.email, f.role_name, f.active,
                f.related_brother_id, b.full_name AS related_brother_name
           FROM fraternity_members f
           LEFT JOIN brothers b ON b.id = f.related_brother_id
          WHERE ($1 = '' OR f.full_name ILIKE '%' || $1 || '%')
            AND ($2 = false OR f.active = true)
          ORDER BY lower(f.full_name)
          LIMIT 500`,
        [q, apenasAtivas],
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/fraternity
  router.post(
    "/",
    ACESSO,
    h(async (req, res) => {
      const p = fraternityCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const r = await pool.query(
        `INSERT INTO fraternity_members(full_name, birth_date, phone, email, role_name, related_brother_id, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, full_name, birth_date, phone, email, role_name, related_brother_id, active, created_at`,
        [d.full_name, d.birth_date, d.phone, d.email, d.role_name, d.related_brother_id, d.active ?? true],
      );
      await audit(pool, req.user.id, "create", "fraternity_member", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // ---------- Eventos da Fraternidade (com aviso à Secretaria) ----------

  // GET /api/fraternity/eventos?upcoming=1 — eventos da Fraternidade.
  router.get(
    "/eventos",
    ACESSO,
    h(async (req, res) => {
      const proximos = String(req.query.upcoming ?? "") === "1";
      const r = await pool.query(
        `SELECT id, title, event_type, starts_at, location, description
           FROM events
          WHERE event_type = $1
            AND ($2 = false OR starts_at >= now())
          ORDER BY starts_at ${proximos ? "ASC" : "DESC"}
          LIMIT 200`,
        [TIPO_EVENTO, proximos],
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/fraternity/eventos — agenda o evento e avisa a Secretaria.
  router.post(
    "/eventos",
    ACESSO,
    h(async (req, res) => {
      const p = fraternityEventSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const evento = await pool.query(
        `INSERT INTO events(title, event_type, starts_at, location, description, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, title, event_type, starts_at, location, description`,
        [d.title, TIPO_EVENTO, d.starts_at, d.location, d.description, req.user.id],
      );

      const dataHora = new Date(evento.rows[0].starts_at).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
      await pool.query(
        `INSERT INTO notifications(target_role, title, message, page, ref_id, created_by)
         VALUES ('secretario', $1, $2, 'sessoes', $3, $4)`,
        [
          `Fraternidade Feminina agendou: ${d.title}`,
          `${dataHora}${d.location ? " • " + d.location : ""} — confira na página Sessões.`,
          evento.rows[0].id,
          req.user.id,
        ],
      );

      await audit(pool, req.user.id, "create", "event", evento.rows[0].id, req.ip);
      res.status(201).json({ item: evento.rows[0], message: "Evento agendado. A Secretaria foi avisada." });
    }),
  );

  // DELETE /api/fraternity/eventos/:id — cancela um evento da Fraternidade.
  router.delete(
    "/eventos/:id",
    ACESSO,
    h(async (req, res) => {
      const r = await pool.query(
        `DELETE FROM events WHERE id = $1 AND event_type = $2 RETURNING id`,
        [req.params.id, TIPO_EVENTO],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Evento da Fraternidade não encontrado." });
      await audit(pool, req.user.id, "delete", "event", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  // PATCH /api/fraternity/:id
  router.patch(
    "/:id",
    ACESSO,
    h(async (req, res) => {
      const p = fraternityUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const upd = buildUpdate("fraternity_members", CAMPOS_ATUALIZAVEIS, p.data, "id", req.params.id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Membro não encontrado." });

      await audit(pool, req.user.id, "update", "fraternity_member", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/fraternity/:id
  router.delete(
    "/:id",
    roles("admin", "veneravel"),
    h(async (req, res) => {
      const r = await pool.query("DELETE FROM fraternity_members WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Membro não encontrado." });
      await audit(pool, req.user.id, "delete", "fraternity_member", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
