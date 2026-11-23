// ============================================================
// Páginas: Início (painel), Loja, Potências, Irmãos e Família.
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const { formatarData, formatarDataHora, formatarMoeda, paraInputData, MESES, MESES_ABREV } = UI;
  const {
    PAGINAS, PERFIS, PERFIS_PAGINA, pode, selo, cabecalho, tabelaHtml,
    campoHtml, formularioHtml, lerFormulario, abrirFormulario, paginaCrud, botaoLinha, mostrarAvisos,
  } = window.PW;

  const CAMPOS_IRMAO = [
    { nome: "full_name", rotulo: "Nome completo", obrigatorio: true, largo: true },
    { nome: "cim", rotulo: "CIM (carteira)" },
    { nome: "birth_date", rotulo: "Nascimento", tipo: "date" },
    { nome: "degree", rotulo: "Grau", tipo: "select", opcoes: [["Aprendiz", "Aprendiz"], ["Companheiro", "Companheiro"], ["Mestre", "Mestre"]], opcoesVazias: "—" },
    { nome: "phone", rotulo: "Telefone" },
    { nome: "email", rotulo: "E-mail", tipo: "email" },
    { nome: "status", rotulo: "Situação", tipo: "select", opcoes: [["ativo", "Ativo"], ["afastado", "Afastado"], ["visitante", "Visitante"], ["desligado", "Desligado"], ["outro", "Outro"]] },
    { nome: "address", rotulo: "Endereço", largo: true },
    { nome: "notes", rotulo: "Observações", tipo: "textarea", largo: true },
  ];

  const CAMPOS_FAMILIA = [
    { nome: "full_name", rotulo: "Nome completo", obrigatorio: true, largo: true },
    { nome: "relationship", rotulo: "Parentesco", obrigatorio: true, dica: "Esposa, filho(a), mãe..." },
    { nome: "birth_date", rotulo: "Nascimento", tipo: "date" },
    { nome: "phone", rotulo: "Telefone" },
    { nome: "email", rotulo: "E-mail", tipo: "email" },
  ];

  // ════════════════════════════ INÍCIO ════════════════════════════

  const MODULOS = [
    ["venerancia", "Venerância (Oficiais)", "mandato"], ["atas", "Livro de Atas", "ata"],
    ["sessoes", "Sessões", "sessoes"], ["calendario", "Calendário", "calendario"],
    ["comunicados", "Comunicados (WhatsApp)", "whatsapp"], ["documentos", "Envios ao GOB", "documentos"],
    ["financeiro", "Financeiro", "financeiro"], ["caixa", "Caixa (Entradas e Saídas)", "caixa"],
    ["irmaos", "Irmãos", "irmaos"], ["familia", "Família", "familia"],
    ["frequencia", "Livro de Frequência", "frequencia"], ["relatorios", "Relatórios", "relatorios"],
    ["fraternidade", "Fraternidade Feminina", "fraternidade"], ["potencias", "Potências", "potencias"],
  ];

  const ACESSO_RAPIDO = [
    ["comunicados", "Enviar Comunicado (WhatsApp)", "whatsapp"],
    ["financeiro", "Registrar Mensalidade", "financeiro"],
    ["caixa", "Registrar Saída do Caixa", "saida"],
    ["relatorios", "Ver Relatórios", "relatorios"],
    ["irmaos", "Consultar Irmão", "busca"],
    ["calendario", "Calendário da Loja", "calendario"],
  ];

  function cartaoNumero(classeIcone, icone, rotulo, valor, detalhe) {
    return `<div class="cartao-numero">
      <div class="icone icone-${classeIcone}">${svg(icone, 22)}</div>
      <div>
        <div class="rotulo">${esc(rotulo)}</div>
        <div class="valor">${esc(String(valor))}</div>
        <div class="detalhe">${detalhe || ""}</div>
      </div>
    </div>`;
  }

  function itemEvento(ev) {
    const d = new Date(ev.starts_at);
    const dia = d.getDate();
    const mes = MESES_ABREV[d.getMonth()];
    return `<li>
      <div class="evento-data"><span class="dia">${dia}</span><span class="mes">${mes}</span></div>
      <div class="evento-info">
        <div class="titulo">${esc(ev.title)}</div>
        <div class="detalhe">${formatarDataHora(ev.starts_at)}${ev.location ? " • " + esc(ev.location) : ""}</div>
      </div>
    </li>`;
  }

  function linhaInfo(chave, valor) {
    return `<div class="linha-info"><span class="chave">${esc(chave)}</span><span class="valor">${valor || "—"}</span></div>`;
  }

  PAGINAS.inicio = {
    titulo: "Início",
    icone: "inicio",
    async render(el, ctx) {
      el.innerHTML = '<p class="carregando">Carregando painel...</p>';

      // Telas que o perfil do usuário pode abrir (menu, cartões e atalhos).
      const permitida = (id) => !PERFIS_PAGINA[id] || PERFIS_PAGINA[id].includes(ctx.usuario.role);
      // O quadro de oficiais (nome, CIM e telefone) é restrito no servidor aos
      // ofícios da Venerância: os demais perfis nem chamam a rota.
      const quadro = permitida("venerancia") ? API.get("/officers?current=1") : Promise.resolve({ items: [] });

      const [painel, lojaResp, cargosResp, eventosResp, anivHojeResp, anivMesResp] = await Promise.all([
        API.get("/reports/dashboard"),
        API.get("/lodge"),
        quadro,
        API.get("/events?upcoming=1&limit=6"),
        API.get("/reports/aniversariantes?hoje=1"),
        API.get("/reports/aniversariantes"),
      ]);
      const loja = lojaResp.item || {};
      const cargos = cargosResp.items || [];
      const eventos = eventosResp.items || [];
      const anivHoje = anivHojeResp.items || [];
      const anivMes = anivMesResp.items || [];

      const irm = painel.brothers;
      const proximo = painel.upcoming_events[0];
      const primeiroNome = (ctx.usuario.name || "").split(" ")[0] || "Irmão";

      // ---------- Aniversariantes ----------
      const descrever = (a) => `${a.nome}${a.tipo && a.tipo !== "Irmão" ? ` (${a.tipo}${a.vinculo ? ` de ${a.vinculo}` : ""})` : " — Irmão"}`;
      const faixaAniversario = anivHoje.length
        ? `<div class="faixa-aniversario">
             <div class="icone">${svg("aniversario", 26)}</div>
             <div class="texto">
               <strong>Hoje é dia de festa!</strong> Aniversário de ${esc(anivHoje.map(descrever).join("; "))}.
               Um abraço fraterno em nome de toda a Loja. 🎉
             </div>
             ${permitida("relatorios") ? `<button type="button" class="botao botao-claro botao-pequeno" data-ir="relatorios"${UI.dica("Abre os relatórios da Chancelaria, com a lista de aniversariantes do mês.")}>Ver aniversariantes do mês</button>` : ""}
           </div>`
        : "";
      const cartaoAniversarios = `<div class="cartao">
        <h3 class="cartao-titulo">${svg("aniversario", 17)} ANIVERSARIANTES DO MÊS</h3>
        ${
          anivMes.length
            ? `<ul class="lista-eventos">${anivMes
                .slice(0, 8)
                .map(
                  (a) => `<li>
                    <div class="evento-data"><span class="dia">${a.dia}</span><span class="mes">${MESES_ABREV[Number(String(a.data).slice(5, 7)) - 1] || ""}</span></div>
                    <div class="evento-info">
                      <div class="titulo">${esc(a.nome)}</div>
                      <div class="detalhe">${esc(a.tipo || "")}${a.vinculo ? ` de ${esc(a.vinculo)}` : ""}${a.idade ? ` • completa ${a.idade} anos` : ""}</div>
                    </div>
                  </li>`,
                )
                .join("")}</ul>
               ${anivMes.length > 8 ? `<p class="texto-suave" style="font-size:12.5px;margin:6px 0 0">+ ${anivMes.length - 8} aniversariante(s) neste mês</p>` : ""}`
            : '<p class="texto-suave" style="font-size:13px">Nenhum aniversariante neste mês.</p>'
        }
      </div>`;

      el.innerHTML = `
        <div class="grade-painel">
          <div>
            <div class="bem-vindo">
              <h2>Bem-vindo, <span class="saudacao">${esc(primeiroNome)}</span>!</h2>
              <p style="margin:0;color:#c8d6ea;font-size:14px">Administração Loja X — painel de gestão administrativa.</p>
              <p class="citacao">“A Maçonaria não é apenas uma instituição: é um ideal de vida — o aperfeiçoamento constante do homem e o serviço à humanidade.”</p>
              <div class="ornamento">◆ ◆ ◆</div>
            </div>

            ${faixaAniversario}

            <div class="cartoes-numeros">
              ${
                irm
                  ? cartaoNumero("azul", "irmaos", "Irmãos Cadastrados", irm.total, `Ativos: ${irm.ativos} • Inativos: ${irm.afastados + irm.desligados}`)
                  : ""
              }
              ${cartaoNumero("verde", "sessoes", "Próximas Sessões", painel.upcoming_events_count, proximo ? `${formatarData(proximo.starts_at)} — ${esc(proximo.title)}` : "Sem eventos futuros")}
              ${
                painel.contributions
                  ? cartaoNumero("ambar", "financeiro", "Mensalidades em Aberto", painel.contributions.pendentes, `${formatarMoeda(painel.contributions.valor_pendente)} pendentes`)
                  : ""
              }
              ${
                irm
                  ? cartaoNumero("roxo", "familia", "Famílias Vinculadas", painel.family_count, `Fraternidade Feminina: ${painel.fraternity_count} membros`)
                  : ""
              }
            </div>

            <div class="cartao" style="margin-top:16px">
              <h3 class="cartao-titulo">MÓDULOS DO SISTEMA</h3>
              <div class="grade-modulos">
                ${MODULOS.filter(([id]) => permitida(id)).map(([id, rotulo, icone]) => `<button type="button" class="modulo" data-ir="${id}"${UI.dica((window.DICAS.PAGINAS || {})[id] || "")}>${svg(icone || id, 30)}<span>${esc(rotulo)}</span></button>`).join("")}
              </div>
            </div>

            <div class="grade-tres">
              <div class="cartao">
                <h3 class="cartao-titulo">${svg("loja", 17)} INFORMAÇÕES DA LOJA</h3>
                ${linhaInfo("Nome", esc(loja.official_name || "—"))}
                ${linhaInfo("Potência", esc(loja.power_name || "—"))}
                ${linhaInfo("Fundação", formatarData(loja.founded_on))}
                ${linhaInfo("Endereço", esc(loja.address || "—"))}
                ${linhaInfo("Contato", esc(loja.phone || loja.email || "—"))}
              </div>
              <div class="cartao" style="text-align:center">
                <h3 class="cartao-titulo" style="justify-content:center">POTÊNCIA</h3>
                <img src="img/esquadro.svg" alt="" style="width:76px;height:76px">
                <div style="font-weight:700;color:var(--azul-800);margin-top:8px">${esc(loja.power_name || "Não configurada")}</div>
                <p class="texto-suave" style="font-size:12.5px;margin:6px 0 0">Configure o vínculo institucional na tela Loja.</p>
                ${permitida("potencias") ? `<div class="mt8"><button type="button" class="botao botao-claro botao-pequeno" data-ir="potencias">Saber mais</button></div>` : ""}
              </div>
              <div class="cartao">
                <h3 class="cartao-titulo">${svg("mandato", 17)} DIRETORIA — MANDATO EM VIGOR</h3>
                ${!permitida("venerancia")
                  ? '<p class="texto-suave" style="font-size:13px">O quadro de oficiais é restrito aos ofícios da Venerância.</p>'
                  : cargos.length
                    ? cargos.slice(0, 5).map((c) => linhaInfo(c.office_name, esc(c.brother_name || "—"))).join("") +
                      (cargos.length > 5 ? `<p class="texto-suave" style="font-size:12.5px;margin:6px 0 0">+ ${cargos.length - 5} outros cargos</p>` : "")
                    : '<p class="texto-suave" style="font-size:13px">Quadro de oficiais ainda não cadastrado.</p>'}
                ${permitida("venerancia") ? `<div class="mt8"><button type="button" class="botao botao-claro botao-pequeno" data-ir="venerancia"${UI.dica("Abre o quadro de oficiais, onde os cargos são cadastrados e o mandato é trocado.")}>Ver quadro de oficiais</button></div>` : ""}
              </div>
            </div>
          </div>

          <div style="display:grid;gap:16px;align-content:start">
            <div class="cartao">
              <h3 class="cartao-titulo">ACESSO RÁPIDO</h3>
              <div class="acesso-rapido">
                ${ACESSO_RAPIDO.filter(([id]) => permitida(id)).map(([id, rotulo, icone]) => `<button type="button" class="botao botao-dourado" style="width:100%;justify-content:flex-start" data-ir="${id}">${svg(icone, 17)} ${esc(rotulo)}</button>`).join("")}
              </div>
            </div>

            <div class="cartao">
              <h3 class="cartao-titulo">${svg("calendario", 17)} CALENDÁRIO MAÇÔNICO</h3>
              <div id="cal-area"><p class="carregando">Carregando calendário...</p></div>
            </div>

            ${cartaoAniversarios}

            <div class="cartao">
              <h3 class="cartao-titulo">${svg("sessoes", 17)} PRÓXIMOS EVENTOS</h3>
              ${eventos.length
                ? `<ul class="lista-eventos">${eventos.map(itemEvento).join("")}</ul>`
                : '<p class="texto-suave" style="font-size:13px">Nenhum evento futuro agendado.</p>'}
              ${permitida("sessoes") ? `<div class="mt8"><button type="button" class="botao botao-claro botao-pequeno" data-ir="sessoes">Ver todos os eventos</button></div>` : ""}
            </div>

            <div class="citacao-cartao">
              <img src="img/logo.svg" alt="Emblema Administração Loja X">
              <p>“Trabalhemos em paz, para que a harmonia e a união sejam sempre o alicerce de nossa Loja.”</p>
              <div class="assinatura">Administração Loja X</div>
            </div>
          </div>
        </div>`;

      el.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => ctx.irPara(b.dataset.ir)));

      // ---------- Avisos internos (ex.: evento agendado pela Fraternidade) ----------
      mostrarAvisos(el, ctx).catch(() => {});

      // ---------- Calendário Maçônico ----------
      const hoje = new Date();
      let mesCal = hoje.getMonth();
      let anoCal = hoje.getFullYear();

      async function desenharCalendario() {
        const area = el.querySelector("#cal-area");
        if (!area) return;
        area.innerHTML = '<p class="carregando">Carregando...</p>';
        const de = new Date(anoCal, mesCal, 1);
        const ate = new Date(anoCal, mesCal + 1, 1);
        let porDia = {};
        try {
          const dados = await API.get(`/events?from=${de.toISOString()}&to=${ate.toISOString()}&limit=200`);
          for (const ev of dados.items || []) {
            const d = new Date(ev.starts_at);
            (porDia[d.getDate()] = porDia[d.getDate()] || []).push(ev);
          }
        } catch {
          area.innerHTML = '<p class="vazio">Não foi possível carregar o calendário.</p>';
          return;
        }

        const primeiroDiaSemana = new Date(anoCal, mesCal, 1).getDay();
        const diasNoMes = new Date(anoCal, mesCal + 1, 0).getDate();
        let celulas = "";
        for (let i = 0; i < primeiroDiaSemana; i++) celulas += '<div class="dia fora"></div>';
        for (let d = 1; d <= diasNoMes; d++) {
          const ehHoje = d === hoje.getDate() && mesCal === hoje.getMonth() && anoCal === hoje.getFullYear();
          const evs = porDia[d];
          celulas += `<div class="dia ${ehHoje ? "hoje" : ""} ${evs ? "com-evento" : ""}" ${evs ? `data-dia="${d}"` : ""}>${d}</div>`;
        }

        area.innerHTML = `
          <div class="calendario-rotulo">
            <button type="button" data-mes="-1" aria-label="Mês anterior">‹</button>
            <span>${MESES[mesCal]} de ${anoCal}</span>
            <button type="button" data-mes="1" aria-label="Próximo mês">›</button>
          </div>
          <div class="calendario-grade">
            ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<span class="semana">${d}</span>`).join("")}
            ${celulas}
          </div>
          ${Object.keys(porDia).length ? '<p class="texto-suave" style="font-size:12px;margin:10px 0 0">◆ Dias destacados possuem eventos — clique para ver.</p>' : ""}`;

        area.querySelectorAll("[data-mes]").forEach((b) =>
          b.addEventListener("click", () => {
            mesCal += Number(b.dataset.mes);
            if (mesCal < 0) { mesCal = 11; anoCal--; }
            if (mesCal > 11) { mesCal = 0; anoCal++; }
            desenharCalendario();
          }),
        );

        area.querySelectorAll(".dia.com-evento").forEach((c) =>
          c.addEventListener("click", () => {
            const d = Number(c.dataset.dia);
            const evs = porDia[d];
            UI.abrirModal({
              titulo: `${d} de ${MESES[mesCal]} de ${anoCal}`,
              corpo: `<ul class="lista-eventos">${evs.map(itemEvento).join("")}</ul>`,
              botoes: [{ rotulo: "Fechar", tipo: "botao-claro" }],
            });
          }),
        );
      }

      await desenharCalendario();
    },
  };

  // ════════════════════════════ LOJA ════════════════════════════

  const CAMPOS_LOJA = [
    { nome: "official_name", rotulo: "Nome oficial", largo: true },
    { nome: "power_name", rotulo: "Potência" },
    { nome: "founded_on", rotulo: "Fundação", tipo: "date" },
    { nome: "phone", rotulo: "Telefone" },
    { nome: "email", rotulo: "E-mail", tipo: "email" },
    { nome: "address", rotulo: "Endereço", largo: true },
    { nome: "logo_url", rotulo: "Endereço do emblema (opcional)", largo: true, ajuda: "Deixe em branco para usar o emblema padrão do sistema." },
  ];

  PAGINAS.loja = {
    titulo: "Loja",
    icone: "loja",
    async render(el, ctx) {
      el.innerHTML = '<p class="carregando">Carregando...</p>';
      const { item: loja } = await API.get("/lodge");

      const ehAdmin = pode(ctx.usuario, PERFIS.loja);

      el.innerHTML =
        cabecalho("Loja", "Dados oficiais da Loja, cargos e diretoria") +
        `<div class="cartao">
          <h3 class="cartao-titulo">${svg("loja", 17)} DADOS DA LOJA ${ehAdmin ? "" : '<span class="texto-suave" style="font-weight:400;font-size:12.5px">(somente administrador edita)</span>'}</h3>
          ${formularioHtml(CAMPOS_LOJA, {
            official_name: loja.official_name || "",
            power_name: loja.power_name || "",
            founded_on: paraInputData(loja.founded_on),
            phone: loja.phone || "",
            email: loja.email || "",
            address: loja.address || "",
            logo_url: loja.logo_url || "",
          })}
          ${ehAdmin ? `<div class="mt16" style="display:flex;justify-content:flex-end"><button type="button" class="botao botao-azul" id="salvar-loja">Salvar dados da Loja</button></div>` : ""}
        </div>

        <div class="cartao">
          <h3 class="cartao-titulo">${svg("mandato", 17)} DIRETORIA E CARGOS</h3>
          <p class="texto-suave" style="font-size:13.5px;margin:0">
            O quadro de oficiais — as três luzes, os cargos oficiais e os oficiais complementares — fica agora na
            <strong>Venerância</strong>, junto com a troca de mandato.
          </p>
          ${pode(ctx.usuario, PERFIS_PAGINA.venerancia) ? `<div class="mt8"><button type="button" class="botao botao-azul botao-pequeno" data-ir="venerancia"${UI.dica("Abre o quadro de oficiais da Loja, onde cada cargo é cadastrado.")}>Abrir o quadro de oficiais</button></div>` : ""}
        </div>`;

      if (ehAdmin) {
        el.querySelector("#salvar-loja").addEventListener("click", async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          try {
            const raiz = el.querySelector(".cartao");
            const dados = lerFormulario(raiz, CAMPOS_LOJA);
            await API.patch("/lodge", dados);
            UI.aviso("Dados da Loja salvos.", "ok");
          } catch (err) {
            UI.aviso(err.message, "erro");
          } finally {
            b.disabled = false;
          }
        });
      }

      el.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => ctx.irPara(b.dataset.ir)));
    },
  };

  // ════════════════════════════ POTÊNCIAS ════════════════════════════

  PAGINAS.potencias = {
    titulo: "Potências",
    icone: "potencias",
    async render(el) {
      const { item: loja } = await API.get("/lodge").catch(() => ({ item: {} }));
      const potencia = loja?.power_name?.trim();
      el.innerHTML =
        cabecalho("Potências", "Potências e vínculos institucionais configurados na Loja") +
        `<div class="grade-dois">
          <div class="cartao" style="text-align:center">
            <img src="img/esquadro.svg" alt="" style="width:86px;height:86px">
            <h3 style="margin:6px 0 4px;color:var(--azul-800)">${esc(potencia || "Nenhuma potência cadastrada ainda")}</h3>
            <p class="texto-suave" style="font-size:13.5px;line-height:1.7">
              ${potencia
                ? `Vínculo institucional registrado para ${esc(loja?.official_name || "Administração Loja X")}.`
                : "Cadastre a potência ou órgão superior na tela Loja para exibi-la aqui."}
            </p>
            <span class="pill">${potencia ? "Vínculo ativo" : "Aguardando configuração"}</span>
          </div>
          <div class="cartao" style="text-align:center">
            <img src="img/logo.svg" alt="Emblema Administração Loja X" style="width:86px;height:86px">
            <h3 style="margin:6px 0 4px;color:var(--azul-800)">${esc(loja?.official_name || "Administração Loja X")}</h3>
            <p class="texto-suave" style="font-size:13.5px;line-height:1.7">
              ${loja?.address ? esc(loja.address) : "Endereço e contatos ainda não cadastrados."}
            </p>
            <span class="pill">Unidade cadastrada</span>
          </div>
        </div>
        <div class="cartao">
          <h3 class="cartao-titulo">SOBRE ESTE MÓDULO</h3>
          <p class="texto-suave" style="font-size:13.5px;line-height:1.7;margin:0">
            Este espaço reúne as informações sobre as Potências e vínculos institucionais cadastrados para a
            Administração Loja X. Os dados exibidos refletem diretamente o cadastro salvo no banco do sistema.
          </p>
        </div>`;
    },
  };

  // ════════════════════════════ IRMÃOS ════════════════════════════

  const paginaIrmaosCrud = paginaCrud({
    titulo: "Irmãos",
    descricao: "Cadastro dos irmãos da Loja — clique em “Ficha” para ver a visão completa",
    caminho: "/brothers",
    permissao: PERFIS.irmaos,
    substantivo: "Irmão",
    rotuloNovo: "Novo irmão",
    vazio: "Nenhum irmão encontrado.",
    filtros: [
      { nome: "q", rotulo: "Buscar", dica: "Nome ou CIM" },
      { nome: "status", rotulo: "Situação", tipo: "select", opcoes: [["ativo", "Ativo"], ["afastado", "Afastado"], ["visitante", "Visitante"], ["desligado", "Desligado"], ["outro", "Outro"]] },
    ],
    montarConsulta: (f) => {
      const p = new URLSearchParams();
      if (f.q) p.set("q", f.q);
      if (f.status) p.set("status", f.status);
      return p.toString();
    },
    colunas: [
      {
        rotulo: "Nome",
        valor: (b) =>
          `<strong>${esc(b.full_name)}</strong>${b.cim ? `<br><span class="texto-suave" style="font-size:12px">CIM ${esc(b.cim)}</span>` : ""}`,
      },
      { rotulo: "Grau", valor: (b) => esc(b.degree || "—") },
      { rotulo: "Telefone", valor: (b) => esc(b.phone || "—") },
      { rotulo: "Nascimento", valor: (b) => formatarData(b.birth_date) },
      { rotulo: "Situação", valor: (b) => selo(b.status) },
    ],
    campos: CAMPOS_IRMAO,
    valoresPadrao: { status: "ativo" },
    valoresIniciais: (b) => ({
      full_name: b.full_name,
      cim: b.cim || "",
      birth_date: paraInputData(b.birth_date),
      degree: b.degree || "",
      phone: b.phone || "",
      email: b.email || "",
      status: b.status,
      address: b.address || "",
      notes: b.notes || "",
    }),
    acoesLinha: (b) => [{ rotulo: "Ficha", icone: "olho", executar: () => abrirFicha(b.id) }],
  });

  async function abrirFicha(brotherId) {
    const dados = await API.get(`/brothers/${brotherId}`);
    const b = dados.item;
    const freq = {};
    for (const linha of dados.attendance_summary || []) freq[linha.status] = linha.total;

    const modal = UI.abrirModal({
      titulo: "Ficha do Irmão",
      largo: true,
      corpo: `
        <div class="grade-dois">
          <div>
            <h4 style="margin:0 0 8px;color:var(--azul-800)">${esc(b.full_name)}</h4>
            ${linhaInfo("CIM", esc(b.cim || "—"))}
            ${linhaInfo("Grau", esc(b.degree || "—"))}
            ${linhaInfo("Nascimento", formatarData(b.birth_date))}
            ${linhaInfo("Telefone", esc(b.phone || "—"))}
            ${linhaInfo("E-mail", esc(b.email || "—"))}
            ${linhaInfo("Endereço", esc(b.address || "—"))}
            ${linhaInfo("Situação", selo(b.status))}
            ${b.notes ? linhaInfo("Obs.", esc(b.notes)) : ""}
          </div>
          <div>
            <h4 style="margin:0 0 8px;color:var(--azul-800)">Frequência registrada</h4>
            <p style="margin:0 0 10px">${selo("presente")} ${freq.presente || 0} &nbsp; ${selo("justificado")} ${freq.justificado || 0} &nbsp; ${selo("ausente")} ${freq.ausente || 0}</p>
            <h4 style="margin:10px 0 8px;color:var(--azul-800)">Cargos</h4>
            ${(dados.offices || []).length
              ? (dados.offices || []).map((c) => linhaInfo(c.office_name, `${formatarData(c.term_start)} a ${c.term_end ? formatarData(c.term_end) : "atual"}`, true)).join("")
              : '<p class="texto-suave" style="font-size:13px;margin:0">Nenhum cargo registrado.</p>'}
          </div>
        </div>
        <h4 style="margin:16px 0 8px;color:var(--azul-800)">Familiares</h4>
        ${(dados.family || []).length
          ? `<div class="tabela-envolucro"><table class="tabela">
              <thead><tr><th>Nome</th><th>Parentesco</th><th>Telefone</th><th>Nascimento</th></tr></thead>
              <tbody>${dados.family.map((f) => `<tr><td>${esc(f.full_name)}</td><td>${esc(f.relationship)}</td><td>${esc(f.phone || "—")}</td><td>${formatarData(f.birth_date)}</td></tr>`).join("")}</tbody>
            </table></div>`
          : '<p class="texto-suave" style="font-size:13px;margin:0">Nenhum familiar cadastrado.</p>'}`,
      botoes: [
        { rotulo: "Fechar", tipo: "botao-claro" },
        {
          rotulo: "Adicionar familiar",
          tipo: "botao-azul",
          acao: async (m) => {
            const adicionou = await abrirFamiliarEm(b.id);
            if (adicionou) {
              m.fechar();
              await abrirFicha(brotherId);
            }
            return false;
          },
        },
      ],
    });
    return modal;
  }

  /** Formulário rápido para adicionar familiar a um irmão. Resolve true se salvou. */
  function abrirFamiliarEm(brotherId) {
    return new Promise((resolver) => {
      UI.abrirModal({
        titulo: "Adicionar familiar",
        corpo: formularioHtml(CAMPOS_FAMILIA),
        botoes: [
          { rotulo: "Cancelar", tipo: "botao-claro", acao: () => resolver(false) },
          {
            rotulo: "Adicionar familiar",
            tipo: "botao-azul",
            acao: async (m) => {
              const dados = lerFormulario(m.corpo, CAMPOS_FAMILIA);
              await API.post("/family", { ...dados, brother_id: brotherId });
              UI.aviso("Familiar adicionado.", "ok");
              resolver(true);
            },
          },
        ],
      });
    });
  }

  PAGINAS.irmaos = { titulo: "Irmãos", icone: "irmaos", render: paginaIrmaosCrud };

  // ════════════════════════════ FAMÍLIA ════════════════════════════

  PAGINAS.familia = {
    titulo: "Família",
    icone: "familia",
    async render(el, ctx) {
      let irmaos = [];
      try {
        irmaos = (await API.get("/brothers?limit=300")).items || [];
      } catch {
        irmaos = [];
      }

      const campos = [
        { nome: "brother_id", rotulo: "Irmão vinculado", tipo: "select", obrigatorio: true, opcoes: irmaos.map((b) => [b.id, b.full_name]), opcoesVazias: "Selecione o irmão..." },
        ...CAMPOS_FAMILIA,
      ];

      const pagina = paginaCrud({
        titulo: "Família",
        descricao: "Familiares dos irmãos — esposas, filhos, mães e demais entes queridos",
        caminho: "/family",
        permissao: PERFIS.familia,
        substantivo: "Familiar",
        rotuloNovo: "Novo familiar",
        vazio: "Nenhum familiar cadastrado ainda.",
        podeExcluir: (u) => pode(u, ["admin", "veneravel", "secretario"]),
        filtros: [{ nome: "q", rotulo: "Buscar", dica: "Nome do familiar ou do irmão" }],
        montarConsulta: (f) => (f.q ? `q=${encodeURIComponent(f.q)}` : ""),
        colunas: [
          { rotulo: "Nome", valor: (f) => `<strong>${esc(f.full_name)}</strong>` },
          { rotulo: "Parentesco", valor: (f) => esc(f.relationship) },
          { rotulo: "Irmão vinculado", valor: (f) => esc(f.brother_name || "—") },
          { rotulo: "Telefone", valor: (f) => esc(f.phone || "—") },
          { rotulo: "Nascimento", valor: (f) => formatarData(f.birth_date) },
        ],
        campos,
        valoresIniciais: (f) => ({
          brother_id: f.brother_id,
          full_name: f.full_name,
          relationship: f.relationship,
          birth_date: paraInputData(f.birth_date),
          phone: f.phone || "",
          email: f.email || "",
        }),
      });

      await pagina(el, ctx);
    },
  };
})();
