// ============================================================
// Páginas: Relatórios, Documentos e Configurações
// (minha conta, usuários do sistema e auditoria).
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const { formatarMoeda, formatarDataHora, formatarData } = UI;
  const {
    PAGINAS, PERFIS, pode, selo, cabecalho, cabecalhoImpressao, assinaturasImpressao, imprimir, tabelaHtml,
    formularioHtml, lerFormulario, ROTULO_CARGO, botaoLinha, paginaCrud,
  } = window.PW;

  const ROLES = ["admin", "veneravel", "secretario", "chanceler", "tesoureiro", "fraternidade", "irmao"];

  const MAPA_ACAO = {
    create: "Criação",
    update: "Alteração",
    delete: "Exclusão",
    login: "Entrada no sistema",
    logout: "Saída",
    login_falha: "Falha de entrada",
    change_password: "Troca de senha",
    reset_password: "Redefinição de senha",
    reset_password_cli: "Redefinição de senha (comando)",
    save_attendance: "Presenças salvas",
    generate_month: "Mensalidades geradas",
    refresh: "Renovação de sessão",
    change_mandate: "Troca de mandato",
    archive: "Arquivamento",
    vacate: "Cargo liberado",
    setup_first_admin: "Configuração do primeiro acesso",
  };

  const MAPA_ENTIDADE = {
    brother: "Irmão",
    family_member: "Familiar",
    fraternity_member: "Fraternidade",
    lodge: "Loja",
    lodge_officer: "Cargo",
    event: "Evento",
    visit: "Visitação",
    contribution: "Contribuição",
    communication: "Comunicado",
    app_user: "Usuário",
    minute: "Ata",
    cash_movement: "Lançamento do caixa",
    mandate: "Mandato",
  };

  function linha(chave, valor) {
    return `<div class="linha-info"><span class="chave">${esc(chave)}</span><span class="valor">${valor || "—"}</span></div>`;
  }

  // ════════════════════════════ RELATÓRIOS ════════════════════════════

  PAGINAS.relatorios = {
    titulo: "Relatórios",
    icone: "relatorios",
    async render(el, ctx) {
      const anoAtual = new Date().getFullYear();
      const anos = Array.from({ length: 6 }, (_, i) => anoAtual - 4 + i);
      const podeFrequencia = pode(ctx.usuario, ["admin", "veneravel", "secretario", "chanceler"]);
      const opcoesAno = anos.map((a) => `<option value="${a}" ${a === anoAtual ? "selected" : ""}>${a}</option>`).join("");
      let mesAniversariantes = String(new Date().getMonth() + 1).padStart(2, "0");
      const opcoesMesHtml = () =>
        UI.MESES.map((nome, i) => {
          const v = String(i + 1).padStart(2, "0");
          return `<option value="${v}" ${mesAniversariantes === v ? "selected" : ""}>${esc(nome)}</option>`;
        }).join("");

      el.innerHTML =
        cabecalho(
          "Relatórios da Chancelaria",
          "Aniversariantes, frequência, família e cadastro de irmãos — veja na tela ou imprima",
          `<button type="button" class="botao botao-azul" id="imprimir-relatorios"${UI.dica("Imprime (ou salva em PDF) os relatórios que estão na tela, com o timbre da Loja.")}>${svg("imprimir", 16)} Imprimir / Salvar em PDF</button>`,
        ) +
        cabecalhoImpressao("Relatórios da Chancelaria", `Gerado em ${new Date().toLocaleDateString("pt-BR")}`) +
        `<div class="cartao">
           <h3 class="cartao-titulo">
             <span class="com-icone">${svg("aniversario", 17)} ANIVERSARIANTES DO MÊS</span>
             <select id="mes-aniversariantes" style="width:auto;padding:6px 10px"${UI.dica("Escolha o mês para ver quem faz aniversário — irmãos, familiares e fraternidade.")}>${opcoesMesHtml()}</select>
           </h3>
           <div id="area-aniversariantes"><p class="carregando">Carregando aniversariantes...</p></div>
         </div>
         <div class="grade-dois">
          ${
            podeFrequencia
              ? `<div class="cartao">
                  <h3 class="cartao-titulo">${svg("presenca", 17)} FREQUÊNCIA ÀS SESSÕES</h3>
                  <p class="texto-suave" style="font-size:13.5px;margin:0 0 12px">Presenças e ausências por sessão e por irmão, com as observações registradas.</p>
                  <div style="display:flex;gap:8px;align-items:center">
                    <select id="ano-frequencia-csv" style="width:auto">${opcoesAno}</select>
                    <button type="button" class="botao botao-azul" id="baixar-frequencia">${svg("baixar", 16)} Baixar CSV</button>
                  </div>
                </div>
                <div class="cartao">
                  <h3 class="cartao-titulo">${svg("irmaos", 17)} CADASTRO DE IRMÃOS</h3>
                  <p class="texto-suave" style="font-size:13.5px;margin:0 0 12px">Nome, CIM, nascimento, grau, contatos, situação e endereço de todos os irmãos.</p>
                  <button type="button" class="botao botao-azul" id="baixar-irmaos">${svg("baixar", 16)} Baixar CSV</button>
                </div>`
              : ""
          }
          <div class="cartao">
            <h3 class="cartao-titulo">${svg("familia", 17)} FAMÍLIA</h3>
            <p class="texto-suave" style="font-size:13.5px;margin:0 0 12px">Familiares cadastrados, com parentesco, vínculo com o irmão e contatos.</p>
            <div id="area-familia"><p class="carregando">Carregando famílias...</p></div>
          </div>
          <div class="cartao">
            <h3 class="cartao-titulo">${svg("irmaos", 17)} RESUMO DOS IRMÃOS</h3>
            <div id="area-irmaos"><p class="carregando">Carregando quadro de irmãos...</p></div>
          </div>
          <div class="cartao">
            <h3 class="cartao-titulo">${svg("relatorios", 17)} RESUMO GERAL</h3>
            <div id="resumo-relatorio"><p class="carregando">Carregando resumo...</p></div>
            <div class="mt8"><button type="button" class="botao botao-claro botao-pequeno" id="ir-painel">Ir ao painel inicial</button></div>
          </div>
        </div>`;

      function ligarDownload(idBotao, montarCaminho, montarNome) {
        const botao = el.querySelector("#" + idBotao);
        if (!botao) return;
        botao.addEventListener("click", async () => {
          botao.disabled = true;
          try {
            await API.baixarArquivo(montarCaminho(), montarNome());
            UI.aviso("Download iniciado.", "ok");
          } catch (err) {
            UI.aviso(err.message, "erro");
          } finally {
            botao.disabled = false;
          }
        });
      }

      ligarDownload(
        "baixar-frequencia",
        () => `/reports/attendance.csv?year=${el.querySelector("#ano-frequencia-csv").value}`,
        () => `frequencia-${el.querySelector("#ano-frequencia-csv").value}.csv`,
      );
      ligarDownload("baixar-irmaos", () => "/reports/brothers.csv", () => "irmaos.csv");

      el.querySelector("#ir-painel").addEventListener("click", () => ctx.irPara("inicio"));
      el.querySelector("#imprimir-relatorios").addEventListener("click", () => window.print());

      // ---------- Aniversariantes ----------
      async function carregarAniversariantes() {
        const area = el.querySelector("#area-aniversariantes");
        area.innerHTML = '<p class="carregando">Carregando aniversariantes...</p>';
        try {
          const { items, total } = await API.get(`/reports/aniversariantes?mes=${mesAniversariantes}`);
          const hoje = new Date();
          const nossoMes = String(hoje.getMonth() + 1).padStart(2, "0");
          area.innerHTML =
            (total
              ? `<div class="chips-resumo">${chipAniversario(total, mesAniversariantes, nossoMes)}</div>`
              : "") +
            tabelaHtml(
              [
                { rotulo: "Dia", valor: (a) => `<strong>${String(a.dia).padStart(2, "0")}</strong>` },
                { rotulo: "Nome", valor: (a) => esc(a.nome) },
                { rotulo: "Quem é", valor: (a) => esc(a.tipo || "—") },
                { rotulo: "Vínculo", valor: (a) => (a.vinculo ? esc(a.vinculo) : "—") },
                { rotulo: "Completa", valor: (a) => (a.idade ? `${a.idade} anos` : "—") },
                { rotulo: "Telefone", valor: (a) => esc(a.phone || "—") },
              ],
              items,
              { vazio: "Nenhum aniversariante neste mês." },
            );
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      function chipAniversario(total, mes, nossoMes) {
        const nomeMes = UI.MESES[Number(mes) - 1];
        const texto = total === 1 ? "1 aniversariante" : `${total} aniversariantes`;
        return `<div class="chip"><span class="ponto ${mes === nossoMes ? "verde" : "azul"}"></span>${esc(texto)} em ${esc(nomeMes)}</div>`;
      }

      // ---------- Família ----------
      async function carregarFamilia() {
        const area = el.querySelector("#area-familia");
        try {
          const dados = await API.get("/reports/familia");
          area.innerHTML =
            `<div class="chips-resumo">
               <div class="chip"><span class="ponto azul"></span>Familiares: <strong>${dados.total}</strong></div>
               <div class="chip"><span class="ponto verde"></span>Irmãos com família: <strong>${dados.irmaos_com_familia}</strong></div>
               ${(dados.por_parentesco || [])
                 .slice(0, 3)
                 .map((p) => `<div class="chip"><span class="ponto ambar"></span>${esc(p.relationship)}: <strong>${p.n}</strong></div>`)
                 .join("")}
             </div>` +
            tabelaHtml(
              [
                { rotulo: "Familiar", valor: (f) => `<strong>${esc(f.full_name)}</strong>` },
                { rotulo: "Parentesco", valor: (f) => esc(f.relationship || "—") },
                { rotulo: "Irmão", valor: (f) => esc(f.brother_name || "—") },
                { rotulo: "Telefone", valor: (f) => esc(f.phone || "—") },
              ],
              (dados.items || []).slice(0, 60),
              { vazio: "Nenhum familiar cadastrado." },
            ) +
            ((dados.items || []).length > 60
              ? `<p class="texto-suave" style="font-size:12.5px;margin:8px 0 0">Mostrando 60 de ${dados.items.length} familiares. Use a página Família para a lista completa.</p>`
              : "");
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      // ---------- Irmãos ----------
      async function carregarIrmaos() {
        const area = el.querySelector("#area-irmaos");
        try {
          const { items } = await API.get("/brothers?limit=300");
          const contar = (chave) => items.filter((b) => b.status === chave).length;
          const graus = ["Aprendiz", "Companheiro", "Mestre"];
          area.innerHTML =
            `<div class="chips-resumo">
               <div class="chip"><span class="ponto azul"></span>Total: <strong>${items.length}</strong></div>
               <div class="chip"><span class="ponto verde"></span>Ativos: <strong>${contar("ativo")}</strong></div>
               <div class="chip"><span class="ponto ambar"></span>Afastados: <strong>${contar("afastado")}</strong></div>
               <div class="chip"><span class="ponto vermelho"></span>Desligados: <strong>${contar("desligado")}</strong></div>
             </div>` +
            `<div class="chips-resumo">
               ${graus
                 .map(
                   (g) =>
                     `<div class="chip"><span class="ponto azul"></span>${g}: <strong>${items.filter((b) => b.degree === g).length}</strong></div>`,
                 )
                 .join("")}
               <div class="chip"><span class="ponto ambar"></span>Sem CIM: <strong>${items.filter((b) => !b.cim).length}</strong></div>
               <div class="chip"><span class="ponto ambar"></span>Sem telefone: <strong>${items.filter((b) => !b.phone).length}</strong></div>
             </div>`;
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      el.querySelector("#mes-aniversariantes").addEventListener("change", (e) => {
        mesAniversariantes = e.target.value;
        carregarAniversariantes();
      });

      await Promise.all([carregarAniversariantes(), carregarFamilia(), carregarIrmaos()]);

      try {
        const d = await API.get("/reports/dashboard");
        const partes = [];
        if (d.brothers) partes.push(linha("Irmãos cadastrados", `<strong>${d.brothers.total}</strong> <span class="texto-suave">(ativos: ${d.brothers.ativos})</span>`));
        partes.push(linha("Sessões nos próximos 30 dias", `<strong>${d.upcoming_events_count}</strong>`));
        if (d.contributions) {
          partes.push(
            linha(
              "Mensalidades pendentes",
              `<strong>${d.contributions.pendentes}</strong> <span class="texto-suave">— ${formatarMoeda(d.contributions.valor_pendente)}</span>`,
            ),
          );
        }
        if (d.family_count !== undefined) {
          partes.push(
            linha("Famílias vinculadas", `<strong>${d.family_count}</strong>`),
            linha("Fraternidade Feminina", `<strong>${d.fraternity_count}</strong> <span class="texto-suave">membros ativos</span>`),
            linha("Visitações no ano", `<strong>${d.visits_year}</strong>`),
            linha("Comunicados em aberto", `<strong>${d.communications_open}</strong>`),
          );
        }
        el.querySelector("#resumo-relatorio").innerHTML = partes.join("");
      } catch (err) {
        el.querySelector("#resumo-relatorio").innerHTML = `<p class="vazio">${esc(err.message)}</p>`;
      }
    },
  };

  // ════════════════════════ ENVIOS AO GOB / GOB-GO ════════════════════════
  // Controle dos documentos enviados à Potência:
  // ata aprovada, pedidos de iniciação, filiação, desligamento
  // e transferência, resultado da votação da diretoria, kit placet...

  const TIPOS_ENVIO = [
    ["ata", "Ata aprovada"],
    ["iniciacao", "Pedido de iniciação"],
    ["filiacao", "Pedido de filiação"],
    ["desligamento", "Pedido de desligamento"],
    ["transferencia", "Pedido de transferência"],
    ["votacao_diretoria", "Resultado da votação da diretoria"],
    ["kit_placet", "Kit placet"],
    ["outro", "Outro (e-mail, ofício...)"],
  ];
  const ROTULO_ENVIO = Object.fromEntries(TIPOS_ENVIO);
  const SITUACOES_ENVIO = [
    ["a_enviar", "A enviar"],
    ["enviado", "Enviado"],
    ["concluido", "Concluído"],
    ["devolvido", "Devolvido (corrigir e reenviar)"],
  ];
  // Data de hoje no fuso do navegador (toISOString usaria UTC e viraria o dia
  // às 21h no horário de Brasília).
  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  PAGINAS.documentos = {
    titulo: "Envios ao GOB",
    icone: "documentos",
    async render(el, ctx) {
      const anoAtual = new Date().getFullYear();
      let recarregarEnvios = null;
      const pagina = paginaCrud({
        titulo: "Envios ao GOB / GOB-GO",
        descricao:
          "Controle dos documentos enviados à Potência: o que falta enviar, prazos, data de envio, protocolo e situação. A ata também guarda o envio no Livro de Atas.",
        caminho: "/gob",
        permissao: ["admin", "veneravel", "secretario"],
        substantivo: "Envio",
        rotuloNovo: "Novo envio",
        vazio: "Nenhum envio registrado para o filtro escolhido.",
        podeExcluir: (usuario) => ["admin", "veneravel", "secretario"].includes(usuario.role),
        nomeDoItem: (g) => `o envio "${g.title}"`,
        filtros: [
          { nome: "status", rotulo: "Situação", tipo: "select", opcoes: SITUACOES_ENVIO },
          {
            nome: "ano",
            rotulo: "Ano",
            tipo: "select",
            padrao: String(anoAtual),
            opcoes: Array.from({ length: 5 }, (_, i) => String(anoAtual - 3 + i)).map((a) => [a, a]),
          },
        ],
        montarConsulta: (f) => {
          const p = new URLSearchParams();
          if (f.status) p.set("status", f.status);
          if (f.ano) p.set("ano", f.ano);
          return p.toString();
        },
        colunas: [
          {
            rotulo: "Documento",
            valor: (g) => `<strong>${esc(ROTULO_ENVIO[g.doc_type] || g.doc_type)}</strong><br><span class="texto-suave" style="font-size:12.5px">${esc(g.title)}</span>`,
          },
          { rotulo: "Para", valor: (g) => esc(g.power) },
          {
            rotulo: "Prazo",
            valor: (g) => {
              if (!g.due_date) return "—";
              const vencido = g.status === "a_enviar" && g.due_date < hojeISO();
              return `<span class="${vencido ? "prazo-vencido" : ""}">${esc(formatarData(g.due_date))}${vencido ? " — atrasado" : ""}</span>`;
            },
          },
          { rotulo: "Enviado em", valor: (g) => (g.sent_on ? esc(formatarData(g.sent_on)) : "—") },
          { rotulo: "Protocolo", valor: (g) => esc(g.protocol || "—") },
          { rotulo: "Situação", valor: (g) => selo(g.status) },
        ],
        campos: [
          { nome: "doc_type", rotulo: "Documento", tipo: "select", obrigatorio: true, opcoes: TIPOS_ENVIO },
          { nome: "title", rotulo: "Descrição", obrigatorio: true, largo: true, dica: "Ex.: Pedido de iniciação — candidato Fulano de Tal" },
          { nome: "power", rotulo: "Enviar para", tipo: "select", opcoes: [["GOB", "GOB"], ["GOB-GO", "GOB-GO"]] },
          { nome: "status", rotulo: "Situação", tipo: "select", opcoes: SITUACOES_ENVIO },
          { nome: "due_date", rotulo: "Prazo", tipo: "date", nuloSeVazio: true },
          { nome: "sent_on", rotulo: "Enviado em", tipo: "date", nuloSeVazio: true },
          { nome: "protocol", rotulo: "Protocolo", nuloSeVazio: true },
          { nome: "notes", rotulo: "Observações", tipo: "textarea", largo: true, nuloSeVazio: true },
        ],
        valoresPadrao: { doc_type: "ata", power: "GOB", status: "a_enviar" },
        valoresIniciais: (g) => ({ ...g, due_date: g.due_date || "", sent_on: g.sent_on || "" }),
        acoesLinha: (g, ctx2) => {
          if (!["admin", "veneravel", "secretario"].includes(ctx2.usuario.role)) return [];
          if (g.status === "a_enviar" || g.status === "devolvido")
            return [
              {
                rotulo: "Marcar enviado",
                icone: "enviar",
                executar: async (item) => {
                  await API.patch(`/gob/${item.id}`, { status: "enviado", sent_on: hojeISO() });
                  UI.aviso("Envio registrado com a data de hoje.", "ok");
                  if (recarregarEnvios) await recarregarEnvios();
                },
              },
            ];
          if (g.status === "enviado")
            return [
              {
                rotulo: "Concluir",
                icone: "presenca",
                executar: async (item) => {
                  await API.patch(`/gob/${item.id}`, { status: "concluido" });
                  UI.aviso("Envio concluído.", "ok");
                  if (recarregarEnvios) await recarregarEnvios();
                },
              },
            ];
          return [];
        },
        aposMontar: (_el2, _ctx, { recarregar }) => {
          recarregarEnvios = recarregar;
        },
      });
      await pagina(el, ctx);
    },
  };

  // ════════════════════════════ CONFIGURAÇÕES ════════════════════════════

  PAGINAS.config = {
    titulo: "Configurações",
    icone: "config",
    async render(el, ctx) {
      const u = ctx.usuario;
      const ehAdmin = u.role === "admin";

      const CAMPOS_SENHA = [
        { nome: "atual", rotulo: "Senha atual", tipo: "password", obrigatorio: true },
        { nome: "nova", rotulo: "Nova senha", tipo: "password", obrigatorio: true, ajuda: "Mínimo de 8 caracteres, com letra, número e símbolo." },
        { nome: "confirma", rotulo: "Repita a nova senha", tipo: "password", obrigatorio: true },
      ];

      el.innerHTML =
        cabecalho("Configurações", "Sua conta, gestão de usuários e auditoria do sistema") +
        `<div class="grade-dois">
          <div class="cartao">
            <h3 class="cartao-titulo">${svg("usuario", 17)} MINHA CONTA</h3>
            ${linha("Nome", esc(u.name))}
            ${linha("E-mail", esc(u.email))}
            ${linha("Perfil de acesso", esc(ROTULO_CARGO[u.role] || u.role))}
            <p class="ajuda" style="margin:10px 0 0">Por segurança, a troca de senha encerra as sessões abertas — você entrará novamente em seguida.</p>
          </div>
          <div class="cartao" id="cartao-senha">
            <h3 class="cartao-titulo">${svg("chave", 17)} TROCAR SENHA</h3>
            ${formularioHtml(CAMPOS_SENHA)}
            <div class="mt16" style="display:flex;justify-content:flex-end">
              <button type="button" class="botao botao-azul" id="salvar-nova-senha">Salvar nova senha</button>
            </div>
          </div>
        </div>` +
        (ehAdmin
          ? `<div class="cartao">
              <h3 class="cartao-titulo">
                <span class="com-icone">${svg("usuario", 17)} USUÁRIOS DO SISTEMA</span>
                <button type="button" class="botao botao-azul botao-pequeno" id="novo-usuario">+ Novo usuário</button>
              </h3>
              <p class="texto-suave" style="font-size:13px;margin:0 0 10px">
                Perfis de acesso: Administrador e Venerável Mestre (acesso total), Secretário (Secretaria), Chanceler (Chancelaria), Tesoureiro (Tesouraria), Fraternidade Feminina (membros e eventos) e Irmão (calendário e o próprio relatório).
              </p>
              <div id="area-usuarios"><p class="carregando">Carregando usuários...</p></div>
            </div>
            <div class="cartao">
              <h3 class="cartao-titulo">
                <span class="com-icone">${svg("config", 17)} AUDITORIA — ÚLTIMAS ATIVIDADES</span>
                <button type="button" class="botao botao-claro botao-pequeno" id="atualizar-auditoria">${svg("atualizar", 14)} Atualizar</button>
              </h3>
              <div id="area-auditoria"><p class="carregando">Carregando auditoria...</p></div>
            </div>`
          : "");

      // ---------- Trocar a própria senha ----------
      el.querySelector("#salvar-nova-senha").addEventListener("click", async (evento) => {
        const botao = evento.currentTarget;
        try {
          const dados = lerFormulario(el.querySelector("#cartao-senha"), CAMPOS_SENHA);
          const problema = UI.senhaErro(dados.nova);
          if (problema) throw new Error(problema);
          if (dados.nova !== dados.confirma) throw new Error("As duas senhas não coincidem.");
          if (dados.nova === dados.atual) throw new Error("A nova senha deve ser diferente da atual.");
          botao.disabled = true;
          await API.post("/auth/change-password", { current_password: dados.atual, new_password: dados.nova }, { tentarRenovar: false });
          UI.aviso("Senha alterada! Entre novamente com a nova senha.", "ok");
          API.limparSessao();
          setTimeout(() => location.reload(), 1800);
        } catch (err) {
          UI.aviso(err.message, "erro");
          botao.disabled = false;
        }
      });

      if (!ehAdmin) return;

      // ---------- Usuários do sistema ----------
      // Lista dos irmãos para o campo "Irmão vinculado" (perfil Irmão).
      let irmaosParaVinculo = [];
      try {
        irmaosParaVinculo = (await API.get("/brothers?limit=300")).items || [];
      } catch {
        irmaosParaVinculo = [];
      }
      const CAMPO_IRMAO_VINCULADO = {
        nome: "brother_id",
        rotulo: "Irmão vinculado (perfil Irmão)",
        tipo: "select",
        opcoes: irmaosParaVinculo.map((b) => [b.id, b.full_name]),
        opcoesVazias: "— nenhum —",
        largo: true,
        ajuda: "Vincule a conta ao cadastro do irmão: com o perfil Irmão, ele verá o calendário e o próprio relatório.",
      };

      const CAMPOS_USUARIO_NOVO = [
        { nome: "full_name", rotulo: "Nome completo", obrigatorio: true, largo: true },
        { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
        {
          nome: "password",
          rotulo: "Senha provisória",
          tipo: "password",
          obrigatorio: true,
          ajuda: "Mínimo de 8 caracteres, com letra, número e símbolo. O usuário definirá a senha definitiva no primeiro acesso.",
        },
        { nome: "role", rotulo: "Perfil de acesso", tipo: "select", opcoes: ROLES.map((r) => [r, ROTULO_CARGO[r] || r]) },
        CAMPO_IRMAO_VINCULADO,
      ];

      const CAMPOS_USUARIO_EDITAR = [
        { nome: "full_name", rotulo: "Nome completo", obrigatorio: true, largo: true },
        { nome: "role", rotulo: "Perfil de acesso", tipo: "select", opcoes: ROLES.map((r) => [r, ROTULO_CARGO[r] || r]) },
        {
          nome: "active",
          rotulo: "Situação",
          tipo: "select",
          opcoes: [
            ["true", "Ativo"],
            ["false", "Inativo"],
          ],
        },
        CAMPO_IRMAO_VINCULADO,
      ];

      async function carregarUsuarios() {
        const area = el.querySelector("#area-usuarios");
        if (!area) return;
        try {
          const { items } = await API.get("/users");
          const colunas = [
            {
              rotulo: "Nome",
              valor: (x) =>
                `<strong>${esc(x.full_name)}</strong>${x.must_change_password ? '<br><span class="texto-suave" style="font-size:12px">senha provisória — troca pendente</span>' : ""}`,
            },
            { rotulo: "E-mail", valor: (x) => esc(x.email) },
            { rotulo: "Perfil", valor: (x) => esc(ROTULO_CARGO[x.role] || x.role) },
            { rotulo: "Irmão vinculado", valor: (x) => esc(x.brother_name || "—") },
            { rotulo: "Situação", valor: (x) => (x.active ? selo("ativo") : selo("desligado")) },
            { rotulo: "Último acesso", valor: (x) => (x.last_login_at ? formatarDataHora(x.last_login_at) : '<span class="texto-suave">Nunca</span>') },
          ];
          area.innerHTML = tabelaHtml(colunas, items, { comAcoes: true });

          area.querySelectorAll("[data-acoes]").forEach((td) => {
            const usuario = items[Number(td.dataset.acoes)];
            const b1 = botaoLinha("Editar", "botao-claro", "editar");
            b1.addEventListener("click", () => editarUsuario(usuario));
            const b2 = botaoLinha("Redefinir senha", "botao-claro", "chave");
            b2.addEventListener("click", () => redefinirSenha(usuario));
            td.appendChild(b1);
            td.appendChild(b2);
          });
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      function criarUsuario() {
        UI.abrirModal({
          titulo: "Novo usuário do sistema",
          corpo: formularioHtml(CAMPOS_USUARIO_NOVO),
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: "Criar usuário",
              tipo: "botao-azul",
              acao: async (m) => {
                const d = lerFormulario(m.corpo, CAMPOS_USUARIO_NOVO);
                const problema = UI.senhaErro(d.password);
                if (problema) throw new Error(problema);
                await API.post("/users", d);
                UI.aviso("Usuário criado. No primeiro acesso, ele definirá a própria senha.", "ok");
                await carregarUsuarios();
              },
            },
          ],
        });
      }

      function editarUsuario(x) {
        UI.abrirModal({
          titulo: `Editar usuário — ${x.full_name}`,
          corpo: formularioHtml(CAMPOS_USUARIO_EDITAR, {
            full_name: x.full_name,
            role: x.role,
            active: String(x.active !== false),
            brother_id: x.brother_id || "",
          }),
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: "Salvar alterações",
              tipo: "botao-azul",
              acao: async (m) => {
                const d = lerFormulario(m.corpo, CAMPOS_USUARIO_EDITAR);
                await API.patch(`/users/${x.id}`, {
                  full_name: d.full_name,
                  role: d.role,
                  active: d.active === "true",
                  brother_id: d.brother_id === "" ? null : d.brother_id,
                });
                UI.aviso("Usuário atualizado.", "ok");
                await carregarUsuarios();
              },
            },
          ],
        });
      }

      function redefinirSenha(x) {
        const campos = [
          { nome: "new_password", rotulo: "Nova senha provisória", tipo: "password", obrigatorio: true, ajuda: "Mínimo de 8 caracteres, com letra, número e símbolo." },
        ];
        UI.abrirModal({
          titulo: `Redefinir senha — ${x.full_name}`,
          corpo:
            formularioHtml(campos) +
            '<p class="ajuda mt8">O usuário deverá trocar esta senha no próximo acesso. As sessões abertas dele serão encerradas.</p>',
          botoes: [
            { rotulo: "Cancelar", tipo: "botao-claro" },
            {
              rotulo: "Redefinir senha",
              tipo: "botao-azul",
              acao: async (m) => {
                const d = lerFormulario(m.corpo, campos);
                const problema = UI.senhaErro(d.new_password);
                if (problema) throw new Error(problema);
                await API.post(`/users/${x.id}/reset-password`, { new_password: d.new_password });
                UI.aviso("Senha provisória definida.", "ok");
                await carregarUsuarios();
              },
            },
          ],
        });
      }

      // ---------- Auditoria ----------
      async function carregarAuditoria() {
        const area = el.querySelector("#area-auditoria");
        if (!area) return;
        area.innerHTML = '<p class="carregando">Carregando...</p>';
        try {
          const { items } = await API.get("/audit?limit=100");
          const colunas = [
            { rotulo: "Data e hora", valor: (a) => formatarDataHora(a.occurred_at) },
            { rotulo: "Usuário", valor: (a) => esc(a.user_name || "—") },
            { rotulo: "Ação", valor: (a) => esc(MAPA_ACAO[a.action] || a.action) },
            {
              rotulo: "Registro",
              valor: (a) => {
                const tipo = MAPA_ENTIDADE[a.entity_type] || a.entity_type || "—";
                return a.entity_id
                  ? `${esc(tipo)} <span class="texto-suave" style="font-size:11.5px">${esc(String(a.entity_id).slice(0, 8))}</span>`
                  : esc(tipo);
              },
            },
            { rotulo: "IP", valor: (a) => esc(a.ip_address || "—") },
          ];
          area.innerHTML = tabelaHtml(colunas, items, { vazio: "Nenhuma atividade registrada ainda." });
        } catch (err) {
          area.innerHTML = `<div class="vazio">${esc(err.message)}</div>`;
        }
      }

      el.querySelector("#novo-usuario").addEventListener("click", () => criarUsuario());
      el.querySelector("#atualizar-auditoria").addEventListener("click", () => carregarAuditoria());

      await Promise.all([carregarUsuarios(), carregarAuditoria()]);
    },
  };
})();
