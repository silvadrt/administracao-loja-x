// ============================================================
// Redefine a senha de um usuário diretamente no banco.
// É o "último recurso" quando ninguém consegue entrar
// (ex.: o único administrador esqueceu a senha).
// Exige acesso ao servidor/banco — por isso NÃO abre nenhuma
// brecha pela internet.
//
// Uso:
//   npm run user:reset -- email@exemplo.com
//   npm run user:reset -- email@exemplo.com "NOVA-SENHA"
//
// Se a senha não for informada, uma senha provisória aleatória é
// gerada e exibida. Em qualquer caso, o usuário é OBRIGADO a
// trocá-la no próximo acesso.
// ============================================================
import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db.js";
import { audit } from "../lib/audit.js";
import { senhaForte, SENHA_REGRA_TEXTO } from "../schemas.js";

const schemaEmail = z.string().trim().email().max(254);

/** Gera uma senha provisória aleatória que já cumpre a regra (letra + número + símbolo). */
function senhaProvisoriaAleatoria() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const numeros = "23456789";
  const simbolos = "!@#$%&*?";
  const todos = letras + numeros + simbolos;
  const sorteia = (conjunto) => conjunto[crypto.randomInt(conjunto.length)];
  const partes = [sorteia(letras), sorteia(numeros), sorteia(simbolos)];
  for (let i = 0; i < 9; i++) partes.push(sorteia(todos));
  for (let i = partes.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [partes[i], partes[j]] = [partes[j], partes[i]];
  }
  return partes.join("");
}

const [emailArg, senhaArg] = process.argv.slice(2);
const email = schemaEmail.safeParse(emailArg);

if (!email.success) {
  console.error('Uso: npm run user:reset -- email@exemplo.com ["NOVA-SENHA"]');
  console.error("Regra da senha:", SENHA_REGRA_TEXTO);
  process.exit(1);
}

const senha = senhaArg ?? senhaProvisoriaAleatoria();
const senhaOk = senhaForte.safeParse(senha);
if (!senhaOk.success) {
  console.error("✗", senhaOk.error.issues[0].message);
  process.exit(1);
}

try {
  const u = await pool.query("SELECT id, full_name FROM app_users WHERE email = $1", [
    email.data.toLowerCase(),
  ]);
  if (!u.rows[0]) {
    console.error("✗ Nenhum usuário cadastrado com o e-mail informado.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(senha, 12);
  await pool.query(
    "UPDATE app_users SET password_hash = $1, must_change_password = true WHERE id = $2",
    [hash, u.rows[0].id],
  );
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [u.rows[0].id],
  );
  await audit(pool, u.rows[0].id, "reset_password_cli", "app_user", u.rows[0].id);

  console.log(`✓ Senha redefinida para: ${u.rows[0].full_name} (${email.data})`);
  if (!senhaArg) console.log(`  Senha provisória: ${senha}`);
  console.log("  Todas as sessões abertas foram encerradas.");
  console.log("  No próximo acesso o sistema pedirá a troca da senha.");
} catch (err) {
  console.error("✗ Falha ao redefinir a senha:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
