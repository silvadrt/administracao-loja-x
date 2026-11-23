// ============================================================
// Páginas: Fraternidade Feminina, Financeiro e Comunicados
// (WhatsApp — mensagens preparadas com links wa.me).
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const { formatarData, formatarDataHora, paraInputData, mesDeReferencia, formatarMoeda, MESES } = UI;
  const {
    PAGINAS, PERFIS, pode, selo, cabecalho, tabelaHtml,
    formularioHtml, lerFormulario, abrirFormulario, paginaCrud, botaoLinha, enviarComMotivo,
  } = window.PW;

  function chip(cor, rotulo, valor) {
    return `<div class="chip"><span class="ponto ${cor}"></span>${esc(rotulo)}: <strong>${esc(String(valor))}</strong></div>`;
  }

  function numerosWhatsApp(telefone) {
    const digitos = String(telefone || "").replace(/\D/g, "");
    if (digitos.length < 10) return "";
    return digitos.length >= 12 ? digitos : "55" + digitos;
  }

  // ════════════════════ FRATERNIDADE FEMININA ════════════════════

  PAGINAS.fraternidade = {
    titulo: "Fraternidade Feminina",
    icone: "fraternidade",
    async render(el, ctx) {
      let irmaos = [];
      try {
        irmaos = (await API.get("/brothers?limit=300")).items || [];
      } catch {
        irmaos = [];
      }

      const CAMPOS_FRATERNIDADE = [
        { nome: "full_name", rotulo: "Nome completo", obrigatorio: true, largo: true },
        { nome: "role_name", rotulo: "Função na Fraternidade", dica: "Presidente, Tesoureira, Secretária..." },
        { nome: "birth_date", rotulo: "Nascimento", tipo: "date" },
        { nome: "phone", rotulo: "Telefone" },
        { nome: "email", rotulo: "E-mail", tipo: "email" },
        {
          nome: "related_brother_id",
          rotulo: "Irmão vinculado",
          tipo: "select",
          opcoes: irmaos.map((b) => [b.id, b.full_name]),
          opcoesVazias: "—",
          largo: true,
        },
        {
          nome: "active",
          rotulo: "Situação",
          tipo: "select",
          opcoes: [
            ["true", "Ativa"],
            ["false", "Inativa"],
          ],
        },
      ];

      const pagina = paginaCrud({
        titulo: "Fraternidade Feminina",
        descricao: "Membros da Fraternidade Feminina vinculados à Loja",
        caminho: "/fraternity",
        permissao: PERFIS.fraternidade,
        substantivo: "Membro",
        rotuloNovo: "Novo membro",
        vazio: "Nenhuma membro cadastrada ainda.",
        podeExcluir: (u) => pode(u, ["admin", "veneravel"]),
        filtros: [
          { nome: "q", rotulo: "Buscar", dica: "Nome" },
          {
            nome: "situacao",
            rotulo: "Situação",
            tipo: "select",
            opcoes: [
              ["1", "Ativas"],
              ["0", "Inativas"],
            ],
          },
        ],
        montarConsulta: (f) => {
          const p = new URLSearchParams();
          if (f.q) p.set("q", f.q);
          if (f.situacao === "1") p.set("active", "1");
          return p.toString();
        },
        colunas: [
          { rotulo: "Nome", valor: (m) => `<strong>${esc(m.full_name)}</strong>` },
          { rotulo: "Função", valor: (m) => esc(m.role_name || "—") },
          { rotulo: "Irmão vinculado", valor: (m) => esc(m.related_brother_name || "—") },
          { rotulo: "Telefone", valor: (m) => esc(m.phone || "—") },
          { rotulo: "Nascimento", valor: (m) => formatarData(m.birth_date) },
          { rotulo: "Situação", valor: (m) => (m.active === false ? selo("nao") : selo("sim")) },
        ],
        campos: CAMPOS_FRATERNIDADE,
        valoresPadrao: { active: "true" },
        valoresIniciais: (m) => ({
          full_name: m.full_name,
          role_name: m.role_name || "",
          birth_date: paraInputData(m.birth_date),
          phone: m.phone || "",
          email: m.email || "",
          related_brother_id: m.related_brother_id || "",
          active: m.active === false ? "false" : "true",
        }),
        aoEnviar: (d) => {
          const dados = { ...d, active: d.active === "true" };
          if (!dados.related_brother_id) delete dados.related_brother_id;
          return dados;
        },
      });

      await pagina(el, ctx);

      // ---------- Eventos da Fraternidade (com aviso à Secretaria) ----------
      const podeAgendar = pode(ctx.usuario, PERFIS.fraternidade);
      el.insertAdjacentHTML(
        "beforeend",
        `<div class="cartao">
          <h3 class="cartao-titulo">
            <span class="com-icone">${svg("calendario", 17)} EVENTOS DA FRATERNIDADE</span>
            ${podeAgendar ? `<button type="button" class="botao botao-azul botao-pequeno" id="agendar-evento-frat"${UI.dica("Agenda um evento da Fraternidade; a Secretaria recebe um aviso automático.")}>${svg("mais", 14)} Agendar evento</button>` : ""}
          </h3>
          <p class="texto-suave" style="font-size:13px;margin:0 0 10px">Os eventos agendados aqui entram no calendário da Loja e a Secretaria recebe um aviso para acompanhar.</p>
          <div id="area-eventos-frat"><p class="carregando">Carregando eventos...</p></div>
        </div>`,
      );

      const CAMPOS_EVENTO_FRAT = [
        { nome: "title", rotulo: "Título do evento", obrigatorio: true, largo: true, dica: "Ex.: Encontro da Fraternidade Feminina" },
        { nome: "starts_at", rotulo: "Data e hora", tipo: "datetime-local", obrigatorio: true, dataHora: true },
        { nome: "location", rotulo: "Local", dica: "Ex.: Templo da Loja" },
        { nome: "description", rotulo: "Descrição / pauta", tipo: "textarea", largo: true },
      ];

      async function carregarEventosFrat() {
        const area = el.querySelector("#area-eventos-frat");
        if (!area) return;
        try {
          const { items } = await API.get("/fraternity/eventos?upcoming=1");
          area.innerHTML = tabelaHtml(
            [
              { rotulo: "Data e hora", valor: (ev) => formatarDataHora(ev.starts_at) },
              {
                rotulo: "Evento",
                valor: (ev) =>
                  `<strong>${esc(ev.title)}</strong>${ev.description ? `<br><span class="texto-suave" style="font-size:12px">${esc(ev.description)}</span>` : ""}`,
              },
              { rotulo: "Local", valor: (ev) => esc(ev.location || "—") },
            ],
            items || [],
            { vazio: "Nenhum evento da Fraternidade agendado.", comAcoes: podeAgendar },
          );
          if (podeAgendar) {
            area.querySelectorAll("[data-acoes]").forEach((td) => {
              const ev = items[Number(td.dataset.acoes)];
              const b = botaoLinha("Cancelar", "botao-perigo", "lixo", "Cancela este evento da Fraternidade (some do calendário).");
              b.addEventListener("click", async () => {
                const ok = await UI.confirmar(`Cancelar o evento "${ev.title}"?`, {
                  titulo: "Cancelar evento",
                  rotuloOk: "Cancelar evento",
                  perigo: true,
                });
                if (!ok) return;
                await API.del(`/fraternity/eventos/${ev.id}`);
                UI.aviso("Evento cancelado.", "ok");
                await carregarEventosFrat();
              });
              td.appendChild(b);
            });
          }
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      const botaoAgendar = el.querySelector("#agendar-evento-frat");
      if (botaoAgendar) {
        botaoAgendar.addEventListener("click", () =>
          abrirFormulario(
            {
              caminho: "/fraternity/eventos",
              titulo: "Evento da Fraternidade",
              substantivo: "evento",
              rotuloNovo: "Agendar evento da Fraternidade",
              campos: CAMPOS_EVENTO_FRAT,
              notaFormulario: "A Secretaria recebe um aviso automático e o evento aparece no calendário da Loja.",
            },
            null,
            async () => {
              UI.aviso("A Secretaria foi avisada do novo evento.", "ok");
              await carregarEventosFrat();
            },
          ),
        );
      }

      await carregarEventosFrat();
    },
  };

  // ════════════════════════════ FINANCEIRO ════════════════════════════
  // Tudo o que movimenta dinheiro é lançado aqui:
  // as cobranças dos irmãos (mensalidade, taxa extra, tronco,
  // doação) e os lançamentos avulsos de entrada e de saída. A tela do
  // Caixa só mostra a contabilidade e o relatório de quem deve.

  // Valor da mensalidade da Loja (igual para todos os irmãos).
  const MENSALIDADE_PADRAO = 180;

  const TIPOS_COBRANCA = [
    ["mensalidade", "Mensalidade"],
    ["taxa_extra", "Taxa extra"],
    ["tronco", "Tronco de Beneficência"],
    ["doacao", "Doação"],
    ["outro", "Outro"],
  ];
  const SITUACOES = [
    ["pendente", "Pendente"],
    ["pago", "Pago"],
    ["isento", "Isento"],
    ["cancelado", "Cancelado"],
  ];
  const ROTULO_TIPO = Object.fromEntries(TIPOS_COBRANCA);
  // Saídas que abatem o Tronco de Beneficência (iguais às do servidor).
  const SAIDAS_TRONCO = ["beneficencia", "retirada_tronco"];

  const mesAtualISO = () => {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  };
  // Data de hoje no fuso do navegador (toISOString usaria UTC e viraria o dia
  // às 21h no horário de Brasília).
  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  let recarregarFinanceiro = null;

  function abrirGerarMensalidades(recarregar) {
    const campos = [
      { nome: "reference_month", rotulo: "Mês de referência", tipo: "month", obrigatorio: true },
      { nome: "amount", rotulo: "Valor por irmão (R$)", tipo: "number", obrigatorio: true, passo: "0.01", min: "0.01", dica: "0,00" },
      { nome: "due_day", rotulo: "Dia do vencimento", tipo: "number", min: 1, max: 28, ajuda: "Entre 1 e 28." },
    ];

    UI.abrirModal({
      titulo: "Gerar mensalidades do mês",
      corpo:
        formularioHtml(campos, { reference_month: mesAtualISO(), amount: MENSALIDADE_PADRAO, due_day: 10 }) +
        `<p class="ajuda mt8">A mensalidade tem o mesmo valor para todos os irmãos. Serão geradas apenas para os irmãos <strong>ativos</strong> que ainda não tenham a mensalidade deste mês; os já lançados são ignorados.</p>`,
      botoes: [
        { rotulo: "Cancelar", tipo: "botao-claro" },
        {
          rotulo: "Gerar mensalidades",
          tipo: "botao-dourado",
          acao: async (m) => {
            const dados = lerFormulario(m.corpo, campos);
            const r = await API.post("/contributions/generate-month", dados);
            UI.aviso(r.message || "Mensalidades geradas.", "ok");
            if (recarregar) await recarregar();
          },
        },
      ],
    });
  }

  // Cobrança em lote: taxa extra (aprovada em loja), doação, tronco ou outro,
  // para todos os irmãos ativos ou só para os escolhidos.
  function abrirCobrancaEmLote(irmaos, recarregar) {
    const ativos = irmaos.filter((b) => b.status === "ativo");
    const campos = [
      {
        nome: "contribution_type",
        rotulo: "Tipo de cobrança",
        tipo: "select",
        obrigatorio: true,
        opcoes: TIPOS_COBRANCA.filter(([v]) => v !== "mensalidade"),
      },
      {
        nome: "description",
        rotulo: "Descrição",
        obrigatorio: true,
        largo: true,
        dica: "Ex.: Reforma do Templo — aprovada na Ata nº 12/2026",
        ajuda: "Aparece no Financeiro, no relatório de quem deve e no relatório do irmão.",
      },
      { nome: "amount", rotulo: "Valor por irmão (R$)", tipo: "number", obrigatorio: true, passo: "0.01", min: "0.01", dica: "0,00" },
      { nome: "reference_month", rotulo: "Mês de referência", tipo: "month", obrigatorio: true },
      { nome: "due_date", rotulo: "Vencimento", tipo: "date", nuloSeVazio: true },
    ];
    const listaIrmaos = ativos
      .map(
        (b) => `<label class="opcao-irmao"><input type="checkbox" value="${esc(b.id)}" data-irmao> ${esc(b.full_name)}</label>`,
      )
      .join("");

    UI.abrirModal({
      titulo: "Gerar cobrança em lote",
      largo: true,
      corpo:
        formularioHtml(campos, { contribution_type: "taxa_extra", reference_month: mesAtualISO() }) +
        `<fieldset class="para-quem mt8">
           <legend>Para quem</legend>
           <label><input type="radio" name="para-quem" value="todos" checked> Todos os irmãos ativos (${ativos.length})</label>
           <label><input type="radio" name="para-quem" value="alguns"> Só os irmãos escolhidos</label>
           <div class="lista-irmaos oculto" data-lista>${listaIrmaos || '<span class="texto-suave">Nenhum irmão ativo.</span>'}</div>
         </fieldset>
         <p class="ajuda mt8">Cada irmão recebe uma cobrança <strong>pendente</strong>. Quem já tem a mesma cobrança (mesmo tipo, mês e descrição) é ignorado.</p>`,
      botoes: [
        { rotulo: "Cancelar", tipo: "botao-claro" },
        {
          rotulo: "Gerar cobrança",
          tipo: "botao-dourado",
          acao: async (m) => {
            const dados = lerFormulario(m.corpo, campos);
            const alguns = m.corpo.querySelector('input[name="para-quem"]:checked').value === "alguns";
            if (alguns) {
              dados.brother_ids = [...m.corpo.querySelectorAll("[data-irmao]:checked")].map((c) => c.value);
              if (!dados.brother_ids.length) throw new Error("Escolha ao menos um irmão.");
            }
            const r = await API.post("/contributions/generate-charge", dados);
            UI.aviso(r.message || "Cobrança gerada.", "ok");
            if (recarregar) await recarregar();
          },
        },
      ],
    });
    const modal = document.getElementById("modal");
    modal.querySelectorAll('input[name="para-quem"]').forEach((r) =>
      r.addEventListener("change", () => {
        modal.querySelector("[data-lista]").classList.toggle("oculto", r.value !== "alguns" || !r.checked);
      }),
    );
  }

  function abrirRemoverMensalidades(recarregar) {
    const campos = [{ nome: "reference_month", rotulo: "Mês de referência", tipo: "month", obrigatorio: true }];

    UI.abrirModal({
      titulo: "Remover mensalidades do mês",
      corpo:
        formularioHtml(campos, { reference_month: mesAtualISO() }) +
        `<p class="ajuda mt8">Apaga <strong>todas as mensalidades</strong> do mês escolhido, em qualquer situação — use para desfazer uma geração feita por engano. Taxas extras, doações e tronco não são afetados.</p>`,
      botoes: [
        { rotulo: "Cancelar", tipo: "botao-claro" },
        {
          rotulo: "Remover mensalidades",
          tipo: "botao-perigo",
          acao: async (m) => {
            const { reference_month: mes } = lerFormulario(m.corpo, campos);
            const [ano, numero] = mes.split("-");
            const { items } = await API.get(`/contributions?ano=${ano}&mes=${numero}`);
            const quantas = (items || []).filter((c) => c.contribution_type === "mensalidade").length;
            if (!quantas) {
              UI.aviso("Não há mensalidades nesse mês.", "ok");
              return false;
            }
            const ok = await UI.confirmar(
              `Remover ${quantas} mensalidade(s) de ${mesDeReferencia(mes)}? Esta ação não pode ser desfeita.`,
              { titulo: "Confirmar remoção", rotuloOk: "Remover", perigo: true },
            );
            if (!ok) return false;
            const r = await API.post("/contributions/remove-month", { reference_month: mes });
            UI.aviso(r.message || "Mensalidades removidas.", "ok");
            if (recarregar) await recarregar();
          },
        },
      ],
    });
  }

  // Pagamento parcial (acordo com o irmão): a parte recebida fica paga e o
  // restante continua pendente como uma nova cobrança.
  function abrirPagamentoParcial(item) {
    const campos = [
      { nome: "amount_paid", rotulo: "Valor recebido agora (R$)", tipo: "number", obrigatorio: true, passo: "0.01", min: "0.01" },
      { nome: "notes", rotulo: "Observação do acordo", nuloSeVazio: true, largo: true, dica: "Ex.: restante combinado para o dia 20" },
    ];
    UI.abrirModal({
      titulo: "Pagamento parcial (acordo)",
      corpo:
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.6"><strong>${esc(item.contributor_name)}</strong> — ${esc(ROTULO_TIPO[item.contribution_type] || item.contribution_type)}
         de ${esc(mesDeReferencia(item.reference_month))}: <strong>${formatarMoeda(item.amount)}</strong></p>` +
        formularioHtml(campos, {}) +
        `<p class="ajuda mt8">O valor recebido entra no saldo agora. O restante continua <strong>pendente</strong> e aparece em “Quem deve”.</p>`,
      botoes: [
        { rotulo: "Cancelar", tipo: "botao-claro" },
        {
          rotulo: "Registrar pagamento",
          tipo: "botao-azul",
          acao: async (m) => {
            const dados = lerFormulario(m.corpo, campos);
            const r = await API.post(`/contributions/${item.id}/parcial`, dados);
            UI.aviso(r.message || "Pagamento parcial registrado.", "ok");
            if (recarregarFinanceiro) await recarregarFinanceiro();
          },
        },
      ],
    });
  }

  // Lançamento avulso de entrada ou de saída (contas, obras, GOB, retiradas,
  // beneficência, doações recebidas de fora...).
  function abrirLancamento(kind, item, catalogo, recarregar) {
    const tipo = item ? item.kind : kind;
    const motivos = catalogo
      .filter((c) => (tipo === "saida" ? c.saida || c.key === "outro" : !c.saida))
      .map((c) => [c.key, c.label]);
    const campos = [
      { nome: "category", rotulo: "Motivo", tipo: "select", obrigatorio: true, opcoes: motivos },
      { nome: "amount", rotulo: "Valor (R$)", tipo: "number", obrigatorio: true, passo: "0.01", min: "0.01" },
      { nome: "movement_date", rotulo: "Data", tipo: "date", obrigatorio: true },
      {
        nome: "description",
        rotulo: tipo === "saida" ? "Destinação / para quem foi pago" : "Origem / quem doou",
        obrigatorio: true,
        largo: true,
        dica: tipo === "saida" ? "Ex.: conta de luz do mês" : "Ex.: doação do Irmão Fulano para o jantar",
      },
    ];
    if (tipo === "saida") {
      campos.push({
        nome: "approval_ref",
        rotulo: "Ata que aprovou",
        nuloSeVazio: true,
        dica: "Ex.: Ata nº 12/2026",
        ajuda: "Obrigatório para retirada do saldo da Loja ou do Tronco.",
      });
    }
    campos.push(
      { nome: "reference_month", rotulo: "Mês de referência", tipo: "month", nuloSeVazio: true, ajuda: "Opcional. Serve para conferir as contas de um mês." },
      { nome: "notes", rotulo: "Observações", tipo: "textarea", largo: true, nuloSeVazio: true },
    );

    const nota =
      tipo === "saida"
        ? "Despesas e retiradas abatem o disponível da Loja. O Tronco de Beneficência não paga despesas gerais: só sai pela beneficência (remédio, exame, cesta básica...) ou por retirada do Tronco aprovada em ata."
        : "Use para dinheiro que não é cobrança de irmão. Mensalidades, taxas extras e tronco dos irmãos entram pela cobrança: ao marcar como paga, já somam no saldo.";

    abrirFormulario(
      {
        caminho: "/cash",
        substantivo: tipo === "saida" ? "saída" : "entrada",
        rotuloNovo: tipo === "saida" ? "Lançar saída" : "Lançar entrada",
        campos,
        notaFormulario: nota,
        valoresPadrao: { movement_date: hojeISO(), category: tipo === "entrada" ? "doacao" : "" },
        valoresIniciais: (c) => ({ ...c, movement_date: paraInputData(c.movement_date) }),
        aoEnviar: (d) => ({ ...d, kind: tipo }),
        // Correção do tesoureiro vira pedido para o Venerável (pede o motivo).
        criar: async (envio, atual) => {
          if (atual) return enviarComMotivo("PATCH", `/cash/${atual.id}`, envio);
          await API.post("/cash", envio);
        },
      },
      item,
      recarregar,
    );
    if (tipo === "saida") avisarSaldoDoTronco(item);
  }

  // Saída do Tronco maior que o saldo dele: só avisa, não bloqueia.
  // O aviso aparece dentro do formulário aberto.
  async function avisarSaldoDoTronco(item) {
    const corpo = document.querySelector("#modal .modal-corpo");
    if (!corpo) return;
    const r = await API.get("/cash/resumo").catch(() => null);
    if (!r) return;
    // Na edição, o valor já lançado volta ao saldo para a comparação.
    const devolvido = item && SAIDAS_TRONCO.includes(item.category) ? Number(item.amount) : 0;
    const saldo = Number(r.acumulado.tronco.saldo) + devolvido;
    const aviso = document.createElement("p");
    aviso.className = "aviso-inline oculto";
    corpo.querySelector(".grade-form").after(aviso);
    const categoria = corpo.querySelector('[data-campo="category"]');
    const valor = corpo.querySelector('[data-campo="amount"]');
    const conferir = () => {
      const excede = SAIDAS_TRONCO.includes(categoria.value) && Number(valor.value) > saldo;
      aviso.classList.toggle("oculto", !excede);
      if (excede)
        aviso.textContent =
          `Atenção: o Tronco de Beneficência tem ${formatarMoeda(saldo)} e esta saída é de ${formatarMoeda(valor.value)}. ` +
          "O tronco ficará negativo. Você pode lançar mesmo assim.";
    };
    categoria.addEventListener("change", conferir);
    valor.addEventListener("input", conferir);
    conferir();
  }

  PAGINAS.financeiro = {
    titulo: "Financeiro",
    icone: "financeiro",
    async render(el, ctx) {
      const anoAtual = new Date().getFullYear();
      const podeEscrever = pode(ctx.usuario, PERFIS.financeiro);

      let irmaos = [];
      let catalogo = [];
      try {
        const [lista, cat] = await Promise.all([API.get("/brothers?limit=300"), API.get("/cash/categorias")]);
        irmaos = lista.items || [];
        catalogo = cat.categorias || [];
      } catch {
        irmaos = irmaos || [];
      }
      const rotuloMotivo = Object.fromEntries(catalogo.map((c) => [c.key, c.label]));

      const CAMPOS_CONTRIBUICAO = [
        {
          nome: "brother_id",
          rotulo: "Irmão vinculado",
          tipo: "select",
          opcoes: irmaos.map((b) => [b.id, b.full_name]),
          opcoesVazias: "— (contribuinte avulso)",
          largo: true,
        },
        { nome: "contributor_name", rotulo: "Nome do contribuinte", ajuda: "Preenchido automaticamente quando vinculado a um irmão." },
        { nome: "contribution_type", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_COBRANCA },
        { nome: "description", rotulo: "Descrição", nuloSeVazio: true, dica: "Ex.: Reforma do Templo", ajuda: "Opcional; recomendada para taxa extra." },
        { nome: "amount", rotulo: "Valor (R$)", tipo: "number", obrigatorio: true, passo: "0.01", min: "0.01", dica: "0,00" },
        { nome: "reference_month", rotulo: "Mês de referência", tipo: "month", obrigatorio: true },
        { nome: "due_date", rotulo: "Vencimento", tipo: "date" },
        { nome: "status", rotulo: "Situação", tipo: "select", opcoes: SITUACOES },
        { nome: "notes", rotulo: "Observações", tipo: "textarea", largo: true },
      ];

      const anos = Array.from({ length: 6 }, (_, i) => anoAtual - 4 + i);

      // Filtros atuais da tela (os mesmos valem para as duas tabelas).
      const filtrosDaTela = (raiz) => {
        const v = (nome) => raiz.querySelector(`[data-filtro="${nome}"]`)?.value || "";
        return { ano: v("ano"), mes: v("mes"), de: v("de"), ate: v("ate") };
      };

      async function desenharAvulsos(raiz) {
        const area = raiz.querySelector("#area-avulsos");
        if (!area) return;
        const f = filtrosDaTela(raiz);
        const q = new URLSearchParams();
        if (f.de && f.ate) {
          q.set("from", f.de);
          q.set("to", f.ate);
        } else {
          if (f.ano) q.set("ano", f.ano);
          if (f.mes) q.set("mes", f.mes);
        }
        let itens = [];
        try {
          itens = (await API.get(`/cash?${q}`)).items || [];
        } catch (err) {
          area.innerHTML = `<div class="vazio">Erro: ${esc(err.message)}</div>`;
          return;
        }
        area.innerHTML = tabelaHtml(
          [
            { rotulo: "Data", valor: (c) => formatarData(c.movement_date) },
            { rotulo: "Tipo", valor: (c) => selo(c.kind) },
            { rotulo: "Motivo", valor: (c) => esc(rotuloMotivo[c.category] || c.category) },
            {
              rotulo: "Descrição",
              valor: (c) =>
                `${esc(c.description)}${c.approval_ref ? `<br><span class="texto-suave" style="font-size:12px">Aprovação: ${esc(c.approval_ref)}</span>` : ""}`,
            },
            {
              rotulo: "Valor",
              valor: (c) =>
                `<strong style="color:${c.kind === "entrada" ? "var(--verde)" : "var(--vermelho)"}">${c.kind === "entrada" ? "+" : "−"} ${formatarMoeda(c.amount)}</strong>`,
            },
          ],
          itens,
          { comAcoes: podeEscrever, vazio: "Nenhuma entrada ou saída avulsa no período." },
        );
        area.querySelectorAll("[data-acoes]").forEach((celula) => {
          const lancamento = itens[Number(celula.dataset.acoes)];
          const ed = botaoLinha("Editar", "botao-claro", "editar");
          ed.addEventListener("click", () => abrirLancamento(null, lancamento, catalogo, recarregarFinanceiro));
          celula.appendChild(ed);
          const ex = botaoLinha("Excluir", "botao-perigo", "lixo");
          ex.addEventListener("click", async () => {
            const ok = await UI.confirmar(
              `Excluir o lançamento "${lancamento.description}" (${formatarMoeda(lancamento.amount)})? Esta ação não pode ser desfeita.`,
              { titulo: "Excluir lançamento", rotuloOk: "Excluir", perigo: true },
            );
            if (!ok) return;
            const msg = await enviarComMotivo("DELETE", `/cash/${lancamento.id}`);
            UI.aviso(msg || "Lançamento excluído.", "ok", msg ? 8000 : undefined);
            if (recarregarFinanceiro) await recarregarFinanceiro();
          });
          celula.appendChild(ex);
        });
      }

      // Pedidos de correção (tesoureiro pede, Venerável aprova).
      const ROTULO_CAMPO = {
        amount: "Valor", contribution_type: "Tipo", reference_month: "Mês de referência", brother_id: "Irmão",
        contributor_name: "Contribuinte", status: "Situação", kind: "Entrada/saída", category: "Motivo",
        movement_date: "Data", description: "Descrição", due_date: "Vencimento", notes: "Observações",
        approval_ref: "Ata", reference_month_cash: "Mês",
      };
      const nomeIrmao = Object.fromEntries(irmaos.map((b) => [b.id, b.full_name]));
      const mostrarValor = (campo, v) => {
        if (v === null || v === undefined || v === "") return "—";
        if (campo === "amount") return formatarMoeda(v);
        if (campo === "brother_id") return nomeIrmao[v] || "—";
        if (campo === "contribution_type") return ROTULO_TIPO[v] || v;
        if (campo === "category") return rotuloMotivo[v] || v;
        if (campo === "movement_date" || campo === "due_date") return formatarData(v);
        if (campo === "reference_month") return mesDeReferencia(v);
        return String(v);
      };
      const podeDecidir = ["veneravel", "admin"].includes(ctx.usuario.role);

      async function desenharCorrecoes(raiz) {
        const area = raiz.querySelector("#area-correcoes");
        if (!area) return;
        let itens = [];
        try {
          itens = (await API.get("/corrections?status=pendente")).items || [];
        } catch {
          itens = [];
        }
        if (!itens.length) {
          area.innerHTML = "";
          return;
        }
        area.innerHTML = `<div class="cartao cartao-correcoes">
          <h3 class="cartao-titulo">${svg("alerta", 17)} CORREÇÕES AGUARDANDO APROVAÇÃO DO VENERÁVEL (${itens.length})</h3>
          ${itens
            .map((c) => {
              const antes = c.before_data || {};
              const qual = c.entity_type === "contribution"
                ? `Cobrança de ${esc(antes.contributor_name || "—")} — ${esc(ROTULO_TIPO[antes.contribution_type] || "")} ${esc(antes.reference_month ? mesDeReferencia(antes.reference_month) : "")} (${formatarMoeda(antes.amount)})`
                : `Lançamento “${esc(antes.description || "—")}” de ${formatarData(antes.movement_date)} (${formatarMoeda(antes.amount)})`;
              const mudancas = c.action === "delete"
                ? "<li><strong>Excluir o lançamento</strong></li>"
                : Object.entries(c.changes || {})
                    .map(([k, v]) => `<li>${esc(ROTULO_CAMPO[k] || k)}: ${esc(mostrarValor(k, antes[k]))} → <strong>${esc(mostrarValor(k, v))}</strong></li>`)
                    .join("");
              return `<div class="pedido-correcao" data-pedido="${esc(c.id)}">
                <div><strong>${qual}</strong>
                  <ul>${mudancas}</ul>
                  <span class="texto-suave" style="font-size:12.5px">Pedido por ${esc(c.requested_by_name || "—")} em ${formatarDataHora(c.requested_at)} — motivo: ${esc(c.reason)}</span>
                </div>
                ${podeDecidir ? `<div class="acoes"><button type="button" class="botao botao-azul botao-pequeno" data-aprovar>Aprovar</button>
                  <button type="button" class="botao botao-perigo botao-pequeno" data-recusar>Recusar</button></div>` : '<span class="selo selo-ambar">Aguardando</span>'}
              </div>`;
            })
            .join("")}
        </div>`;
        area.querySelectorAll("[data-pedido]").forEach((bloco) => {
          const id = bloco.dataset.pedido;
          const decidir = async (acao) => {
            const ok = await UI.confirmar(
              acao === "aprovar" ? "Aprovar esta correção? O lançamento será alterado agora." : "Recusar esta correção? O lançamento continua como está.",
              { titulo: acao === "aprovar" ? "Aprovar correção" : "Recusar correção", rotuloOk: acao === "aprovar" ? "Aprovar" : "Recusar", perigo: acao !== "aprovar" },
            );
            if (!ok) return;
            const r = await API.post(`/corrections/${id}/${acao}`, {});
            UI.aviso(r.message, "ok");
            if (recarregarFinanceiro) await recarregarFinanceiro();
          };
          const ap = bloco.querySelector("[data-aprovar]");
          if (ap) ap.addEventListener("click", () => decidir("aprovar").catch((e) => UI.aviso(e.message, "erro")));
          const re = bloco.querySelector("[data-recusar]");
          if (re) re.addEventListener("click", () => decidir("recusar").catch((e) => UI.aviso(e.message, "erro")));
        });
      }

      const pagina = paginaCrud({
        titulo: "Financeiro",
        descricao:
          "Todos os lançamentos da Tesouraria: cobranças dos irmãos (mensalidade, taxa extra, tronco, doação) e entradas e saídas avulsas. A contabilidade fica no Caixa.",
        caminho: "/contributions",
        permissao: PERFIS.financeiro,
        substantivo: "Cobrança",
        rotuloNovo: "Nova cobrança individual",
        vazio: "Nenhuma cobrança encontrada para o filtro escolhido.",
        // Exclusão de cobranças: somente o administrador (decisão de 19/10/2026).
        podeExcluir: (usuario) => usuario.role === "admin",
        nomeDoItem: (c) => `o lançamento de ${formatarMoeda(c.amount)} de ${c.contributor_name} (${mesDeReferencia(c.reference_month)})`,
        acoesExtras: (ctx) => {
          const botoes = [];
          if (podeEscrever) {
            botoes.push(
              `<button type="button" class="botao botao-dourado" id="gerar-mensalidades"${UI.dica("Gera a mensalidade do mês para todos os irmãos ativos.")}>${svg("financeiro", 16)} Gerar mensalidades</button>`,
              `<button type="button" class="botao botao-dourado" id="gerar-cobranca"${UI.dica("Taxa extra, doação ou tronco para todos os irmãos ou só para alguns.")}>${svg("irmaos", 16)} Cobrança em lote</button>`,
              `<button type="button" class="botao botao-azul" id="lancar-entrada"${UI.dica("Dinheiro que entrou e não é cobrança de irmão.")}>${svg("entrada", 16)} Lançar entrada</button>`,
              `<button type="button" class="botao botao-perigo" id="lancar-saida"${UI.dica("Contas, obras, GOB, retiradas e beneficência.")}>${svg("saida", 16)} Lançar saída</button>`,
            );
          }
          if (ctx.usuario.role === "admin")
            botoes.push(
              `<button type="button" class="botao botao-claro" id="remover-mensalidades"${UI.dica("Apaga todas as mensalidades de um mês escolhido — use para desfazer uma geração feita por engano.")}>${svg("lixo", 16)} Remover mensalidades do mês</button>`,
            );
          botoes.push(`<button type="button" class="botao botao-claro" id="exportar-financeiro">${svg("baixar", 16)} Exportar CSV</button>`);
          return botoes;
        },
        filtros: [
          {
            nome: "ano",
            rotulo: "Ano",
            tipo: "select",
            padrao: String(anoAtual),
            opcoes: anos.map((a) => [String(a), String(a)]),
          },
          {
            nome: "mes",
            rotulo: "Mês",
            tipo: "select",
            opcoes: MESES.map((nome, i) => [String(i + 1).padStart(2, "0"), nome]),
            todos: "Ano inteiro",
          },
          { nome: "de", rotulo: "Período de", tipo: "date", lembrete: "Com as duas datas, o período tem prioridade sobre ano e mês." },
          { nome: "ate", rotulo: "até", tipo: "date" },
          { nome: "status", rotulo: "Situação", tipo: "select", opcoes: SITUACOES },
        ],
        montarConsulta: (f) => {
          const p = new URLSearchParams();
          if (f.ano) p.set("ano", f.ano);
          if (f.mes) p.set("mes", f.mes);
          if (f.de) p.set("from", f.de);
          if (f.ate) p.set("to", f.ate);
          if (f.status) p.set("status", f.status);
          return p.toString();
        },
        colunas: [
          {
            rotulo: "Contribuinte",
            valor: (c) =>
              `<strong>${esc(c.contributor_name)}</strong>${c.brother_name && c.brother_name !== c.contributor_name ? `<br><span class="texto-suave" style="font-size:12px">${esc(c.brother_name)}</span>` : ""}`,
          },
          {
            rotulo: "Tipo",
            valor: (c) =>
              `${selo(c.contribution_type)}${c.description ? `<br><span class="texto-suave" style="font-size:12px">${esc(c.description)}</span>` : ""}`,
          },
          { rotulo: "Referência", valor: (c) => esc(mesDeReferencia(c.reference_month)) },
          { rotulo: "Valor", valor: (c) => `<strong>${formatarMoeda(c.amount)}</strong>` },
          { rotulo: "Vencimento", valor: (c) => formatarData(c.due_date) },
          { rotulo: "Situação", valor: (c) => selo(c.status) },
        ],
        campos: CAMPOS_CONTRIBUICAO,
        valoresPadrao: { contribution_type: "mensalidade", status: "pendente", amount: MENSALIDADE_PADRAO },
        valoresIniciais: (c) => ({
          brother_id: c.brother_id || "",
          contributor_name: c.contributor_name || "",
          contribution_type: c.contribution_type,
          description: c.description || "",
          amount: c.amount,
          reference_month: c.reference_month,
          due_date: paraInputData(c.due_date),
          status: c.status,
          notes: c.notes || "",
        }),
        aoEnviar: (d) => {
          const dados = { ...d };
          if (!dados.brother_id) delete dados.brother_id;
          if (!dados.contributor_name) delete dados.contributor_name;
          return dados;
        },
        // Correção do tesoureiro vira pedido para o Venerável (pede o motivo).
        criar: async (envio, atual) => {
          if (atual) return enviarComMotivo("PATCH", `/contributions/${atual.id}`, envio);
          await API.post("/contributions", envio);
        },
        acoesLinha: (c, ctx2) => {
          if (!pode(ctx2.usuario, PERFIS.financeiro)) return [];
          if (c.status === "pendente")
            return [
              {
                rotulo: "Marcar pago",
                icone: "presenca",
                executar: async (item) => {
                  await API.patch(`/contributions/${item.id}`, { status: "pago" });
                  UI.aviso("Contribuição marcada como paga.", "ok");
                  if (recarregarFinanceiro) await recarregarFinanceiro();
                },
              },
              {
                rotulo: "Pagamento parcial",
                icone: "financeiro",
                executar: (item) => abrirPagamentoParcial(item),
              },
            ];
          if (c.status === "isento" || c.status === "cancelado")
            return [
              {
                rotulo: "Reabrir",
                icone: "atualizar",
                executar: async (item) => {
                  await API.patch(`/contributions/${item.id}`, { status: "pendente" });
                  UI.aviso("Contribuição reaberta como pendente.", "ok");
                  if (recarregarFinanceiro) await recarregarFinanceiro();
                },
              },
            ];
          return [];
        },
        aposMontar: (el2, _ctx, { recarregar }) => {
          recarregarFinanceiro = recarregar;
          const cartao = el2.querySelector(".cartao");
          const box = document.createElement("div");
          box.id = "resumo-financeiro";
          cartao.insertBefore(box, el2.querySelector("#area-tabela"));

          const correcoes = document.createElement("div");
          correcoes.id = "area-correcoes";
          cartao.before(correcoes);

          const titulo = document.createElement("h3");
          titulo.className = "cartao-titulo";
          titulo.innerHTML = `${svg("financeiro", 17)} COBRANÇAS DOS IRMÃOS`;
          cartao.insertBefore(titulo, el2.querySelector("#area-tabela"));

          const avulsos = document.createElement("div");
          avulsos.className = "cartao";
          avulsos.innerHTML = `<h3 class="cartao-titulo">${svg("caixa", 17)} ENTRADAS E SAÍDAS AVULSAS</h3><div id="area-avulsos"><p class="carregando">Carregando...</p></div>`;
          cartao.after(avulsos);

          const ligar = (id, acao) => {
            const b = el2.querySelector(id);
            if (b) b.addEventListener("click", acao);
          };
          ligar("#gerar-mensalidades", () => abrirGerarMensalidades(recarregar));
          ligar("#gerar-cobranca", () => abrirCobrancaEmLote(irmaos, recarregar));
          ligar("#lancar-entrada", () => abrirLancamento("entrada", null, catalogo, recarregar));
          ligar("#lancar-saida", () => abrirLancamento("saida", null, catalogo, recarregar));
          ligar("#remover-mensalidades", () => abrirRemoverMensalidades(recarregar));
          ligar("#exportar-financeiro", async () => {
            const ano = el2.querySelector('[data-filtro="ano"]')?.value || String(anoAtual);
            try {
              await API.baixarArquivo(`/contributions/export.csv?year=${ano}`, `financeiro-${ano}.csv`);
              UI.aviso("Download iniciado.", "ok");
            } catch (err) {
              UI.aviso(err.message, "erro");
            }
          });
        },
        aposRecarregar: async (el2) => {
          desenharAvulsos(el2);
          desenharCorrecoes(el2);
          const box = el2.querySelector("#resumo-financeiro");
          if (!box) return;
          const ano = el2.querySelector('[data-filtro="ano"]')?.value || String(anoAtual);
          try {
            const [resumo, caixa] = await Promise.all([
              API.get(`/contributions/summary?year=${ano}`),
              API.get("/cash/resumo").catch(() => null),
            ]);
            const por = { pago: [0, 0], pendente: [0, 0], isento: [0, 0], cancelado: [0, 0] };
            for (const linha of resumo.items) {
              if (!por[linha.status]) por[linha.status] = [0, 0];
              por[linha.status][0] += linha.quantidade;
              por[linha.status][1] += linha.total;
            }
            const a = caixa?.acumulado;
            box.innerHTML = `<div class="chips-resumo">
              ${a ? chip("dourado", "Saldo da Loja", formatarMoeda(a.total)) : ""}
              ${a ? chip("azul", "Disponível", formatarMoeda(a.disponivel)) : ""}
              ${a ? chip("ambar", "Tronco de Beneficência", formatarMoeda(a.tronco.saldo)) : ""}
              ${a && a.devido_ao_tronco > 0 ? chip("vermelho", "Loja deve ao Tronco", formatarMoeda(a.devido_ao_tronco)) : ""}
            </div>
            <div class="chips-resumo">
              ${chip("verde", `Recebido em ${ano} (${por.pago[0]})`, formatarMoeda(por.pago[1]))}
              ${chip("ambar", `Pendente (${por.pendente[0]})`, formatarMoeda(por.pendente[1]))}
              ${chip("azul", `Isento (${por.isento[0]})`, formatarMoeda(por.isento[1]))}
              ${chip("vermelho", `Cancelado (${por.cancelado[0]})`, formatarMoeda(por.cancelado[1]))}
            </div>
            ${a ? '<p class="texto-suave" style="font-size:12.5px;margin:-6px 0 12px">Cobranças marcadas como pagas já entram no saldo — não lance a mesma entrada de novo. O Tronco de Beneficência faz parte do saldo da Loja, mas é reservado: só sai pela beneficência. Disponível = saldo da Loja sem o tronco.</p>' : ""}`;
          } catch {
            box.innerHTML = "";
          }
        },
      });

      await pagina(el, ctx);
    },
  };

  // ════════════════════════════ COMUNICADOS ════════════════════════════

  PAGINAS.comunicados = {
    titulo: "Comunicados (WhatsApp)",
    icone: "whatsapp",
    async render(el, ctx) {
      let irmaos = [];
      try {
        irmaos = (await API.get("/brothers?limit=300")).items || [];
      } catch {
        irmaos = [];
      }
      const comTelefone = irmaos.filter((b) => b.status === "ativo" && numerosWhatsApp(b.phone));

      let recarregarComunicados = null;

      const CAMPOS_COMUNICADO = [
        { nome: "title", rotulo: "Assunto", obrigatorio: true, largo: true, dica: "Ex.: Convocação — Sessão Magna de novembro" },
        {
          nome: "message",
          rotulo: "Mensagem",
          tipo: "textarea",
          obrigatorio: true,
          largo: true,
          linhas: 8,
          dica: "Escreva a mensagem que será enviada pelo WhatsApp.",
        },
        {
          nome: "status",
          rotulo: "Situação",
          tipo: "select",
          opcoes: [
            ["rascunho", "Rascunho"],
            ["preparado", "Preparado"],
            ["enviado", "Enviado"],
          ],
        },
      ];

      async function abrirEnvioWhatsApp(c) {
        const destinos = comTelefone
          .map((b) => {
            const fone = numerosWhatsApp(b.phone);
            return `<li style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--borda)">
              <span style="font-size:13.5px">${esc(b.full_name)}</span>
              <a class="botao botao-claro botao-pequeno" href="https://wa.me/${fone}?text=${encodeURIComponent(c.message)}" target="_blank" rel="noopener">${svg("whatsapp", 14)} Abrir conversa</a>
            </li>`;
          })
          .join("");

        const modal = UI.abrirModal({
          titulo: `Enviar por WhatsApp — ${c.title}`,
          largo: true,
          corpo: `
            <p class="texto-suave" style="font-size:12.5px;margin:0 0 6px">Mensagem preparada:</p>
            <div style="background:#f4f7fb;border:1px solid var(--borda);border-radius:10px;padding:12px;font-size:13.5px;white-space:pre-wrap;max-height:190px;overflow:auto">${esc(c.message)}</div>
            <div style="display:flex;gap:8px;margin:10px 0 14px;flex-wrap:wrap">
              <button type="button" class="botao botao-claro botao-pequeno" id="copiar-mensagem">${svg("copiar", 14)} Copiar mensagem</button>
              <a class="botao botao-claro botao-pequeno" href="https://wa.me/?text=${encodeURIComponent(c.message)}" target="_blank" rel="noopener">${svg("whatsapp", 14)} Escolher contato no WhatsApp</a>
            </div>
            <h4 style="margin:0 0 4px;color:var(--azul-800);font-size:14px">Enviar direto para um irmão (com telefone cadastrado):</h4>
            ${destinos ? `<ul style="list-style:none;margin:0;padding:0">${destinos}</ul>` : '<p class="texto-suave" style="font-size:13px">Nenhum irmão ativo com telefone cadastrado. Cadastre o telefone na página Irmãos.</p>'}`,
          botoes: [
            { rotulo: "Fechar", tipo: "botao-claro" },
            {
              rotulo: "Marcar como enviado",
              tipo: "botao-azul",
              acao: async () => {
                await API.patch(`/communications/${c.id}`, { status: "enviado" });
                UI.aviso("Comunicado marcado como enviado.", "ok");
                if (recarregarComunicados) await recarregarComunicados();
              },
            },
          ],
        });

        const copiar = modal.el.querySelector("#copiar-mensagem");
        if (copiar)
          copiar.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(c.message);
              UI.aviso("Mensagem copiada.", "ok");
            } catch {
              UI.aviso("Não foi possível copiar automaticamente. Selecione o texto manualmente.", "erro");
            }
          });
      }

      // ---------- Modelos prontos de mensagem ----------
      async function abrirModelos(recarregar) {
        const P = window.PRESETS_COMUNICADO;
        if (!P) {
          UI.aviso("Os modelos de mensagem não foram carregados.", "erro");
          return;
        }
        const modelos = P.MODELOS;
        const formatarValor = (n) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const corpo = `
          <p class="texto-suave" style="font-size:13px;margin:0 0 10px">
            Escolha um modelo pronto, informe o irmão e a referência: o sistema preenche os dados. Depois é só ajustar o texto, se quiser.
          </p>
          <div class="grade-form">
            <div class="campo"${UI.dica("Filtra os modelos pelo assunto: financeiro, faltas, convocação, aniversário...")}><label for="m-cat">Categoria</label>
              <select id="m-cat"><option value="">Todas as categorias</option>
                ${P.CATEGORIAS.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("")}
              </select></div>
            <div class="campo"${UI.dica("Escolha o modelo de mensagem pronto.")}><label for="m-modelo">Modelo</label><select id="m-modelo"></select></div>
            <div class="campo"${UI.dica(UI.FILTROS_DICA().irmao)}><label for="m-irmao">Irmão (preenche o nome e os valores)</label>
              <select id="m-irmao"><option value="">— sem irmão vinculado —</option>
                ${irmaos.map((b) => `<option value="${esc(b.id)}">${esc(b.full_name)}${b.status && b.status !== "ativo" ? ` (${esc(b.status)})` : ""}</option>`).join("")}
              </select></div>
            <div class="campo"${UI.dica("Serve para os espaços {meses} do modelo: ex.: “outubro/2026”, “as mensalidades de maio e junho”.")}><label for="m-meses">Referência do texto ({meses})</label>
              <input id="m-meses" type="text" placeholder="Ex.: outubro/2026"></div>
          </div>
          <div class="campo largo mt8"><label for="m-titulo">Assunto do comunicado</label><input id="m-titulo" type="text"></div>
          <div class="campo largo"><label for="m-texto">Mensagem (pode ajustar antes de enviar)</label><textarea id="m-texto" rows="11"></textarea></div>
          <p class="ajuda mt8">Os trechos entre {chaves} são preenchidos com os dados do irmão e da Loja. O que não puder ser preenchido fica igual — basta completar à mão.</p>`;

        const modal = UI.abrirModal({
          titulo: "Modelos de comunicado",
          largo: true,
          corpo,
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: "Criar comunicado",
              tipo: "botao-claro",
              acao: async (m) => {
                await criar(m, false);
              },
            },
            {
              rotulo: "Criar e abrir WhatsApp",
              tipo: "botao-dourado",
              acao: async (m) => {
                await criar(m, true);
              },
            },
          ],
        });

        const mc = modal.corpo;
        const selCategoria = mc.querySelector("#m-cat");
        const selModelo = mc.querySelector("#m-modelo");
        const selIrmao = mc.querySelector("#m-irmao");
        const inMeses = mc.querySelector("#m-meses");
        const inTitulo = mc.querySelector("#m-titulo");
        const inTexto = mc.querySelector("#m-texto");

        function listaFiltrada() {
          const cat = selCategoria.value;
          return modelos.map((mo, i) => ({ mo, i })).filter(({ mo }) => !cat || mo.categoria === cat);
        }

        /** Busca os valores do irmão (dívida) ou do mês (entradas/saídas) para completar o texto. */
        async function completarComDados(modelo) {
          if (!modelo) return;
          const dados = { ...P.dadosPadrao(), meses: inMeses.value.trim() };
          const irmao = irmaos.find((b) => b.id === selIrmao.value);
          if (irmao) {
            dados.nome = irmao.full_name;
            dados.primeiro_nome = irmao.full_name.split(" ")[0];
          }
          if (irmao && modelo.mo.texto.includes("{valor}")) {
            try {
              const r = await API.get(`/reports/irmao/${irmao.id}?ano=${new Date().getFullYear()}`);
              dados.valor = formatarValor(r.totais.pendente);
              dados.pendentes = String(r.totais.meses_abertos || 0);
            } catch {
              /* sem permissão para o relatório: o texto fica com os espaços para completar */
            }
          }
          if (modelo.mo.texto.includes("{saidas}") || modelo.mo.texto.includes("{saldo}")) {
            try {
              const hoje = new Date();
              const r = await API.get(`/reports/financeiro?ano=${hoje.getFullYear()}&mes=${hoje.getMonth() + 1}`);
              dados.valor = formatarValor(r.totais.entradas);
              dados.saidas = formatarValor(r.totais.saidas);
              dados.saldo = formatarValor(r.totais.saldo);
            } catch {
              /* idem */
            }
          }
          inTexto.value = P.preencher(modelo.mo.texto, dados);
        }

        function preencherModelo() {
          const lista = listaFiltrada();
          const idx = Number(selModelo.value);
          const modelo = lista.find((x) => x.i === idx);
          if (!modelo) {
            inTitulo.value = "";
            inTexto.value = "";
            return;
          }
          inTitulo.value = modelo.mo.assunto;
          inTexto.value = P.preencher(modelo.mo.texto, {
            ...P.dadosPadrao(),
            meses: inMeses.value.trim(),
            nome: (irmaos.find((b) => b.id === selIrmao.value) || {}).full_name || "",
            primeiro_nome: ((irmaos.find((b) => b.id === selIrmao.value) || {}).full_name || "").split(" ")[0] || "",
          });
          completarComDados(modelo);
        }

        function montarOpcoes(primeiro) {
          const lista = listaFiltrada();
          selModelo.innerHTML = lista.map(({ mo, i }) => `<option value="${i}">${esc(mo.assunto)}</option>`).join("");
          if (primeiro || !lista.some((x) => String(x.i) === selModelo.value)) {
            selModelo.value = lista.length ? String(lista[0].i) : "";
          }
          preencherModelo();
        }

        async function criar(m, abrirWhats) {
          const titulo = inTitulo.value.trim();
          const texto = inTexto.value.trim();
          if (!titulo || !texto) {
            UI.aviso("Escolha um modelo e confira o assunto e a mensagem.", "erro");
            return false;
          }
          await API.post("/communications", { title: titulo, message: texto, status: "preparado" });
          UI.aviso("Comunicado criado a partir do modelo.", "ok");
          if (recarregar) await recarregar();
          if (abrirWhats) {
            const irmao = irmaos.find((b) => b.id === selIrmao.value);
            const fone = irmao ? numerosWhatsApp(irmao.phone) : "";
            const url = fone
              ? `https://wa.me/${fone}?text=${encodeURIComponent(texto)}`
              : `https://wa.me/?text=${encodeURIComponent(texto)}`;
            window.open(url, "_blank", "noopener");
          }
        }

        selCategoria.addEventListener("change", () => montarOpcoes(true));
        selModelo.addEventListener("change", preencherModelo);
        selIrmao.addEventListener("change", preencherModelo);
        inMeses.addEventListener("change", preencherModelo);
        montarOpcoes(true);
      }

      const pagina = paginaCrud({
        titulo: "Comunicados (WhatsApp)",
        descricao: "Prepare a mensagem, abra o WhatsApp com o texto pronto e registre o envio",
        caminho: "/communications",
        permissao: PERFIS.comunicados,
        substantivo: "Comunicado",
        rotuloNovo: "Novo comunicado",
        vazio: "Nenhum comunicado preparado ainda.",
        podeExcluir: (u) => pode(u, ["admin", "veneravel", "secretario"]),
        filtros: [
          {
            nome: "status",
            rotulo: "Situação",
            tipo: "select",
            opcoes: [
              ["rascunho", "Rascunho"],
              ["preparado", "Preparado"],
              ["enviado", "Enviado"],
              ["falhou", "Falhou"],
            ],
          },
        ],
        montarConsulta: (f) => (f.status ? `status=${f.status}` : ""),
        colunas: [
          {
            rotulo: "Assunto",
            valor: (c) => `<strong>${esc(c.title)}</strong><br><span class="texto-suave" style="font-size:12px">${esc((c.message || "").slice(0, 90))}${(c.message || "").length > 90 ? "…" : ""}</span>`,
          },
          { rotulo: "Situação", valor: (c) => selo(c.status) },
          { rotulo: "Criado por", valor: (c) => esc(c.created_by_name || "—") },
          { rotulo: "Atualizado", valor: (c) => formatarDataHora(c.updated_at || c.created_at) },
        ],
        campos: CAMPOS_COMUNICADO,
        valoresPadrao: { status: "rascunho" },
        valoresIniciais: (c) => ({ title: c.title, message: c.message, status: c.status }),
        acoesLinha: (c) => [{ rotulo: "WhatsApp", icone: "whatsapp", tipo: "botao-dourado", executar: (item) => abrirEnvioWhatsApp(item) }],
        acoesExtras: (ctx2) =>
          pode(ctx2.usuario, PERFIS.comunicados)
            ? [
                `<button type="button" class="botao botao-dourado" id="usar-modelo"${UI.dica("Modelos de mensagem prontos: dívida, ausência, convocação, aniversário, pêsames e outros. O sistema preenche os dados do irmão.")}>${svg("modelo", 16)} Usar modelo</button>`,
              ]
            : [],
        aposMontar: (el2, _ctx, { recarregar }) => {
          recarregarComunicados = recarregar;
          const botao = el2.querySelector("#usar-modelo");
          if (botao) botao.addEventListener("click", () => abrirModelos(recarregar));
        },
      });

      await pagina(el, ctx);
    },
  };
})();
