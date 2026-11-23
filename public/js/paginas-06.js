// ============================================================
// Secretaria: Livro de Atas.
// Registra a ata de cada sessão, controla o envio ao GOB,
// imprime (ou salva em PDF) e arquiva por período.
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const PW = window.PW;
  const { PAGINAS, pode, cabecalho, cabecalhoImpressao, assinaturasImpressao, botaoLinha, botaoNovo, tabelaHtml } = PW;

  // Atas: somente Secretário e Venerável.
  const PERMISSAO_EDITAR = ["veneravel", "secretario"];
  const PERMISSAO_EXCLUIR = ["veneravel"];

  const TIPOS_SESSAO = [
    "Sessão Ordinária",
    "Sessão Extraordinária",
    "Sessão Magna",
    "Sessão Econômica",
    "Sessão Solene",
    "Sessão Branca",
    "Outra",
  ];
  const GRAUS = ["Aprendiz", "Companheiro", "Mestre", "Mestre Instalado", "Todos os graus", "Não se aplica"];
  const SITUACOES = [
    ["rascunho", "Rascunho"],
    ["aprovada", "Aprovada"],
    ["enviada", "Enviada ao GOB"],
    ["arquivada", "Arquivada"],
  ];

  const CAMPOS = [
    { nome: "session_date", rotulo: "Data da sessão", tipo: "date", obrigatorio: true, ajuda: "Dia em que a sessão aconteceu." },
    { nome: "number", rotulo: "Número da ata", dica: "Ex.: 12/2026", ajuda: "Número com que a ata entra no livro." },
    {
      nome: "title",
      rotulo: "Assunto / título",
      obrigatorio: true,
      largo: true,
      dica: "Ex.: Sessão ordinária de instrução",
      ajuda: "Resumo curto do que trata esta ata.",
    },
    {
      nome: "session_type",
      rotulo: "Tipo de sessão",
      tipo: "select",
      opcoes: TIPOS_SESSAO.map((t) => [t, t]),
      opcoesVazias: "— escolha —",
    },
    { nome: "degree", rotulo: "Grau", tipo: "select", opcoes: GRAUS.map((g) => [g, g]), opcoesVazias: "— escolha —" },
    {
      nome: "body",
      rotulo: "Ata (texto completo)",
      tipo: "textarea",
      linhas: 14,
      largo: true,
      dica: "Escreva ou cole aqui o texto da ata...",
      ajuda: "Este é o texto que sai na impressão e no PDF.",
    },
    {
      nome: "decisions",
      rotulo: "Deliberações, propostas e destaques",
      tipo: "textarea",
      linhas: 4,
      largo: true,
      ajuda: "O que foi decidido, aprovado ou registrado na sessão.",
    },
    { nome: "sent_to_gob_at", rotulo: "Enviada ao GOB em", tipo: "date", ajuda: "Deixe em branco enquanto não for enviada." },
    { nome: "gob_protocol", rotulo: "Protocolo no GOB", dica: "Nº do protocolo ou do ofício" },
    { nome: "status", rotulo: "Situação", tipo: "select", opcoes: SITUACOES, padrao: "rascunho" },
  ];

  const dataBR = (valor) => (valor ? UI.formatarData(valor) : "—");

  PAGINAS.atas = {
    titulo: "Livro de Atas",
    icone: "ata",
    async render(el, ctx) {
      const podeEditar = pode(ctx.usuario, PERMISSAO_EDITAR);
      const podeExcluir = pode(ctx.usuario, PERMISSAO_EXCLUIR);
      const filtros = { de: "", ate: "", status: "", tipo: "", busca: "" };
      let itens = [];
      let resumo = {};
      let tempoBusca = null;

      // ---------- Dados ----------
      async function carregar() {
        const q = new URLSearchParams();
        Object.entries(filtros).forEach(([chave, valor]) => {
          if (valor) q.set(chave, valor);
        });
        const [lista, numeros] = await Promise.all([
          API.get(`/minutes?${q.toString()}`),
          API.get("/minutes/resumo"),
        ]);
        itens = lista.items || [];
        resumo = numeros || {};
      }

      /** Período mostrado: usa os filtros ou, sem eles, o das atas listadas. */
      function periodoAtual() {
        const datas = itens.map((i) => String(i.session_date).slice(0, 10)).filter(Boolean).sort();
        const de = filtros.de || datas[0] || "";
        const ate = filtros.ate || datas[datas.length - 1] || "";
        return { de, ate };
      }

      // ---------- Desenho ----------
      function cartoesHtml() {
        const c = (rotulo, valor, detalhe) =>
          `<div class="cartao-dinheiro"><div class="rotulo">${esc(rotulo)}</div><div class="valor">${esc(String(valor ?? 0))}</div><div class="detalhe">${esc(detalhe || "")}</div></div>`;
        return `<div class="cartoes-dinheiro quatro">
          ${c("Atas no livro", resumo.total, resumo.primeira ? `de ${dataBR(resumo.primeira)} a ${dataBR(resumo.ultima)}` : "nenhuma ata registrada")}
          ${c("Rascunhos", resumo.rascunho, "ainda não aprovadas")}
          ${c("Aprovadas", resumo.aprovada, "prontas para envio")}
          ${c("Arquivadas", resumo.arquivada, "guardadas no arquivo do livro")}
        </div>`;
      }

      function filtrosHtml() {
        const dicas = UI.FILTROS_DICA();
        return `<div class="filtros-barra">
          <div class="campo"${UI.dica(dicas.de)}><label for="f-de">Sessões de</label><input id="f-de" type="date" data-filtro="de" value="${esc(filtros.de)}"></div>
          <div class="campo"${UI.dica(dicas.ate)}><label for="f-ate">até</label><input id="f-ate" type="date" data-filtro="ate" value="${esc(filtros.ate)}"></div>
          <div class="campo"${UI.dica(dicas.status)}><label for="f-status">Situação</label><select id="f-status" data-filtro="status">
            <option value="">Todas</option>
            ${SITUACOES.map(([v, r]) => `<option value="${v}" ${filtros.status === v ? "selected" : ""}>${esc(r)}</option>`).join("")}
          </select></div>
          <div class="campo"${UI.dica(dicas.tipo)}><label for="f-tipo">Tipo de sessão</label><select id="f-tipo" data-filtro="tipo">
            <option value="">Todos</option>
            ${TIPOS_SESSAO.map((t) => `<option value="${esc(t)}" ${filtros.tipo === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
          </select></div>
          <div class="campo" style="flex:1 1 220px"${UI.dica(dicas.busca)}><label for="f-busca">Buscar no texto</label><input id="f-busca" type="text" data-filtro="busca" value="${esc(filtros.busca)}" placeholder="assunto, número, trecho..."></div>
        </div>`;
      }

      function desenhar() {
        const p = periodoAtual();
        const rotuloPeriodo = p.de && p.ate ? `${dataBR(p.de)} a ${dataBR(p.ate)}` : "período completo";
        const acoes = [];
        if (podeEditar) acoes.push(botaoNovo("Nova ata"));
        acoes.push(
          `<button type="button" class="botao botao-claro" id="imprimir-lista"${UI.dica("Imprime (ou salva em PDF) as atas do período filtrado. Depois de imprimir, o sistema pergunta se deseja arquivar o período.")}>${svg("imprimir", 16)} Imprimir período</button>`,
        );
        if (podeEditar) {
          acoes.push(
            `<button type="button" class="botao botao-claro" id="arquivar-periodo"${UI.dica(UI.ACOES_DICA().arquivar)}>${svg("arquivar", 16)} Arquivar período</button>`,
          );
        }

        el.innerHTML =
          cabecalho(
            "Livro de Atas",
            "Registro das atas de cada sessão, com o envio ao GOB, a impressão em PDF e o arquivamento por período.",
            acoes.join(""),
          ) +
          cabecalhoImpressao("Livro de Atas", rotuloPeriodo) +
          cartoesHtml() +
          filtrosHtml() +
          `<div class="cartao">
             <h3 class="cartao-titulo">${svg("ata", 17)} ATAS — ${esc(rotuloPeriodo.toUpperCase())}</h3>
             ${tabelaHtml(
               [
                 { rotulo: "Nº", valor: (a) => (a.number ? `<strong>${esc(a.number)}</strong>` : "—") },
                 { rotulo: "Sessão", valor: (a) => dataBR(a.session_date) },
                 { rotulo: "Assunto", valor: (a) => esc(a.title) },
                 { rotulo: "Tipo", valor: (a) => esc(a.session_type || "—") },
                 { rotulo: "Situação", valor: (a) => PW.selo(a.status) },
                 { rotulo: "GOB", valor: (a) => (a.sent_to_gob_at ? dataBR(a.sent_to_gob_at) : '<span class="texto-suave">não enviada</span>') },
               ],
               itens,
               { comAcoes: true, vazio: "Nenhuma ata encontrada com estes filtros." },
             )}
           </div>` +
          assinaturasImpressao(["Secretário", "Venerável Mestre"]) +
          `<div class="folha-documento"></div>`;

        // Filtros
        el.querySelectorAll("[data-filtro]").forEach((campo) => {
          const evento = campo.dataset.filtro === "busca" ? "input" : "change";
          campo.addEventListener(evento, () => {
            const aplicar = async () => {
              filtros[campo.dataset.filtro] = campo.value;
              await carregar();
              desenhar();
              const foco = el.querySelector(`[data-filtro="${campo.dataset.filtro}"]`);
              if (foco && campo.dataset.filtro === "busca") {
                foco.focus();
                foco.setSelectionRange(foco.value.length, foco.value.length);
              }
            };
            if (campo.dataset.filtro === "busca") {
              clearTimeout(tempoBusca);
              tempoBusca = setTimeout(aplicar, 350);
            } else {
              aplicar();
            }
          });
        });

        // Ações
        if (podeEditar) {
          el.querySelector("[data-papel='novo']").addEventListener("click", () => formulario(null));
        }

        el.querySelectorAll("[data-acoes]").forEach((celula) => {
          const ata = itens[Number(celula.dataset.acoes)];
          const ver = botaoLinha("Ver", "botao-claro", "olho", "Lê a ata completa, com opção de imprimir e editar.");
          ver.addEventListener("click", () => abrirLeitura(ata.id));
          celula.appendChild(ver);

          const imp = botaoLinha("Imprimir", "botao-claro", "imprimir", UI.ACOES_DICA().imprimir);
          imp.addEventListener("click", () => imprimirAta(ata.id));
          celula.appendChild(imp);

          // Ata arquivada fica travada: só ler e imprimir.
          const travada = ata.status === "arquivada";
          if (podeEditar && !travada) {
            const arq = botaoLinha("Arquivar", "botao-claro", "arquivar", UI.ACOES_DICA().arquivar);
            arq.addEventListener("click", () => arquivarUma(ata));
            celula.appendChild(arq);
          }

          if (podeExcluir && !travada) {
            const ex = botaoLinha("Excluir", "botao-perigo", "lixo", UI.ACOES_DICA().excluir);
            ex.addEventListener("click", async () => {
              const ok = await UI.confirmar(`Excluir a ata "${ata.title}"? Esta ação não pode ser desfeita.`, {
                titulo: "Excluir ata",
                rotuloOk: "Excluir",
                perigo: true,
              });
              if (!ok) return;
              await API.del(`/minutes/${ata.id}`);
              UI.aviso("Ata excluída.", "ok");
              await recarregar();
            });
            celula.appendChild(ex);
          }
        });

        const bl = el.querySelector("#imprimir-lista");
        if (bl) bl.addEventListener("click", imprimirLista);

        const ba = el.querySelector("#arquivar-periodo");
        if (ba) ba.addEventListener("click", () => abrirArquivarPeriodo());
      }

      async function recarregar() {
        await carregar();
        desenhar();
      }

      // ---------- Formulário ----------
      function formulario(item) {
        PW.abrirFormulario(
          {
            caminho: "/minutes",
            titulo: "Ata",
            substantivo: "ata",
            rotuloNovo: "Nova ata",
            modalLargo: true,
            campos: CAMPOS,
            notaFormulario: "Campos com * são obrigatórios. A situação “Arquivada” também pode ser marcada pelo botão Arquivar.",
            valoresIniciais: (a) => ({
              ...a,
              session_date: UI.paraInputData(a.session_date),
              sent_to_gob_at: UI.paraInputData(a.sent_to_gob_at),
            }),
            valoresPadrao: { session_date: new Date().toISOString().slice(0, 10), status: "rascunho" },
          },
          item,
          recarregar,
        );
      }

      // ---------- Leitura / impressão de uma ata ----------
      function corpoDaAta(a) {
        const linha = (rotulo, valor) =>
          valor ? `<p style="margin:0 0 6px"><strong>${esc(rotulo)}:</strong> ${esc(valor)}</p>` : "";
        return `
          ${linha("Ata nº", a.number)}
          ${linha("Sessão", `${a.session_type || "Sessão"} — ${dataBR(a.session_date)}`)}
          ${linha("Grau", a.degree)}
          ${linha("Assunto", a.title)}
          <div class="ata-texto mt8">${esc(a.body || "(texto da ata ainda não digitado)")}</div>
          ${
            a.decisions
              ? `<h4 style="margin:14px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase">Deliberações e destaques</h4><div class="ata-texto">${esc(a.decisions)}</div>`
              : ""
          }
          <p class="ajuda mt8">Situação: ${esc((SITUACOES.find((s) => s[0] === a.status) || [a.status])[1])}${
            a.sent_to_gob_at ? ` · Enviada ao GOB em ${dataBR(a.sent_to_gob_at)}${a.gob_protocol ? ` (protocolo ${esc(a.gob_protocol)})` : ""}` : " · Ainda não enviada ao GOB"
          }${a.archived_at ? ` · Arquivada em ${dataBR(a.archived_at)}` : ""}</p>`;
      }

      async function abrirLeitura(id) {
        const { item } = await API.get(`/minutes/${id}`);
        const botoes = [{ rotulo: "Fechar", tipo: "botao-claro" }];
        if (podeEditar && item.status !== "arquivada") {
          botoes.push({
            rotulo: "Editar",
            tipo: "botao-claro",
            acao: () => {
              formulario(item);
            },
          });
        }
        botoes.push({
          rotulo: "Imprimir / Salvar em PDF",
          tipo: "botao-azul",
          acao: () => {
            imprimirAta(id);
          },
        });
        UI.abrirModal({
          titulo: item.number ? `Ata nº ${item.number} — ${item.title}` : item.title,
          largo: true,
          corpo: corpoDaAta(item),
          botoes,
        });
      }

      async function imprimirAta(id) {
        const { item } = await API.get(`/minutes/${id}`);
        const folha = el.querySelector(".folha-documento");
        folha.innerHTML =
          cabecalhoImpressao("Ata da sessão", `Ata nº ${item.number || "—"} — ${dataBR(item.session_date)}`) +
          `<h3 style="text-align:center;margin:0 0 12px;font-size:14px">${esc(item.title)}</h3>` +
          `<p style="font-size:11.5px;text-align:center;margin:0 0 14px">${esc(item.session_type || "Sessão")}${
            item.degree ? ` — Grau: ${esc(item.degree)}` : ""
          }</p>` +
          `<div class="ata-texto">${esc(item.body || "(sem texto)")}</div>` +
          (item.decisions
            ? `<h4 style="margin:16px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase">Deliberações e destaques</h4><div class="ata-texto">${esc(item.decisions)}</div>`
            : "") +
          `<p style="font-size:11px;margin-top:18px">Situação: ${esc(item.status)}${
            item.sent_to_gob_at ? ` — enviada ao GOB em ${dataBR(item.sent_to_gob_at)}` : " — ainda não enviada ao GOB"
          }</p>` +
          assinaturasImpressao(["Venerável Mestre", "Secretário"]);
        el.classList.add("imprimindo");
        window.print();
        setTimeout(() => el.classList.remove("imprimindo"), 800);
      }

      // ---------- Arquivamento ----------
      async function arquivarUma(ata) {
        const ok = await UI.confirmar(
          `Deseja arquivar a ata de ${dataBR(ata.session_date)} ("${ata.title}")? Ela deixa a lista do dia a dia e fica guardada no arquivo do livro. Depois de arquivada, a ata não pode mais ser editada nem excluída.`,
          { titulo: "Arquivar ata", rotuloOk: "Arquivar" },
        );
        if (!ok) return;
        await API.post(`/minutes/${ata.id}/arquivar`, {});
        UI.aviso("Ata arquivada.", "ok");
        await recarregar();
      }

      async function arquivarPeriodo(de, ate) {
        await API.post("/minutes/arquivar", { from: de, to: ate });
        UI.aviso(`Atas de ${dataBR(de)} a ${dataBR(ate)} arquivadas.`, "ok", 7000);
        await recarregar();
      }

      function abrirArquivarPeriodo() {
        const p = periodoAtual();
        UI.abrirModal({
          titulo: "Arquivar atas do período",
          corpo: `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">
              Deseja arquivar as atas de <strong>${esc(dataBR(p.de))}</strong> a <strong>${esc(dataBR(p.ate))}</strong>?
              Elas continuam no sistema (com tudo registrado), mas saem da lista do dia a dia e
              <strong>não podem mais ser editadas nem excluídas</strong>.
            </p>
            <div class="grade-form">
              <div class="campo"${UI.dica(UI.FILTROS_DICA().de)}><label for="arq-de">Início do período</label><input id="arq-de" type="date" value="${esc(p.de)}"></div>
              <div class="campo"${UI.dica(UI.FILTROS_DICA().ate)}><label for="arq-ate">Fim do período</label><input id="arq-ate" type="date" value="${esc(p.ate)}"></div>
            </div>`,
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: "Arquivar período",
              tipo: "botao-azul",
              acao: async (m) => {
                const de = m.corpo.querySelector("#arq-de").value;
                const ate = m.corpo.querySelector("#arq-ate").value;
                if (!de || !ate) {
                  UI.aviso("Informe o período completo (início e fim).", "erro");
                  return false;
                }
                await arquivarPeriodo(de, ate);
              },
            },
          ],
        });
      }

      // ---------- Imprimir o período (e perguntar sobre o arquivamento) ----------
      async function imprimirLista() {
        if (!itens.length) {
          UI.aviso("Nenhuma ata no período selecionado.", "erro");
          return;
        }
        const p = periodoAtual();
        window.print();
        const ok = await UI.confirmar(
          `Deseja arquivar as atas de ${dataBR(p.de)} a ${dataBR(p.ate)}? Elas saem da lista do dia a dia e ficam guardadas no arquivo do livro.`,
          { titulo: "Arquivar atas do período", rotuloOk: "Arquivar agora" },
        );
        if (ok) await arquivarPeriodo(p.de, p.ate);
      }

      await recarregar();
    },
  };
})();
