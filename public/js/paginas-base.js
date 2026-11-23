// ============================================================
// Base das páginas do painel: componentes e fábrica de tabelas.
// As páginas em si ficam em paginas-01/02/03.js.
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const PAGINAS = {};

  // ---------- Permissões (espelham as regras do servidor) ----------
  const PERFIS = {
    irmaos: ["admin", "veneravel", "chanceler"],
    familia: ["admin", "veneravel", "chanceler"],
    sessoes: ["admin", "veneravel", "secretario"],
    presenca: ["admin", "veneravel", "chanceler"],
    visitas: ["admin", "veneravel", "chanceler"],
    fraternidade: ["admin", "veneravel", "fraternidade"],
    financeiro: ["admin", "veneravel", "tesoureiro"],
    comunicados: ["admin", "veneravel", "secretario"],
    cargos: ["admin", "veneravel"],
    loja: ["admin", "veneravel"],
    usuarios: ["admin"],
  };
  const pode = (usuario, lista) => !!usuario && lista.includes(usuario.role);

  const ROTULO_CARGO = {
    admin: "Administrador",
    veneravel: "Venerável Mestre",
    secretario: "Secretário",
    chanceler: "Chanceler",
    tesoureiro: "Tesoureiro",
    fraternidade: "Fraternidade Feminina",
    irmao: "Irmão",
  };

  // ---------- Quem vê cada tela (menu e rotas) ----------
  // O administrador e o venerável têm acesso a todas as telas; cada
  // ofício enxerga as telas do seu ofício. Os demais perfis
  // (fraternidade e irmão) veem o calendário e o relatório por
  // irmão — o perfil "Irmão" vê apenas o próprio relatório.
  const TODOS = ["admin", "veneravel", "secretario", "chanceler", "tesoureiro", "fraternidade", "irmao"];
  const PERFIS_PAGINA = {
    venerancia: ["admin", "veneravel"],
    atas: ["veneravel", "secretario"],
    sessoes: ["admin", "veneravel", "secretario"],
    calendario: TODOS,
    comunicados: ["admin", "veneravel", "secretario"],
    documentos: ["admin", "veneravel", "secretario"],
    financeiro: ["admin", "veneravel", "tesoureiro"],
    caixa: ["admin", "veneravel", "tesoureiro"],
    "relatorio-financeiro": ["admin", "veneravel", "tesoureiro"],
    "relatorio-irmao": ["admin", "veneravel", "tesoureiro", "irmao"],
    irmaos: ["admin", "veneravel", "chanceler"],
    familia: ["admin", "veneravel", "chanceler"],
    frequencia: ["admin", "veneravel", "chanceler"],
    relatorios: ["admin", "veneravel", "chanceler"],
    loja: ["admin", "veneravel"],
    potencias: ["admin", "veneravel"],
    fraternidade: ["admin", "veneravel", "fraternidade"],
  };

  // ---------- Selos de situação ----------
  const SELOS = {
    ativo: ["Ativo", "verde"], afastado: ["Afastado", "ambar"], desligado: ["Desligado", "vermelho"],
    visitante: ["Visitante", "azul"], outro: ["Outro", "cinza"],
    presente: ["Presente", "verde"], ausente: ["Ausente", "vermelho"], justificado: ["Justificado", "ambar"],
    pendente: ["Pendente", "ambar"], pago: ["Pago", "verde"], isento: ["Isento", "cinza"], cancelado: ["Cancelado", "vermelho"],
    a_enviar: ["A enviar", "ambar"], concluido: ["Concluído", "verde"], devolvido: ["Devolvido", "vermelho"],
    aprovada_correcao: ["Aprovada", "verde"], recusada: ["Recusada", "vermelho"],
    rascunho: ["Rascunho", "cinza"], preparado: ["Preparado", "azul"], enviado: ["Enviado", "verde"], falhou: ["Falhou", "vermelho"],
    realizada: ["Realizada", "azul"], recebida: ["Recebida", "verde"],
    aprovada: ["Aprovada", "azul"], arquivada: ["Arquivada", "cinza"],
    entrada: ["Entrada", "verde"], saida: ["Saída", "vermelho"],
    vago: ["Vago", "cinza"],
    mensalidade: ["Mensalidade", "azul"], taxa_extra: ["Taxa extra", "roxo"], tronco: ["Tronco de Beneficência", "ambar"], doacao: ["Doação", "verde"],
    sim: ["Sim", "verde"], nao: ["Não", "cinza"],
  };
  function selo(valor) {
    const par = SELOS[valor];
    if (!par) return valor ? `<span class="selo selo-cinza">${esc(valor)}</span>` : "—";
    return `<span class="selo selo-${par[1]}">${esc(par[0])}</span>`;
  }

  // ---------- Componentes ----------
  function cabecalho(titulo, descricao, acoesHtml) {
    return `<div class="cabecalho-pagina">
      <div><h2>${esc(titulo)}</h2>${descricao ? `<p class="descricao">${esc(descricao)}</p>` : ""}</div>
      ${acoesHtml ? `<div class="acoes-pagina">${acoesHtml}</div>` : ""}
    </div>`;
  }

  function botaoNovo(rotulo) {
    return `<button type="button" class="botao botao-azul" data-papel="novo"${UI.dica(UI.ACOES_DICA().novo)}>${svg("mais", 16)} ${esc(rotulo || "Novo registro")}</button>`;
  }

  /** Cabeçalho de papel timbrado: aparece só na impressão (papel/PDF). */
  function cabecalhoImpressao(documento, extra) {
    return `<div class="apenas-impressao">
      <div class="papel-titulo">
        <div class="loja">Administração Loja X</div>
        <div class="potencia">Sistema de Gestão Administrativa</div>
        <div class="documento">${esc(documento)}</div>
        ${extra ? `<div class="potencia" style="margin-top:4px">${esc(extra)}</div>` : ""}
      </div>
    </div>`;
  }

  /** Assinaturas do rodapé do documento impresso. */
  function assinaturasImpressao(nomes) {
    const lista = nomes && nomes.length ? nomes : ["Venerável Mestre", "Secretário"];
    return `<div class="apenas-impressao"><div class="papel-assinatura">${lista
      .map((n) => `<div>${esc(n)}</div>`)
      .join("")}</div></div>`;
  }

  /** Manda a página atual para a impressora (ou "Salvar como PDF"). */
  function imprimir() {
    window.print();
  }

  /** Renderiza a tabela; a coluna de ações é preenchida depois (preencherAcoes). */
  function tabelaHtml(colunas, itens, opcoes = {}) {
    if (!itens.length) {
      return `<div class="vazio">${esc(opcoes.vazio || "Nenhum registro encontrado.")}</div>`;
    }
    const th = colunas.map((c) => `<th>${esc(c.rotulo)}</th>`).join("") + (opcoes.comAcoes ? "<th style=\"text-align:right\">Ações</th>" : "");
    const linhas = itens
      .map((item, i) => {
        const tds = colunas.map((c) => `<td>${c.valor(item) ?? "—"}</td>`).join("");
        return `<tr>${tds}${opcoes.comAcoes ? `<td><div class="acoes" data-acoes="${i}"></div></td>` : ""}</tr>`;
      })
      .join("");
    return `<div class="tabela-envolucro"><table class="tabela"><thead><tr>${th}</tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function botaoLinha(rotulo, tipo, icone, dicaTexto) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `botao ${tipo || "botao-claro"} botao-pequeno`;
    b.innerHTML = (icone ? svg(icone, 14) + " " : "") + rotulo;
    const texto = dicaTexto || UI.ACOES_DICA()[String(rotulo).toLowerCase()] || "";
    if (texto) b.setAttribute("data-dica", texto);
    return b;
  }

  // ---------- Formulários ----------
  function campoHtml(campo, valor) {
    const nome = esc(campo.nome);
    const id = `c-${campo.nome}`;
    const v = valor === null || valor === undefined ? campo.padrao ?? "" : valor;
    let controle;
    if (campo.tipo === "select") {
      const opcoes = (campo.opcoes || [])
        .map((o) => {
          const [v2, r2] = Array.isArray(o) ? o : [o, o];
          return `<option value="${esc(v2)}" ${String(v) === String(v2) ? "selected" : ""}>${esc(r2)}</option>`;
        })
        .join("");
      const vazio = campo.opcoesVazias ? `<option value="">${esc(campo.opcoesVazias)}</option>` : "";
      controle = `<select id="${id}" data-campo="${nome}">${vazio}${opcoes}</select>`;
    } else if (campo.tipo === "textarea") {
      controle = `<textarea id="${id}" data-campo="${nome}" rows="${campo.linhas || 4}">${esc(v)}</textarea>`;
    } else {
      const extra = [
        campo.min !== undefined ? `min="${campo.min}"` : "",
        campo.max !== undefined ? `max="${campo.max}"` : "",
        campo.passo !== undefined ? `step="${campo.passo}"` : "",
        campo.dica ? `placeholder="${esc(campo.dica)}"` : "",
      ].join(" ");
      controle = `<input id="${id}" data-campo="${nome}" type="${campo.tipo || "text"}" value="${esc(v)}" ${extra}>`;
    }
    return `<div class="campo ${campo.largo ? "largo" : ""}">
      <label for="${id}">${esc(campo.rotulo)}${campo.obrigatorio ? " *" : ""}</label>
      ${controle}
      ${campo.ajuda ? `<span class="ajuda">${esc(campo.ajuda)}</span>` : ""}
    </div>`;
  }

  function formularioHtml(campos, valores = {}) {
    return `<div class="grade-form">${campos.map((c) => campoHtml(c, valores[c.nome])).join("")}</div>`;
  }

  /** Lê os valores do formulário; valida campos obrigatórios. */
  function lerFormulario(raiz, campos) {
    const dados = {};
    for (const campo of campos) {
      const el = raiz.querySelector(`[data-campo="${campo.nome}"]`);
      if (!el) continue;
      let valor = el.value;
      if (campo.tipo === "number" && valor !== "") valor = Number(valor);
      if (campo.dataHora && valor) valor = UI.deInputDataHora(valor);
      if (campo.obrigatorio && (valor === "" || valor === null || valor === undefined)) {
        throw new Error(`Preencha o campo "${campo.rotulo}".`);
      }
      if (campo.nuloSeVazio && valor === "") valor = null;
      dados[campo.nome] = valor;
    }
    return dados;
  }

  // ---------- Abertura de formulário (criar/editar) ----------
  function abrirFormulario(cfg, item, recarregar) {
    const valores = item && cfg.valoresIniciais ? cfg.valoresIniciais(item) : cfg.valoresPadrao || {};
    const modal = UI.abrirModal({
      titulo: item ? `Editar — ${cfg.substantivo || cfg.titulo}` : cfg.rotuloNovo || "Novo registro",
      largo: cfg.modalLargo,
      corpo: formularioHtml(cfg.campos, valores) + (cfg.notaFormulario ? `<p class="ajuda mt8">${esc(cfg.notaFormulario)}</p>` : ""),
      botoes: [
        { rotulo: "Cancelar", tipo: "botao-claro" },
        {
          rotulo: item ? "Salvar alterações" : "Criar registro",
          tipo: "botao-azul",
          acao: async (m) => {
            const dados = lerFormulario(m.corpo, cfg.campos);
            const envio = cfg.aoEnviar ? cfg.aoEnviar(dados, item) : dados;
            if (envio === false) return false;
            // cfg.criar pode devolver um texto (ex.: "enviado para aprovação").
            let mensagem;
            if (cfg.criar) mensagem = await cfg.criar(envio, item);
            else if (item) await API.patch(`${cfg.caminho}/${item.id}`, envio);
            else await API.post(cfg.caminho, envio);
            UI.aviso(typeof mensagem === "string" ? mensagem : item ? "Alterações salvas." : "Registro criado com sucesso.", "ok", typeof mensagem === "string" ? 8000 : undefined);
            await recarregar();
          },
        },
      ],
    });
    const primeiro = modal.corpo.querySelector("input, select, textarea");
    if (primeiro) primeiro.focus();
  }

  // ---------- Correção financeira com aprovação do Venerável ----------
  // Pede ao tesoureiro o motivo da correção (vai para o Venerável aprovar).
  function pedirMotivo(acao) {
    return new Promise((resolve) => {
      UI.abrirModal({
        titulo: "Motivo da correção",
        corpo: `<p style="margin:0 0 10px;font-size:14px;line-height:1.6">Para ${esc(acao || "corrigir")} um lançamento já feito é preciso a
                 <strong>aprovação do Venerável Mestre</strong>. Explique o motivo: o pedido vai para ele aprovar.</p>
               <div class="campo largo"><label for="motivo-correcao">Motivo *</label>
               <textarea id="motivo-correcao" rows="3" placeholder="Ex.: valor digitado errado — o certo é R$ 150,00"></textarea></div>`,
        botoes: [
          { rotulo: "Cancelar", tipo: "botao-claro", acao: () => resolve(null) },
          {
            rotulo: "Enviar para aprovação",
            tipo: "botao-azul",
            acao: (m) => {
              const motivo = m.corpo.querySelector("#motivo-correcao").value.trim();
              if (motivo.length < 3) throw new Error("Escreva o motivo da correção.");
              resolve(motivo);
            },
          },
        ],
      });
      const campo = document.querySelector("#motivo-correcao");
      if (campo) campo.focus();
    });
  }

  /**
   * Envia uma alteração; se o servidor pedir o motivo (correção do
   * tesoureiro), pergunta e reenvia. Devolve a mensagem quando o pedido
   * ficou aguardando o Venerável.
   */
  async function enviarComMotivo(metodo, caminho, corpo) {
    const tentar = (motivo) => {
      if (metodo === "DELETE") return API.del(motivo ? `${caminho}?motivo=${encodeURIComponent(motivo)}` : caminho);
      return API.patch(caminho, motivo ? { ...corpo, motivo_correcao: motivo } : corpo);
    };
    let r;
    try {
      r = await tentar();
    } catch (err) {
      if (err.codigo !== "motivo_obrigatorio") throw err;
      const motivo = await pedirMotivo(metodo === "DELETE" ? "excluir" : "corrigir");
      // Cancelou: a janela do formulário já foi trocada pela do motivo,
      // então só avisa (nada foi alterado).
      if (!motivo) return "Correção cancelada — nada foi alterado.";
      r = await tentar(motivo);
    }
    return r && r.pendente_aprovacao ? r.message : undefined;
  }

  // ---------- Exclusão ----------
  async function excluirRegistro(cfg, item, recarregar) {
    const nome = cfg.nomeDoItem ? cfg.nomeDoItem(item) : "este registro";
    const ok = await UI.confirmar(`Excluir ${nome}? Esta ação não pode ser desfeita.`, {
      titulo: "Confirmar exclusão",
      rotuloOk: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    await API.del(`${cfg.caminho}/${item.id}`);
    UI.aviso("Registro excluído.", "ok");
    await recarregar();
  }

  // ---------- Fábrica de páginas CRUD ----------
  function paginaCrud(cfg) {
    return async function render(el, ctx) {
      const filtros = {};
      (cfg.filtros || []).forEach((f) => {
        filtros[f.nome] = f.padrao || "";
      });
      let itens = [];

      const htmlAcoes = () => {
        const partes = [];
        if (cfg.acoesExtras) partes.push(...cfg.acoesExtras(ctx));
        if (!cfg.semBotaoNovo && pode(ctx.usuario, cfg.permissao || PERFIS.irmaos)) {
          partes.push(botaoNovo(cfg.rotuloNovo));
        }
        return partes.join("");
      };

      const htmlFiltros = () => {
        if (!cfg.filtros || !cfg.filtros.length) return "";
        const dicas = UI.FILTROS_DICA();
        const campos = cfg.filtros
          .map((f) => {
            const id = `f-${f.nome}`;
            const lembrete = UI.dica(f.lembrete || dicas[f.nome] || "");
            if (f.tipo === "select") {
              const ops = (f.opcoes || [])
                .map((o) => {
                  const [v, r] = Array.isArray(o) ? o : [o, o];
                  return `<option value="${esc(v)}" ${String(filtros[f.nome]) === String(v) ? "selected" : ""}>${esc(r)}</option>`;
                })
                .join("");
              return `<div class="campo"${lembrete}><label for="${id}">${esc(f.rotulo)}</label><select id="${id}" data-filtro="${f.nome}"><option value="">${esc(f.todos || "Todos")}</option>${ops}</select></div>`;
            }
            return `<div class="campo"${lembrete}><label for="${id}">${esc(f.rotulo)}</label><input id="${id}" data-filtro="${f.nome}" type="${f.tipo === "date" ? "date" : "text"}" value="${esc(filtros[f.nome])}" placeholder="${esc(f.dica || "")}"></div>`;
          })
          .join("");
        return `<div class="filtros-barra">${campos}</div>`;
      };

      const consulta = () => {
        if (!cfg.montarConsulta) return "";
        return cfg.montarConsulta(filtros);
      };

      async function recarregar() {
        const q = consulta();
        const dados = await API.get(`${cfg.caminho}${q ? "?" + q : ""}`);
        itens = dados.items || [];
        const area = el.querySelector("#area-tabela");
        const comAcoes = !!cfg.acoesLinha || (pode(ctx.usuario, cfg.permissaoEditar || cfg.permissao || []) || cfg.podeExcluir);
        area.innerHTML = tabelaHtml(cfg.colunas, itens, { vazio: cfg.vazio, comAcoes });
        if (comAcoes) preencherAcoes(el.querySelector("#area-tabela"), itens);
        if (cfg.aposRecarregar) cfg.aposRecarregar(el, ctx, itens);
      }

      function preencherAcoes(raiz, lista) {
        raiz.querySelectorAll("[data-acoes]").forEach((td) => {
          const i = Number(td.dataset.acoes);
          const item = lista[i];
          const escreve = pode(ctx.usuario, cfg.permissao || []);

          if (cfg.acoesLinha) {
            for (const acao of cfg.acoesLinha(item, ctx) || []) {
              const b = botaoLinha(acao.rotulo, acao.tipo || "botao-claro", acao.icone);
              b.addEventListener("click", () => acao.executar(item));
              td.appendChild(b);
            }
          }
          if (cfg.podeEditar !== false && escreve && !cfg.semEditar) {
            const b = botaoLinha("Editar", "botao-claro", "editar");
            b.addEventListener("click", () => abrirFormulario(cfg, item, recarregar));
            td.appendChild(b);
          }
          const podeExcluir = typeof cfg.podeExcluir === "function" ? cfg.podeExcluir(ctx.usuario, item) : cfg.podeExcluir;
          if (podeExcluir && !cfg.semExcluir) {
            const b = botaoLinha("Excluir", "botao-perigo", "lixo");
            b.addEventListener("click", () => excluirRegistro(cfg, item, recarregar));
            td.appendChild(b);
          } else if (cfg.acaoExtraExclusao) {
            // custom deletion-like action handled by acoesLinha
          }
          if (!td.children.length) td.innerHTML = '<span class="texto-suave">—</span>';
        });
      }

      async function carregar() {
        el.innerHTML =
          cabecalho(cfg.titulo, cfg.descricao, htmlAcoes()) +
          `<div class="cartao">${htmlFiltros()}<div id="area-tabela"><p class="carregando">Carregando...</p></div></div>`;

        el.querySelectorAll("[data-filtro]").forEach((campo) => {
          const evento = campo.tagName === "SELECT" ? "change" : "input";
          let tempo = null;
          campo.addEventListener(evento, () => {
            filtros[campo.dataset.filtro] = campo.value;
            clearTimeout(tempo);
            tempo = setTimeout(() => recarregar().catch(mostrarErro), campo.tagName === "SELECT" ? 0 : 320);
          });
        });

        const botaoCriar = el.querySelector('[data-papel="novo"]');
        if (botaoCriar) botaoCriar.addEventListener("click", () => abrirFormulario(cfg, null, recarregar));
        if (cfg.aposMontar) cfg.aposMontar(el, ctx, { recarregar });

        const carregando = el.querySelector("#area-tabela");
        if (carregando) carregando.innerHTML = '<p class="carregando">Carregando...</p>';
        await recarregar();
      }

      function mostrarErro(err) {
        const area = el.querySelector("#area-tabela");
        if (area) area.innerHTML = `<div vazio class="vazio">Erro: ${esc(err.message)}</div>`;
      }

      await carregar();
    };
  }

  // ---------- Avisos internos (ex.: evento da Fraternidade) ----------
  // Insere no topo da página os avisos pendentes do perfil do usuário.
  // O botão "Ciente" marca o aviso — some para todos do mesmo perfil.
  async function mostrarAvisos(container, ctx) {
    let itens = [];
    try {
      itens = (await API.get("/notifications?pendentes=1")).items || [];
    } catch {
      return; // avisos nunca impedem a página de abrir
    }
    if (!itens.length) return;

    const cartao = document.createElement("div");
    cartao.className = "cartao";
    container.insertBefore(cartao, container.firstChild);

    function desenhar() {
      if (!itens.length) {
        cartao.remove();
        return;
      }
      cartao.innerHTML =
        `<h3 class="cartao-titulo">${svg("sino", 17)} AVISOS PARA VOCÊ</h3>
         <div class="lista-avisos">${itens
           .map(
             (a) => `<div class="aviso-item">
               <div class="aviso-texto">
                 <div class="titulo-aviso">${esc(a.title)}</div>
                 ${a.message ? `<div class="texto-suave" style="font-size:13px">${esc(a.message)}</div>` : ""}
                 <div class="texto-suave" style="font-size:12px;margin-top:2px">${UI.formatarDataHora(a.created_at)}${a.created_by_name ? ` • por ${esc(a.created_by_name)}` : ""}</div>
               </div>
               <div class="aviso-acoes">
                 ${a.page && PAGINAS[a.page] && ctx && ctx.irPara ? `<button type="button" class="botao botao-claro botao-pequeno" data-ver="${esc(a.id)}">Ver</button>` : ""}
                 <button type="button" class="botao botao-azul botao-pequeno" data-ciente="${esc(a.id)}">Ciente</button>
               </div>
             </div>`,
           )
           .join("")}</div>`;

      cartao.querySelectorAll("[data-ver]").forEach((b) =>
        b.addEventListener("click", () => {
          const a = itens.find((x) => x.id === b.dataset.ver);
          if (a && a.page && ctx && ctx.irPara) ctx.irPara(a.page);
        }),
      );
      cartao.querySelectorAll("[data-ciente]").forEach((b) =>
        b.addEventListener("click", async () => {
          b.disabled = true;
          try {
            await API.post(`/notifications/${b.dataset.ciente}/ciente`, {});
            itens = itens.filter((x) => x.id !== b.dataset.ciente);
            UI.aviso("Aviso marcado como ciente.", "ok");
            desenhar();
          } catch (err) {
            UI.aviso(err.message, "erro");
            b.disabled = false;
          }
        }),
      );
    }
    desenhar();
  }

  window.PW = {
    PAGINAS, PERFIS, PERFIS_PAGINA, pode, ROTULO_CARGO, selo, SELOS,
    cabecalho, botaoNovo, botaoLinha, tabelaHtml,
    campoHtml, formularioHtml, lerFormulario,
    abrirFormulario, excluirRegistro, paginaCrud, pedirMotivo, enviarComMotivo,
    cabecalhoImpressao, assinaturasImpressao, imprimir,
    mostrarAvisos,
  };
})();
