// ============================================================
// Dados de demonstração (APENAS PARA TESTES).
// Nomes e valores são FICTÍCIOS — nunca use dados reais aqui.
//
// Uso:
//   npm run seed:demo                                 (banco local, exige banco vazio)
//   npm run seed:demo -- --aditivo                    (ACRESCENTA sem apagar nada)
//   npm run seed:demo -- --aditivo --confirmar-nuvem  (ex.: demonstração na nuvem)
//
// Recusa executar se o ambiente for de produção. Em banco que não
// seja o local, exige --confirmar-nuvem. Sem --aditivo, recusa se
// já houver irmãos cadastrados.
//
// Todos os registros ficam MARCADOS (CIM "DEMO-…", títulos/textos
// com "(demonstração)" ou "FICTÍCIO") e há um comando para apagá-los:
//   npm run seed:demo:remover [-- --confirmar-nuvem]
// ============================================================
import { pool } from "../db.js";
import { CARGOS } from "../schemas.js";

const ADITIVO = process.argv.includes("--aditivo");

if (process.env.NODE_ENV === "production") {
  console.error("✗ Por segurança, o seed de demonstração não roda em produção.");
  process.exit(1);
}

// Segunda trava: mesmo em desenvolvimento, recusa gravar dados FICTÍCIOS
// em um banco que não seja o local. Evita "sujar" o banco da nuvem sem querer.
const urlBanco = process.env.DATABASE_URL ?? "";
const ehBancoLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(urlBanco);
if (!ehBancoLocal && !process.argv.includes("--confirmar-nuvem")) {
  console.error("✗ Este comando gravaria dados FICTÍCIOS em um banco que NÃO é o local:");
  console.error("   " + urlBanco.replace(/:[^:@/]+@/, ":****@"));
  console.error("  Se é isso mesmo que você quer (ex.: demonstração na nuvem), rode:");
  console.error("   npm run seed:demo -- --confirmar-nuvem");
  process.exit(1);
}

const irmãos = [
  // O CIM "DEMO-xx" marca os registros fictícios (e evita conflito com CIMs reais).
  ["José da Silva Santos", "DEMO-01", "1968-04-12", "Mestre", "(61) 99911-0001", "ativo"],
  ["Carlos Alberto Mendes", "DEMO-02", "1972-09-03", "Mestre", "(61) 99911-0002", "ativo"],
  ["Roberto Ferreira Lima", "DEMO-03", "1975-01-27", "Companheiro", "(61) 99911-0003", "ativo"],
  ["Paulo Henrique Costa", "DEMO-04", "1980-06-15", "Mestre", "(61) 99911-0004", "ativo"],
  ["Antônio Carlos Oliveira", "DEMO-05", "1965-11-30", "Mestre", "(61) 99911-0005", "ativo"],
  ["Marcos Vinícius Rocha", "DEMO-06", "1983-03-08", "Companheiro", "(61) 99911-0006", "ativo"],
  ["Fernando Augusto Pires", "DEMO-07", "1978-08-21", "Aprendiz", "(61) 99911-0007", "ativo"],
  ["Ricardo Nunes Pereira", "DEMO-08", "1970-12-05", "Mestre", "(61) 99911-0008", "afastado"],
];

const familiares = [
  ["Maria Auxiliadora Santos", "Esposa", 0, "1972-04-12"],
  ["Helena Mendes", "Esposa", 1, "1978-09-03"],
  ["Clara Ferreira Lima", "Filha", 2, "2005-01-27"],
  ["Ana Beatriz Costa", "Filha", 3, null],
];

const fraternidade = [
  ["Maria Auxiliadora Santos", "Presidente", 0],
  ["Helena Mendes", "Secretária", 1],
  ["Clara Ferreira Lima", "Tesoureira", 2],
  ["Ana Beatriz Costa", "Membro", 3],
];

