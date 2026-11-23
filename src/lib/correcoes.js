// ============================================================
// Correções financeiras com aprovação do Venerável:
// o tesoureiro lança e faz a rotina, mas
// corrigir um lançamento já feito (valor, tipo, mês, irmão, data,
// motivo, desfazer pagamento ou excluir) vira um PEDIDO que só o
// Venerável aprova. O Venerável (e o admin, como reserva técnica)
// corrige direto.
// ============================================================

/** Perfis que pedem aprovação para corrigir lançamentos. */
export const PEDE_APROVACAO = ["tesoureiro"];

// Campos que mexem em dinheiro (os demais — descrição, observações,
// vencimento, ata — o tesoureiro altera sem aprovação).
const FINANCEIROS = {
  contribution: ["brother_id", "contributor_name", "reference_month", "contribution_type", "amount"],
  cash_movement: ["kind", "category", "amount", "movement_date"],
};

// Mudanças de situação que são rotina (não são correção).
const ROTINA_STATUS = {
  pendente: ["pago", "isento", "cancelado"],
  isento: ["pendente"],
  cancelado: ["pendente"],
};

const normalizar = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Math.round(v * 100) / 100;
  if (/^-?\d+(\.\d+)?$/.test(String(v))) return Math.round(Number(v) * 100) / 100;
  return String(v);
};

/** SELECT do registro atual, com datas e valores já em texto/número. */
export const SQL_ATUAL = {
  contribution: `SELECT id, brother_id::text AS brother_id, contributor_name, reference_month, contribution_type,
                        description, amount::float AS amount, to_char(due_date, 'YYYY-MM-DD') AS due_date,
                        status, notes
                   FROM contributions WHERE id = $1`,
  cash_movement: `SELECT id, kind, category, description, amount::float AS amount,
                         to_char(movement_date, 'YYYY-MM-DD') AS movement_date, reference_month, approval_ref, notes
                    FROM cash_movements WHERE id = $1`,
};

/** Motivo da correção enviado junto com a alteração (obrigatório no pedido). */
export function motivoDe(req) {
  const m = String(req.body?.motivo_correcao ?? req.query?.motivo ?? "").trim();
  return m.length >= 3 ? m.slice(0, 500) : "";
}

/** Campos que realmente mudaram em relação ao registro atual. */
export function camposAlterados(atual, dados) {
  const mudou = {};
  for (const [campo, valor] of Object.entries(dados)) {
    if (valor === undefined) continue;
    if (normalizar(atual[campo]) !== normalizar(valor)) mudou[campo] = valor;
  }
  return mudou;
}

/** A alteração é uma correção que precisa do Venerável? */
export function ehCorrecao(entidade, atual, alterados) {
  if (FINANCEIROS[entidade].some((c) => c in alterados)) return true;
  if (entidade === "contribution" && "status" in alterados) {
    const permitidos = ROTINA_STATUS[atual.status] || [];
    if (!permitidos.includes(alterados.status)) return true;
  }
  return false;
}

/** Registra o pedido de correção e avisa o Venerável. */
export async function registrarPedido(pool, req, { entidade, id, acao, alterados, atual, motivo }) {
  const r = await pool.query(
    `INSERT INTO financial_corrections(entity_type, entity_id, action, changes, before_data, reason,
                                       requested_by, requested_by_name)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
     RETURNING id`,
    [entidade, id, acao, JSON.stringify(alterados || null), JSON.stringify(atual || null), motivo, req.user.id, req.user.full_name],
  );
  await pool.query(
    `INSERT INTO notifications(target_role, title, message, page, ref_id, created_by)
     VALUES ('veneravel', $1, $2, 'financeiro', $3, $4)`,
    [
      "Correção financeira aguardando sua aprovação",
      `${req.user.full_name} pediu para ${acao === "delete" ? "excluir" : "corrigir"} um lançamento. Motivo: ${motivo}`,
      r.rows[0].id,
      req.user.id,
    ],
  );
  return r.rows[0].id;
}

export const MSG_PEDIDO =
  "Correção enviada para aprovação do Venerável Mestre. O lançamento só muda depois que ele aprovar (veja “Correções aguardando aprovação” no Financeiro).";
