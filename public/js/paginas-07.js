// ============================================================
// Tesouraria: caixa (contabilidade e quem deve), relatório
// financeiro completo e relatório por irmão.
// ============================================================
(function () {
  "use strict";

  const UI = window.UI;
  const { esc, svg } = UI;
  const PW = window.PW;
  const { PAGINAS, pode, cabecalho, cabecalhoImpressao, assinaturasImpressao, tabelaHtml } = PW;

  const PERMISSAO = ["admin", "veneravel", "tesoureiro"];
  const PERMISSAO_LER = ["admin", "veneravel", "tesoureiro"];

  // Rótulos dos motivos (caixa + contribuições), usados nos relatórios.
  const ROTULOS_CATEGORIA = {
    mensalidade: "Mensalidade",
    taxa_extra: "Taxa extra",
    tronco: "Tronco de Beneficência",
    doacao: "Doação",
    outro: "Outro",
    obras: "Pagamento de obras",
    agua: "Água",
    luz: "Luz",
    gob: "GOB",
    gobgo: "GOB-GO",
    retirada: "Retirada do caixa",
    beneficencia: "Beneficência",
    retirada_tronco: "Retirada do Tronco (ata)",
    internet: "Internet",
    aluguel: "Aluguel",
  };
  const rotuloCategoria = (chave) => ROTULOS_CATEGORIA[chave] || chave || "—";
  const dataBR = (v) => (v ? UI.formatarData(v) : "—");
  const anosDisponiveis = () => {
    const a = new Date().getFullYear();
    return [a - 3, a - 2, a - 1, a, a + 1];
  };

  function cartaoDinheiro(classe, rotulo, valor, detalhe) {
    return `<div class="cartao-dinheiro ${classe}">
      <div class="rotulo">${esc(rotulo)}</div>
      <div class="valor">${esc(valor)}</div>
      <div class="detalhe">${esc(detalhe || "")}</div>
    </div>`;
  }

  function periodoTexto(de, ate) {
    if (!de || !ate) return "período completo";
    return `${dataBR(de)} a ${dataBR(ate)}`;
  }

  // ════════════════════════════ CAIXA ════════════════════════════
  // Só contabilidade: o que tinha, o que
  // entrou, o que saiu, o saldo e quem deve. Os lançamentos são feitos
  // no Financeiro.

  PAGINAS.caixa = {
    titulo: "Caixa",
    icone: "caixa",
    async render(el, ctx) {
      const podeLancar = pode(ctx.usuario, PERMISSAO);
      const filtros = { ano: String(new Date().getFullYear()), mes: String(new Date().getMonth() + 1).padStart(2, "0"), de: "", ate: "" };
      let extrato = null;
      let devedores = { items: [], total: 0, devedores: 0 };

      function query() {
        const q = new URLSearchParams();
        if (filtros.de && filtros.ate) {
          q.set("from", filtros.de);
          q.set("to", filtros.ate);
        } else {
          if (filtros.ano) q.set("ano", filtros.ano);
          if (filtros.mes) q.set("mes", filtros.mes);
        }
        return q.toString();
      }

      async function carregar() {
        const [e, d] = await Promise.all([
          API.get(`/cash/extrato?${query()}`),
          API.get("/contributions/devedores").catch(() => devedores),
        ]);
        extrato = e;
        devedores = d;
      }

      function filtrosHtml() {
        const dicas = UI.FILTROS_DICA();
        const meses = UI.MESES.map((nome, i) => [String(i + 1).padStart(2, "0"), nome]);
        return `<div class="filtros-barra">
          <div class="campo"${UI.dica(dicas.ano)}><label for="f-ano">Ano</label><select id="f-ano" data-filtro="ano">
            ${anosDisponiveis().map((a) => `<option value="${a}" ${filtros.ano === String(a) ? "selected" : ""}>${a}</option>`).join("")}
          </select></div>
          <div class="campo"${UI.dica(dicas.mes)}><label for="f-mes">Mês</label><select id="f-mes" data-filtro="mes">
            <option value="">Ano inteiro</option>
            ${meses.map(([v, r]) => `<option value="${v}" ${filtros.mes === v ? "selected" : ""}>${esc(r)}</option>`).join("")}
          </select></div>
          <div class="campo"${UI.dica(dicas.de + " Se usar as duas datas, elas têm prioridade sobre ano e mês.")}><label for="f-de">Período de</label><input id="f-de" type="date" data-filtro="de" value="${esc(filtros.de)}"></div>
          <div class="campo"${UI.dica(dicas.ate)}><label for="f-ate">até</label><input id="f-ate" type="date" data-filtro="ate" value="${esc(filtros.ate)}"></div>
        </div>`;
      }

      const moeda = (v) => UI.formatarMoeda(v);
      const valorComSinal = (l) =>
        `<strong style="color:${l.kind === "entrada" ? "var(--verde)" : "var(--vermelho)"}">${l.kind === "entrada" ? "+" : "−"} ${moeda(l.amount)}</strong>`;
      const rotuloFundo = (f) => (f === "tronco" ? "Tronco de Beneficência" : "Loja");

      // Link do WhatsApp com a mensagem de cobrança preenchida (modelo de
      // comunicado "Pendências financeiras", em presets.js).
      function linkCobranca(d) {
        const digitos = String(d.phone || "").replace(/\D/g, "");
        const P = window.PRESETS_COMUNICADO;
        if (digitos.length < 10 || !P) return "";
        const numero = digitos.length >= 12 ? digitos : "55" + digitos;
        const modelo = P.MODELOS.find((m) => m.assunto.startsWith("Pendências financeiras"));
        if (!modelo) return "";
        const reais = (n) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const detalhes = (d.itens || [])
          .map(
            (i) =>
              `• ${rotuloCategoria(i.contribution_type)}${i.description ? ` (${i.description})` : ""} — ${UI.mesDeReferencia(i.reference_month)}: R$ ${reais(i.amount)}`,
          )
          .join("\n");
        const texto = P.preencher(modelo.texto, { ...P.dadosPadrao(), nome: d.nome, detalhes, valor: reais(d.total) });
        return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
      }

      // Balancete: receitas e despesas do período agrupadas por motivo.
      function balancete(items) {
        const grupos = { entrada: {}, saida: {} };
        for (const l of items) {
          const chave = l.category;
          grupos[l.kind][chave] = (grupos[l.kind][chave] || 0) + Number(l.amount);
        }
        const linhas = (kind) =>
          Object.entries(grupos[kind])
            .sort((a, b) => b[1] - a[1])
            .map(([cat, total]) => `<tr><td>${esc(rotuloCategoria(cat))}</td><td style="text-align:right">${moeda(total)}</td></tr>`)
            .join("") || '<tr><td colspan="2" class="texto-suave">Nada no período.</td></tr>';
        const soma = (kind) => Object.values(grupos[kind]).reduce((s, v) => s + v, 0);
        return `<div class="balancete">
          <div class="tabela-envolucro"><table class="tabela">
            <thead><tr><th>Receitas (entrou)</th><th style="text-align:right">Valor</th></tr></thead>
            <tbody>${linhas("entrada")}<tr><td><strong>Total de receitas</strong></td><td style="text-align:right;color:var(--verde)"><strong>${moeda(soma("entrada"))}</strong></td></tr></tbody>
          </table></div>
          <div class="tabela-envolucro"><table class="tabela">
            <thead><tr><th>Despesas (saiu)</th><th style="text-align:right">Valor</th></tr></thead>
            <tbody>${linhas("saida")}<tr><td><strong>Total de despesas</strong></td><td style="text-align:right;color:var(--vermelho)"><strong>${moeda(soma("saida"))}</strong></td></tr></tbody>
          </table></div>
        </div>`;
      }

      function cartaoValor(classe, rotulo, valor, detalhe) {
        const html = cartaoDinheiro(classe, rotulo, moeda(valor), detalhe);
        return Number(valor) < 0 ? html.replace('class="valor"', 'class="valor negativo"') : html;
      }

      function desenhar() {
        const e = extrato;
        const a = e.acumulado;
        const periodo = periodoTexto(e.de, e.ate);
        const acoes = [];
        if (podeLancar) {
          acoes.push(
            `<a class="botao botao-azul" href="#/financeiro"${UI.dica("Entradas, saídas e cobranças são lançadas no Financeiro.")}>${svg("financeiro", 16)} Lançar no Financeiro</a>`,
          );
        }
        acoes.push(
          `<button type="button" class="botao botao-claro" id="imprimir-caixa"${UI.dica("Imprime (ou salva em PDF) o balancete e a contabilidade do período, com o timbre da Loja e espaço para assinaturas.")}>${svg("imprimir", 16)} Imprimir balancete</button>`,
        );

        const linhaFundo = (nome, f) => `<tr>
            <td><strong>${esc(nome)}</strong></td>
            <td style="text-align:right">${moeda(f.anterior)}</td>
            <td style="text-align:right;color:var(--verde)">+ ${moeda(f.entradas)}</td>
            <td style="text-align:right;color:var(--vermelho)">− ${moeda(f.saidas)}</td>
            <td style="text-align:right"><strong class="${f.final < 0 ? "valor-negativo" : ""}">${moeda(f.final)}</strong></td>
          </tr>`;

        el.innerHTML =
          cabecalho(
            "Caixa",
            "Contabilidade da Loja: o que tinha, o que entrou, o que saiu, o saldo e quem deve. Os lançamentos são feitos no Financeiro.",
            acoes.join(""),
          ) +
          cabecalhoImpressao("Balancete e Movimento de Caixa", periodo) +
          `<h3 class="cartao-titulo" style="margin:0 0 8px">${svg("caixa", 17)} SALDOS DE HOJE</h3>
           <div class="cartoes-dinheiro tres-fundos">
             ${cartaoValor("disponivel", "Saldo da Loja", a.total, "tudo o que entrou − tudo o que saiu")}
             ${cartaoValor("saldo", "Disponível", a.disponivel, "saldo da Loja sem o Tronco de Beneficência")}
             ${cartaoValor("tronco", "Tronco de Beneficência", a.tronco.saldo, "reservado — só sai pela beneficência ou retirada aprovada em ata")}
           </div>
           ${
             a.devido_ao_tronco > 0
               ? `<div class="aviso-tronco">${svg("alerta", 18)} <div><strong>A Loja deve ${moeda(a.devido_ao_tronco)} ao Tronco de Beneficência.</strong><br>
                  O dinheiro da beneficência foi usado em outras despesas e precisa ser reposto. O saldo do tronco continua o mesmo: ele não é dinheiro para gastos gerais da Loja.</div></div>`
               : ""
           }
           ${
             a.tronco.saldo < 0
               ? `<div class="aviso-tronco">${svg("alerta", 18)} <div><strong>O Tronco de Beneficência está negativo (${moeda(a.tronco.saldo)}).</strong><br>
                  Saiu mais beneficência do que entrou no tronco. Confira os lançamentos de beneficência e de retirada do Tronco.</div></div>`
               : ""
           }
           <h3 class="cartao-titulo" style="margin:4px 0 8px">${svg("calendario", 17)} PERÍODO: ${esc(periodo.toUpperCase())}</h3>` +
          filtrosHtml() +
          `<div class="cartoes-dinheiro quatro">
             ${cartaoValor("saldo", "Saldo anterior", e.saldo_anterior, "antes do início do período")}
             ${cartaoValor("entrada", "Entrou", e.entradas, "cobranças pagas + entradas avulsas")}
             ${cartaoValor("saida", "Saiu", e.saidas, "despesas, retiradas e beneficência")}
             ${cartaoValor("disponivel", "Saldo no fim do período", e.saldo_final, `${e.items.length} lançamento(s)`)}
           </div>
           <div class="cartao">
             <h3 class="cartao-titulo">${svg("relatorios", 17)} CONTABILIDADE POR FUNDO</h3>
             <div class="tabela-envolucro"><table class="tabela">
               <thead><tr><th>Fundo</th><th style="text-align:right">Tinha</th><th style="text-align:right">Entrou</th><th style="text-align:right">Saiu</th><th style="text-align:right">Saldo</th></tr></thead>
               <tbody>
                 ${linhaFundo("Loja (disponível)", e.fundos.geral)}
                 ${linhaFundo("Tronco de Beneficência", e.fundos.tronco)}
                 <tr>
                   <td><strong>Total da Loja</strong></td>
                   <td style="text-align:right">${moeda(e.saldo_anterior)}</td>
                   <td style="text-align:right;color:var(--verde)">+ ${moeda(e.entradas)}</td>
                   <td style="text-align:right;color:var(--vermelho)">− ${moeda(e.saidas)}</td>
                   <td style="text-align:right"><strong>${moeda(e.saldo_final)}</strong></td>
                 </tr>
               </tbody>
             </table></div>
           </div>
           <div class="cartao">
             <h3 class="cartao-titulo">${svg("relatorios", 17)} BALANCETE DO PERÍODO — RECEITAS E DESPESAS POR MOTIVO</h3>
             ${balancete(e.items)}
             <p class="texto-suave" style="font-size:12.5px;margin:10px 0 0">
               Para a prestação de contas em sessão e ao GOB: escolha o mês nos filtros e use “Imprimir balancete” (ou salve em PDF).
             </p>
           </div>
           <div class="cartao">
             <h3 class="cartao-titulo">${svg("financeiro", 17)} EXTRATO DO PERÍODO</h3>
             ${tabelaHtml(
               [
                 { rotulo: "Data", valor: (l) => dataBR(l.data) },
                 { rotulo: "Origem", valor: (l) => (l.origem === "caixa" ? "Lançamento avulso" : "Cobrança paga") },
                 { rotulo: "Fundo", valor: (l) => esc(rotuloFundo(l.fundo)) },
                 {
                   rotulo: "Descrição",
                   valor: (l) =>
                     `${esc(l.description || "—")}${l.approval_ref ? `<br><span class="texto-suave" style="font-size:12px">Aprovação: ${esc(l.approval_ref)}</span>` : ""}`,
                 },
                 { rotulo: "Motivo", valor: (l) => esc(rotuloCategoria(l.category)) },
                 { rotulo: "Valor", valor: valorComSinal },
                 { rotulo: "Saldo", valor: (l) => `<span class="${l.saldo < 0 ? "valor-negativo" : ""}">${moeda(l.saldo)}</span>` },
               ],
               e.items,
               { vazio: "Nada entrou nem saiu neste período." },
             )}
           </div>
           <div class="cartao">
             <h3 class="cartao-titulo">${svg("alerta", 17)} QUEM DEVE — ${devedores.devedores} pendente(s), total ${moeda(devedores.total)}</h3>
             ${tabelaHtml(
               [
                 { rotulo: "Irmão / contribuinte", valor: (d) => `<strong>${esc(d.nome)}</strong>${d.phone ? `<br><span class="texto-suave" style="font-size:12px">${esc(d.phone)}</span>` : ""}` },
                 { rotulo: "Em aberto desde", valor: (d) => esc(UI.mesDeReferencia(d.desde)) },
                 {
                   rotulo: "O que deve",
                   valor: (d) =>
                     (d.itens || [])
                       .map(
                         (i) =>
                           `${esc(rotuloCategoria(i.contribution_type))}${i.description ? ` (${esc(i.description)})` : ""} — ${esc(UI.mesDeReferencia(i.reference_month))}: ${moeda(i.amount)}`,
                       )
                       .join("<br>"),
                 },
                 { rotulo: "Total", valor: (d) => `<strong style="color:var(--vermelho)">${moeda(d.total)}</strong>` },
                 {
                   rotulo: "Cobrar",
                   valor: (d) => {
                     const link = linkCobranca(d);
                     return link
                       ? `<a class="botao botao-claro botao-pequeno nao-imprimir" href="${esc(link)}" target="_blank" rel="noopener"${UI.dica("Abre o WhatsApp com a mensagem de cobrança pronta (modelo “Pendências financeiras”).")}>${svg("whatsapp", 14)} WhatsApp</a>`
                       : '<span class="texto-suave" style="font-size:12px">sem telefone</span>';
                   },
                 },
               ],
               devedores.items || [],
               { vazio: "Ninguém está devendo. Todas as cobranças estão em dia." },
             )}
           </div>` +
          assinaturasImpressao(["Tesoureiro", "Venerável Mestre"]);

        el.querySelectorAll("[data-filtro]").forEach((campo) => {
          campo.addEventListener("change", async () => {
            filtros[campo.dataset.filtro] = campo.value;
            await recarregar();
          });
        });
        el.querySelector("#imprimir-caixa").addEventListener("click", () => window.print());
      }

      async function recarregar() {
        try {
          await carregar();
          desenhar();
        } catch (err) {
          el.innerHTML = cabecalho("Caixa", esc(err.message));
        }
      }

      await recarregar();
    },
  };

  // ═══════════════════════ RELATÓRIO FINANCEIRO ═══════════════════════

  PAGINAS["relatorio-financeiro"] = {
    titulo: "Relatório Financeiro",
    icone: "relatorios",
    async render(el, ctx) {
      if (!pode(ctx.usuario, PERMISSAO_LER)) {
        el.innerHTML = cabecalho("Relatório Financeiro", "Apenas o venerável e a tesouraria têm acesso a este relatório.");
        return;
      }
      const filtros = { ano: String(new Date().getFullYear()), mes: "", de: "", ate: "" };
      let dados = { items: [], totais: {}, por_categoria: [], de: "", ate: "" };

      function query() {
        const q = new URLSearchParams();
        const nomes = { de: "from", ate: "to" };
        Object.entries(filtros).forEach(([chave, valor]) => {
          if (valor) q.set(nomes[chave] || chave, valor);
        });
        return q.toString();
      }

      async function carregar() {
        dados = await API.get(`/reports/financeiro?${query()}`);
      }

      function filtrosHtml() {
        const dicas = UI.FILTROS_DICA();
        const meses = UI.MESES.map((nome, i) => [String(i + 1).padStart(2, "0"), nome]);
        return `<div class="filtros-barra">
          <div class="campo"${UI.dica(dicas.ano)}><label for="r-ano">Ano</label><select id="r-ano" data-filtro="ano">
            <option value="">Todos</option>
            ${anosDisponiveis().map((a) => `<option value="${a}" ${filtros.ano === String(a) ? "selected" : ""}>${a}</option>`).join("")}
          </select></div>
          <div class="campo"${UI.dica(dicas.mes)}><label for="r-mes">Mês</label><select id="r-mes" data-filtro="mes">
            <option value="">Ano inteiro</option>
            ${meses.map(([v, r]) => `<option value="${v}" ${filtros.mes === v ? "selected" : ""}>${esc(r)}</option>`).join("")}
          </select></div>
          <div class="campo"${UI.dica(dicas.de)}><label for="r-de">Período de</label><input id="r-de" type="date" data-filtro="de" value="${esc(filtros.de)}"></div>
          <div class="campo"${UI.dica(dicas.ate)}><label for="r-ate">até</label><input id="r-ate" type="date" data-filtro="ate" value="${esc(filtros.ate)}"></div>
        </div>`;
      }

      function desenhar() {
        const t = dados.totais || { entradas: 0, saidas: 0, saldo: 0, lancamentos: 0 };
        const periodo = periodoTexto(dados.de, dados.ate);
        const acoes = [
          `<button type="button" class="botao botao-azul" id="imprimir-rel"${UI.dica("Imprime (ou salva em PDF) o relatório do período, com o timbre da Loja.")}>${svg("imprimir", 16)} Imprimir / Salvar em PDF</button>`,
        ];

        el.innerHTML =
          cabecalho(
            "Relatório Financeiro",
            "Todas as entradas e saídas da Loja no período: mensalidades recebidas, tronco, doações, contas pagas e retiradas do caixa.",
            acoes.join(""),
          ) +
          cabecalhoImpressao("Relatório Financeiro", periodo) +
          filtrosHtml() +
          `<div class="cartoes-dinheiro">
             ${cartaoDinheiro("entrada", "Total de entradas", UI.formatarMoeda(t.entradas), "mensalidades, tronco, doações e outras entradas")}
             ${cartaoDinheiro("saida", "Total de saídas", UI.formatarMoeda(t.saidas), "contas, obras, GOB, retiradas e beneficência")}
             ${cartaoDinheiro("saldo", "Saldo do período", UI.formatarMoeda(t.saldo), `${t.lancamentos || 0} lançamento(s) — ${periodo}`)}
           </div>` +
          `<div class="cartao">
             <h3 class="cartao-titulo">${svg("relatorios", 17)} RESUMO POR MOTIVO</h3>
             ${
               (dados.por_categoria || []).length
                 ? `<div class="tabela-envolucro"><table class="tabela"><thead><tr><th>Movimento</th><th>Motivo</th><th style="text-align:right">Total</th></tr></thead><tbody>
                   ${dados.por_categoria
                     .map(
                       (c) => `<tr>
                         <td>${PW.selo(c.kind)}</td>
                         <td>${esc(rotuloCategoria(c.category))}</td>
                         <td style="text-align:right"><strong>${UI.formatarMoeda(c.total)}</strong></td>
                       </tr>`,
                     )
                     .join("")}
                 </tbody></table></div>`
                 : '<p class="texto-suave" style="font-size:13px;margin:0">Nenhum lançamento no período.</p>'
             }
           </div>` +
          `<div class="cartao">
             <h3 class="cartao-titulo">${svg("financeiro", 17)} ENTRADAS E SAÍDAS — ${esc(periodo.toUpperCase())}</h3>
             ${tabelaHtml(
               [
                 { rotulo: "Data", valor: (l) => dataBR(l.data) },
                 { rotulo: "Origem", valor: (l) => (l.origem === "caixa" ? "Lançamento avulso" : "Cobrança paga") },
                 { rotulo: "Descrição", valor: (l) => esc(l.description || "—") },
                 { rotulo: "Motivo", valor: (l) => esc(rotuloCategoria(l.category)) },
                 { rotulo: "Referência", valor: (l) => (l.reference_month ? UI.mesDeReferencia(l.reference_month) : "—") },
                 {
                   rotulo: "Valor",
                   valor: (l) =>
                     `<strong style="color:${l.kind === "entrada" ? "var(--verde)" : "var(--vermelho)"}">${l.kind === "entrada" ? "+" : "−"} ${UI.formatarMoeda(l.amount)}</strong>`,
                 },
               ],
               dados.items || [],
               { vazio: "Nenhum lançamento no período escolhido." },
             )}
             <div class="mt16" style="display:flex;gap:20px;justify-content:flex-end;flex-wrap:wrap">
               <span><strong>Entradas:</strong> <span style="color:var(--verde)">${UI.formatarMoeda(t.entradas)}</span></span>
               <span><strong>Saídas:</strong> <span style="color:var(--vermelho)">${UI.formatarMoeda(t.saidas)}</span></span>
               <span><strong>Saldo:</strong> ${UI.formatarMoeda(t.saldo)}</span>
             </div>
           </div>` +
          assinaturasImpressao(["Tesoureiro", "Venerável Mestre"]);

        el.querySelectorAll("[data-filtro]").forEach((campo) => {
          campo.addEventListener("change", async () => {
            filtros[campo.dataset.filtro] = campo.value;
            await carregar();
            desenhar();
          });
        });
        el.querySelector("#imprimir-rel").addEventListener("click", () => window.print());
      }

      await carregar();
      desenhar();
    },
  };

  // ═══════════════════════ RELATÓRIO POR IRMÃO ═══════════════════════

  PAGINAS["relatorio-irmao"] = {
    titulo: "Relatório por Irmão",
    icone: "irmaos",
    async render(el, ctx) {
      // Quem lança as contribuições (admin, venerável e tesoureiro) escolhe
      // qualquer irmão; o perfil "Irmão" vê apenas o próprio relatório
      // (a conta vinculada ao cadastro).
      const perfisLivres = ["admin", "veneravel", "tesoureiro"];
      const soProprio = !pode(ctx.usuario, perfisLivres);

      if (soProprio && !ctx.usuario.brother_id) {
        el.innerHTML = cabecalho(
          "Relatório por Irmão",
          "Sua conta ainda não está vinculada a um cadastro de irmão. Peça ao administrador do sistema para vincular e o seu relatório aparecerá aqui.",
        );
        return;
      }

      const anos = anosDisponiveis();
      let irmaos = [];
      let escolhido = soProprio ? ctx.usuario.brother_id : "";
      let ano = String(new Date().getFullYear());
      let dados = null;

      if (!soProprio) {
        const { items } = await API.get("/brothers?limit=300");
        irmaos = items || [];
      }

      async function carregar() {
        if (!escolhido) {
          dados = null;
          return;
        }
        dados = await API.get(`/reports/irmao/${escolhido}?ano=${ano}`);
      }

      function desenhar() {
        const t = (dados && dados.totais) || { pago: 0, pendente: 0, isento: 0, meses_abertos: 0 };
        const irm = (dados && dados.irmao) || {};
        const acoes = [
          `<button type="button" class="botao botao-azul" id="imprimir-irmao"${dados ? UI.dica("Imprime (ou salva em PDF) o relatório deste irmão, com o timbre da Loja.") : " disabled"}>${svg("imprimir", 16)} Imprimir / Salvar em PDF</button>`,
        ];

        el.innerHTML =
          cabecalho(
            "Relatório por Irmão",
            soProprio
              ? "As suas contribuições: o que já foi pago, o que está pendente e o histórico mês a mês."
              : "O que cada irmão já pagou, o que está pendente e o histórico mês a mês. Escolha o irmão e o ano.",
            acoes.join(""),
          ) +
          cabecalhoImpressao("Relatório de Contribuições do Irmão", dados ? `${irm.full_name || ""} — ${ano}` : "") +
          `<div class="cartao">
             <h3 class="cartao-titulo">${svg("busca", 17)} ${soProprio ? "SEU RELATÓRIO" : "ESCOLHA O IRMÃO"}</h3>
             <div class="filtros-barra">
               ${
                 soProprio
                   ? ""
                   : `<div class="campo" style="flex:1 1 320px"${UI.dica(UI.FILTROS_DICA().irmao)}>
                        <label for="i-irmao">Irmão</label>
                        <select id="i-irmao" data-escolha="irmao">
                          <option value="">— escolha o irmão —</option>
                          ${irmaos
                            .map((b) => `<option value="${esc(b.id)}" ${escolhido === b.id ? "selected" : ""}>${esc(b.full_name)}${b.cim ? ` — CIM ${esc(b.cim)}` : ""}</option>`)
                            .join("")}
                        </select>
                      </div>`
               }
               <div class="campo"${UI.dica("Ano das contribuições que você quer conferir.")}>
                 <label for="i-ano">Ano</label>
                 <select id="i-ano" data-escolha="ano">
                   ${anos.map((a) => `<option value="${a}" ${String(a) === ano ? "selected" : ""}>${a}</option>`).join("")}
                 </select>
               </div>
             </div>
             ${
               dados
                 ? `<p class="texto-suave" style="font-size:13px;margin:12px 0 0">
                      <strong>${esc(irm.full_name || "")}</strong>${irm.cim ? ` · CIM ${esc(irm.cim)}` : ""}${
                       irm.status ? ` · situação: ${esc(irm.status)}` : ""
                     }${irm.phone ? ` · ${esc(irm.phone)}` : ""}
                    </p>`
                 : soProprio
                   ? ""
                   : '<p class="texto-suave" style="font-size:13.5px;margin:12px 0 0">Escolha um irmão para ver o relatório dele.</p>'
             }
           </div>` +
          (dados
            ? `<div class="cartoes-dinheiro">
                 ${cartaoDinheiro("entrada", "Já pago", UI.formatarMoeda(t.pago), `contribuições quitadas em ${ano}`)}
                 ${cartaoDinheiro("saida", "Pendente", UI.formatarMoeda(t.pendente), `${t.meses_abertos} mês(es) em aberto`)}
                 ${cartaoDinheiro("saldo", "Isento", UI.formatarMoeda(t.isento), "valores dispensados")}
               </div>
               <div class="cartao">
                 <h3 class="cartao-titulo">${svg("financeiro", 17)} CONTRIBUIÇÕES DE ${esc((irm.full_name || "").toUpperCase())} — ${ano}</h3>
                 ${tabelaHtml(
                   [
                     { rotulo: "Mês de referência", valor: (c) => UI.mesDeReferencia(c.reference_month) },
                     { rotulo: "Tipo", valor: (c) => esc(rotuloCategoria(c.contribution_type)) },
                     { rotulo: "Valor", valor: (c) => UI.formatarMoeda(c.amount) },
                     { rotulo: "Vencimento", valor: (c) => dataBR(c.due_date) },
                     { rotulo: "Situação", valor: (c) => PW.selo(c.status) },
                     { rotulo: "Pago em", valor: (c) => (c.paid_at ? dataBR(c.paid_at) : "—") },
                     { rotulo: "Observações", valor: (c) => esc(c.notes || "—") },
                   ],
                   dados.items || [],
                   { vazio: "Nenhuma contribuição registrada para este irmão no ano escolhido." },
                 )}
                 <div class="mt16" style="display:flex;gap:20px;justify-content:flex-end;flex-wrap:wrap">
                   <span><strong>Pago:</strong> <span style="color:var(--verde)">${UI.formatarMoeda(t.pago)}</span></span>
                   <span><strong>Pendente:</strong> <span style="color:var(--vermelho)">${UI.formatarMoeda(t.pendente)}</span></span>
                 </div>
               </div>
               ${assinaturasImpressao(["Tesoureiro", "Venerável Mestre"])}`
            : "");

        el.querySelectorAll("[data-escolha]").forEach((campo) => {
          campo.addEventListener("change", async () => {
            if (campo.dataset.escolha === "irmao") escolhido = campo.value;
            else ano = campo.value;
            await carregar();
            desenhar();
          });
        });
        const imp = el.querySelector("#imprimir-irmao");
        if (imp && dados) imp.addEventListener("click", () => window.print());
      }

      // O perfil "Irmão" abre o próprio relatório já preenchido.
      if (soProprio) {
        try {
          await carregar();
        } catch (err) {
          el.innerHTML = cabecalho("Relatório por Irmão", esc(err.message));
          return;
        }
      }
      desenhar();
    },
  };
})();
