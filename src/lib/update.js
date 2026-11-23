// ============================================================
// Monta a instrução SQL de UPDATE dinamicamente.
// Somente os campos informados (presentes no corpo da requisição)
// são atualizados — os demais ficam intactos.
// ============================================================
export function buildUpdate(table, columns, data, whereColumn, whereValue) {
  const sets = [];
  const values = [];

  for (const col of columns) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      values.push(data[col]);
      sets.push(`${col} = $${values.length}`);
    }
  }

  if (sets.length === 0) return null; // nada para atualizar

  values.push(whereValue);
  return {
    text: `UPDATE ${table} SET ${sets.join(", ")} WHERE ${whereColumn} = $${values.length} RETURNING *`,
    values,
  };
}
