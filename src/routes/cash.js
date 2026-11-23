// ============================================================
// Tesouraria: lançamentos avulsos e contabilidade do caixa.
// Os lançamentos de entrada e saída (água, luz, GOB, obras,
// retiradas, doações, beneficência...) são feitos pela tela do
// Financeiro; a tela do Caixa só mostra a contabilidade (saldo
// anterior, entradas, saídas, saldo e quem deve).
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { buildUpdate } from "../lib/update.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import {
  cashCreateSchema, cashUpdateSchema, problemaLancamento, CASH_CATEGORIES, CASH_KINDS,
} from "../schemas.js";
import {
  LANCAMENTOS_CTE, SALDOS_SQL, montarSaldos, periodoRelatorio, arredondar,
} from "../lib/financeiro.js";
import {
  PEDE_APROVACAO, SQL_ATUAL, camposAlterados, ehCorrecao, motivoDe, registrarPedido, MSG_PEDIDO,
} from "../lib/correcoes.js";

const CAMPOS_ATUALIZAVEIS = [
  "kind", "category", "description", "amount", "movement_date", "reference_month", "approval_ref", "notes",
];

/** Monta o filtro de período (de/até) ou ano/mês usado nas listagens. */
function filtroPeriodo(query) {
  const where = [];
  const vals = [];
  const ehData = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

  if (ehData(query.from) && ehData(query.to)) {
    vals.push(query.from);
    const de = "$" + vals.length;
    vals.push(query.to);
    const ate = "$" + vals.length;
    where.push(`movement_date BETWEEN ${de}::date AND ${ate}::date`);
  } else if (ehData(query.from)) {
    vals.push(query.from);
    where.push(`movement_date >= $${vals.length}::date`);
  } else if (ehData(query.to)) {
    vals.push(query.to);
    where.push(`movement_date <= $${vals.length}::date`);
  } else {
    if (/^\d{4}$/.test(String(query.ano || ""))) {
      vals.push(Number(query.ano));
      where.push(`date_part('year', movement_date) = $${vals.length}::int`);
    }
    if (/^(0?[1-9]|1[0-2])$/.test(String(query.mes || ""))) {
      vals.push(Number(query.mes));
      where.push(`date_part('month', movement_date) = $${vals.length}::int`);
    }
  }
  return { where, vals };
}

/** Grava só os campos que mudaram; undefined = nada mudou, null = não existe. */
export async function aplicarLancamento(pool, id, alterados) {
  const upd = buildUpdate("cash_movements", CAMPOS_ATUALIZAVEIS, alterados, "id", id);
  if (!upd) return undefined;
  const r = await pool.query(upd.text, upd.values);
  return r.rows[0] || null;
}

