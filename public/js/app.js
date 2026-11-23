// ============================================================
// Inicialização do aplicativo: login, sessão, menu e navegação
// (rotas por hash: #/inicio, #/irmaos, #/financeiro...).
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const { PAGINAS, ROTULO_CARGO, PERFIS_PAGINA } = window.PW;

  // Menu por ofício: cada seção agrupa as telas daquele cargo.
  const MENU = [
    { id: "inicio" },
    { grupo: "Venerância", icone: "mandato", itens: ["venerancia"] },
    { grupo: "Secretaria", icone: "ata", itens: ["atas", "sessoes", "calendario", "comunicados", "documentos"] },
    { grupo: "Tesouraria", icone: "caixa", itens: ["financeiro", "caixa", "relatorio-financeiro", "relatorio-irmao"] },
    { grupo: "Chancelaria", icone: "irmaos", itens: ["irmaos", "familia", "frequencia", "relatorios"] },
    { grupo: "A Loja", icone: "loja", itens: ["loja", "potencias", "fraternidade"] },
    { id: "config" },
  ];

  const el = {
    login: document.getElementById("tela-login"),
    setup: document.getElementById("tela-setup"),
    senha: document.getElementById("tela-senha"),
    app: document.getElementById("app"),
    menu: document.getElementById("menu"),
    conteudo: document.getElementById("conteudo"),
    formLogin: document.getElementById("form-login"),
    loginEmail: document.getElementById("login-email"),
    loginSenha: document.getElementById("login-senha"),
    loginErro: document.getElementById("login-erro"),
    botaoEntrar: document.getElementById("botao-entrar"),
    formSetup: document.getElementById("form-setup"),
    setupNome: document.getElementById("setup-nome"),
    setupEmail: document.getElementById("setup-email"),
    setupSenha: document.getElementById("setup-senha"),
    setupConfirma: document.getElementById("setup-confirma"),
    setupErro: document.getElementById("setup-erro"),
    botaoCriarAdmin: document.getElementById("botao-criar-admin"),
    formSenha: document.getElementById("form-senha"),
    senhaAtual: document.getElementById("senha-atual"),
    senhaNova: document.getElementById("senha-nova"),
    senhaConfirma: document.getElementById("senha-confirma"),
    senhaErro: document.getElementById("senha-erro"),
    senhaOk: document.getElementById("senha-ok"),
    botaoSalvarSenha: document.getElementById("botao-salvar-senha"),
    botaoSair: document.getElementById("botao-sair"),
    topoNome: document.getElementById("topo-nome"),
    topoCargo: document.getElementById("topo-cargo"),
  };

  let usuario = null;

  function mostrar(tela) {
    ["login", "setup", "senha", "app"].forEach((nome) => el[nome].classList.toggle("oculto", nome !== tela));
  }

  function rotaAtual() {
    return (location.hash || "").replace(/^#\/?/, "").trim();
  }

  function erroLogin(mensagem) {
    el.loginErro.textContent = mensagem || "";
    el.loginErro.classList.toggle("oculto", !mensagem);
  }

  function erroSetup(mensagem) {
    el.setupErro.textContent = mensagem || "";
    el.setupErro.classList.toggle("oculto", !mensagem);
  }

  function erroSenha(mensagem) {
    el.senhaErro.textContent = mensagem || "";
    el.senhaErro.classList.toggle("oculto", !mensagem);
  }

  // ---------- Menu lateral ----------
  function dicaDaPagina(id) {
    const mapa = (window.DICAS && window.DICAS.PAGINAS) || {};
    return mapa[id] || PAGINAS[id].descricao || "";
  }

  function itemMenu(id) {
    const permitidos = PERFIS_PAGINA[id];
    if (permitidos && usuario && !permitidos.includes(usuario.role)) return "";
    const pagina = PAGINAS[id];
    return `<button type="button" class="menu-item" data-rota="${id}"${UI.dica(dicaDaPagina(id))}>${svg(pagina.icone || "inicio", 18)}<span>${esc(pagina.titulo)}</span></button>`;
  }

  function montarMenu() {
    el.menu.innerHTML =
      MENU.map((bloco) => {
        if (bloco.id) return itemMenu(bloco.id);
        const itens = bloco.itens.map(itemMenu).join("");
        if (!itens) return ""; // ofício sem telas liberadas não aparece no menu
        return `<div class="menu-grupo">
              <div class="menu-grupo-titulo"${UI.dica(bloco.grupo + " — telas deste ofício.")}>${svg(bloco.icone || "loja", 13)}<span>${esc(bloco.grupo)}</span></div>
              ${itens}
            </div>`;
      }).join("") +
      `<div class="menu-rodape">
        <img src="img/logo.svg" alt="Emblema Administração Loja X">
        <div class="loja">Administração Loja X</div>
        <div class="cidade">Sistema de Gestão</div>
        <div class="lema">Versão Acadêmica</div>
      </div>`;
  }

  // Clique no menu: registrado uma única vez (o conteúdo é redesenhado
  // a cada entrada, conforme o perfil do usuário).
  el.menu.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-rota]");
    if (!botao) return;
    location.hash = "#/" + botao.dataset.rota;
  });

  // ---------- Aniversariantes do dia ----------
  // Sempre que alguém entra no sistema, um aviso aparece se for o
  // aniversário de algum irmão, familiar ou sócia da fraternidade.
  async function avisarAniversarios() {
    try {
      const { items } = await API.get("/reports/aniversariantes?hoje=1");
      if (!items || !items.length) return;
      const nomes = items.map((a) => `${a.nome}${a.tipo === "Irmão" ? "" : ` (${a.tipo})`}`);
      const texto =
        nomes.length === 1
          ? `🎂 Hoje é o aniversário de ${nomes[0]}! Não esqueça do abraço fraterno.`
          : `🎂 Hoje temos ${nomes.length} aniversários: ${nomes.join(", ")}.`;
      UI.aviso(texto, "info", 12000);
      window.ANIVERSARIANTES_HOJE = items;
    } catch {
      // um aviso festivo nunca deve atrapalhar o acesso
    }
  }

  // ---------- Avisos internos ----------
  // Ex.: a Fraternidade Feminina agendou um evento e avisou a Secretaria.
  async function avisarAvisos() {
    try {
      const { items } = await API.get("/notifications?pendentes=1");
      if (!items || !items.length) return;
      const extra = items.length > 1 ? ` (e mais ${items.length - 1})` : "";
      UI.aviso(`📌 ${items[0].title}${extra}`, "info", 14000);
    } catch {
      // avisos nunca devem atrapalhar o acesso
    }
  }

  function marcarAtivo(id) {
    el.menu.querySelectorAll(".menu-item").forEach((b) => b.classList.toggle("ativo", b.dataset.rota === id));
  }

  // ---------- Navegação ----------
  async function abrirRota() {
    const bruta = rotaAtual();
    const id = PAGINAS[bruta] ? bruta : "inicio";
    marcarAtivo(id);

    // Cada ofício enxerga apenas as telas do seu ofício (o venerável e o
    // administrador enxergam todas).
    const permitidos = PERFIS_PAGINA[id];
    if (permitidos && usuario && !permitidos.includes(usuario.role)) {
      el.conteudo.innerHTML = `<div class="cartao">
        <h3 class="cartao-titulo">Acesso restrito</h3>
        <p class="texto-suave" style="font-size:13.5px;margin:0">Esta tela pertence a outro ofício e o seu perfil de acesso não permite abri-la.</p>
        <div class="mt8"><button type="button" class="botao botao-azul botao-pequeno" id="voltar-inicio">Ir ao Início</button></div>
      </div>`;
      el.conteudo.querySelector("#voltar-inicio").addEventListener("click", () => {
        location.hash = "#/inicio";
      });
      return;
    }

    el.conteudo.innerHTML = '<p class="carregando">Carregando...</p>';
    try {
      await PAGINAS[id].render(el.conteudo, {
        usuario,
        irPara: (destino) => {
          if (PAGINAS[destino]) location.hash = "#/" + destino;
        },
      });
    } catch (err) {
      if (err.status === 401) return encerrarSessao("Sua sessão expirou. Entre novamente.");
      el.conteudo.innerHTML = `<div class="cartao">
        <h3 class="cartao-titulo">Não foi possível abrir esta página</h3>
        <p class="texto-suave" style="font-size:13.5px;margin:0">${esc(err.message || "Erro inesperado.")}</p>
        <div class="mt8"><button type="button" class="botao botao-azul botao-pequeno" id="tentar-de-novo">Tentar novamente</button></div>
      </div>`;
      const botao = el.conteudo.querySelector("#tentar-de-novo");
      if (botao) botao.addEventListener("click", abrirRota);
    }
  }

  // ---------- Sessão ----------
  async function entrarNoPainel(user) {
    usuario = user;
    montarMenu();
    el.topoNome.textContent = user.name || "—";
    el.topoCargo.textContent = `${ROTULO_CARGO[user.role] || user.role} — acesso restrito`;
    el.botaoSair.setAttribute("data-dica", "Encerra a sessão com segurança e volta para a tela de acesso.");
    mostrar("app");
    if (PAGINAS[rotaAtual()]) await abrirRota();
    else location.hash = "#/inicio"; // o evento de mudança de hash abre a página
    avisarAniversarios();
    avisarAvisos();
  }

  function encerrarSessao(mensagem) {
    API.limparSessao();
    usuario = null;
    el.loginSenha.value = "";
    mostrar("login");
    if (mensagem) erroLogin(mensagem);
  }

  // ---------- Primeiro acesso (banco recém-instalado) ----------
  if (el.formSetup) {
    el.formSetup.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      erroSetup("");
      const nome = el.setupNome.value.trim();
      const email = el.setupEmail.value.trim();
      const senha = el.setupSenha.value;
      const confirma = el.setupConfirma.value;

      if (nome.length < 2) return erroSetup("Informe o nome completo (mínimo 2 caracteres).");
      const problema = UI.senhaErro(senha);
      if (problema) return erroSetup(problema);
      if (senha !== confirma) return erroSetup("As duas senhas não coincidem.");

      el.botaoCriarAdmin.disabled = true;
      el.botaoCriarAdmin.textContent = "Configurando...";
      try {
        const dados = await API.post(
          "/auth/setup",
          { full_name: nome, email, password: senha },
          { semToken: true, tentarRenovar: false },
        );
        API.salvarSessao(dados);
        await entrarNoPainel(dados.user);
        UI.aviso("Primeiro acesso configurado! Bem-vindo à Administração Loja X.", "ok");
      } catch (err) {
        erroSetup(err.message || "Não foi possível configurar o primeiro acesso.");
      } finally {
        el.botaoCriarAdmin.disabled = false;
        el.botaoCriarAdmin.textContent = "Criar administrador e entrar";
      }
    });
  }

  // ---------- Entrar ----------
  el.formLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erroLogin("");
    el.botaoEntrar.disabled = true;
    el.botaoEntrar.textContent = "Entrando...";
    try {
      const dados = await API.login(el.loginEmail.value.trim(), el.loginSenha.value);
      if (dados.must_change_password) {
        usuario = dados.user;
        el.senhaAtual.value = el.loginSenha.value;
        el.senhaNova.value = "";
        el.senhaConfirma.value = "";
        erroSenha("");
        el.senhaOk.classList.add("oculto");
        mostrar("senha");
        el.senhaNova.focus();
      } else {
        await entrarNoPainel(dados.user);
      }
    } catch (err) {
      erroLogin(err.message || "Não foi possível entrar.");
    } finally {
      el.botaoEntrar.disabled = false;
      el.botaoEntrar.textContent = "Entrar no sistema";
    }
  });

  // ---------- Troca de senha (primeiro acesso / senha redefinida) ----------
  el.formSenha.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erroSenha("");
    el.senhaOk.classList.add("oculto");
    const atual = el.senhaAtual.value;
    const nova = el.senhaNova.value;
    const problema = UI.senhaErro(nova);
    if (problema) return erroSenha(problema);
    if (nova !== el.senhaConfirma.value) return erroSenha("As duas senhas não coincidem.");
    if (nova === atual) return erroSenha("A nova senha deve ser diferente da senha provisória.");
    el.botaoSalvarSenha.disabled = true;
    el.botaoSalvarSenha.textContent = "Salvando...";
    try {
      await API.post("/auth/change-password", { current_password: atual, new_password: nova }, { tentarRenovar: false });
      API.limparSessao();
      usuario = null;
      el.senhaOk.textContent = "Senha alterada! Entre novamente com a nova senha.";
      el.senhaOk.classList.remove("oculto");
      setTimeout(() => {
        el.loginSenha.value = "";
        erroLogin("");
        mostrar("login");
      }, 2400);
    } catch (err) {
      erroSenha(err.message || "Não foi possível trocar a senha.");
    } finally {
      el.botaoSalvarSenha.disabled = false;
      el.botaoSalvarSenha.textContent = "Salvar nova senha";
    }
  });

  // ---------- Sair ----------
  el.botaoSair.addEventListener("click", async () => {
    const ok = await UI.confirmar("Deseja sair do sistema?", { rotuloOk: "Sair" });
    if (!ok) return;
    await API.sair();
    usuario = null;
    mostrar("login");
    el.loginSenha.value = "";
    erroLogin("");
    if (location.hash) history.replaceState(null, "", location.pathname);
  });

  // ---------- Início ----------
  window.addEventListener("hashchange", () => {
    if (usuario && !el.app.classList.contains("oculto")) abrirRota();
  });

  // Renovação silenciosa da sessão a cada 20 minutos.
  setInterval(() => {
    if (API.lerSessao()) API.renovar();
  }, 20 * 60 * 1000);

  async function abrirTelaInicial(mensagemLogin) {
    try {
      const status = await API.get("/auth/setup-status", { semToken: true, tentarRenovar: false });
      if (status && status.needs_setup) {
        erroSetup("");
        mostrar("setup");
        if (el.setupNome) el.setupNome.focus();
        return;
      }
    } catch {
      /* se falhar ao consultar status, segue para a tela de login */
    }
    mostrar("login");
    if (mensagemLogin) erroLogin(mensagemLogin);
  }

  async function iniciar() {
    montarMenu();
    const sessao = API.lerSessao();
    if (!sessao) {
      await abrirTelaInicial();
      return;
    }
    el.app.classList.remove("oculto"); // mostra o painel enquanto confirma a sessão
    try {
      const { user } = await API.get("/me");
      if (user.must_change_password) {
        usuario = user;
        el.loginEmail.value = user.email || el.loginEmail.value;
        erroSenha("");
        el.senhaOk.classList.add("oculto");
        mostrar("senha");
        el.senhaAtual.focus();
        return;
      }
      await entrarNoPainel(user);
    } catch (err) {
      if (err.status === 401) {
        API.limparSessao();
        usuario = null;
        el.loginSenha.value = "";
        await abrirTelaInicial("Sua sessão expirou. Entre novamente.");
      } else {
        mostrar("login");
        erroLogin("Não foi possível falar com o servidor. Tente novamente em instantes.");
      }
    }
  }

  iniciar();
})();
