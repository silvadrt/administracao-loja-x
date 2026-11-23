// ============================================================
// Regras comuns da Tesouraria (Financeiro, Caixa e relatórios).
//
// Regra do saldo (decisão do responsável, 21/10/2026 — v0.4.0):
//   - todo dinheiro que entra (contribuições pagas + entradas avulsas) e
//     todo dinheiro que sai (saídas) forma o SALDO TOTAL da Loja;
//   - dentro dele, o TRONCO DE BENEFICÊNCIA tem saldo próprio: recebe as
//     contribuições/entradas do tipo "tronco" e só é abatido pelas saídas
//     de "beneficência";
//   - o DISPONÍVEL da Loja (fundo geral) é o saldo total menos o tronco.
//     Despesas e retiradas comuns abatem só o fundo geral.
//   - o saldo do tronco nunca é limitado pelo dinheiro em caixa: se o
//     disponível ficar negativo, a Loja DEVE essa diferença ao tronco e
//     precisa repor. O tronco só sai pela
//     beneficência ou por retirada específica aprovada em ata.
// ============================================================
import { TRONCO_ENTRADA, TRONCO_SAIDAS } from "../schemas.js";

const CATEGORIAS_TRONCO = [TRONCO_ENTRADA, ...TRONCO_SAIDAS].map((c) => `'${c}'`).join(", ");

/** Arredonda para centavos (somas NUMERIC viram float no JavaScript). */
export const arredondar = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Período dos relatórios: from/to (as duas datas) têm prioridade; senão
 * ano + mês; senão o ano inteiro (padrão: ano atual).
 */
export function periodoRelatorio(query) {
  const hoje = new Date();
  const ano = /^\d{4}$/.test(String(query.ano || "")) ? Number(query.ano) : hoje.getFullYear();
  const mes = /^(0?[1-9]|1[0-2])$/.test(String(query.mes || "")) ? Number(query.mes) : null;
  const ehData = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  let de;
  let ate;
  if (ehData(query.from) && ehData(query.to)) {
    de = String(query.from);
    ate = String(query.to);
  } else if (mes) {
    de = `${ano}-${String(mes).padStart(2, "0")}-01`;
    ate = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
  } else {
    de = `${ano}-01-01`;
    ate = `${ano}-12-31`;
  }
  return { ano, mes, de, ate };
}

/**
 * Todos os lançamentos que movimentam dinheiro, numa só lista:
 * contribuições pagas (entrada) + lançamentos avulsos de entrada/saída.
 * Cada linha diz a que fundo pertence ("tronco" ou "geral").
 */
export const LANCAMENTOS_CTE = `lancamentos AS (
  SELECT 'contribuicao'::text AS origem, c.id, 'entrada'::text AS kind,
         c.contribution_type AS category,
         CASE WHEN c.description IS NOT NULL
              THEN COALESCE(b.full_name, NULLIF(c.contributor_name, ''), 'Contribuição') || ' — ' || c.description
              ELSE COALESCE(b.full_name, NULLIF(c.contributor_name, ''), 'Contribuição') END AS description,
         c.amount,
         COALESCE(c.paid_at::date, c.due_date, c.created_at::date) AS data,
         c.reference_month, NULL::text AS approval_ref,
         CASE WHEN c.contribution_type = '${TRONCO_ENTRADA}' THEN 'tronco' ELSE 'geral' END AS fundo,
         c.created_at
    FROM contributions c
    LEFT JOIN brothers b ON b.id = c.brother_id
   WHERE c.status = 'pago'
  UNION ALL
  SELECT 'caixa'::text, m.id, m.kind, m.category, m.description,
         m.amount, m.movement_date, m.reference_month, m.approval_ref,
         CASE WHEN m.category IN (${CATEGORIAS_TRONCO}) THEN 'tronco' ELSE 'geral' END,
         m.created_at
    FROM cash_movements m
)`;

/** Consulta dos saldos acumulados (desde o início), por fundo. */
export const SALDOS_SQL = `WITH ${LANCAMENTOS_CTE}
  SELECT
    COALESCE(sum(amount) FILTER (WHERE origem = 'contribuicao'), 0)::float AS contribuicoes_pagas,
    COALESCE(sum(amount) FILTER (WHERE origem = 'caixa' AND kind = 'entrada'), 0)::float AS entradas_avulsas,
    COALESCE(sum(amount) FILTER (WHERE fundo = 'geral' AND kind = 'entrada'), 0)::float AS geral_entradas,
    COALESCE(sum(amount) FILTER (WHERE fundo = 'geral' AND kind = 'saida'), 0)::float AS geral_saidas,
    COALESCE(sum(amount) FILTER (WHERE fundo = 'tronco' AND kind = 'entrada'), 0)::float AS tronco_entradas,
    COALESCE(sum(amount) FILTER (WHERE fundo = 'tronco' AND kind = 'saida'), 0)::float AS tronco_saidas
  FROM lancamentos`;

/** Monta o objeto de saldos a partir da linha de SALDOS_SQL. */
export function montarSaldos(linha = {}) {
  const geralEntradas = arredondar(linha.geral_entradas);
  const geralSaidas = arredondar(linha.geral_saidas);
  const troncoEntradas = arredondar(linha.tronco_entradas);
  const troncoSaidas = arredondar(linha.tronco_saidas);
  const geral = arredondar(geralEntradas - geralSaidas);
  const tronco = arredondar(troncoEntradas - troncoSaidas);
  return {
    contribuicoes_pagas: arredondar(linha.contribuicoes_pagas),
    entradas_avulsas: arredondar(linha.entradas_avulsas),
    entradas: arredondar(geralEntradas + troncoEntradas),
    saidas: arredondar(geralSaidas + troncoSaidas),
    total: arredondar(geral + tronco),
    geral: { entradas: geralEntradas, saidas: geralSaidas, saldo: geral },
    tronco: { entradas: troncoEntradas, saidas: troncoSaidas, saldo: tronco },
    // Disponível da Loja = fundo geral (o tronco fica reservado à beneficência).
    disponivel: geral,
    // Quanto a Loja deve repor ao tronco (usou dinheiro da beneficência).
    devido_ao_tronco: geral < 0 && tronco > 0 ? arredondar(Math.min(-geral, tronco)) : 0,
  };
}
