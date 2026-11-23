// ============================================================
// Venerância: quadro de oficiais da Loja (as três luzes, cargos
// oficiais e oficiais complementares) e troca de mandato.
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const PW = window.PW;
  const { PAGINAS, pode, cabecalho, cabecalhoImpressao, assinaturasImpressao, imprimir, botaoLinha } = PW;

  const PERMISSAO = ["admin", "veneravel"];

  PAGINAS.venerancia = {
    titulo: "Venerância",
    icone: "mandato",
    async render(el, ctx) {
      const podeEditar = pode(ctx.usuario, PERMISSAO);

      let categorias = [];
      let cargos = [];
      let mandato = null;
      let historico = [];
      let quadro = [];
      let irmaos = [];

      // ---------- Dados ----------
      async function carregar() {
        const [c, m, q] = await Promise.all([
          API.get("/officers/cargos"),
          API.get("/officers/mandato"),
          API.get("/officers"),
        ]);
        categorias = c.categorias || [];
        cargos = c.cargos || [];
        mandato = m.atual;
        historico = m.historico || [];
        quadro = q.items || [];
        if (podeEditar && !irmaos.length) {
          const r = await API.get("/brothers?limit=300");
          irmaos = r.items || [];
        }
      }

      const ocupanteDoCargo = (chave) => quadro.find((o) => o.cargo === chave && o.active);
      const vagasDoGrupo = (chave) => cargos.filter((c) => c.categoria === chave).length;

      // ---------- Desenho ----------
      function gruposHtml() {
        return categorias
          .map((cat) => {
            const doGrupo = cargos.filter((c) => c.categoria === cat.key);
            if (!doGrupo.length) return "";
            const preenchidos = doGrupo.filter((c) => ocupanteDoCargo(c.key)).length;
            return `<div class="cartao grupo-cargos">
              <h3 class="grupo-cargos-titulo">${svg("usuario", 18)} ${esc(cat.label)}
                <span class="contagem">${preenchidos} de ${vagasDoGrupo(cat.key)}</span>
              </h3>
              <p class="texto-suave" style="font-size:13px;margin:-2px 0 10px">${esc(cat.descricao || "")}</p>
              ${doGrupo
                .map((c) => {
                  const ocupante = ocupanteDoCargo(c.key);
                  return `<div class="linha-cargo">
                    <div class="cargo-nome">${esc(c.label)}</div>
                    <div class="cargo-ocupante" data-ocupante="${esc(c.key)}">
                      ${
                        ocupante
                          ? `<strong>${esc(ocupante.brother_name || "—")}</strong>
                             ${ocupante.cim ? `<span class="texto-suave" style="font-size:12px">· CIM ${esc(ocupante.cim)}</span>` : ""}`
                          : `<span class="vago">Cargo vago</span>`
                      }
                    </div>
                    <div class="acoes" data-acoes-cargo="${esc(c.key)}"></div>
                  </div>`;
                })
                .join("")}
            </div>`;
          })
          .join("");
      }

      function desenhar() {
        const tituloMandato = mandato
          ? `Mandato em vigor: <strong>${esc(mandato.label)}</strong> <span class="texto-suave">desde ${UI.formatarData(mandato.started_on)}</span>`
          : `<strong>Nenhum mandato aberto.</strong> Abra o mandato para começar a cadastrar os cargos.`;

        const acoes = [
          `<button type="button" class="botao botao-claro" id="imprimir-quadro"${UI.dica("Abre a versão para papel. Na janela de impressão escolha “Salvar como PDF”.")}>${svg("imprimir", 16)} Imprimir quadro</button>`,
        ];
        if (podeEditar) {
          acoes.push(
            mandato
              ? `<button type="button" class="botao botao-perigo" id="trocar-mandato"${UI.dica(UI.ACOES_DICA().trocar_mandato)}>${svg("mandato", 16)} Trocar mandato</button>`
              : `<button type="button" class="botao botao-azul" id="abrir-mandato"${UI.dica("Abre o mandato (ex.: 2026/2027) para começar o quadro de oficiais.")}>${svg("mandato", 16)} Abrir mandato</button>`,
          );
        }

        el.innerHTML =
          cabecalho(
            "Venerância — Quadro de Oficiais",
            "Quem ocupa cada cargo no mandato em vigor. Ao trocar o mandato, todos os cargos são encerrados e um quadro novo é aberto.",
            acoes.join(""),
          ) +
          `<div class="faixa-aniversario" style="background:#f6f9ff;border-color:var(--borda)">
             ${svg("mandato", 20)}
             <div class="texto" style="color:var(--texto)">${tituloMandato}</div>
             ${mandato ? `<div class="texto-suave" style="font-size:12.5px">${quadro.filter((o) => o.active).length} cargo(s) preenchido(s)</div>` : ""}
           </div>` +
          cabecalhoImpressao("Quadro de Oficiais", mandato ? `Mandato ${mandato.label}` : "") +
          gruposHtml() +
          (historico.length
            ? `<div class="cartao">
                 <h3 class="cartao-titulo">${svg("relatorios", 17)} HISTÓRICO DE MANDATOS</h3>
                 ${PW.tabelaHtml(
                   [
                     { rotulo: "Mandato", valor: (m) => `<strong>${esc(m.label)}</strong>` },
                     { rotulo: "Início", valor: (m) => UI.formatarData(m.started_on) },
                     { rotulo: "Encerrado em", valor: (m) => (m.ended_on ? UI.formatarData(m.ended_on) : '<span class="selo selo-verde">em vigor</span>') },
                     { rotulo: "Cargos registrados", valor: (m) => String(m.cargos ?? 0) },
                   ],
                   historico,
                 )}
               </div>`
            : "") +
          assinaturasImpressao(["Venerável Mestre", "Secretário"]);

        if (podeEditar) {
          for (const c of cargos) {
            const td = el.querySelector(`[data-acoes-cargo="${c.key}"]`);
            if (!td) continue;
            const ocupante = ocupanteDoCargo(c.key);
            const b = botaoLinha(ocupante ? "Trocar" : "Definir", ocupante ? "botao-claro" : "botao-azul", "usuario", UI.ACOES_DICA().definir);
            b.addEventListener("click", () => abrirEscolha(c, ocupante));
            td.appendChild(b);
            if (ocupante) {
              const b2 = botaoLinha("Liberar", "botao-perigo", "lixo", UI.ACOES_DICA().liberar);
              b2.addEventListener("click", () => liberar(ocupante));
              td.appendChild(b2);
            }
          }
        }

        const bp = el.querySelector("#imprimir-quadro");
        if (bp) bp.addEventListener("click", () => imprimir());

        const bt = el.querySelector("#trocar-mandato");
        if (bt) bt.addEventListener("click", abrirTrocaMandato);

        const ba = el.querySelector("#abrir-mandato");
        if (ba) ba.addEventListener("click", () => abrirModalMandato(false));
      }

      async function recarregar() {
        await carregar();
        desenhar();
      }

      // ---------- Ações ----------
      function abrirEscolha(cargo, ocupante) {
        const options = [`<option value="">— deixar vago —</option>`]
          .concat(
            irmaos.map(
              (b) =>
                `<option value="${esc(b.id)}" ${ocupante && ocupante.brother_id === b.id ? "selected" : ""}>${esc(b.full_name)}${
                  b.cim ? ` — CIM ${esc(b.cim)}` : ""
                }${b.status && b.status !== "ativo" ? ` (${esc(b.status)})` : ""}</option>`,
            ),
          )
          .join("");

        UI.abrirModal({
          titulo: `Cargo — ${cargo.label}`,
          corpo: `<div class="campo largo">
              <label for="cargo-irmao">Irmão que ocupa o cargo</label>
              <select id="cargo-irmao">${options}</select>
              <span class="ajuda">${esc(UI.FILTROS_DICA().irmao || "")}</span>
            </div>
            <p class="ajuda mt8">Ao salvar, o cargo passa a aparecer no quadro do mandato ${
              mandato ? `<strong>${esc(mandato.label)}</strong>` : "em vigor"
            }.</p>`,
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: "Salvar cargo",
              tipo: "botao-azul",
              acao: async (m) => {
                const brotherId = m.corpo.querySelector("#cargo-irmao").value || null;
                if (!brotherId) {
                  if (ocupante) await API.del(`/officers/${ocupante.id}`);
                  UI.aviso("Cargo liberado.", "ok");
                  await recarregar();
                  return;
                }
                await API.post("/officers", {
                  cargo: cargo.key,
                  brother_id: brotherId,
                  // O servidor espera a data no formato AAAA-MM-DD.
                  term_start: mandato ? UI.paraInputData(mandato.started_on) : null,
                });
                UI.aviso("Cargo atualizado.", "ok");
                await recarregar();
              },
            },
          ],
        });
      }

      async function liberar(ocupante) {
        const ok = await UI.confirmar(
          `Liberar o cargo de ${ocupante.office_name}? O histórico de ${ocupante.brother_name || "quem ocupava"} continua registrado.`,
          { titulo: "Liberar cargo", rotuloOk: "Liberar" },
        );
        if (!ok) return;
        await API.del(`/officers/${ocupante.id}`);
        UI.aviso("Cargo liberado.", "ok");
        await recarregar();
      }

      function sugestaoLabel() {
        const ano = new Date().getFullYear();
        const proximo = ano + 1;
        if (!mandato) return `${ano}/${proximo}`;
        return `${proximo}/${proximo + 1}`;
      }

      // ---------- Abertura / troca de mandato ----------
      function abrirModalMandato(troca) {
        const total = quadro.filter((o) => o.active).length;
        const aviso = troca
          ? `<div class="alerta-forte">
              <div class="alerta-forte-titulo">${svg("alerta", 20)} ATENÇÃO — AÇÃO IRREVERSÍVEL</div>
              <p class="alerta-forte-texto">
                Você está prestes a <strong>trocar o mandato</strong> da Loja. Ao confirmar, o sistema vai:
              </p>
              <ul class="alerta-forte-lista">
                <li>Encerrar o mandato <strong>${esc(mandato.label)}</strong> hoje (${UI.formatarData(new Date())});</li>
                <li>Marcar <strong>todos os ${total} cargo(s)</strong> do quadro atual como <strong>inativos</strong>;</li>
                <li>Abrir um <strong>quadro novo, em branco</strong>, para o mandato seguinte;</li>
                <li>Manter todo o histórico consultável nesta tela.</li>
              </ul>
              <p class="alerta-forte-texto">Depois disso, será preciso <strong>cadastrar todos os cargos de novo</strong>.</p>
            </div>`
          : `<p class="texto-suave" style="font-size:13.5px;margin:0 0 10px">
              Informe o nome do mandato (por exemplo, <strong>2026/2027</strong>) e a data de início.
              Depois de aberto, cadastre cada cargo no quadro.
            </p>`;

        const corpo =
          aviso +
          `<div class="grade-form">
            <div class="campo">
              <label for="mandato-label">Mandato *</label>
              <input id="mandato-label" type="text" value="${esc(sugestaoLabel())}" placeholder="2026/2027">
              <span class="ajuda">Como este mandato será identificado no histórico.</span>
            </div>
            <div class="campo">
              <label for="mandato-inicio">Início</label>
              <input id="mandato-inicio" type="date" value="${new Date().toISOString().slice(0, 10)}">
              <span class="ajuda">Data em que a nova diretoria assume.</span>
            </div>
          </div>` +
          (troca
            ? `<div class="campo largo mt8">
                <label for="mandato-confirma">Para confirmar, escreva <strong>TROCAR MANDATO</strong> *</label>
                <input id="mandato-confirma" type="text" placeholder="TROCAR MANDATO" autocomplete="off">
                <span class="ajuda">Isso evita que a troca aconteça por engano.</span>
              </div>`
            : "");

        UI.abrirModal({
          titulo: troca ? "Trocar mandato — confirmação obrigatória" : "Abrir mandato",
          largo: true,
          corpo,
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: troca ? "Encerrar e abrir novo mandato" : "Abrir mandato",
              tipo: troca ? "botao-perigo" : "botao-azul",
              acao: async (m) => {
                const label = m.corpo.querySelector("#mandato-label").value.trim();
                const inicio = m.corpo.querySelector("#mandato-inicio").value || null;
                if (label.length < 4) {
                  UI.aviso("Informe o nome do mandato (ex.: 2026/2027).", "erro");
                  return false;
                }
                if (troca) {
                  const confirma = m.corpo.querySelector("#mandato-confirma").value.trim();
                  if (confirma.toUpperCase() !== "TROCAR MANDATO") {
                    UI.aviso('Para confirmar, escreva exatamente "TROCAR MANDATO".', "erro");
                    return false;
                  }
                }
                const r = await API.post("/officers/mandato", { label, started_on: inicio });
                UI.aviso(
                  troca
                    ? `Mandato trocado. ${r.encerrados} cargo(s) encerrado(s); o quadro de ${r.item.label} está em branco.`
                    : `Mandato ${r.item.label} aberto. Cadastre os cargos.`,
                  "ok",
                  7000,
                );
                await recarregar();
              },
            },
          ],
        });
      }

      function abrirTrocaMandato() {
        abrirModalMandato(true);
      }

      await recarregar();
    },
  };
})();
