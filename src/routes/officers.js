// ============================================================
// Venerância: quadro de oficiais da Loja e troca de mandato.
// O quadro é montado por cargos catalogados (as três luzes,
// cargos oficiais e oficiais complementares), sempre ligados a
// um mandato. Trocar o mandato encerra todos os cargos ativos
// e abre um quadro novo, em branco.
// ============================================================
import { Router } from "express";
import { h } from "../lib/util.js";
import { audit } from "../lib/audit.js";
import { roles } from "../middleware/auth.js";
import { CARGO_KEYS, CARGO_POR_CHAVE, CATEGORIAS_CARGO, CARGOS, mandateCreateSchema, officerSetSchema, officerUpdateSchema } from "../schemas.js";

export function officerRoutes({ pool }) {
  const router = Router();
  const GESTAO = roles("admin", "veneravel");

  async function mandatoAberto() {
    const r = await pool.query(
      `SELECT id, label, to_char(started_on, 'YYYY-MM-DD') AS started_on FROM mandates
        WHERE ended_on IS NULL ORDER BY started_on DESC LIMIT 1`,
    );
    return r.rows[0] || null;
  }

  // GET /api/officers/cargos — catálogo dos cargos (ordem das sessões).
  // Leitura restrita: junto com o quadro, identifica a diretoria da Loja.
  router.get(
    "/cargos",
    GESTAO,
    h(async (_req, res) => {
      res.json({ categorias: CATEGORIAS_CARGO, cargos: CARGOS });
    }),
  );

  // GET /api/officers/mandato — mandato em vigor e histórico.
  router.get(
    "/mandato",
    GESTAO,
    h(async (_req, res) => {
      const [atual, historico] = await Promise.all([
        pool.query(
          `SELECT id, label, to_char(started_on, 'YYYY-MM-DD') AS started_on, notes FROM mandates
            WHERE ended_on IS NULL ORDER BY started_on DESC LIMIT 1`,
        ),
        pool.query(
          `SELECT m.id, m.label, to_char(m.started_on, 'YYYY-MM-DD') AS started_on, m.ended_on,
                  (SELECT count(*)::int FROM lodge_officers lo WHERE lo.mandate_id = m.id) AS cargos
             FROM mandates m ORDER BY m.started_on DESC LIMIT 20`,
        ),
      ]);
      res.json({ atual: atual.rows[0] || null, historico: historico.rows });
    }),
  );

  // GET /api/officers?historico=1 — quadro de oficiais.
  // Leitura restrita a admin e venerável: traz nome, CIM e telefone.
  router.get(
    "/",
    GESTAO,
    h(async (req, res) => {
      const tudo = String(req.query.historico ?? "") === "1";
      const r = await pool.query(
        `SELECT lo.id, lo.cargo, lo.category, lo.office_name,
                to_char(lo.term_start, 'YYYY-MM-DD') AS term_start,
                to_char(lo.term_end, 'YYYY-MM-DD') AS term_end,
                lo.brother_id, lo.active, lo.mandate_id,
                b.full_name AS brother_name, b.cim, b.phone,
                m.label AS mandate_label
           FROM lodge_officers lo
           LEFT JOIN brothers b ON b.id = lo.brother_id
           LEFT JOIN mandates m ON m.id = lo.mandate_id
          WHERE (
                  $1 = true                                   -- histórico: mostra tudo
                  OR (lo.active = true                        -- quadro: só cargos catalogados
                      AND lo.cargo IS NOT NULL
                      AND lo.mandate_id IS NOT NULL)
                )
          ORDER BY array_position($2::text[], lo.cargo) NULLS LAST, lo.office_name`,
        [tudo, CARGO_KEYS],
      );
      res.json({ items: r.rows });
    }),
  );

  // POST /api/officers/mandato — encerra o mandato em vigor e abre o novo.
  // Todos os cargos ativos ficam inativos; o quadro novo começa vazio.
  router.post(
    "/mandato",
    GESTAO,
    h(async (req, res) => {
      const p = mandateCreateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const d = p.data;

      const client = await pool.connect();
      let novo;
      let encerrados = 0;
      let anterior = null;
      try {
        await client.query("BEGIN");
        const aberto = await client.query(
          `SELECT id, label FROM mandates WHERE ended_on IS NULL
            ORDER BY started_on DESC LIMIT 1 FOR UPDATE`,
        );
        anterior = aberto.rows[0] || null;
        const inicio = d.started_on || null;

        if (anterior) {
          await client.query(
            `UPDATE mandates SET ended_on = COALESCE($1::date, CURRENT_DATE) WHERE id = $2`,
            [inicio, anterior.id],
          );
          const fim = await client.query(
            `UPDATE lodge_officers
                SET active = false,
                    term_end = COALESCE(term_end, COALESCE($1::date, CURRENT_DATE))
              WHERE mandate_id = $2 AND active = true
              RETURNING id`,
            [inicio, anterior.id],
          );
          encerrados = fim.rowCount;
        }

        // Registros antigos do módulo "Diretoria" (sem cargo catalogado nem
        // mandato) também são arquivados: o quadro novo começa do zero.
        const antigos = await client.query(
          `UPDATE lodge_officers
              SET active = false,
                  term_end = COALESCE(term_end, COALESCE($1::date, CURRENT_DATE))
            WHERE mandate_id IS NULL AND active = true
            RETURNING id`,
          [inicio],
        );
        encerrados += antigos.rowCount;

        novo = await client.query(
          `INSERT INTO mandates(label, started_on, notes, created_by)
           VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4)
           RETURNING id, label, started_on`,
          [d.label, inicio, d.notes, req.user.id],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      await audit(pool, req.user.id, "change_mandate", "mandate", novo.rows[0].id, req.ip);
      res.status(201).json({ item: novo.rows[0], encerrados, anterior });
    }),
  );

  // POST /api/officers — define (ou troca) o ocupante de um cargo.
  router.post(
    "/",
    GESTAO,
    h(async (req, res) => {
      const p = officerSetSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const d = p.data;

      const mandato = await mandatoAberto();
      if (!mandato) {
        return res.status(409).json({ error: "Nenhum mandato aberto. Abra o mandato antes de cadastrar os cargos." });
      }
      const cargo = CARGO_POR_CHAVE[d.cargo];
      if (!cargo) return res.status(400).json({ error: "Cargo desconhecido." });

      const existente = await pool.query(
        `SELECT id FROM lodge_officers
          WHERE mandate_id = $1 AND cargo = $2 AND active = true LIMIT 1`,
        [mandato.id, d.cargo],
      );

      // Sem data informada, o cargo passa a contar desde o início do mandato.
      const inicio = d.term_start || mandato.started_on || null;

      let r;
      if (existente.rows[0]) {
        r = await pool.query(
          `UPDATE lodge_officers
              SET brother_id = $1, term_start = $2, term_end = $3,
                  office_name = $4, category = $5, active = true
            WHERE id = $6
            RETURNING id, cargo, category, office_name, brother_id, term_start, term_end, active`,
          [d.brother_id, inicio, d.term_end, cargo.label, cargo.categoria, existente.rows[0].id],
        );
      } else {
        r = await pool.query(
          `INSERT INTO lodge_officers(cargo, category, office_name, brother_id, term_start, term_end, mandate_id, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true)
           RETURNING id, cargo, category, office_name, brother_id, term_start, term_end, active`,
          [d.cargo, cargo.categoria, cargo.label, d.brother_id, inicio, d.term_end, mandato.id],
        );
      }
      await audit(pool, req.user.id, "create", "lodge_officer", r.rows[0].id, req.ip);
      res.status(201).json({ item: r.rows[0], mandate: mandato });
    }),
  );

  // PATCH /api/officers/:id
  router.patch(
    "/:id",
    GESTAO,
    h(async (req, res) => {
      const p = officerUpdateSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Dados inválidos.", details: p.error.flatten() });
      const d = p.data;

      const campos = [];
      const valores = [];
      const push = (sql, valor) => {
        valores.push(valor);
        campos.push(sql.replace("$?", "$" + valores.length));
      };

      if (d.brother_id !== undefined) push("brother_id = $?", d.brother_id);
      if (d.term_start !== undefined) push("term_start = $?", d.term_start);
      if (d.term_end !== undefined) push("term_end = $?", d.term_end);
      if (d.cargo !== undefined) {
        const cargo = CARGO_POR_CHAVE[d.cargo];
        if (!cargo) return res.status(400).json({ error: "Cargo desconhecido." });
        push("cargo = $?", d.cargo);
        push("office_name = $?", cargo.label);
        push("category = $?", cargo.categoria);
      }
      if (!campos.length) return res.status(400).json({ error: "Nada para atualizar." });
      push("id = $?", req.params.id);

      const r = await pool.query(
        `UPDATE lodge_officers SET ${campos.join(", ")} WHERE id = $${valores.length}
         RETURNING id, cargo, category, office_name, brother_id, term_start, term_end, active`,
        valores,
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Cargo não encontrado." });
      await audit(pool, req.user.id, "update", "lodge_officer", req.params.id, req.ip);
      res.json({ item: r.rows[0] });
    }),
  );

  // DELETE /api/officers/:id — libera o cargo (mantém o histórico).
  // Use ?definitivo=1 para apagar o registro de vez (correção de erro).
  router.delete(
    "/:id",
    GESTAO,
    h(async (req, res) => {
      const definitivo = String(req.query.definitivo ?? "") === "1";
      const r = await pool.query(
        definitivo
          ? `DELETE FROM lodge_officers WHERE id = $1 RETURNING id`
          : `UPDATE lodge_officers
                SET active = false, term_end = COALESCE(term_end, CURRENT_DATE)
              WHERE id = $1
              RETURNING id`,
        [req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "Cargo não encontrado." });
      await audit(pool, req.user.id, definitivo ? "delete" : "vacate", "lodge_officer", req.params.id, req.ip);
      res.status(204).end();
    }),
  );

  return router;
}
