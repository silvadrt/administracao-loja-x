// ============================================================
// Irmãos: cadastro, consulta, atualização e frequência.
// ============================================================
import { Router } from "express";
import { h, cleanSearch, parseIntLimit } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { brotherCreateSchema, brotherUpdateSchema, BROTHER_STATUS } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = [
  "full_name",
  "cim",
  "birth_date",
  "degree",
  "address",
  "phone",
  "email",
  "status",
  "notes",
];
const CAMPOS_RETORNO =
  "id, full_name, cim, birth_date, degree, address, phone, email, status, notes, created_at, updated_at";

export function brotherRoutes({ pool }) {
  const router = Router();

  // GET /api/brothers?q=texto&status=ativo&limit=200
  router.get(
    "/",
    roles("admin", "veneravel", "secretario", "chanceler", "tesoureiro", "fraternidade"),
    h(async (req, res) => {
      const q = cleanSearch(req.query.q);
      const status = BROTHER_STATUS.includes(String(req.query.status)) ? String(req.query.status) : "";
      const limit = parseIntLimit(req.query.limit, { min: 1, max: 300, fallback: 200 });

      const r = await pool.query(
        `SELECT ${CAMPOS_RETORNO}
           FROM brothers
          WHERE ($1 = '' OR full_name ILIKE '%' || $1 || '%' OR COALESCE(cim,'') ILIKE '%' || $1 || '%')
            AND ($2 = '' OR status = $2)
          ORDER BY lower(full_name)
          LIMIT $3`,
        [q, status, limit],
      );
      res.json({ items: r.rows });
    }),
  );

  // GET /api/brothers/:id — ficha completa: dados + familiares + cargos.
  router.get(
    "/:id",
    roles("admin", "veneravel", "secretario", "chanceler", "tesoureiro", "fraternidade"),
    h(async (req, res) => {
      const { id } = req.params;
      const ficha = await pool.query(`SELECT ${CAMPOS_RETORNO} FROM brothers WHERE id = $1`, [id]);
      if (!ficha.rows[0]) return res.status(404).json({ error: "Irmão não encontrado." });

      const [familia, cargos, frequencia] = await Promise.all([
        pool.query(
          "SELECT id, full_name, relationship, birth_date, phone, email FROM family_members WHERE brother_id = $1 ORDER BY full_name",
          [id],
        ),
        pool.query(
          `SELECT lo.id, lo.office_name, lo.term_start, lo.term_end
             FROM lodge_officers lo WHERE lo.brother_id = $1 ORDER BY lo.term_start DESC NULLS LAST`,
          [id],
        ),
        pool.query(
          `SELECT status, count(*)::int AS total
             FROM attendance WHERE brother_id = $1 GROUP BY status`,
          [id],
        ),
      ]);

      res.json({
        item: ficha.rows[0],
        family: familia.rows,
        offices: cargos.rows,
        attendance_summary: frequencia.rows,
      });
    }),
  );

  // POST /api/brothers
  router.post(
    "/",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const p = brotherCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      const r = await pool.query(
        `INSERT INTO brothers(full_name, cim, birth_date, degree, address, phone, email, status, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING ${CAMPOS_RETORNO}`,
        [
          d.full_name,
          d.cim, // já validado: null quando não enviado
          d.birth_date,
          d.degree,
          d.address,
          d.phone,
          d.email,
          d.status ?? "ativo",
          d.notes,
          req.user.id,
        ],
      );
      await audit(pool, req.user.id, "create", "brother", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/brothers/:id
  router.patch(
    "/:id",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const p = brotherUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const upd = buildUpdate("brothers", CAMPOS_ATUALIZAVEIS, p.data, "id", req.params.id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Irmão não encontrado." });

      await audit(pool, req.user.id, "update", "brother", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // GET /api/brothers/:id/attendance-summary?year=2026
  router.get(
    "/:id/attendance-summary",
    roles("admin", "veneravel", "secretario", "chanceler"),
    h(async (req, res) => {
      const year = /^\d{4}$/.test(String(req.query.year)) ? Number(req.query.year) : null;
      const r = await pool.query(
        `SELECT a.status, count(*)::int AS total
           FROM attendance a
           JOIN events e ON e.id = a.event_id
          WHERE a.brother_id = $1
            AND ($2::int IS NULL OR date_part('year', e.starts_at) = $2)
          GROUP BY a.status`,
        [req.params.id, year],
      );
      const resumo = { presente: 0, ausente: 0, justificado: 0, visitante: 0 };
      for (const linha of r.rows) resumo[linha.status] = linha.total;
      resumo.total = Object.values(resumo).reduce((a, b) => a + b, 0);
      res.json({ item: resumo });
    }),
  );

  return router;
}
