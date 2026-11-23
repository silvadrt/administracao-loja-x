// ============================================================
// Verificação rápida de ponta a ponta (com o servidor rodando).
// Uso:  node scripts/verificar-api.mjs email@teste.org "senha"
// Testa: saúde, login, sessão, painel e lista de irmãos.
// ============================================================
const base = process.env.VERIFICAR_URL || "http://localhost:3000";
const email = process.argv[2];
const senha = process.argv[3];

let falhas = 0;
function ok(nome, condicao, detalhe = "") {
  console.log(`${condicao ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!condicao) falhas++;
}

// 1. Saúde
try {
  const r = await fetch(`${base}/health`);
  const dados = await r.json();
  ok("Servidor respondendo", r.ok, `status: ${dados.status}, banco: ${dados.db}`);
} catch (err) {
  ok("Servidor respondendo", false, err.message);
  console.log("\n  O servidor não está no ar. Inicie com: npm start");
  process.exit(1);
}

if (!email || !senha) {
  console.log("\n  Para testar o login, informe e-mail e senha:");
  console.log('  node scripts/verificar-api.mjs seu@email.com "SUA-SENHA"');
  process.exit(falhas ? 1 : 0);
}

// 2. Login
let sessao;
try {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  const dados = await r.json();
  ok("Login", r.ok, r.ok ? `perfil: ${dados.user.role}` : dados.error);
  sessao = dados;
  if (!r.ok) process.exit(1);
} catch (err) {
  ok("Login", false, err.message);
  process.exit(1);
}

const auth = { Authorization: `Bearer ${sessao.access_token}` };

// 3. Sessão
try {
  const r = await fetch(`${base}/api/me`, { headers: auth });
  const dados = await r.json();
  ok("Sessão (/api/me)", r.ok, r.ok ? dados.user.name : dados.error);
} catch (err) {
  ok("Sessão (/api/me)", false, err.message);
}

if (sessao.must_change_password) {
  console.log("ℹ Este usuário ainda usa senha provisória.");
  console.log("  É esperado que os demais módulos fiquem bloqueados até trocar a senha");
  console.log("  (faça a troca pelo painel, na tela que aparece logo após o login).");
  console.log("");
  if (falhas === 0) console.log("✓ Login e segurança funcionando!");
  else console.log(`✗ ${falhas} verificação(ões) falharam.`);
  process.exit(falhas ? 1 : 0);
}

// 4. Painel
try {
  const r = await fetch(`${base}/api/reports/dashboard`, { headers: auth });
  const d = await r.json();
  ok(
    "Painel (/api/reports/dashboard)",
    r.ok,
    r.ok ? `${d.brothers.total} irmãos, ${d.upcoming_events_count} sessões próximas` : d.error,
  );
} catch (err) {
  ok("Painel", false, err.message);
}

// 5. Irmãos
try {
  const r = await fetch(`${base}/api/brothers?limit=5`, { headers: auth });
  const d = await r.json();
  ok("Irmãos (/api/brothers)", r.ok, r.ok ? `${d.items.length} registros na amostra` : d.error);
} catch (err) {
  ok("Irmãos", false, err.message);
}

console.log("");
if (falhas === 0) console.log("✓ Tudo funcionando de ponta a ponta!");
else console.log(`✗ ${falhas} verificação(ões) falharam.`);
process.exit(falhas ? 1 : 0);
