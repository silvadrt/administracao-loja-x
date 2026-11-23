// ============================================================
// Registro de auditoria: quem fez o quê, quando e de onde.
// O nome de quem agiu é gravado na própria linha, para que o
// histórico continue legível mesmo se a conta for apagada.
// Nunca deixa uma falha de auditoria derrubar a operação
// principal — apenas registra o problema no log do servidor.
// ============================================================
export async function audit(pool, userId, action, entityType, entityId = null, ip = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log(user_id, user_name, action, entity_type, entity_id, ip_address)
       VALUES ($1, (SELECT full_name FROM app_users WHERE id = $1), $2, $3, $4, $5)`,
      [userId ?? null, action, entityType, entityId ?? null, ip ?? null],
    );
  } catch (err) {
    console.error("Falha ao registrar auditoria:", err.message);
  }
}
