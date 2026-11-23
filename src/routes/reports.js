// ============================================================
// Relatórios: painel inicial, frequência, exportações CSV.
// ============================================================
import { Router } from "express";
import { h, toCsv } from "../lib/util.js";
import { roles } from "../middleware/auth.js";
import { LANCAMENTOS_CTE, periodoRelatorio, arredondar } from "../lib/financeiro.js";

export function reportRoutes({ pool }) {
  const router = Router();

  // GET /api/reports/dashboard — números dos cartões do painel inicial.
  // O conteúdo é montado conforme o perfil: cada ofício recebe apenas os
  // números das telas que pode acessar.
  router.get(
    "/dashboard",
    h(async (req, res) => {
      const papel = req.user.role;
      const podePessoas = ["admin", "veneravel", "secretario", "chanceler"].includes(papel);
      const podeFinanceiro = ["admin", "veneravel", "tesoureiro"].includes(papel);

      const [eventos, proximos] = await Promise.all([
        pool.query(
          `SELECT count(*)::int AS n FROM events
            WHERE starts_at >= now() AND starts_at < now() + interval '30 days'`,
        ),
        pool.query(
          `SELECT id, title, event_type, starts_at, location
             FROM events WHERE starts_at >= now()
            ORDER BY starts_at ASC LIMIT 5`,
        ),
      ]);

      const resposta = {
        upcoming_events_count: eventos.rows[0].n,
        upcoming_events: proximos.rows,
      };

      if (podePessoas) {
        const [irmaos, familias, fraternidade, visitas, comunicados] = await Promise.all([
          pool.query(
            `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE status = 'ativo')::int AS ativos,
                    count(*) FILTER (WHERE status = 'afastado')::int AS afastados,
                    count(*) FILTER (WHERE status = 'desligado')::int AS desligados
               FROM brothers`,
          ),
          pool.query("SELECT count(*)::int AS n FROM family_members"),
          pool.query("SELECT count(*)::int AS n FROM fraternity_members WHERE active = true"),
          pool.query(
            `SELECT count(*)::int AS n FROM visits
              WHERE date_part('year', visit_date) = date_part('year', now())`,
          ),
          pool.query(
            `SELECT count(*) FILTER (WHERE status IN ('rascunho','preparado'))::int AS em_aberto
               FROM communications`,
          ),
        ]);
        resposta.brothers = irmaos.rows[0];
        resposta.family_count = familias.rows[0].n;
        resposta.fraternity_count = fraternidade.rows[0].n;
        resposta.visits_year = visitas.rows[0].n;
        resposta.communications_open = comunicados.rows[0].em_aberto;
      }

      if (podeFinanceiro) {
        const financeiro = await pool.query(
          `SELECT count(*)::int AS pendentes, COALESCE(sum(amount), 0)::float AS valor_pendente
             FROM contributions WHERE status = 'pendente'`,
        );
        resposta.contributions = financeiro.rows[0];
      }

      res.json(resposta);
    }),
  );

  // GET /api/reports/frequency?year=2026 — frequência consolidada por irmão.
  // Contam todas as sessões em loja (tipo "Sessão ..."); ágapes, reuniões e
  // outros eventos ficam de fora. Falta justificada continua sendo falta.
  router.get(
    "/frequency",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
      const [porIrmao, sessoes] = await Promise.all([
        pool.query(
          `SELECT b.id AS brother_id, b.full_name, b.phone,
                  count(*) FILTER (WHERE a.status = 'presente')::int AS presente,
                  count(*) FILTER (WHERE a.status = 'ausente')::int AS ausente,
                  count(*) FILTER (WHERE a.status = 'justificado')::int AS justificado,
                  count(*)::int AS registros
             FROM attendance a
             JOIN brothers b ON b.id = a.brother_id
             JOIN events e ON e.id = a.event_id
            WHERE date_part('year', e.starts_at) = $1::int
              AND e.event_type ILIKE 'Sess%'
            GROUP BY b.id, b.full_name, b.phone
            ORDER BY lower(b.full_name)`,
          [year],
        ),
        pool.query(
          `SELECT count(*)::int AS n FROM events
            WHERE date_part('year', starts_at) = $1::int AND starts_at < now()
              AND event_type ILIKE 'Sess%'`,
          [year],
        ),
      ]);
      res.json({ year: Number(year), meetings: sessoes.rows[0].n, items: porIrmao.rows });
    }),
  );

  // GET /api/reports/attendance.csv?year=2026 — frequência detalhada.
  router.get(
    "/attendance.csv",
    roles("admin", "veneravel", "chanceler"),
    h(async (req, res) => {
      const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
      const r = await pool.query(
        `SELECT e.starts_at, e.title AS event_title, b.full_name AS brother_name, b.cim, a.status, a.notes
           FROM attendance a
           JOIN events e ON e.id = a.event_id
           JOIN brothers b ON b.id = a.brother_id
          WHERE date_part('year', e.starts_at) = $1::int
          ORDER BY e.starts_at, lower(b.full_name)`,
        [year],
      );
      const csv = toCsv(r.rows, [
        {
          key: "starts_at",
          label: "Data da sessão",
          value: (row) => new Date(row.starts_at).toLocaleDateString("pt-BR"),
        },
        { key: "event_title", label: "Sessão" },
        { key: "brother_name", label: "Irmão" },
        { key: "cim", label: "CIM" },
        { key: "status", label: "Presença" },
        { key: "notes", label: "Observações" },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="frequencia-${year}.csv"`);
      res.send(csv);
    }),
  );

  // GET /api/reports/brothers.csv — cadastro completo de irmãos.
  router.get(
    "/brothers.csv",
    roles("admin", "veneravel", "chanceler"),
    h(async (_req, res) => {
      const r = await pool.query(
        `SELECT full_name, cim, birth_date, degree, phone, email, status, address
           FROM brothers ORDER BY lower(full_name)`,
      );
      const csv = toCsv(r.rows, [
        { key: "full_name", label: "Nome" },
        { key: "cim", label: "CIM" },
        { key: "birth_date", label: "Nascimento", value: (row) => (row.birth_date ? new Date(row.birth_date).toLocaleDateString("pt-BR") : "") },
        { key: "degree", label: "Grau" },
        { key: "phone", label: "Telefone" },
        { key: "email", label: "E-mail" },
        { key: "status", label: "Situação" },
        { key: "address", label: "Endereço" },
      ]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="irmaos.csv"');
      res.send(csv);
    }),
  );

  // ---------- Aniversariantes (também alimenta o aviso de aniversário) ----------
  // GET /api/reports/aniversariantes?ano=&mes=&hoje=1&dias=30
  router.get(
    "/aniversariantes",
    h(async (req, res) => {
      const mes = /^(0?[1-9]|1[0-2])$/.test(String(req.query.mes || ""))
        ? Number(req.query.mes)
        : new Date().getMonth() + 1;
      const somenteHoje = String(req.query.hoje ?? "") === "1";

      const [irmaos, familiares, fraternidade] = await Promise.all([
        pool.query(
          `SELECT b.id, b.full_name AS nome, to_char(b.birth_date, 'YYYY-MM-DD') AS data, b.status, b.phone,
                  'Irmão' AS tipo, NULL::text AS vinculo
             FROM brothers b
            WHERE b.birth_date IS NOT NULL
              AND date_part('month', b.birth_date) = $1::int
              AND ($2 = false OR date_part('day', b.birth_date) = date_part('day', CURRENT_DATE))
            ORDER BY date_part('day', b.birth_date)`,
          [mes, somenteHoje],
        ),
        pool.query(
          `SELECT f.id, f.full_name AS nome, to_char(f.birth_date, 'YYYY-MM-DD') AS data, f.relationship AS tipo,
                  b.full_name AS vinculo, f.phone
             FROM family_members f
             LEFT JOIN brothers b ON b.id = f.brother_id
            WHERE f.birth_date IS NOT NULL
              AND date_part('month', f.birth_date) = $1::int
              AND ($2 = false OR date_part('day', f.birth_date) = date_part('day', CURRENT_DATE))
            ORDER BY date_part('day', f.birth_date)`,
          [mes, somenteHoje],
        ),
        pool.query(
          `SELECT fm.id, fm.full_name AS nome, to_char(fm.birth_date, 'YYYY-MM-DD') AS data, fm.role_name AS tipo,
                  b.full_name AS vinculo, fm.phone
             FROM fraternity_members fm
             LEFT JOIN brothers b ON b.id = fm.related_brother_id
            WHERE fm.birth_date IS NOT NULL AND fm.active = true
              AND date_part('month', fm.birth_date) = $1::int
              AND ($2 = false OR date_part('day', fm.birth_date) = date_part('day', CURRENT_DATE))
            ORDER BY date_part('day', fm.birth_date)`,
          [mes, somenteHoje],
        ),
      ]);

      // As datas vêm como texto "AAAA-MM-DD" (to_char), então o dia, o mês
      // e a idade são calculados sem depender do fuso do banco.
      const partes = (v) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
        return m ? { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) } : null;
      };
      const anoAtual = new Date().getFullYear();
      const itens = [...irmaos.rows, ...familiares.rows, ...fraternidade.rows]
        .map((x) => {
          const p = partes(x.data);
          if (!p) return { ...x, dia: null, aniversario: null, idade: null };
          return {
            ...x,
            data: `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`,
            dia: p.dia,
            mes: p.mes,
            aniversario: `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`,
            idade: anoAtual - p.ano,
          };
        })
        .sort((a, b) => (a.dia ?? 0) - (b.dia ?? 0));
      res.json({ mes, somente_hoje: somenteHoje, total: itens.length, items: itens });
    }),
  );

  // ---------- Relatório financeiro (entradas e saídas da Loja) ----------
  // GET /api/reports/financeiro?ano=&mes=&from=&to=
  router.get(
    "/financeiro",
    roles("admin", "veneravel", "tesoureiro"),
    h(async (req, res) => {
      const { de, ate } = periodoRelatorio(req.query);
      const r = await pool.query(
        `WITH ${LANCAMENTOS_CTE}
         SELECT * FROM lancamentos
          WHERE data BETWEEN $1::date AND $2::date
          ORDER BY data DESC, description`,
        [de, ate],
      );
      const entradas = r.rows.filter((x) => x.kind === "entrada").reduce((s, x) => s + Number(x.amount), 0);
      const saidas = r.rows.filter((x) => x.kind === "saida").reduce((s, x) => s + Number(x.amount), 0);
      const porCategoria = {};
      for (const x of r.rows) {
        const k = `${x.kind}:${x.category}`;
        porCategoria[k] = (porCategoria[k] || 0) + Number(x.amount);
      }
      res.json({
        de, ate, items: r.rows,
        totais: { entradas: arredondar(entradas), saidas: arredondar(saidas), saldo: arredondar(entradas - saidas), lancamentos: r.rows.length },
        por_categoria: Object.entries(porCategoria).map(([k, total]) => {
          const [kind, category] = k.split(":");
          return { kind, category, total };
        }),
      });
    }),
  );

  // ---------- Relatório de um irmão (o que pagou, o que está pendente) ----------
  // GET /api/reports/irmao/:id?ano=2026
  // Quem lança e acompanha as contribuições (admin, venerável e tesoureiro)
  // abre o relatório de qualquer irmão; o perfil "Irmão" vê apenas o próprio
  // (a conta é vinculada ao cadastro em app_users.brother_id).
  router.get(
    "/irmao/:id",
    h(async (req, res) => {
      const podeVerTodos = ["admin", "veneravel", "tesoureiro"].includes(req.user.role);
      const ehProprio = Boolean(req.user.brother_id) && req.user.brother_id === req.params.id;
      if (!podeVerTodos && !ehProprio) {
        return res.status(403).json({ error: "Você só pode ver o seu próprio relatório." });
      }

      const { de, ate, ano } = periodoRelatorio(req.query);
      const [irmao, contas, pagos] = await Promise.all([
        pool.query("SELECT id, full_name, cim, status, phone, email, birth_date FROM brothers WHERE id = $1", [
          req.params.id,
        ]),
        pool.query(
          `SELECT c.id, c.reference_month, c.contribution_type, c.amount, c.due_date, c.status, c.paid_at, c.notes
             FROM contributions c
            WHERE c.brother_id = $1
              AND COALESCE(c.paid_at::date, c.due_date, c.created_at::date) BETWEEN $2::date AND $3::date
            ORDER BY c.reference_month DESC`,
          [req.params.id, de, ate],
        ),
        pool.query(
          `SELECT COALESCE(sum(amount) FILTER (WHERE status = 'pago'), 0)::float AS pago,
                  COALESCE(sum(amount) FILTER (WHERE status = 'pendente'), 0)::float AS pendente,
                  COALESCE(sum(amount) FILTER (WHERE status = 'isento'), 0)::float AS isento,
                  count(*) FILTER (WHERE status = 'pendente')::int AS meses_abertos
             FROM contributions
            WHERE brother_id = $1
              AND COALESCE(paid_at::date, due_date, created_at::date) BETWEEN $2::date AND $3::date`,
          [req.params.id, de, ate],
        ),
      ]);
      if (!irmao.rows[0]) return res.status(404).json({ error: "Irmão não encontrado." });
      res.json({ irmao: irmao.rows[0], ano, de, ate, totais: pagos.rows[0], items: contas.rows });
    }),
  );

  // ---------- Relatório de família ----------
  router.get(
    "/familia",
    roles("admin", "veneravel", "chanceler"),
    h(async (_req, res) => {
      const r = await pool.query(
        `SELECT f.id, f.full_name, f.relationship, f.birth_date, f.phone, f.email,
                b.full_name AS brother_name, b.status AS brother_status
           FROM family_members f
           LEFT JOIN brothers b ON b.id = f.brother_id
          ORDER BY lower(coalesce(b.full_name, '')), lower(f.full_name)`,
      );
      const porParentesco = {};
      for (const x of r.rows) porParentesco[x.relationship] = (porParentesco[x.relationship] || 0) + 1;
      res.json({
        total: r.rows.length,
        irmaos_com_familia: new Set(r.rows.map((x) => x.brother_name).filter(Boolean)).size,
        por_parentesco: Object.entries(porParentesco).map(([relationship, n]) => ({ relationship, n })),
        items: r.rows,
      });
    }),
  );

  return router;
}
