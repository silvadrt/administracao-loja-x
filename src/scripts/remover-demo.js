// ============================================================
// Apaga os dados de demonstração deixados pelo `npm run seed:demo`.
// Só toca no que está marcado como fictício (CIM "DEMO-…",
// títulos/textos com "(demonstração)" ou "FICTÍCIO") — nada de
// dados reais é apagado.
//
// Uso:
//   npm run seed:demo:remover                        (banco local)
//   npm run seed:demo:remover -- --so-contar         (simulação: só mostra a conta)
//   npm run seed:demo:remover -- --confirmar-nuvem   (banco na nuvem)
// ============================================================
import { pool } from "../db.js";

const SO_CONTAR = process.argv.includes("--so-contar");

if (process.env.NODE_ENV === "production") {
  console.error("✗ Por segurança, a remoção da demonstração não roda com NODE_ENV=production.");
  process.exit(1);
}

const urlBanco = process.env.DATABASE_URL ?? "";
const ehBancoLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(urlBanco);
if (!ehBancoLocal && !process.argv.includes("--confirmar-nuvem")) {
  console.error("✗ Este comando apagaria dados em um banco que NÃO é o local:");
  console.error("   " + urlBanco.replace(/:[^:@/]+@/, ":****@"));
  console.error("  Se é isso mesmo que você quer, rode:");
  console.error("   npm run seed:demo:remover -- --confirmar-nuvem");
  process.exit(1);
}

const IRMAOS_DEMO = "(SELECT id FROM brothers WHERE cim LIKE 'DEMO-%')";
const MANDATOS_DEMO =
  "(SELECT id FROM mandates WHERE COALESCE(notes,'') ILIKE '%FICTÍCIO%' OR label ILIKE '%demonstração%')";

// A ordem importa: cada passo é seguro em relação às chaves estrangeiras
// (contribuições antes dos irmãos, cargos antes dos mandatos etc.).
const PASSOS = [
  ["contribuições (mensalidades)", `DELETE FROM contributions WHERE brother_id IN ${IRMAOS_DEMO}`],
  ["familiares", `DELETE FROM family_members WHERE brother_id IN ${IRMAOS_DEMO}`],
  ["fraternidade feminina", `DELETE FROM fraternity_members WHERE related_brother_id IN ${IRMAOS_DEMO}`],
  ["cargos do quadro (Venerância)", `DELETE FROM lodge_officers WHERE mandate_id IN ${MANDATOS_DEMO} OR brother_id IN ${IRMAOS_DEMO}`],
  ["mandatos", `DELETE FROM mandates WHERE id IN ${MANDATOS_DEMO}`],
  ["atas", `DELETE FROM minutes WHERE number LIKE 'DEMO%'`],
  ["movimentos de caixa", `DELETE FROM cash_movements WHERE description ILIKE '%(demonstração)%'`],
  ["comunicados", `DELETE FROM communications WHERE title ILIKE '%(demonstração)%'`],
  ["visitações", `DELETE FROM visits WHERE COALESCE(notes,'') ILIKE '%FICTÍCIO%'`],
  [
    "presenças",
    `DELETE FROM attendance
      WHERE event_id IN (SELECT id FROM events WHERE title ILIKE '%(demonstração)%')
         OR brother_id IN ${IRMAOS_DEMO}`,
  ],
  ["sessões/eventos", `DELETE FROM events WHERE title ILIKE '%(demonstração)%'`],
  ["irmãos", `DELETE FROM brothers WHERE cim LIKE 'DEMO-%'`],
];

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const resumo = [];
    let total = 0;
    for (const [nome, sql] of PASSOS) {
      const r = await client.query(sql);
      resumo.push([nome, r.rowCount]);
      total += r.rowCount;
    }

    if (SO_CONTAR) {
      await client.query("ROLLBACK");
      console.log("• Simulação (--so-contar): nada foi apagado.");
    } else {
      await client.query("COMMIT");
    }

    console.log((SO_CONTAR ? "Sairiam" : "✓ Apagados") + ":");
    for (const [nome, n] of resumo) {
      if (n) console.log(`  ${String(n).padStart(4)}  ${nome}`);
    }
    console.log(`  ${String(total).padStart(4)}  TOTAL`);
    if (!SO_CONTAR) {
      console.log("  (usuários, dados da Loja e histórico de auditoria foram preservados)");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
} catch (err) {
  console.error("✗ Falha ao remover a demonstração:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
