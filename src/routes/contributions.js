// ============================================================
// Financeiro: cobranças dos irmãos (mensalidades, taxas extras,
// tronco e doações), geração em lote e relatório de quem deve.
// ============================================================
import { Router } from "express";
import { h, toCsv, parseIntLimit } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import {
  PEDE_APROVACAO, SQL_ATUAL, camposAlterados, ehCorrecao, motivoDe, registrarPedido, MSG_PEDIDO,
} from "../lib/correcoes.js";
import {
  contributionCreateSchema,
  contributionUpdateSchema,
  generateMonthSchema,
  generateChargeSchema,
  partialPaymentSchema,
  removeMonthSchema,
  CONTRIBUTION_STATUS,
} from "../schemas.js";

const CAMPOS_ATUALIZAVEIS = [
  "contributor_name",
  "brother_id",
  "reference_month",
  "contribution_type",
  "description",
  "amount",
  "due_date",
  "status",
  "notes",
];
const CAMPOS_RETORNO =
  "id, contributor_name, brother_id, reference_month, contribution_type, description, amount, due_date, status, paid_at, notes, created_at";
const CAMPOS_RETORNO_COM_ALIAS = CAMPOS_RETORNO.split(", ")
  .map((c) => `c.${c}`)
  .join(", ");

/**
 * Grava as alterações de uma cobrança (só os campos que mudaram).
 * A data de pagamento acompanha a mudança de situação. Devolve a linha,
 * null se não existir ou undefined se não houver nada para gravar.
 */
export async function aplicarContribuicao(pool, id, alterados) {
  const dados = { ...alterados };
  if (dados.status === "pago") dados.paid_at = new Date();
  else if (dados.status) dados.paid_at = null;

  const colunas = dados.paid_at !== undefined ? [...CAMPOS_ATUALIZAVEIS, "paid_at"] : CAMPOS_ATUALIZAVEIS;
  const upd = buildUpdate("contributions", colunas, dados, "id", id);
  if (!upd) return undefined;
  const r = await pool.query(upd.text, upd.values);
  return r.rows[0] || null;
}

