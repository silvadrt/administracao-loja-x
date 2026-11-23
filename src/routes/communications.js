// ============================================================
// Comunicados (preparação de mensagens para WhatsApp).
// O envio oficial pela API do WhatsApp Business é uma etapa
// futura; por enquanto o sistema prepara o texto e gera os
// links prontos (wa.me) para envio direto pelo aplicativo.
// ============================================================
import { Router } from "express";
import { h, parseIntLimit } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { communicationCreateSchema, communicationUpdateSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = ["title", "message", "channel", "status"];

export function communicationRoutes({ pool }) {
  const router = Router();

  // GET /api/communications?status=rascunho
  router.get(
    "/",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const status = ["rascunho", "preparado", "enviado", "falhou"].includes(String(req.query.status))
        ? String(req.query.status)
        : "";
      const limit = parseIntLimit(req.query.limit, { min: 1, max: 300, fallback: 100 });

      const r = await pool.query(
        `SELECT c.id, c.title, c.message, c.channel, c.status, c.created_at, c.updated_at, c.sent_at,
                u.full_name AS created_by_name
           FROM communications c
           LEFT JOIN app_users u ON u.id = c.created_by
          WHERE ($1 = '' OR c.status = $1)
          ORDER BY c.created_at DESC
          LIMIT $2`,
        [status, limit],
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/communications
  router.post(
    "/",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const p = communicationCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const r = await pool.query(
        `INSERT INTO communications(title, message, channel, status, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, title, message, channel, status, created_at, updated_at, sent_at`,
        [d.title, d.message, d.channel ?? "whatsapp", d.status ?? "rascunho", req.user.id],
      );
      await audit(pool, req.user.id, "create", "communication", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/communications/:id — atualiza texto/situação.
  // Ao marcar como "enviado", registra a data do envio.
  router.patch(
    "/:id",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const p = communicationUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const dados = { ...p.data };
      if (dados.status) dados.sent_at = dados.status === "enviado" ? new Date() : null;

      const colunas = dados.sent_at !== undefined ? [...CAMPOS_ATUALIZAVEIS, "sent_at"] : CAMPOS_ATUALIZAVEIS;
      const upd = buildUpdate("communications", colunas, dados, "id", req.params.id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Comunicado não encontrado." });

      await audit(pool, req.user.id, "update", "communication", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/communications/:id
  router.delete(
    "/:id",
    roles("admin", "veneravel", "secretario"),
    h(async (req, res) => {
      const r = await pool.query("DELETE FROM communications WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Comunicado não encontrado." });
      await audit(pool, req.user.id, "delete", "communication", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
