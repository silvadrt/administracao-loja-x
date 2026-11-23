// ============================================================
// Cliente da API do painel.
// Guarda a sessão no navegador, renova o token automaticamente
// e baixa arquivos (CSV) com autenticação.
// ============================================================
(function () {
  "use strict";

  const CHAVE = "administracao-loja-x.sessao";

  function lerSessao() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE));
    } catch {
      return null;
    }
  }

  function salvarSessao(dados) {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  }

  function limparSessao() {
    localStorage.removeItem(CHAVE);
  }

  let renovandoAgora = null;

  async function renovar() {
    if (renovandoAgora) return renovandoAgora;
    const s = lerSessao();
    if (!s || !s.refresh_token) return false;

    renovandoAgora = (async () => {
      try {
        const r = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        if (!r.ok) return false;
        const dados = await r.json();
        salvarSessao({ ...s, ...dados });
        return true;
      } catch {
        return false;
      } finally {
        renovandoAgora = null;
      }
    })();

    return renovandoAgora;
  }

  async function requisicao(metodo, caminho, corpo, opcoes) {
    const cfg = { semToken: false, tentarRenovar: true, ...(opcoes || {}) };
    const s = lerSessao();
    const headers = {};
    if (corpo !== undefined) headers["Content-Type"] = "application/json";
    if (!cfg.semToken && s && s.access_token) headers.Authorization = "Bearer " + s.access_token;

    let resposta = await fetch("/api" + caminho, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });

    if (resposta.status === 401 && cfg.tentarRenovar && s && s.refresh_token && !cfg.semToken) {
      const ok = await renovar();
      if (ok) {
        const nova = lerSessao();
        headers.Authorization = "Bearer " + nova.access_token;
        resposta = await fetch("/api" + caminho, {
          method: metodo,
          headers,
          body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        });
      }
    }

    if (resposta.status === 204) return null;

    let dados = {};
    try {
      dados = await resposta.json();
    } catch {
      dados = {};
    }

    if (!resposta.ok) {
      const erro = new Error(dados.error || "Erro " + resposta.status + " na comunicação com o servidor.");
      erro.status = resposta.status;
      erro.codigo = dados.code;
      erro.detalhes = dados.details;
      throw erro;
    }
    return dados;
  }

  async function baixarArquivo(caminho, nomeArquivo) {
    const s = lerSessao();
    let resposta = await fetch("/api" + caminho, {
      headers: s && s.access_token ? { Authorization: "Bearer " + s.access_token } : {},
    });
    if (resposta.status === 401) {
      const ok = await renovar();
      if (ok) {
        const nova = lerSessao();
        resposta = await fetch("/api" + caminho, { headers: { Authorization: "Bearer " + nova.access_token } });
      }
    }
    if (!resposta.ok) throw new Error("Não foi possível baixar o arquivo.");
    const blob = await resposta.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function login(email, senha) {
    const dados = await requisicao("POST", "/auth/login", { email, password: senha }, { semToken: true, tentarRenovar: false });
    salvarSessao(dados);
    return dados;
  }

  async function sair() {
    const s = lerSessao();
    try {
      await requisicao("POST", "/auth/logout", { refresh_token: s ? s.refresh_token : undefined }, { tentarRenovar: false });
    } catch {
      /* sair localmente mesmo se a rede falhar */
    }
    limparSessao();
  }

  window.API = {
    login,
    sair,
    renovar,
    lerSessao,
    salvarSessao,
    limparSessao,
    baixarArquivo,
    get: (caminho, opcoes) => requisicao("GET", caminho, undefined, opcoes),
    post: (caminho, corpo, opcoes) => requisicao("POST", caminho, corpo, opcoes),
    put: (caminho, corpo, opcoes) => requisicao("PUT", caminho, corpo, opcoes),
    patch: (caminho, corpo, opcoes) => requisicao("PATCH", caminho, corpo, opcoes),
    del: (caminho, opcoes) => requisicao("DELETE", caminho, undefined, opcoes),
  };
})();