export function cashRoutes({ pool }) {
  const router = Router();
  const CAIXA = roles("admin", "tesoureiro", "veneravel");

  // GET /api/cash/categorias — catálogo dos motivos (água, luz, GOB, obras...).
  router.get(
    "/categorias",
    CAIXA,
    h(async (_req, res) => {
      res.json({ categorias: CASH_CATEGORIES, tipos: CASH_KINDS });
    }),
  );

  // GET /api/cash?ano=&mes=&from=&to=&kind=&category=
  router.get(
    "/",
    CAIXA,
    h(async (req, res) => {
      const { where, vals } = filtroPeriodo(req.query);
      const add = (sql, valor) => {
        vals.push(valor);
        where.push(sql.replace("$?", "$" + vals.length));
      };
      if (req.query.kind) add("kind = $?", String(req.query.kind));
      if (req.query.category) add("category = $?", String(req.query.category));

      const r = await pool.query(
        `SELECT c.id, c.kind, c.category, c.description, c.amount, c.movement_date,
                c.reference_month, c.approval_ref, c.notes, c.created_at,
                u.full_name AS created_by_name
           FROM cash_movements c
           LEFT JOIN app_users u ON u.id = c.created_by
          ${where.length ? "WHERE " + where.join(" AND ") : ""}
          ORDER BY c.movement_date DESC, c.created_at DESC
          LIMIT 500`,
        vals,
      );
      res.json({ items: r.rows });
    }),
  );

  // GET /api/cash/resumo — entradas e saídas avulsas do período e os
  // saldos acumulados da Loja (total, fundo geral e Tronco de Beneficência).
  router.get(
    "/resumo",
    CAIXA,
    h(async (req, res) => {
      const { where, vals } = filtroPeriodo(req.query);
      const filtro = where.length ? "WHERE " + where.join(" AND ") : "";
      const [totais, categorias, saldos] = await Promise.all([
        pool.query(
          `SELECT COALESCE(sum(amount) FILTER (WHERE kind = 'entrada'), 0)::float AS entradas,
                  COALESCE(sum(amount) FILTER (WHERE kind = 'saida'), 0)::float AS saidas,
                  count(*)::int AS lancamentos
             FROM cash_movements ${filtro}`,
          vals,
        ),
        pool.query(
          `SELECT category, kind, sum(amount)::float AS total, count(*)::int AS n
             FROM cash_movements ${filtro}
            GROUP BY category, kind
            ORDER BY total DESC`,
          vals,
        ),
        pool.query(SALDOS_SQL),
      ]);
      const t = totais.rows[0];
      res.json({
        ...t,
        saldo: arredondar(Number(t.entradas) - Number(t.saidas)),
        por_categoria: categorias.rows,
        acumulado: montarSaldos(saldos.rows[0]),
      });
    }),
  );

  // GET /api/cash/extrato?ano=&mes=&from=&to= — contabilidade do período:
  // saldo anterior, tudo o que entrou (contribuições pagas + entradas
  // avulsas), tudo o que saiu, saldo final e o extrato com saldo linha a linha.
  router.get(
    "/extrato",
    CAIXA,
    h(async (req, res) => {
      const { de, ate } = periodoRelatorio(req.query);
      const [anterior, lista, saldos] = await Promise.all([
        pool.query(
          `WITH ${LANCAMENTOS_CTE}
           SELECT COALESCE(sum(CASE WHEN kind = 'entrada' THEN amount ELSE -amount END)
                    FILTER (WHERE fundo = 'geral'), 0)::float AS geral,
                  COALESCE(sum(CASE WHEN kind = 'entrada' THEN amount ELSE -amount END)
                    FILTER (WHERE fundo = 'tronco'), 0)::float AS tronco
             FROM lancamentos WHERE data < $1::date`,
          [de],
        ),
        pool.query(
          `WITH ${LANCAMENTOS_CTE}
           SELECT origem, id, kind, category, description, amount::float AS amount, data,
                  reference_month, approval_ref, fundo
             FROM lancamentos
            WHERE data BETWEEN $1::date AND $2::date
            ORDER BY data, created_at`,
          [de, ate],
        ),
        pool.query(SALDOS_SQL),
      ]);

      const a = anterior.rows[0] || {};
      const fundos = {
        geral: { anterior: arredondar(a.geral), entradas: 0, saidas: 0 },
        tronco: { anterior: arredondar(a.tronco), entradas: 0, saidas: 0 },
      };
      const saldoAnterior = arredondar(fundos.geral.anterior + fundos.tronco.anterior);
      let corrente = saldoAnterior;
      let entradas = 0;
      let saidas = 0;
      const items = lista.rows.map((l) => {
        const valor = Number(l.amount);
        const fundo = fundos[l.fundo] || fundos.geral;
        if (l.kind === "entrada") {
          entradas += valor;
          corrente += valor;
          fundo.entradas += valor;
        } else {
          saidas += valor;
          corrente -= valor;
          fundo.saidas += valor;
        }
        return { ...l, saldo: arredondar(corrente) };
      });
      for (const f of Object.values(fundos)) {
        f.entradas = arredondar(f.entradas);
        f.saidas = arredondar(f.saidas);
        f.final = arredondar(f.anterior + f.entradas - f.saidas);
      }

      res.json({
        de,
        ate,
        saldo_anterior: saldoAnterior,
        entradas: arredondar(entradas),
        saidas: arredondar(saidas),
        saldo_final: arredondar(saldoAnterior + entradas - saidas),
        fundos,
        // Do mais recente para o mais antigo; o saldo de cada linha é o
        // saldo da Loja logo depois daquele lançamento.
        items: items.reverse(),
        acumulado: montarSaldos(saldos.rows[0]),
      });
    }),
  );

  // POST /api/cash
  router.post(
    "/",
    CAIXA,
    h(async (req, res) => {
      const p = cashCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const d = p.data;
      const problema = problemaLancamento(d);
      if (problema) return res.status(400).json({ error: problema });
      const r = await pool.query(
        `INSERT INTO cash_movements(kind, category, description, amount, movement_date, reference_month, approval_ref, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [d.kind, d.category, d.description, d.amount, d.movement_date, d.reference_month, d.approval_ref, d.notes, req.user.id],
      );
      await audit(pool, req.user.id, "create", "cash_movement", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0] });
    }),
  );

  // PATCH /api/cash/:id — o tesoureiro corrigindo valor, tipo, motivo ou
  // data gera um pedido para o Venerável (ver src/lib/correcoes.js).
  router.patch(
    "/:id",
    CAIXA,
    h(async (req, res) => {
      const p = cashUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });

      // As regras de coerência valem sobre o lançamento completo (o que já
      // está gravado + o que está sendo alterado).
      const atual = (await pool.query(SQL_ATUAL.cash_movement, [req.params.id])).rows[0];
      if (!atual) return res.status(404).json({ error: "Lançamento não encontrado." });
      const problema = problemaLancamento({ ...atual, ...p.data });
      if (problema) return res.status(400).json({ error: problema });
      const alterados = camposAlterados(atual, p.data);

      if (PEDE_APROVACAO.includes(req.user.role) && ehCorrecao("cash_movement", atual, alterados)) {
        const motivo = motivoDe(req);
        if (!motivo) return res.status(400).json({ error: "Informe o motivo da correção (ele vai para o Venerável aprovar).", code: "motivo_obrigatorio" });
        const pedido = await registrarPedido(pool, req, { entidade: "cash_movement", id: req.params.id, acao: "update", alterados, atual, motivo });
        await audit(pool, req.user.id, "request_correction", "cash_movement", req.params.id, req.ip);
        return res.status(202).json({ pendente_aprovacao: true, correction_id: pedido, message: MSG_PEDIDO });
      }

      const item = await aplicarLancamento(pool, req.params.id, alterados);
      if (item === undefined) return res.json({ item: atual }); // nada mudou
      if (!item) return res.status(404).json({ error: "Lançamento não encontrado." });
      await audit(pool, req.user.id, "update", "cash_movement", req.params.id, req.ip);
      res.json({ item });
    }),
  );

  // DELETE /api/cash/:id?motivo= — para o tesoureiro, vira pedido de exclusão.
  router.delete(
    "/:id",
    CAIXA,
    h(async (req, res) => {
      if (PEDE_APROVACAO.includes(req.user.role)) {
        const atual = (await pool.query(SQL_ATUAL.cash_movement, [req.params.id])).rows[0];
        if (!atual) return res.status(404).json({ error: "Lançamento não encontrado." });
        const motivo = motivoDe(req);
        if (!motivo) return res.status(400).json({ error: "Informe o motivo da exclusão (ele vai para o Venerável aprovar).", code: "motivo_obrigatorio" });
        const pedido = await registrarPedido(pool, req, { entidade: "cash_movement", id: req.params.id, acao: "delete", alterados: null, atual, motivo });
        await audit(pool, req.user.id, "request_correction", "cash_movement", req.params.id, req.ip);
        return res.status(202).json({ pendente_aprovacao: true, correction_id: pedido, message: MSG_PEDIDO });
      }
      const r = await pool.query("DELETE FROM cash_movements WHERE id = $1 RETURNING id", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Lançamento não encontrado." });
      await audit(pool, req.user.id, "delete", "cash_movement", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
