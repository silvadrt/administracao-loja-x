// ============================================================
// Tesouraria: pedidos de correção de lançamentos financeiros.
// O tesoureiro pede (ao editar/excluir no Financeiro) e o Venerável
// Mestre aprova ou recusa aqui. O admin decide só como reserva
// técnica (ex.: enquanto a conta do Venerável não existir).
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { contributionUpdateSchema, cashUpdateSchema, problemaLancamento } from "../schemas.js";
import { SQL_ATUAL } from "../lib/correcoes.js";
import { aplicarContribuicao } from "./contributions.js";
import { aplicarLancamento } from "./cash.js";

export function correctionRoutes({ pool }) {
  const router = Router();
  const VER = roles("admin", "veneravel", "tesoureiro");
  const DECIDIR = roles("veneravel", "admin");

  // GET /api/corrections?status=pendente
  router.get(
    "/",
    VER,
    h(async (req, res) => {
      const status = ["pendente", "aprovada", "recusada"].includes(String(req.query.status)) ? String(req.query.status) : "";
      const r = await pool.query(
        `SELECT id, entity_type, entity_id, action, changes, before_data, reason, status,
                requested_by_name, requested_at, decided_by_name, decided_at, decision_note
           FROM financial_corrections
          WHERE ($1 = '' OR status = $1)
          ORDER BY status = 'pendente' DESC, requested_at DESC
          LIMIT 100`,
        [status],
      );
      res.json({ items: r.rows });
    }),
  );

  async function pedidoPendente(id) {
    const r = await pool.query("SELECT * FROM financial_corrections WHERE id = $1", [id]);
    return r.rows[0];
  }

  async function concluir(id, req, status, nota) {
    await pool.query(
      `UPDATE financial_corrections
          SET status = $2, decided_by = $3, decided_by_name = $4, decided_at = now(), decision_note = $5
        WHERE id = $1`,
      [id, status, req.user.id, req.user.full_name, nota],
    );
  }

  // POST /api/corrections/:id/aprovar — aplica a correção pedida.
  router.post(
    "/:id/aprovar",
    DECIDIR,
    h(async (req, res) => {
      const c = await pedidoPendente(req.params.id);
      if (!c) return res.status(404).json({ error: "Pedido de correção não encontrado." });
      if (c.status !== "pendente") return res.status(409).json({ error: "Este pedido já foi decidido." });

      const atual = (await pool.query(SQL_ATUAL[c.entity_type], [c.entity_id])).rows[0];
      if (!atual) {
        await concluir(c.id, req, "recusada", "Lançamento não existe mais.");
        return res.status(409).json({ error: "O lançamento não existe mais; o pedido foi encerrado." });
      }

      if (c.action === "delete") {
        await pool.query("DELETE FROM cash_movements WHERE id = $1", [c.entity_id]);
      } else if (c.entity_type === "contribution") {
        const p = contributionUpdateSchema.safeParse(c.changes || {});
        if (!p.success) return res.status(400).json({ error: "O pedido tem dados inválidos." });
        await aplicarContribuicao(pool, c.entity_id, p.data);
      } else {
        const p = cashUpdateSchema.safeParse(c.changes || {});
        if (!p.success) return res.status(400).json({ error: "O pedido tem dados inválidos." });
        const problema = problemaLancamento({ ...atual, ...p.data });
        if (problema) return res.status(400).json({ error: problema });
        await aplicarLancamento(pool, c.entity_id, p.data);
      }

      await concluir(c.id, req, "aprovada", String(req.body?.nota || "").slice(0, 300) || null);
      await audit(pool, req.user.id, "approve_correction", c.entity_type, c.entity_id, req.ip);
      res.json({ message: "Correção aprovada e aplicada." });
    }),
  );

  // POST /api/corrections/:id/recusar — recusa sem mexer no lançamento.
  router.post(
    "/:id/recusar",
    DECIDIR,
    h(async (req, res) => {
      const c = await pedidoPendente(req.params.id);
      if (!c) return res.status(404).json({ error: "Pedido de correção não encontrado." });
      if (c.status !== "pendente") return res.status(409).json({ error: "Este pedido já foi decidido." });
      await concluir(c.id, req, "recusada", String(req.body?.nota || "").slice(0, 300) || null);
      await audit(pool, req.user.id, "reject_correction", c.entity_type, c.entity_id, req.ip);
      res.json({ message: "Correção recusada. O lançamento continua como estava." });
    }),
  );

  return router;
}
