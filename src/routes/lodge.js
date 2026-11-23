// ============================================================
// Dados da Loja (informações gerais da Chancelaria).
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { lodgeUpdateSchema } from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = [
  "official_name",
  "power_name",
  "address",
  "email",
  "phone",
  "logo_url",
  "founded_on",
];

export function lodgeRoutes({ pool }) {
  const router = Router();

  // GET /api/lodge — qualquer usuário autenticado.
  router.get(
    "/",
    h(async (_req, res) => {
      const r = await pool.query("SELECT * FROM lodge ORDER BY created_at LIMIT 1");
      res.json({ item: r.rows[0] ?? null });
    }),
  );

  // PATCH /api/lodge — admin e venerável.
  router.patch(
    "/",
    roles("admin", "veneravel"),
    h(async (req, res) => {
      const p = lodgeUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const atual = await pool.query("SELECT id FROM lodge ORDER BY created_at LIMIT 1");
      if (!atual.rows[0]) return res.status(404).json({ error: "Registro da Loja não encontrado." });

      const upd = buildUpdate("lodge", CAMPOS_ATUALIZAVEIS, p.data, "id", atual.rows[0].id);
      if (!upd) return res.status(400).json({ error: "Nada para atualizar." });

      const r = await pool.query(upd.text, upd.values);
      await audit(pool, req.user.id, "update", "lodge", atual.rows[0].id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  return router;
}