export function contributionRoutes({ pool }) {
  const router = Router();
  const podeEscrever = roles("admin", "veneravel", "tesoureiro");
  const podeLer = roles("admin", "veneravel", "tesoureiro");
  // Exclusão de lançamentos (individual e mensalidades do mês): somente o
  // administrador (decisão do responsável, 19/10/2026).
  const soAdmin = roles("admin");

  // GET /api/contributions?ano=2026&mes=10&from=&to=&status=pendente&brother_id=UUID
  // Aceita as três formas de filtro: por ano, por ano+mês ou por período.
  router.get(
    "/",
    podeLer,
    h(async (req, res) => {
      const ehData = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
      const ano = /^\d{4}$/.test(String(req.query.ano ?? req.query.year)) ? String(req.query.ano ?? req.query.year) : "";
      const mes = /^(0?[1-9]|1[0-2])$/.test(String(req.query.mes || ""))
        ? String(req.query.mes).padStart(2, "0")
        : "";
      const mesCompleto = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month)) ? String(req.query.month) : "";
      const de = ehData(req.query.from) ? String(req.query.from).slice(0, 7) : "";
      const ate = ehData(req.query.to) ? String(req.query.to).slice(0, 7) : "";
      const status = CONTRIBUTION_STATUS.includes(String(req.query.status)) ? String(req.query.status) : "";
      const brotherId = typeof req.query.brother_id === "string" ? req.query.brother_id : "";
      const limit = parseIntLimit(req.query.limit, { min: 1, max: 500, fallback: 500 });

      // O ano filtra pelo prefixo ("2026-%"); ano + mês filtra o mês exato ("2026-10").
      const refAno = ano;
      const refMes = ano && mes ? `${ano}-${mes}` : mesCompleto;
      const r = await pool.query(
        `SELECT ${CAMPOS_RETORNO_COM_ALIAS}, b.full_name AS brother_name
           FROM contributions c
           LEFT JOIN brothers b ON b.id = c.brother_id
          WHERE ($1 = '' OR c.reference_month LIKE $1 || '-%')
            AND ($2 = '' OR c.reference_month = $2)
            AND ($3 = '' OR c.status = $3)
            AND ($4 = '' OR c.brother_id::text = $4)
            AND ($5 = '' OR c.reference_month >= $5)
            AND ($6 = '' OR c.reference_month <= $6)
          ORDER BY c.reference_month DESC, lower(c.contributor_name)
          LIMIT $7`,
        [refAno, refMes, status, brotherId, de, ate, limit],
      );
      res.json({ items: r.rows });
    }),
  );

  // GET /api/contributions/summary?year=2026 — totais por mês e situação.
  router.get(
    "/summary",
    podeLer,
    h(async (req, res) => {
      const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
      const r = await pool.query(
        `SELECT reference_month, status, count(*)::int AS quantidade, COALESCE(sum(amount), 0)::float AS total
           FROM contributions
          WHERE reference_month LIKE $1 || '-%'
          GROUP BY reference_month, status
          ORDER BY reference_month`,
        [year],
      );
      res.json({ year, items: r.rows });
    }),
  );

  // POST /api/contributions
  router.post(
    "/",
    podeEscrever,
    h(async (req, res) => {
      const p = contributionCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      if (!d.brother_id && !d.contributor_name) {
        return res.status(400).json({ error: "Informe o irmão ou o nome do contribuinte." });
      }

      // Nome do contribuinte: se vinculado a um irmão, usa o nome dele.
      let nome = d.contributor_name;
      if (!nome && d.brother_id) {
        const b = await pool.query("SELECT full_name FROM brothers WHERE id = $1", [d.brother_id]);
        nome = b.rows[0]?.full_name ?? "Irmão";
      }

      const status = d.status ?? "pendente";
      const r = await pool.query(
        `INSERT INTO contributions(contributor_name, brother_id, reference_month, contribution_type, description, amount, due_date, status, paid_at, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 = 'pago' THEN now() ELSE NULL END, $9, $10)
         RETURNING ${CAMPOS_RETORNO}`,
        [nome, d.brother_id, d.reference_month, d.contribution_type, d.description, d.amount, d.due_date, status, d.notes, req.user.id],
      );
      await audit(pool, req.user.id, "create", "contribution", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/contributions/:id
  router.patch(
    "/:id",
    podeEscrever,
    h(async (req, res) => {
      const p = contributionUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const atual = (await pool.query(SQL_ATUAL.contribution, [req.params.id])).rows[0];
      if (!atual) return res.status(404).json({ error: "Contribuição não encontrada." });
      const alterados = camposAlterados(atual, p.data);

      // Tesoureiro corrigindo um lançamento: vira pedido para o Venerável.
      if (PEDE_APROVACAO.includes(req.user.role) && ehCorrecao("contribution", atual, alterados)) {
        const motivo = motivoDe(req);
        if (!motivo) return res.status(400).json({ error: "Informe o motivo da correção (ele vai para o Venerável aprovar).", code: "motivo_obrigatorio" });
        const pedido = await registrarPedido(pool, req, { entidade: "contribution", id: req.params.id, acao: "update", alterados, atual, motivo });
        await audit(pool, req.user.id, "request_correction", "contribution", req.params.id, req.ip);
        return res.status(202).json({ pendente_aprovacao: true, correction_id: pedido, message: MSG_PEDIDO });
      }

      const item = await aplicarContribuicao(pool, req.params.id, alterados);
      if (item === undefined) return res.json({ item: atual }); // nada mudou
      if (!item) return res.status(404).json({ error: "Contribuição não encontrada." });

      await audit(pool, req.user.id, "update", "contribution", req.params.id, req.ip);
      res.json({ item });
    }),
  );

  // DELETE /api/contributions/:id — apaga um lançamento (somente administrador).
  router.delete(
    "/:id",
    soAdmin,
    h(async (req, res) => {
      const r = await pool.query("DELETE FROM contributions WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Lançamento não encontrado." });

      await audit(pool, req.user.id, "delete", "contribution", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  // POST /api/contributions/generate-month — gera mensalidades do mês para os irmãos ativos.
  router.post(
    "/generate-month",
    podeEscrever,
    h(async (req, res) => {
      const p = generateMonthSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const { reference_month, amount, due_day } = p.data;
      const dia = String(due_day ?? 10).padStart(2, "0");
      const vencimento = `${reference_month}-${dia}`;

      const r = await pool.query(
        `INSERT INTO contributions(contributor_name, brother_id, reference_month, contribution_type, amount, due_date, status, created_by)
         SELECT b.full_name, b.id, $1, 'mensalidade', $2, $3, 'pendente', $4
           FROM brothers b
          WHERE b.status = 'ativo'
            AND NOT EXISTS (
              SELECT 1 FROM contributions c
               WHERE c.brother_id = b.id
                 AND c.reference_month = $1
                 AND c.contribution_type = 'mensalidade'
            )`,
        [reference_month, amount, vencimento, req.user.id],
      );

      await audit(pool, req.user.id, "generate_month", "contribution", reference_month, req.ip);
      res.status(201).json({
        message: `Mensalidade de ${reference_month} gerada para ${r.rowCount} irmão(s) ativo(s).`,
        created: r.rowCount,
      });
    }),
  );

  // POST /api/contributions/generate-charge — cobrança em lote (taxa extra,
  // doação, tronco ou outro) para todos os irmãos ativos ou só para os
  // escolhidos. Quem já tem a mesma cobrança (tipo + mês + descrição) é ignorado.
  router.post(
    "/generate-charge",
    podeEscrever,
    h(async (req, res) => {
      const p = generateChargeSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const d = p.data;
      if (d.brother_ids && d.brother_ids.length === 0) {
        return res.status(400).json({ error: "Escolha ao menos um irmão." });
      }
      const escolhidos = d.brother_ids ?? null;

      const r = await pool.query(
        `INSERT INTO contributions(contributor_name, brother_id, reference_month, contribution_type, description, amount, due_date, status, created_by)
         SELECT b.full_name, b.id, $1, $2, $3, $4, $5, 'pendente', $6
           FROM brothers b
          WHERE (($7::uuid[] IS NULL AND b.status = 'ativo') OR b.id = ANY($7::uuid[]))
            AND NOT EXISTS (
              SELECT 1 FROM contributions c
               WHERE c.brother_id = b.id
                 AND c.reference_month = $1
                 AND c.contribution_type = $2
                 AND c.description IS NOT DISTINCT FROM $3
            )`,
        [d.reference_month, d.contribution_type, d.description, d.amount, d.due_date ?? null, req.user.id, escolhidos],
      );

      await audit(pool, req.user.id, "generate_charge", "contribution", `${d.contribution_type}:${d.reference_month}`, req.ip);
      res.status(201).json({
        message: `Cobrança "${d.description}" gerada para ${r.rowCount} irmão(s).`,
        created: r.rowCount,
      });
    }),
  );

  // POST /api/contributions/:id/parcial — pagamento parcial por acordo.
  // A cobrança original fica paga com o valor recebido e o restante vira
  // uma nova cobrança pendente, ligada à original (parent_id). Tudo numa
  // única instrução SQL (atômica).
  router.post(
    "/:id/parcial",
    podeEscrever,
    h(async (req, res) => {
      const p = partialPaymentSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const pago = Math.round(p.data.amount_paid * 100) / 100;

      const atual = await pool.query("SELECT id, amount, status FROM contributions WHERE id = $1", [req.params.id]);
      const c = atual.rows[0];
      if (!c) return res.status(404).json({ error: "Cobrança não encontrada." });
      if (c.status !== "pendente") return res.status(400).json({ error: "Só cobranças pendentes aceitam pagamento parcial." });
      if (pago >= Number(c.amount)) {
        return res.status(400).json({ error: "O valor parcial deve ser menor que o total. Para o valor inteiro, use “Marcar pago”." });
      }

      const nota = `Pagamento parcial (acordo): R$ ${pago.toFixed(2).replace(".", ",")}${p.data.notes ? " — " + p.data.notes : ""}`;
      const r = await pool.query(
        `WITH orig AS (
           SELECT * FROM contributions WHERE id = $1 AND status = 'pendente' AND amount > $2 FOR UPDATE
         ), pago AS (
           UPDATE contributions c
              SET amount = $2, status = 'pago', paid_at = now(),
                  notes = concat_ws(' | ', NULLIF(c.notes, ''), $3::text)
             FROM orig WHERE c.id = orig.id
           RETURNING c.id, c.amount
         ), restante AS (
           INSERT INTO contributions(contributor_name, brother_id, reference_month, contribution_type, description,
                                     amount, due_date, status, notes, created_by, parent_id)
           SELECT o.contributor_name, o.brother_id, o.reference_month, o.contribution_type, o.description,
                  o.amount - $2, o.due_date, 'pendente', 'Restante do acordo', $4, COALESCE(o.parent_id, o.id)
             FROM orig o JOIN pago ON true
           RETURNING id, amount
         )
         SELECT (SELECT row_to_json(pago) FROM pago) AS pago,
                (SELECT row_to_json(restante) FROM restante) AS restante`,
        [req.params.id, pago, nota, req.user.id],
      );
      const linha = r.rows[0] || {};
      if (!linha.pago) return res.status(409).json({ error: "A cobrança mudou enquanto isso. Atualize a página e tente de novo." });

      await audit(pool, req.user.id, "partial_payment", "contribution", req.params.id, req.ip);
      res.status(201).json({
        message: `Recebido R$ ${pago.toFixed(2).replace(".", ",")}. O restante ficou pendente.`,
        pago: linha.pago,
        restante: linha.restante,
      });
    }),
  );

  // GET /api/contributions/devedores — quem deve: cobranças pendentes
  // agrupadas por irmão (ou contribuinte avulso), com total e detalhes.
  router.get(
    "/devedores",
    podeLer,
    h(async (_req, res) => {
      const r = await pool.query(
        `SELECT c.brother_id,
                COALESCE(b.full_name, c.contributor_name) AS nome,
                b.phone,
                count(*)::int AS quantidade,
                COALESCE(sum(c.amount), 0)::float AS total,
                min(c.reference_month) AS desde,
                json_agg(json_build_object(
                  'id', c.id, 'reference_month', c.reference_month,
                  'contribution_type', c.contribution_type, 'description', c.description,
                  'amount', c.amount, 'due_date', c.due_date
                ) ORDER BY c.reference_month, c.contribution_type) AS itens
           FROM contributions c
           LEFT JOIN brothers b ON b.id = c.brother_id
          WHERE c.status = 'pendente'
          GROUP BY c.brother_id, COALESCE(b.full_name, c.contributor_name), b.phone
          ORDER BY total DESC, lower(COALESCE(b.full_name, c.contributor_name))`,
      );
      const total = r.rows.reduce((s, x) => s + Number(x.total), 0);
      res.json({
        items: r.rows,
        total: Math.round(total * 100) / 100,
        devedores: r.rows.length,
      });
    }),
  );

  // POST /api/contributions/remove-month — apaga as mensalidades de um mês
  // (somente administrador) para desfazer uma geração feita por engano.
  router.post(
    "/remove-month",
    soAdmin,
    h(async (req, res) => {
      const p = removeMonthSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      const r = await pool.query(
        "DELETE FROM contributions WHERE reference_month = $1 AND contribution_type = 'mensalidade'",
        [p.data.reference_month],
      );

      await audit(pool, req.user.id, "remove_month", "contribution", p.data.reference_month, req.ip);
      res.json({
        message: `Mensalidade(s) de ${p.data.reference_month} removida(s): ${r.rowCount}.`,
        removed: r.rowCount,
      });
    }),
  );

  // GET /api/contributions/export.csv?year=2026
  router.get(
    "/export.csv",
    podeLer,
    h(async (req, res) => {
      const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
      const r = await pool.query(
        `SELECT c.reference_month, c.contributor_name, c.contribution_type, c.description, c.amount, c.due_date, c.status, c.paid_at
           FROM contributions c
          WHERE c.reference_month LIKE $1 || '-%'
          ORDER BY c.reference_month, lower(c.contributor_name)`,
        [year],
      );
      const csv = toCsv(r.rows, [
        { key: "reference_month", label: "Mês de referência" },
        { key: "contributor_name", label: "Contribuinte" },
        { key: "contribution_type", label: "Tipo" },
        { key: "description", label: "Descrição" },
        { key: "amount", label: "Valor (R$)" },
        { key: "due_date", label: "Vencimento" },
        { key: "status", label: "Situação" },
        {
          key: "paid_at",
          label: "Pago em",
          value: (row) => (row.paid_at ? new Date(row.paid_at).toLocaleDateString("pt-BR") : ""),
        },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="financeiro-${year}.csv"`);
      res.send(csv);
    }),
  );

  return router;
}
