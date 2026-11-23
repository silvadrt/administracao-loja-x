// ============================================================
// Familiares dos irmãos.
// ============================================================
import { Router } from "express";
import { h, cleanSearch } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { familyCreateSchema, familyUpdateSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = ["full_name", "relationship", "birth_date", "address", "phone", "email"];
const CAMPOS_RETORNO = "id, brother_id, full_name, relationship, birth_date, address, phone, email, created_at";

export function familyRoutes({ pool }) {
  const router = Router();

  // GET /api/family?q=texto — lista geral com o nome do irmão vinculado.
  router.get(
    "/",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const q = cleanSearch(req.query.q);
      const r = await pool.query(
        `SELECT f.id, f.brother_id, f.full_name, f.relationship, f.birth_date, f.phone, f.email,
                b.full_name AS brother_name
           FROM family_members f
           JOIN brothers b ON b.id = f.brother_id
          WHERE ($1 = '' OR f.full_name ILIKE '%' || $1 || '%' OR b.full_name ILIKE '%' || $1 || '%')
          ORDER BY lower(f.full_name)
          LIMIT 500`,
        [q],
      );
      res.json({ items: r.rows });
    }),
  );

  // GET /api/family/by-brother/:brotherId
  router.get(
    "/by-brother/:brotherId",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const r = await pool.query(
        `SELECT ${CAMPOS_RETORNO} FROM family_members WHERE brother_id = $1 ORDER BY full_name`,
        [req.params.brotherId],
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/family — cria familiar vinculado a um irmão.
  router.post(
    "/",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const corpo = { ...req.body };
      const brotherId = corpo.brother_id ?? req.body?.brother_id;
      delete corpo.brother_id;

      const p = familyCreateSchema.safeParse(corpo);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      if (!brotherId || typeof brotherId !== "string") {
        return res.status(400).json({ error: "Informe o irmão ao qual o familiar pertence." });
      }

      const d = p.data;
      const r = await pool.query(
        `INSERT INTO family_members(brother_id, full_name, relationship, birth_date, address, phone, email)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING ${CAMPOS_RETORNO}`,
        [brotherId, d.full_name, d.relationship, d.birth_date, d.address, d.phone, d.email],
      );
      await audit(pool, req.user.id, "create", "family_member", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/family/:id
  router.patch(
    "/:id",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const p = familyUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const upd = buildUpdate("family_members", CAMPOS_ATUALIZAVEIS, p.data, "id", req.params.id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(upd.text, upd.values);
      if (!r.rows[0]) return res.status(404).json({ error: "Familiar não encontrado." });

      await audit(pool, req.user.id, "update", "family_member", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/family/:id
  router.delete(
    "/:id",
    roles("admin", "veneravel"),
    h(async (req, res) => {
      const r = await pool.query("DELETE FROM family_members WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Familiar não encontrado." });
      await audit(pool, req.user.id, "delete", "family_member", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