try {
  if (!ADITIVO) {
    const existentes = await pool.query("SELECT count(*)::int AS n FROM brothers");
    if (existentes.rows[0].n > 0) {
      console.error(
        `✗ Já existem ${existentes.rows[0].n} irmão(s) cadastrado(s). O seed de demonstração não sobrescreve dados.`,
      );
      console.error("  Para ACRESCENTAR a demonstração sem tocar nos dados existentes, use:");
      console.error("   npm run seed:demo -- --aditivo");
      process.exit(1);
    }
  } else {
    console.log("• Modo --aditivo: os dados de demonstração serão ACRESCENTADOS (nada existente é apagado).");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Irmãos
    const ids = [];
    for (const [nome, cim, nascimento, grau, telefone, situacao] of irmãos) {
      const r = await client.query(
        `INSERT INTO brothers(full_name, cim, birth_date, degree, phone, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,'FICTÍCIO — registro de demonstração (pode ser apagado).') RETURNING id`,
        [nome, cim, nascimento, grau, telefone, situacao],
      );
      ids.push(r.rows[0].id);
    }

    // Familiares
    for (const [nome, parentesco, idx, nascimento] of familiares) {
      await client.query(
        `INSERT INTO family_members(brother_id, full_name, relationship, birth_date) VALUES ($1,$2,$3,$4)`,
        [ids[idx], nome, parentesco, nascimento],
      );
    }

    // Aniversariantes "de hoje" (para testar o aviso de aniversário):
    // um irmão e uma familiar com data no dia de hoje, em qualquer mês.
    await client.query(
      `UPDATE brothers SET birth_date = make_date(1975, date_part('month', CURRENT_DATE)::int, date_part('day', CURRENT_DATE)::int)
        WHERE id = $1`,
      [ids[6]],
    );
    await client.query(
      `UPDATE family_members SET birth_date = make_date(2005, date_part('month', CURRENT_DATE)::int, date_part('day', CURRENT_DATE)::int)
        WHERE full_name = 'Clara Ferreira Lima'`,
    );

    // Mandato em vigor e quadro de oficiais (Venerância)
    const mandato = await client.query(
      `INSERT INTO mandates(label, started_on, notes)
       VALUES ('Mandato 2026/2027 (demonstração)', DATE '2026-01-01',
               'Mandato FICTÍCIO criado para demonstração — pode ser apagado.')
       RETURNING id`,
    );
    const mandatoId = mandato.rows[0].id;
    const cargos = [
      ["veneravel_mestre", 0],
      ["primeiro_vigilante", 1],
      ["segundo_vigilante", 2],
      ["orador", 4],
      ["secretario", 3],
      ["tesoureiro", 5],
      ["mestre_cerimonias", 6],
      ["hospitaleiro", 2],
      ["primeiro_diacono", 1],
      ["segundo_diacono", 6],
      ["cobridor_interno", 5],
      ["cobridor_externo", 4],
      ["mestre_harmonia", 3],
      ["mestre_banquete", 0],
    ];
    for (const [chave, idx] of cargos) {
      const cargo = CARGOS.find((c) => c.key === chave);
      await client.query(
        `INSERT INTO lodge_officers(office_name, cargo, category, mandate_id, active, brother_id, term_start)
         VALUES ($1,$2,$3,$4, true, $5, DATE '2026-01-01')`,
        [cargo.label, cargo.key, cargo.categoria, mandatoId, ids[idx]],
      );
    }

    // Fraternidade Feminina
    for (const [nome, cargo, idx] of fraternidade) {
      await client.query(
        `INSERT INTO fraternity_members(full_name, role_name, related_brother_id) VALUES ($1,$2,$3)`,
        [nome, cargo, ids[idx]],
      );
    }

    // Sessões (passadas e futuras)
    const eventos = [
      ["Sessão Ordinária (demonstração)", "sessao_ordinaria", "-14 days", "Templo da Loja"],
      ["Sessão Ordinária (demonstração)", "sessao_ordinaria", "-7 days", "Templo da Loja"],
      ["Sessão Ordinária (demonstração)", "sessao_ordinaria", "+3 days", "Templo da Loja"],
      ["Reunião da Fraternidade Feminina (demonstração)", "fraternidade", "+9 days", "Salão de festas"],
      ["Aniversário da Loja (demonstração)", "aniversario", "+20 days", "Templo da Loja"],
      ["Sessão Magnífica (demonstração)", "sessao_magnifica", "+35 days", "Templo da Loja"],
      ["Sessão Ordinária (demonstração)", "sessao_ordinaria", "+45 days", "Templo da Loja"],
    ];
    const eventIds = [];
    for (const [titulo, tipo, offset, local] of eventos) {
      const r = await client.query(
        `INSERT INTO events(title, event_type, starts_at, location)
         VALUES ($1,$2, (now() + $3::interval)::date + time '19:30', $4) RETURNING id`,
        [titulo, tipo, offset, local],
      );
      eventIds.push(r.rows[0].id);
    }

    // Presença nas duas sessões passadas
    for (const eventId of [eventIds[0], eventIds[1]]) {
      for (let i = 0; i < ids.length; i++) {
        const status = i === 7 ? "justificado" : i < 6 ? "presente" : "ausente";
        await client.query(
          `INSERT INTO attendance(event_id, brother_id, status) VALUES ($1,$2,$3)`,
          [eventId, ids[i], status],
        );
      }
    }

    // Visitações
    await client.query(
      `INSERT INTO visits(visit_type, brother_name, lodge_name, power_name, visit_date, notes)
       VALUES
        ('realizada','José da Silva Santos','A∴R∴L∴S∴ Luz de Brasília','GOB', CURRENT_DATE - 10, 'FICTÍCIO — demonstração.'),
        ('recebida','Pedro Álvares Cabral','A∴R∴L∴S∴ Fraternidade Universitária','GOB', CURRENT_DATE - 3, 'FICTÍCIO — demonstração.')`,
    );

    // Mensalidades dos últimos 3 meses
    const agora = new Date();
    for (let m = 2; m >= 0; m--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - m, 1);
      const ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      for (let i = 0; i < ids.length; i++) {
        const pago = m > 0 || i < 4; // mês atual: só parte paga
        await client.query(
          `INSERT INTO contributions(contributor_name, brother_id, reference_month, contribution_type, amount, due_date, status, paid_at)
           VALUES ((SELECT full_name FROM brothers WHERE id = $1), $1, $2, 'mensalidade', 150.00, ($2 || '-10')::date, $3, CASE WHEN $3 = 'pago' THEN now() ELSE NULL END)`,
          [ids[i], ref, pago ? "pago" : "pendente"],
        );
      }
    }

    // Comunicado de exemplo
    await client.query(
      `INSERT INTO communications(title, message, status)
       VALUES ('Convocação — Sessão Ordinária (demonstração)', 'Irmãos, lembramos a todos da Sessão Ordinária desta quinta-feira, às 19h30, no Templo da Loja.\n\nTema: fortalecimento da fraternidade.\n\nAdministração Loja X', 'rascunho')`,
    );

    // Livro de Atas (Secretaria) — textos FICTÍCIOS
    await client.query(
      `INSERT INTO minutes(number, title, session_date, session_type, degree, body, decisions, status, sent_to_gob_at, gob_protocol)
       VALUES
        ('DEMO 01/2026', 'Sessão ordinária de instrução',
         CURRENT_DATE - 21, 'Sessão Ordinária', 'Mestre',
         'Aos vinte e um dias do mês passado, às 19h30, no Templo da Loja, reuniu-se a Administração Loja X, sob a presidência do Venerável Mestre, com a presença de oito obreiros. Aberta a sessão, foi lida e aprovada a ata anterior. Em seguida o Orador apresentou a peça de arquitetura do mês, versando sobre a virtude da tolerância. (Texto FICTÍCIO de demonstração.)',
         'Aprovada a peça de arquitetura e autorizado o auxílio de beneficência no valor de R$ 250,00. (Demonstração.)',
         'enviada', CURRENT_DATE - 18, 'GOB-2026-0001'),
        ('DEMO 02/2026', 'Sessão ordinária — prestação de contas',
         CURRENT_DATE - 14, 'Sessão Ordinária', 'Todos os graus',
         'Aos quatorze dias, às 19h30, reuniu-se a Loja em sessão ordinária. O Tesoureiro apresentou o balanço do mês, com as entradas e saídas do caixa, que foi aprovado por unanimidade. (Texto FICTÍCIO de demonstração.)',
         'Aprovado o balanço financeiro do mês, sem ressalvas. (Demonstração.)',
         'aprovada', NULL, NULL),
        ('DEMO 03/2026', 'Sessão magna de aniversário da Loja',
         CURRENT_DATE - 7, 'Sessão Magna', 'Todos os graus',
         'Aos sete dias, às 20h00, reuniu-se a Loja em Sessão Magna para comemorar o aniversário de sua fundação, com a presença de visitantes das Lojas coirmãs. (Texto FICTÍCIO de demonstração.)',
         NULL,
         'rascunho', NULL, NULL)`,
    );

    // Movimento de caixa (Tesouraria) — valores FICTÍCIOS
    const caixa = [
      ["saida", "luz", "Conta de luz do Templo — energia elétrica (demonstração)", 320.55, "-20 days"],
      ["saida", "agua", "Conta de água e saneamento (demonstração)", 145.9, "-18 days"],
      ["saida", "gob", "Repasse ao GOB (demonstração)", 480, "-15 days"],
      ["saida", "retirada", "Retirada para despesas miúdas (demonstração)", 100, "-10 days"],
      ["entrada", "doacao", "Doação de irmão para a beneficência (demonstração)", 250, "-9 days"],
      ["saida", "obras", "Obra do telhado — 1ª parcela (demonstração)", 1200, "-5 days"],
      ["saida", "internet", "Internet do Templo (demonstração)", 119.9, "-2 days"],
    ];
    for (const [kind, category, description, amount, dias] of caixa) {
      await client.query(
        `INSERT INTO cash_movements(kind, category, description, amount, movement_date, reference_month)
         VALUES ($1,$2,$3,$4, (CURRENT_DATE + $5::interval)::date, to_char(CURRENT_DATE, 'YYYY-MM'))`,
        [kind, category, description, amount, dias],
      );
    }

    await client.query("COMMIT");
    console.log("✓ Dados de demonstração carregados (irmãos, familiares, mandato e quadro de oficiais, sessões, presenças, visitações, mensalidades, atas, caixa e 1 comunicado).");
    console.log("  Lembre-se: estes dados são FICTÍCIOS e servem apenas para testar o sistema.");
    console.log("  Para apagá-los depois: npm run seed:demo:remover [-- --confirmar-nuvem]");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
} catch (err) {
  console.error("✗ Falha ao carregar demonstração:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
