// ============================================================
// Utilitários de interface: avisos, modais, formatação e ícones.
// ============================================================
(function () {
  "use strict";

  /** Escapa texto para uso seguro em HTML. */
  function esc(valor) {
    if (valor === null || valor === undefined) return "";
    return String(valor)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const MESES_ABREV = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

  /** Datas “YYYY-MM-DD” sem sofrer com fuso horário. */
  function formatarData(valor) {
    if (!valor) return "—";
    const s = String(valor);
    const somenteData = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (somenteData) return `${somenteData[3]}/${somenteData[2]}/${somenteData[1]}`;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  }

  function formatarDataHora(valor) {
    if (!valor) return "—";
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return "—";
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function paraInputData(valor) {
    if (!valor) return "";
    const s = String(valor);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  }

  /** "2026-10-18T19:30:00-03:00" → valor para <input type="datetime-local"> */
  function paraInputDataHora(valor) {
    if (!valor) return "";
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** "2026-10-18T19:30" (input local) → ISO com fuso */
  function deInputDataHora(valor) {
    if (!valor) return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function formatarMoeda(valor) {
    const n = Number(valor ?? 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  /** "2026-10" → "Outubro/2026" */
  function mesDeReferencia(ref) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ref || ""));
    if (!m) return ref || "—";
    return `${MESES[Number(m[2]) - 1]}/${m[1]}`;
  }

  // ---------- Senha (mesma regra do servidor) ----------
  const SENHA_MIN = 8;
  const SENHA_REGRA_TEXTO =
    "Mínimo de 8 caracteres, com pelo menos uma letra, um número e um símbolo (ex.: ! @ # $ %).";

  /** Devolve a mensagem do problema ou null se a senha estiver dentro da regra. */
  function senhaErro(valor) {
    const s = String(valor ?? "");
    if (s.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`;
    if (!/\p{L}/u.test(s)) return "A senha deve ter pelo menos uma letra.";
    if (!/\p{N}/u.test(s)) return "A senha deve ter pelo menos um número.";
    if (!/[^\p{L}\p{N}]/u.test(s)) return "A senha deve ter pelo menos um símbolo (ex.: ! @ # $ %).";
    return null;
  }

  function aviso(mensagem, tipo = "info", tempo = 4500) {
    const caixa = document.getElementById("avisos");
    const el = document.createElement("div");
    el.className = `aviso aviso-${tipo}`;
    el.textContent = mensagem;
    caixa.appendChild(el);
    setTimeout(() => el.remove(), tempo);
  }

  // ---------------- Modal ----------------

  let fecharAtual = null;

  function abrirModal(opcoes) {
    const fundo = document.getElementById("modal-fundo");
    const caixa = document.getElementById("modal");
    fecharAtual = () => {
      fundo.classList.add("oculto");
      caixa.innerHTML = "";
      document.removeEventListener("keydown", aoTeclar);
    };

    const botoes = (opcoes.botoes || []).map(
      (b, i) =>
        `<button type="button" class="botao ${b.tipo || "botao-claro"}" data-botao="${i}">${esc(b.rotulo)}</button>`,
    );

    caixa.className = "modal" + (opcoes.largo ? " modal-largo" : "");
    caixa.innerHTML = `
      <div class="modal-cabecalho">
        <h3>${esc(opcoes.titulo)}</h3>
        <button type="button" class="modal-fechar" data-fechar title="Fechar">✕</button>
      </div>
      <div class="modal-corpo">${opcoes.corpo || ""}</div>
      ${botoes.length ? `<div class="modal-rodape">${botoes.join("")}</div>` : ""}
    `;

    fundo.classList.remove("oculto");

    const api = {
      el: caixa,
      corpo: caixa.querySelector(".modal-corpo"),
      fechar: fecharAtual,
      erro(mensagem) {
        let alvo = caixa.querySelector(".mensagem-erro");
        if (!alvo) {
          alvo = document.createElement("p");
          alvo.className = "mensagem-erro";
          caixa.querySelector(".modal-corpo").appendChild(alvo);
        }
        alvo.textContent = mensagem;
        alvo.classList.remove("oculto");
      },
    };

    caixa.querySelector("[data-fechar]").addEventListener("click", fecharAtual);
    fundo.addEventListener(
      "mousedown",
      (e) => {
        if (e.target === fundo) fecharAtual();
      },
      { once: true },
    );

    function aoTeclar(e) {
      if (e.key === "Escape") fecharAtual();
    }
    document.addEventListener("keydown", aoTeclar);

    (opcoes.botoes || []).forEach((b, i) => {
      const el = caixa.querySelector(`[data-botao="${i}"]`);
      if (!el) return;
      el.addEventListener("click", async () => {
        const antes = el.textContent;
        el.disabled = true;
        try {
          // Botões sem ação (ex.: "Cancelar") apenas fecham o modal.
          const resultado = b.acao ? await b.acao(api) : undefined;
          if (resultado !== false) fecharAtual();
        } catch (err) {
          api.erro(err.message || "Não foi possível concluir a operação.");
        } finally {
          el.disabled = false;
          el.textContent = antes;
        }
      });
    });

    return api;
  }

  function confirmar(mensagem, opcoes = {}) {
    return new Promise((resolve) => {
      abrirModal({
        titulo: opcoes.titulo || "Confirmar",
        corpo: `<p style="margin:0;font-size:14.5px;line-height:1.6">${esc(mensagem)}</p>`,
        botoes: [
          { rotulo: "Cancelar", tipo: "botao-claro", acao: () => resolve(false) },
          {
            rotulo: opcoes.rotuloOk || "Confirmar",
            tipo: opcoes.perigo ? "botao-perigo" : "botao-azul",
            acao: () => resolve(true),
          },
        ],
      });
    });
  }

  // ---------------- Ícones (SVG em linha) ----------------

  const CAMINHOS = {
    inicio: '<path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M10 21v-6h4v6"/>',
    loja: '<path d="M3 21h18"/><path d="M4.5 21V10M9.5 21V10M14.5 21V10M19.5 21V10"/><path d="M2.5 10 12 4l9.5 6z"/>',
    potencias: '<path d="M10 13.5a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 10.5a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/>',
    irmaos: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5v-1a5.5 5.5 0 0 1 5.5-5.5h2a5.5 5.5 0 0 1 5.5 5.5v1"/><path d="M16 4.6a3.6 3.6 0 0 1 0 6.8"/><path d="M18 14.2a5.5 5.5 0 0 1 3.5 5.1v1.2"/>',
    familia: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>',
    sessoes: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="m9 13 2 2 4-4"/>',
    frequencia: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/><path d="m9 15 2 2 4-4"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/><path d="M8 13.5h2.5M13.5 13.5H16M8 17h2.5"/>',
    fraternidade: '<circle cx="12" cy="8.5" r="5"/><path d="M12 13.5V21M9 18h6"/>',
    financeiro: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v5.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6"/><path d="M4.5 11.5V17c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-5.5"/>',
    whatsapp: '<path d="M21 11.8a8.6 8.6 0 0 1-12.9 7.4L3.5 20.5l1.4-4.4A8.6 8.6 0 1 1 21 11.8z"/><path d="M8.7 9.2c.5 2.9 3.6 6 6.5 6.5l1.4-1.4-2.1-1.7-1.2.7c-.9-.3-2-1.4-2.3-2.3l.7-1.2-1.7-2z"/>',
    relatorios: '<path d="M3.5 21h17"/><path d="M6 21v-7h3v7M10.5 21V9h3v12M15 21v-10h3v10"/>',
    documentos: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
    config: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.4 4.4l2.1 2.1M17.5 17.5l2.1 2.1M2.5 12h3M18.5 12h3M4.4 19.6l2.1-2.1M17.5 6.5l2.1-2.1"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    lixo: '<path d="M3.5 6.5h17"/><path d="M8.5 6.5V4.8A1.3 1.3 0 0 1 9.8 3.5h4.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="m6.5 6.5 1 13a2 2 0 0 0 2 1.9h5a2 2 0 0 0 2-1.9l1-13"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/>',
    olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    presenca: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="m8 12.5 2.8 2.8L16 9.5"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5.5 15h-1a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v1"/>',
    baixar: '<path d="M12 3.5v12"/><path d="m7 10.5 5 5 5-5"/><path d="M4 20.5h16"/>',
    chave: '<circle cx="8" cy="15.5" r="4.5"/><path d="m11.3 12.2 9-9M15.5 8l3 3M18.5 5l2 2"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1"/>',
    atualizar: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V9h-5.5"/>',
    enviar: '<path d="m21 3-7.5 19-3.5-8.5L1.5 10z"/><path d="M21 3 10 13.5"/>',
    ata: '<rect x="4" y="4" width="16" height="16.5" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M8 9.5h8M8 13h8M8 16.5h5"/>',
    caixa: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M3 11.5h18"/><path d="M7 7.5v-2A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5v2"/>',
    mandato: '<path d="M3.5 7.5h11"/><path d="m11.5 4 3.5 3.5-3.5 3.5"/><path d="M20.5 16.5h-11"/><path d="m12.5 13-3.5 3.5 3.5 3.5"/>',
    aniversario: '<path d="M4 20.5h16"/><path d="M5.5 20.5v-6a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5v6"/><path d="M12 13V9.5"/><path d="M12 6.6c1.4-1.2 1.2-2.8 0-3.3-1.2.5-1.4 2.1 0 3.3z"/>',
    imprimir: '<path d="M6.5 9V3.5h11V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="1.5"/><path d="M6.5 16.5h11v4h-11z"/>',
    arquivar: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5"/><path d="M10 12.5h4"/>',
    alerta: '<path d="M12 3.5 21 19.5H3z"/><path d="M12 9.5v4.5"/><path d="M12 17h.01"/>',
    dica: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6"/><path d="M12 7.5h.01"/>',
    saida: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="m8.5 13 3.5 3.5L15.5 13"/>',
    entrada: '<circle cx="12" cy="12" r="8.5"/><path d="M12 16.5v-9"/><path d="m8.5 11 3.5-3.5L15.5 11"/>',
    modelo: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17"/><path d="M8 13h8M8 16.5h5"/>',
    sino: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z"/><path d="M10.2 20a2 2 0 0 0 3.6 0"/>',
  };

  function svg(nome, tamanho = 18) {
    const caminho = CAMINHOS[nome] || CAMINHOS.inicio;
    return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminho}</svg>`;
  }

  // ---------------- Dicas (lembretes ao passar o mouse) ----------------
  // Qualquer elemento com data-dica="texto" mostra o lembrete.
  // A caixa é única, fica presa na tela (não é cortada pelo menu).

  let caixaDica = null;
  let alvoDica = null;
  let tempoDica = null;

  /** Devolve o atributo pronto para entrar no HTML. */
  function dica(texto) {
    return texto ? ` data-dica="${esc(texto)}"` : "";
  }

  const ACOES_DICA = () => (window.DICAS && window.DICAS.ACOES) || {};
  const FILTROS_DICA = () => (window.DICAS && window.DICAS.FILTROS) || {};

  function montarDicas() {
    if (caixaDica || !document.body) return;
    caixaDica = document.createElement("div");
    caixaDica.className = "dica oculto";
    caixaDica.setAttribute("role", "tooltip");
    document.body.appendChild(caixaDica);

    const posicionar = (el) => {
      const r = el.getBoundingClientRect();
      const c = caixaDica.getBoundingClientRect();
      let topo = r.bottom + 8;
      if (topo + c.height > window.innerHeight - 8) topo = r.top - c.height - 8;
      let esquerda = r.left + r.width / 2 - c.width / 2;
      esquerda = Math.max(8, Math.min(esquerda, window.innerWidth - c.width - 8));
      caixaDica.style.top = Math.max(8, topo) + "px";
      caixaDica.style.left = esquerda + "px";
    };

    const mostrar = (el) => {
      const texto = el.getAttribute("data-dica");
      if (!texto) return;
      caixaDica.textContent = texto;
      caixaDica.classList.remove("oculto");
      posicionar(el);
    };

    const esconder = () => {
      clearTimeout(tempoDica);
      alvoDica = null;
      if (caixaDica) caixaDica.classList.add("oculto");
    };

    document.addEventListener("mouseover", (evento) => {
      const el = evento.target.closest ? evento.target.closest("[data-dica]") : null;
      if (!el || el === alvoDica) return;
      clearTimeout(tempoDica);
      alvoDica = el;
      tempoDica = setTimeout(() => mostrar(el), 250);
    });

    document.addEventListener("mouseout", (evento) => {
      const el = evento.target.closest ? evento.target.closest("[data-dica]") : null;
      if (el) esconder();
    });

    document.addEventListener("focusin", (evento) => {
      const el = evento.target.closest ? evento.target.closest("[data-dica]") : null;
      if (el) {
        alvoDica = el;
        clearTimeout(tempoDica);
        mostrar(el);
      }
    });

    document.addEventListener("focusout", esconder);
    document.addEventListener("click", esconder);
    window.addEventListener("scroll", esconder, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montarDicas);
  } else {
    montarDicas();
  }

  window.UI = {
    esc,
    MESES,
    MESES_ABREV,
    formatarData,
    formatarDataHora,
    paraInputData,
    paraInputDataHora,
    deInputDataHora,
    formatarMoeda,
    mesDeReferencia,
    SENHA_MIN,
    SENHA_REGRA_TEXTO,
    senhaErro,
    aviso,
    abrirModal,
    confirmar,
    svg,
    dica,
    ACOES_DICA,
    FILTROS_DICA,
  };
})();
