// ============================================================
// Cria um usuário do sistema (o primeiro deve ser admin).
// Uso:
//   npm run user:create -- "Nome Completo" email@exemplo.com "SENHA-FORTE" admin
// ============================================================
import "dotenv/config";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db.js";
import { ROLES, senhaForte, SENHA_REGRA_TEXTO } from "../schemas.js";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: senhaForte,
  role: z.enum(ROLES),
});

const [name, email, password, role] = process.argv.slice(2);
const p = schema.safeParse({ name, email, password, role });

if (!p.success) {
  console.error("Uso: npm run user:create -- \"Nome Completo\" email@exemplo.com \"SENHA-FORTE\" admin");
  console.error("Perfis disponíveis:", ROLES.join(", "));
  console.error("Regra da senha:", SENHA_REGRA_TEXTO);
  for (const i of p.error.issues) console.error(`  - ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(p.data.password, 12);
  await pool.query(
    `INSERT INTO app_users(full_name, email, password_hash, role, must_change_password)
     VALUES ($1,$2,$3,$4,true)`,
    [p.data.name, p.data.email.toLowerCase(), hash, p.data.role],
  );
  console.log(`✓ Usuário criado: ${p.data.email} (perfil: ${p.data.role})`);
  console.log("  No primeiro acesso, o sistema pedirá a troca da senha.");
} catch (err) {
  console.error("✗ Falha ao criar usuário:", err.code === "23505" ? "e-mail já cadastrado." : err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
