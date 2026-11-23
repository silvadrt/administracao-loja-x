// ============================================================
// Secretaria: livro de atas.
// Registra a ata de cada sessão, controla o envio ao GOB e o
// arquivamento (por período ou ata a ata).
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { minuteArchiveSchema, minuteCreateSchema, minuteUpdateSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = [
  "number", "title", "session_date", "session_type", "degree", "body",
  "decisions", "sent_to_gob_at", "gob_protocol", "status",
];

const COLUNAS_RESUMO = `m.id, m.number, m.title, m.session_date, m.session_type, m.degree,
       m.status, m.sent_to_gob_at, m.gob_protocol, m.archived_at, m.archive_note,
       m.created_at, m.updated_at,
       left(coalesce(m.body, ''), 220) AS resumo,
       (coalesce(m.body, '') <> '') AS tem_texto`;

function ehData(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

export function minuteRoutes({ pool }) {
  const router = Router();
  // Atas: somente os responsáveis — Secretário (quem lavra) e Venerável
  // (quem assina).
  const LER = roles("veneravel", "secretario");
  const ESCREVER = roles("veneravel", "secretario");

  // Ata arquivada (aprovada em sessão, assinada e guardada) não muda mais.
  async function estaArquivada(id) {
    const r = await pool.query("SELECT status FROM minutes WHERE id = $1", [id]);
    if (!r.rows[0]) return null;
    return r.rows[0].status === "arquivada";
  }
  const MSG_ARQUIVADA = "Ata arquivada não pode ser alterada nem excluída: ela já foi aprovada, assinada e guardada.";

  // GET /api/minutes?from=&to=&status=&tipo=&busca=
  router.get(
    "/",
    LER,
    h(async (req, res) => {
      const where = [];
      const vals = [];
      const add = (sql, valores) => {
        let texto = sql;
        for (const v of valores) {
          vals.push(v);
          texto = texto.replace("$?", "$" + vals.length);
        }
        where.push(texto);
      };

      if (ehData(req.query.from)) add("m.session_date >= $?::date", [req.query.from]);
      if (ehData(req.query.to)) add("m.session_date <= $?::date", [req.query.to]);
      if (req.query.status) add("m.status = $?", [String(req.query.status)]);
      if (req.query.tipo) add("m.session_type = $?", [String(req.query.tipo)]);
      if (req.query.busca) {
        add("(m.title ILIKE '%'||$?||'%' OR coalesce(m.number,'') ILIKE '%'||$?||'%' OR coalesce(m.body,'') ILIKE '%'||$?||'%')", [
          String(req.query.busca),
          String(req.query.busca),
          String(req.query.busca),
        ]);
      }

      const r = await pool.query(
        `SELECT ${COLUNAS_RESUMO}
           FROM minutes m
          ${where.length ? "WHERE " + where.join(" AND ") : ""}
          ORDER BY m.session_date DESC, m.created_at DESC
          LIMIT 400`,
        vals,
      );
      res.json({ items: r.rows });
    }),
  );

  // GET /api/minutes/resumo — números para os cartões da tela.
  router.get(
    "/resumo",
    LER,
    h(async (_req, res) => {
      const r = await pool.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'rascunho')::int AS rascunho,
                count(*) FILTER (WHERE status = 'aprovada')::int AS aprovada,
                count(*) FILTER (WHERE status = 'enviada')::int AS enviada,
                count(*) FILTER (WHERE status = 'arquivada')::int AS arquivada,
                count(*) FILTER (WHERE sent_to_gob_at IS NOT NULL)::int AS enviadas_gob,
                min(session_date) AS primeira, max(session_date) AS ultima
           FROM minutes`,
      );
      res.json(r.rows[0]);
    }),
  );

  // GET /api/minutes/:id — ata completa (para imprimir/editar).
  router.get(
    "/:id",
    LER,
    h(async (req, res) => {
      const r = await pool.query("SELECT * FROM minutes WHERE id = $1", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Ata não encontrada." });
      res.json({ item: r.rows[0] });
    }),
  );

  // POST /api/minutes
  router.post(
    "/",
    ESCREVER,
    h(async (req, res) => {
      const p = minuteCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const d = p.data;
      const r = await pool.query(
        `INSERT INTO minutes(number, title, session_date, session_type, degree, body, decisions,
                             sent_to_gob_at, gob_protocol, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'rascunho'),$11)
         RETURNING *`,
        [
          d.number, d.title, d.session_date, d.session_type, d.degree, d.body, d.decisions,
          d.sent_to_gob_at, d.gob_protocol, d.status, req.user.id,
        ],
      );
      await audit(pool, req.user.id, "create", "minute", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/minutes/:id
  router.patch(
    "/:id",
    ESCREVER,
    h(async (req, res) => {
      const p = minuteUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const arquivada = await estaArquivada(req.params.id);
      if (arquivada === null) return res.status(404).json({ error: "Ata não encontrada." });
      if (arquivada) return res.status(409).json({ error: MSG_ARQUIVADA });
      const upd = buildUpdate("minutes", CAMPOS_ATUALIZAVEIS, p.data, "id", req.params.id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });
      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Ata não encontrada." });
      await audit(pool, req.user.id, "update", "minute", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // POST /api/minutes/arquivar — arquiva todas as atas de um período.
  router.post(
    "/arquivar",
    ESCREVER,
    h(async (req, res) => {
      const p = minuteArchiveSchema.safeParse(req.body || {});
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const { from, to } = req.body || {};
      if (!ehData(from) || !ehData(to)) {
        return res.status(400).json({ error: "Informe o período (data inicial e final) para arquivar." });
      }
      const r = await pool.query(
        `UPDATE minutes
            SET status = 'arquivada', archived_at = now(), archive_note = $3
          WHERE session_date BETWEEN $1::date AND $2::date
            AND status <> 'arquivada'
          RETURNING id`,
        [from, to, p.data.archive_note],
      );
      await audit(pool, req.user.id, "archive", "minute", `${from}..${to}`, req.ip);
      res.json({ arquivadas: r.rowCount, from, to });
    }),
  );

  // POST /api/minutes/:id/arquivar — arquiva uma única ata.
  router.post(
    "/:id/arquivar",
    ESCREVER,
    h(async (req, res) => {
      const p = minuteArchiveSchema.safeParse(req.body || {});
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const r = await pool.query(
        `UPDATE minutes
            SET status = 'arquivada', archived_at = now(), archive_note = $2
          WHERE id = $1
          RETURNING id, status, archived_at`,
        [req.params.id, p.data.archive_note],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Ata não encontrada." });
      await audit(pool, req.user.id, "archive", "minute", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/minutes/:id
  router.delete(
    "/:id",
    roles("veneravel"),
    h(async (req, res) => {
      const arquivada = await estaArquivada(req.params.id);
      if (arquivada === null) return res.status(404).json({ error: "Ata não encontrada." });
      if (arquivada) return res.status(409).json({ error: MSG_ARQUIVADA });
      const r = await pool.query("DELETE FROM minutes WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Ata não encontrada." });
      await audit(pool, req.user.id, "delete", "minute", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
