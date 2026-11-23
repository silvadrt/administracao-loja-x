// ============================================================
// Secretaria: controle de envios ao GOB e ao GOB-GO.
// Registra cada documento a enviar (ata aprovada, pedidos de
// iniciação, filiação, desligamento, transferência, resultado da
// votação da diretoria, kit placet...) com prazo, data de envio,
// protocolo e situação.
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { gobCreateSchema, gobUpdateSchema, GOB_DOC_TYPES, GOB_STATUS } from "../schemas.js";

const CAMPOS = ["doc_type", "title", "power", "status", "due_date", "sent_on", "protocol", "notes"];

export function gobRoutes({ pool }) {
  const router = Router();
  const SECRETARIA = roles("admin", "veneravel", "secretario");

  // GET /api/gob?status=&ano=
  router.get(
    "/",
    SECRETARIA,
    h(async (req, res) => {
      const status = GOB_STATUS.includes(String(req.query.status)) ? String(req.query.status) : "";
      const ano = /^\d{4}$/.test(String(req.query.ano || "")) ? Number(req.query.ano) : null;
      const r = await pool.query(
        `SELECT g.*, to_char(g.due_date, 'YYYY-MM-DD') AS due_date, to_char(g.sent_on, 'YYYY-MM-DD') AS sent_on,
                u.full_name AS created_by_name
           FROM gob_submissions g
           LEFT JOIN app_users u ON u.id = g.created_by
          WHERE ($1 = '' OR g.status = $1)
            AND ($2::int IS NULL OR date_part('year', g.created_at) = $2::int
                 OR date_part('year', g.due_date) = $2::int OR date_part('year', g.sent_on) = $2::int)
          ORDER BY (g.status = 'a_enviar') DESC, g.due_date NULLS LAST, g.created_at DESC
          LIMIT 300`,
        [status, ano],
      );
      res.json({ items: r.rows, tipos: GOB_DOC_TYPES });
    }),
  );

  // POST /api/gob
  router.post(
    "/",
    SECRETARIA,
    h(async (req, res) => {
      const p = gobCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const d = p.data;
      const r = await pool.query(
        `INSERT INTO gob_submissions(doc_type, title, power, status, due_date, sent_on, protocol, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [d.doc_type, d.title, d.power ?? "GOB", d.status ?? "a_enviar", d.due_date, d.sent_on, d.protocol, d.notes, req.user.id],
      );
      await audit(pool, req.user.id, "create", "gob_submission", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/gob/:id
  router.patch(
    "/:id",
    SECRETARIA,
    h(async (req, res) => {
      const p = gobUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const dados = { ...p.data };
      // Marcou como enviado sem data: usa hoje.
      if (dados.status === "enviado" && dados.sent_on === undefined) dados.sent_on = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const upd = buildUpdate("gob_submissions", [...CAMPOS, "updated_at"], { ...dados, updated_at: new Date() }, "id", req.params.id);
      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Envio não encontrado." });
      await audit(pool, req.user.id, "update", "gob_submission", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/gob/:id
  router.delete(
    "/:id",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const r = await pool.query("DELETE FROM gob_submissions WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Envio não encontrado." });
      await audit(pool, req.user.id, "delete", "gob_submission", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
