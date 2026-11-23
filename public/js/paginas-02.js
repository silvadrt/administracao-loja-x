// ============================================================
// Páginas: Sessões (eventos + presença), Frequência e
// Visitação e Calendário Maçônico.
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const { formatarData, formatarDataHora, paraInputData, paraInputDataHora, MESES, MESES_ABREV } = UI;
  const {
    PAGINAS, PERFIS, pode, selo, cabecalho, cabecalhoImpressao, tabelaHtml,
    formularioHtml, lerFormulario, paginaCrud, botaoLinha, mostrarAvisos,
  } = window.PW;

  const ROTULO_PRESENCA = { presente: "Presente", ausente: "Ausente", justificado: "Justificado", visitante: "Visitante" };
  const STATUS_PRESENCA = ["presente", "ausente", "justificado", "visitante"];

  function chip(cor, rotulo, valor) {
    return `<div class="chip"><span class="ponto ${cor}"></span>${esc(rotulo)}: <strong>${esc(String(valor))}</strong></div>`;
  }

  // ════════════════════════════ SESSÕES ════════════════════════════

  const CAMPOS_EVENTO = [
    { nome: "title", rotulo: "Título", obrigatorio: true, largo: true, dica: "Ex.: Sessão Ordinária — Outubro/2026" },
    {
      nome: "event_type",
      rotulo: "Tipo",
      tipo: "select",
      opcoes: [
        ["Sessão Ordinária", "Sessão Ordinária"],
        ["Sessão Magna", "Sessão Magna"],
        ["Sessão Branca", "Sessão Branca"],
        ["Sessão de Iniciação", "Sessão de Iniciação"],
        ["Cerimônia", "Cerimônia"],
        ["Reunião", "Reunião"],
        ["Ágape Fraternal", "Ágape Fraternal"],
        ["Outro", "Outro"],
      ],
    },
    { nome: "starts_at", rotulo: "Data e hora", tipo: "datetime-local", obrigatorio: true, dataHora: true },
    { nome: "location", rotulo: "Local", dica: "Templo da Loja" },
    { nome: "description", rotulo: "Descrição / pauta", tipo: "textarea", largo: true },
  ];

  let recarregarSessoes = null;

  async function abrirFrequencia(ev, ctx, aoSalvar) {
    const { items } = await API.get(`/events/${ev.id}/attendance`);
    const podeMarcar = pode(ctx.usuario, PERFIS.presenca);

    const linhas = items
      .map(
        (p, i) => `<tr>
          <td><strong>${esc(p.full_name)}</strong>${p.cim ? ` <span class="texto-suave" style="font-size:12px">CIM ${esc(p.cim)}</span>` : ""}</td>
          <td>
            <div class="escolha-presenca">
              ${STATUS_PRESENCA.map(
                (v) =>
                  `<button type="button" class="opcao-presenca ${p.status === v ? "selecionada" : ""}" data-valor="${v}" ${podeMarcar ? "" : "disabled"}>${ROTULO_PRESENCA[v]}</button>`,
              ).join("")}
              <input type="hidden" data-p="${i}" value="${esc(p.status || "")}">
            </div>
          </td>
          <td><input type="text" data-obs="${i}" value="${esc(p.notes || "")}" placeholder="Observação" ${podeMarcar ? "" : "disabled"} style="width:100%"></td>
        </tr>`,
      )
      .join("");

    const modal = UI.abrirModal({
      titulo: `Frequência — ${ev.title}`,
      largo: true,
      corpo: `
        <p class="texto-suave" style="margin:0 0 12px;font-size:13px">${formatarDataHora(ev.starts_at)}${ev.location ? " • " + esc(ev.location) : ""}</p>
        ${
          podeMarcar
            ? `<div style="display:flex;gap:8px;margin-bottom:12px">
                 <button type="button" class="botao botao-claro botao-pequeno" id="todos-presentes">Marcar todos presentes</button>
                 <button type="button" class="botao botao-claro botao-pequeno" id="limpar-presencas">Limpar marcações</button>
               </div>`
            : ""
        }
        ${items.length
          ? `<div class="tabela-envolucro"><table class="tabela">
               <thead><tr><th>Irmão</th><th>Presença</th><th>Observação</th></tr></thead>
               <tbody>${linhas}</tbody>
             </table></div>`
          : '<p class="vazio">Nenhum irmão ativo para registrar presença.</p>'}`,
      botoes: podeMarcar
        ? [
            { rotulo: "Fechar", tipo: "botao-claro" },
            {
              rotulo: "Salvar presenças",
              tipo: "botao-azul",
              acao: async (m) => {
                const entries = [];
                m.el.querySelectorAll("input[data-p]").forEach((h) => {
                  if (!h.value) return;
                  const i = Number(h.dataset.p);
                  const obs = m.el.querySelector(`input[data-obs="${i}"]`);
                  const entrada = { brother_id: items[i].brother_id, status: h.value };
                  if (obs && obs.value.trim()) entrada.notes = obs.value.trim();
                  entries.push(entrada);
                });
                if (!entries.length) throw new Error("Nenhuma presença marcada.");
                await API.put(`/events/${ev.id}/attendance`, { entries });
                UI.aviso(`Presenças salvas (${entries.length}).`, "ok");
                if (aoSalvar) await aoSalvar();
              },
            },
          ]
        : [{ rotulo: "Fechar", tipo: "botao-claro" }],
    });

    if (!podeMarcar) return;

    modal.el.querySelectorAll(".escolha-presenca").forEach((grupo) => {
      const oculto = grupo.querySelector("input[type=hidden]");
      grupo.querySelectorAll(".opcao-presenca").forEach((b) =>
        b.addEventListener("click", () => {
          const jaSelecionado = b.classList.contains("selecionada");
          grupo.querySelectorAll(".opcao-presenca").forEach((x) => x.classList.remove("selecionada"));
          if (jaSelecionado) {
            oculto.value = "";
          } else {
            b.classList.add("selecionada");
            oculto.value = b.dataset.valor;
          }
        }),
      );
    });

    const todos = modal.el.querySelector("#todos-presentes");
    if (todos)
      todos.addEventListener("click", () => {
        modal.el.querySelectorAll(".escolha-presenca").forEach((grupo) => {
          grupo.querySelector("input[type=hidden]").value = "presente";
          grupo.querySelectorAll(".opcao-presenca").forEach((b) => b.classList.toggle("selecionada", b.dataset.valor === "presente"));
        });
      });

    const limpar = modal.el.querySelector("#limpar-presencas");
    if (limpar)
      limpar.addEventListener("click", () => {
        modal.el.querySelectorAll(".escolha-presenca").forEach((grupo) => {
          grupo.querySelector("input[type=hidden]").value = "";
          grupo.querySelectorAll(".opcao-presenca").forEach((b) => b.classList.remove("selecionada"));
        });
      });
  }

  const paginaSessoesCrud = paginaCrud({
    titulo: "Sessões e Eventos",
    descricao: "Agenda da Loja — sessões, cerimônias e reuniões, com controle de presença",
    caminho: "/events",
    permissao: PERFIS.sessoes,
    substantivo: "Evento",
    rotuloNovo: "Novo evento",
    vazio: "Nenhum evento encontrado.",
    filtros: [
      {
        nome: "periodo",
        rotulo: "Período",
        tipo: "select",
        padrao: "todos",
        opcoes: [
          ["todos", "Todos"],
          ["proximos", "Próximos"],
          ["ano", "Ano atual"],
          ["passados", "Já realizados"],
        ],
      },
    ],
    montarConsulta: (f) => {
      const anoAtual = new Date().getFullYear();
      const p = new URLSearchParams();
      if (f.periodo === "proximos") p.set("upcoming", "1");
      else if (f.periodo === "ano") {
        p.set("from", `${anoAtual}-01-01T00:00:00`);
        p.set("to", `${anoAtual + 1}-01-01T00:00:00`);
      } else if (f.periodo === "passados") p.set("to", new Date().toISOString());
      p.set("limit", "300");
      return p.toString();
    },
    colunas: [
      {
        rotulo: "Evento",
        valor: (ev) => `<strong>${esc(ev.title)}</strong>${ev.event_type ? `<br><span class="texto-suave" style="font-size:12px">${esc(ev.event_type)}</span>` : ""}`,
      },
      { rotulo: "Data e hora", valor: (ev) => formatarDataHora(ev.starts_at) },
      { rotulo: "Local", valor: (ev) => esc(ev.location || "—") },
      {
        rotulo: "Presenças",
        valor: (ev) =>
          new Date(ev.starts_at) < new Date()
            ? `<span class="selo selo-verde">${ev.presentes} presentes</span>`
            : '<span class="texto-suave" style="font-size:12.5px">Evento futuro</span>',
      },
    ],
    campos: CAMPOS_EVENTO,
    valoresPadrao: { event_type: "Sessão Ordinária" },
    valoresIniciais: (ev) => ({
      title: ev.title,
      event_type: ev.event_type || "Sessão Ordinária",
      starts_at: paraInputDataHora(ev.starts_at),
      location: ev.location || "",
      description: ev.description || "",
    }),
    acoesLinha: (ev, ctx) => [
      {
        rotulo: "Frequência",
        icone: "presenca",
        executar: (item) => abrirFrequencia(item, ctx, () => recarregarSessoes && recarregarSessoes()),
      },
    ],
    aposMontar: (elPagina, ctxPagina, { recarregar }) => {
      recarregarSessoes = recarregar;
      // Avisos internos do perfil (ex.: evento agendado pela Fraternidade).
      mostrarAvisos(elPagina, ctxPagina).catch(() => {});
    },
  });

  PAGINAS.sessoes = { titulo: "Sessões", icone: "sessoes", render: paginaSessoesCrud };

  // ════════════════════ FREQUÊNCIA E VISITAÇÃO ════════════════════

  const CAMPOS_VISITA = [
    {
      nome: "visit_type",
      rotulo: "Tipo",
      tipo: "select",
      opcoes: [
        ["realizada", "Realizada (nossa visita)"],
        ["recebida", "Recebida (visita à nossa Loja)"],
      ],
      padrao: "realizada",
    },
    { nome: "visit_date", rotulo: "Data", tipo: "date", obrigatorio: true },
    { nome: "brother_name", rotulo: "Irmão / visitante", obrigatorio: true, largo: true, dica: "Nome de quem visitou ou foi visitado" },
    { nome: "lodge_name", rotulo: "Loja" },
    { nome: "power_name", rotulo: "Potência" },
    { nome: "notes", rotulo: "Observações", tipo: "textarea", largo: true },
  ];

  PAGINAS.frequencia = {
    titulo: "Livro de Frequência",
    icone: "frequencia",
    async render(el, ctx) {
      const anoAtual = new Date().getFullYear();
      let ano = anoAtual;
      const podeVisitas = pode(ctx.usuario, PERFIS.visitas);
      const podeExcluirVisita = pode(ctx.usuario, ["admin", "veneravel"]);
      const podeMarcar = pode(ctx.usuario, PERFIS.presenca);
      let visitas = [];

      const opcoesAno = Array.from({ length: 6 }, (_, i) => anoAtual - 4 + i)
        .map((a) => `<option value="${a}" ${a === ano ? "selected" : ""}>${a}</option>`)
        .join("");

      el.innerHTML =
        cabecalho(
          "Livro de Frequência",
          "O livro de presença dos irmãos nas sessões e o registro das visitações realizadas e recebidas",
          (podeMarcar
            ? `<button type="button" class="botao botao-dourado" id="lancar-frequencia"${UI.dica("Abre a chamada de uma sessão para marcar presença, ausência ou justificativa.")}>${svg("presenca", 16)} Lançar frequência</button>`
            : "") +
            `<button type="button" class="botao botao-claro" id="imprimir-frequencia"${UI.dica("Imprime (ou salva em PDF) o livro de frequência do ano escolhido, com o timbre da Loja.")}>${svg("imprimir", 16)} Imprimir livro</button>`,
        ) +
        cabecalhoImpressao("Livro de Frequência", `Ano ${ano}`) +
        `<div class="cartao">
          <h3 class="cartao-titulo">
            <span class="com-icone">${svg("presenca", 17)} FREQUÊNCIA DOS IRMÃOS</span>
            <select id="ano-frequencia" style="width:auto;padding:6px 10px">${opcoesAno}</select>
          </h3>
          <div id="area-frequencia"><p class="carregando">Carregando frequência...</p></div>
        </div>
        <div class="cartao">
          <h3 class="cartao-titulo">
            <span class="com-icone">${svg("frequencia", 17)} VISITAÇÕES</span>
            <span style="display:flex;gap:8px;align-items:center">
              <select id="filtro-visita" style="width:auto;padding:6px 10px">
                <option value="">Todas</option>
                <option value="realizada">Realizadas</option>
                <option value="recebida">Recebidas</option>
              </select>
              ${podeVisitas ? '<button type="button" class="botao botao-azul botao-pequeno" id="nova-visita">+ Nova visitação</button>' : ""}
            </span>
          </h3>
          <div id="area-visitas"><p class="carregando">Carregando visitações...</p></div>
        </div>`;

      // Cobrar frequência: irmãos com faltas no ano (justificada continua
      // sendo falta), com o WhatsApp já preenchido com o modelo
      // "Sentimos sua falta nas sessões" (presets.js).
      function faltososHtml(items, year) {
        const faltosos = items
          .map((i) => ({ ...i, faltas: (i.ausente || 0) + (i.justificado || 0) }))
          .filter((i) => i.faltas > 0)
          .sort((a, b) => b.faltas - a.faltas);
        const P = window.PRESETS_COMUNICADO;
        const modelo = P && P.MODELOS.find((m) => m.assunto === "Sentimos sua falta nas sessões");
        const link = (i) => {
          const digitos = String(i.phone || "").replace(/\D/g, "");
          if (digitos.length < 10 || !modelo) return "";
          const numero = digitos.length >= 12 ? digitos : "55" + digitos;
          const texto = P.preencher(modelo.texto, { ...P.dadosPadrao(), nome: i.full_name });
          return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
        };
        return `<h3 class="cartao-titulo mt16"><span class="com-icone">${svg("alerta", 17)} FALTAS EM ${year} — COBRAR FREQUÊNCIA</span></h3>
          ${tabelaHtml(
            [
              { rotulo: "Irmão", valor: (i) => `<strong>${esc(i.full_name)}</strong>` },
              { rotulo: "Faltas", valor: (i) => `<span class="selo selo-vermelho">${i.faltas}</span>` },
              { rotulo: "Justificadas (contam como falta)", valor: (i) => String(i.justificado || 0) },
              {
                rotulo: "Cobrar",
                valor: (i) => {
                  const l = link(i);
                  return l
                    ? `<a class="botao botao-claro botao-pequeno nao-imprimir" href="${esc(l)}" target="_blank" rel="noopener"${UI.dica("Abre o WhatsApp com a mensagem “Sentimos sua falta nas sessões”.")}>${svg("whatsapp", 14)} WhatsApp</a>`
                    : '<span class="texto-suave" style="font-size:12px">sem telefone</span>';
                },
              },
            ],
            faltosos,
            { vazio: `Nenhum irmão com falta em ${year}.` },
          )}`;
      }

      async function carregarFrequencia() {
        const area = el.querySelector("#area-frequencia");
        area.innerHTML = '<p class="carregando">Carregando...</p>';
        try {
          const { year, meetings, items } = await API.get(`/reports/frequency?year=${ano}`);
          const soma = (k) => items.reduce((t, i) => t + (i[k] || 0), 0);
          const presentes = soma("presente");
          const ausentes = soma("ausente");
          const justificados = soma("justificado");
          const base = presentes + ausentes + justificados;
          const media = base ? Math.round((100 * presentes) / base) : 0;

          const colunas = [
            { rotulo: "Irmão", valor: (i) => `<strong>${esc(i.full_name)}</strong>` },
            { rotulo: "Presente", valor: (i) => `<span class="selo selo-verde">${i.presente}</span>` },
            { rotulo: "Ausente", valor: (i) => `<span class="selo selo-vermelho">${i.ausente}</span>` },
            { rotulo: "Justificado", valor: (i) => `<span class="selo selo-ambar">${i.justificado}</span>` },
            {
              rotulo: "% de presença",
              valor: (i) => {
                const b = i.presente + i.ausente + i.justificado;
                const pct = b ? Math.round((100 * i.presente) / b) : 0;
                return `<div style="display:flex;align-items:center;gap:8px;min-width:130px">
                  <div class="barra-pct" style="flex:1"><span style="width:${pct}%"></span></div>
                  <span style="font-size:12.5px;color:var(--texto-suave)">${pct}%</span>
                </div>`;
              },
            },
          ];

          area.innerHTML =
            `<div class="chips-resumo">
              ${chip("azul", "Sessões no ano", meetings)}
              ${chip("verde", "Presenças", presentes)}
              ${chip("vermelho", "Ausências", ausentes)}
              ${chip("ambar", "Justificadas", justificados)}
              ${chip("azul", "Frequência média", media + "%")}
            </div>` +
            tabelaHtml(colunas, items, {
              vazio: `Nenhuma presença registrada em ${year}. Use o botão "Lançar frequência" para fazer a chamada.`,
            }) +
            faltososHtml(items, year);
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      async function carregarVisitas() {
        const filtro = el.querySelector("#filtro-visita").value;
        const area = el.querySelector("#area-visitas");
        area.innerHTML = '<p class="carregando">Carregando...</p>';
        try {
          const { items } = await API.get(`/visits?year=${ano}${filtro ? "&type=" + filtro : ""}`);
          visitas = items;
          const colunas = [
            { rotulo: "Tipo", valor: (v) => selo(v.visit_type) },
            { rotulo: "Irmão / visitante", valor: (v) => `<strong>${esc(v.brother_name)}</strong>` },
            { rotulo: "Loja", valor: (v) => esc(v.lodge_name || "—") },
            { rotulo: "Potência", valor: (v) => esc(v.power_name || "—") },
            { rotulo: "Data", valor: (v) => formatarData(v.visit_date) },
            { rotulo: "Registrada por", valor: (v) => esc(v.registrado_por || "—") },
          ];
          area.innerHTML = tabelaHtml(colunas, visitas, {
            vazio: "Nenhuma visitação registrada neste ano.",
            comAcoes: podeVisitas,
          });

          if (podeVisitas) {
            area.querySelectorAll("[data-acoes]").forEach((td) => {
              const visita = visitas[Number(td.dataset.acoes)];
              const b1 = botaoLinha("Editar", "botao-claro", "editar");
              b1.addEventListener("click", () => abrirVisita(visita));
              td.appendChild(b1);
              if (podeExcluirVisita) {
                const b2 = botaoLinha("Excluir", "botao-perigo", "lixo");
                b2.addEventListener("click", async () => {
                  const ok = await UI.confirmar(`Excluir a visitação de ${visita.brother_name}?`, {
                    rotuloOk: "Excluir",
                    perigo: true,
                  });
                  if (!ok) return;
                  await API.del(`/visits/${visita.id}`);
                  UI.aviso("Visitação excluída.", "ok");
                  await carregarVisitas();
                });
                td.appendChild(b2);
              }
            });
          }
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      function abrirVisita(visita) {
        UI.abrirModal({
          titulo: visita ? "Editar visitação" : "Nova visitação",
          corpo: formularioHtml(
            CAMPOS_VISITA,
            visita ? { ...visita, visit_date: paraInputData(visita.visit_date) } : {},
          ),
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: visita ? "Salvar alterações" : "Registrar visitação",
              tipo: "botao-azul",
              acao: async (m) => {
                const dados = lerFormulario(m.corpo, CAMPOS_VISITA);
                if (visita) await API.patch(`/visits/${visita.id}`, dados);
                else await API.post("/visits", dados);
                UI.aviso("Visitação salva.", "ok");
                await carregarVisitas();
              },
            },
          ],
        });
      }

      async function abrirEscolhaSessao() {
        let sessoes = [];
        try {
          const de = new Date(ano, 0, 1).toISOString();
          const ate = new Date(ano + 1, 0, 1).toISOString();
          const r = await API.get(`/events?from=${encodeURIComponent(de)}&to=${encodeURIComponent(ate)}&limit=300`);
          // Só sessões em loja entram no Livro (ágape, reunião etc. não contam).
          sessoes = (r.items || [])
            .filter((ev) => /^sess/i.test(ev.event_type || ""))
            .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
        } catch (err) {
          UI.aviso(err.message || "Não foi possível carregar as sessões.", "erro");
          return;
        }
        if (!sessoes.length) {
          UI.aviso(`Nenhuma sessão cadastrada em ${ano}. Cadastre na página Sessões.`, "erro");
          return;
        }
        const opcoes = sessoes
          .map(
            (ev) =>
              `<option value="${esc(ev.id)}">${esc(formatarDataHora(ev.starts_at))} — ${esc(ev.title)}</option>`,
          )
          .join("");
        UI.abrirModal({
          titulo: `Lançar frequência — ${ano}`,
          corpo: `<div class="campo">
              <label for="sessao-chamada">Sessão</label>
              <select id="sessao-chamada">${opcoes}</select>
            </div>
            <p class="texto-suave" style="font-size:13px;margin:10px 0 0">Escolha a sessão para abrir a chamada dos irmãos.</p>`,
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: "Abrir chamada",
              tipo: "botao-azul",
              acao: async (m) => {
                const id = m.el.querySelector("#sessao-chamada").value;
                const ev = sessoes.find((x) => x.id === id);
                if (!ev) throw new Error("Escolha uma sessão.");
                // Fecha a escolha antes de abrir a chamada: os dois modais
                // usam o mesmo elemento da página.
                m.fechar();
                try {
                  await abrirFrequencia(ev, ctx, carregarFrequencia);
                } catch (err) {
                  UI.aviso(err.message || "Não foi possível abrir a chamada.", "erro");
                }
                return false;
              },
            },
          ],
        });
      }

      el.querySelector("#ano-frequencia").addEventListener("change", (e) => {
        ano = Number(e.target.value);
        carregarFrequencia();
        carregarVisitas();
      });
      el.querySelector("#filtro-visita").addEventListener("change", carregarVisitas);
      const nova = el.querySelector("#nova-visita");
      if (nova) nova.addEventListener("click", () => abrirVisita(null));
      const lancar = el.querySelector("#lancar-frequencia");
      if (lancar) lancar.addEventListener("click", abrirEscolhaSessao);
      const imprimirLivro = el.querySelector("#imprimir-frequencia");
      if (imprimirLivro) imprimirLivro.addEventListener("click", () => window.print());

      await Promise.all([carregarFrequencia(), carregarVisitas()]);
    },
  };

  // ════════════════════════════ CALENDÁRIO ════════════════════════════

  PAGINAS.calendario = {
    titulo: "Calendário",
    icone: "calendario",
    async render(el) {
      const hoje = new Date();
      let mes = hoje.getMonth();
      let ano = hoje.getFullYear();

      el.innerHTML =
        cabecalho("Calendário Maçônico", "Agenda completa da Loja — use as setas para navegar entre os meses") +
        `<div class="cartao" id="area-cal"><p class="carregando">Carregando calendário...</p></div>
        <div class="cartao">
          <h3 class="cartao-titulo">${svg("sessoes", 17)} EVENTOS DO MÊS</h3>
          <ul class="lista-eventos" id="lista-mes"></ul>
        </div>`;

      async function desenhar() {
        const area = el.querySelector("#area-cal");
        const lista = el.querySelector("#lista-mes");
        area.innerHTML = '<p class="carregando">Carregando...</p>';
        const de = new Date(ano, mes, 1);
        const ate = new Date(ano, mes + 1, 1);
        const { items } = await API.get(`/events?from=${de.toISOString()}&to=${ate.toISOString()}&limit=300`);

        const porDia = {};
        for (const ev of items) {
          const d = new Date(ev.starts_at);
          (porDia[d.getDate()] = porDia[d.getDate()] || []).push(ev);
        }

        const primeiroDia = new Date(ano, mes, 1).getDay();
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        let celulas = "";
        for (let i = 0; i < primeiroDia; i++) celulas += '<div class="dia fora"></div>';
        for (let d = 1; d <= diasNoMes; d++) {
          const ehHoje = d === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();
          celulas += `<div class="dia ${ehHoje ? "hoje" : ""} ${porDia[d] ? "com-evento" : ""}" ${porDia[d] ? `title="${esc(porDia[d].map((e) => e.title).join(" | "))}"` : ""}>${d}</div>`;
        }

        area.innerHTML = `
          <div class="calendario-rotulo">
            <button type="button" data-mes="-1" aria-label="Mês anterior">‹</button>
            <span>${MESES[mes]} de ${ano}</span>
            <button type="button" data-mes="1" aria-label="Próximo mês">›</button>
          </div>
          <div class="calendario-grade">
            ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<span class="semana">${d}</span>`).join("")}
            ${celulas}
          </div>
          ${items.length ? '<p class="texto-suave" style="font-size:12px;margin:10px 0 0">◆ Dias destacados possuem eventos.</p>' : ""}`;

        area.querySelectorAll("[data-mes]").forEach((b) =>
          b.addEventListener("click", () => {
            mes += Number(b.dataset.mes);
            if (mes < 0) { mes = 11; ano--; }
            if (mes > 11) { mes = 0; ano++; }
            desenhar();
          }),
        );

        const ordenados = items.slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
        lista.innerHTML = ordenados.length
          ? ordenados
              .map((ev) => {
                const d = new Date(ev.starts_at);
                return `<li>
                  <div class="evento-data"><span class="dia">${d.getDate()}</span><span class="mes">${MESES_ABREV[d.getMonth()]}</span></div>
                  <div class="evento-info">
                    <div class="titulo">${esc(ev.title)}</div>
                    <div class="detalhe">${formatarDataHora(ev.starts_at)}${ev.location ? " • " + esc(ev.location) : ""}${ev.event_type ? " • " + esc(ev.event_type) : ""}</div>
                  </div>
                </li>`;
              })
              .join("")
          : '<li><span class="texto-suave" style="font-size:13px">Nenhum evento neste mês.</span></li>';
      }

      await desenhar();
    },
  };
})();
