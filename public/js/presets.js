// ============================================================
// Modelos de comunicado (mensagens prontas para o WhatsApp).
// Cada modelo tem um assunto, o texto com espaços para preencher
// ({nome}, {valor}...) e uma categoria para facilitar a busca.
// ============================================================
(function () {
  "use strict";

  const LOJA = "Administração Loja X";

  const CATEGORIAS = [
    { key: "financeiro", label: "Financeiro (mensalidade e dívidas)" },
    { key: "presenca", label: "Faltas, ausências e visitas" },
    { key: "convocacao", label: "Convocação de sessões e eventos" },
    { key: "aniversario", label: "Aniversários e datas festivas" },
    { key: "acolhimento", label: "Acolhimento, saúde e pêsames" },
    { key: "fraternidade", label: "Fraternidade Feminina" },
    { key: "institucional", label: "Institucional e avisos gerais" },
  ];

  const MODELOS = [
    {
      categoria: "financeiro",
      assunto: "Mensalidade em atraso — regularização",
      texto:
        "Estimado Irmão {nome}, boa noite!\n\n" +
        "Espero que o Irmão e sua família estejam bem.\n\n" +
        "Ao conferirmos o movimento financeiro, verificamos que constam {pendentes} mensalidade(s) em aberto em seu nome, " +
        "no valor total de R$ {valor}, referente(s) a {meses}.\n\n" +
        "Se já houver sido pago, por favor desconsidere este aviso e nos mande o comprovante para baixa. " +
        "Caso contrário, pedimos a gentileza de regularizar até {data}, pelo PIX da Loja ou em mãos com o Tesoureiro.\n\n" +
        "Qualquer dúvida, ficamos à disposição.\n\nFraternalmente,\n{loja}",
    },
    {
      // Usado pelo botão "Cobrar no WhatsApp" do relatório "Quem deve" (Caixa).
      categoria: "financeiro",
      assunto: "Pendências financeiras — mensalidade, taxa extra e outras",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Ao conferirmos a tesouraria, verificamos as seguintes pendências em seu nome:\n\n" +
        "{detalhes}\n\n" +
        "Total em aberto: R$ {valor}.\n\n" +
        "Se já houver sido pago, por favor desconsidere este aviso e nos mande o comprovante para baixa. " +
        "Caso contrário, pedimos a gentileza de regularizar pelo PIX da Loja ou em mãos com o Tesoureiro.\n\n" +
        "Qualquer dúvida, ficamos à disposição.\n\nFraternalmente,\nTesouraria — {loja}",
    },
    {
      categoria: "financeiro",
      assunto: "Lembrete amigável da mensalidade do mês",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Passando para lembrar da mensalidade de {mes}, no valor de R$ {valor}, com vencimento em {data}.\n\n" +
        "O tronco da Loja sustenta o Templo, a beneficência e as obrigações junto ao GOB. Sua contribuição, Irmão, " +
        "é o que mantém a nossa Oficina acesa.\n\n" +
        "Fraternalmente,\n{loja}",
    },
    {
      categoria: "financeiro",
      assunto: "Agradecimento por contribuição recebida",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Recebemos o valor de R$ {valor}, referente a {meses}, em seu nome. Em nome da Loja, o nosso muito obrigado!\n\n" +
        "Toda ajuda é fruto da sua dedicação à Ordem e aos irmãos.\n\nFraternalmente,\n{loja}",
    },
    {
      categoria: "financeiro",
      assunto: "Contribuição de beneficência — solicitação de apoio",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Chegou ao nosso conhecimento uma situação de necessidade entre as famílias ligadas à nossa Loja.\n\n" +
        "Convidamos o Irmão a participar desta corrente de beneficência, no valor que puder oferecer, " +
        "com entrega até {data}. Toda contribuição será registrada em ata.\n\n" +
        "O que dermos aos necessitados é devolvido ao nosso próprio coração.\n\nFraternalmente,\n{loja}",
    },
    {
      categoria: "financeiro",
      assunto: "Prestação de contas do mês",
      texto:
        "Estimados Irmãos,\n\n" +
        "Em cumprimento ao nosso Regimento, apresentamos o resumo financeiro de {mes}:\n\n" +
        "• Entradas: R$ {valor}\n• Saídas: R$ {saidas}\n• Saldo: R$ {saldo}\n\n" +
        "Os comprovantes estão à disposição na tesouraria. Fico à disposição para qualquer esclarecimento.\n\n" +
        "Fraternalmente,\nTesoureiro — {loja}",
    },
    {
      categoria: "presenca",
      assunto: "Sentimos sua falta nas sessões",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Sentimos a sua falta nos nossos últimos trabalhos. O Irmão tem sido lembrado com carinho pelos irmãos do quadro.\n\n" +
        "Se houver algo em que a Loja possa ajudar — saúde, família ou trabalho —, conte conosco. " +
        "Se não houver, será uma alegria receber o Irmão na próxima sessão.\n\n" +
        "Um forte abraço fraterno,\n{loja}",
    },
    {
      categoria: "presenca",
      assunto: "Justificativa de ausência — pedido de retorno",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Registramos a sua ausência nos últimos trabalhos e, por isso, gostaríamos de entender o motivo, " +
        "para que possamos lançar a justificativa em ata e, se possível, ajudar no que for preciso.\n\n" +
        "Peço apenas a gentileza de responder esta mensagem com uma palavra do Irmão.\n\n" +
        "Fraternalmente,\nChancelaria — {loja}",
    },
    {
      categoria: "presenca",
      assunto: "Visita fraterna — agendamento",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "A Chancelaria da nossa Loja está organizando o quadro de visitas do mês e gostaria de visitar o Irmão, " +
        "levando o abraço fraterno de todos os irmãos.\n\n" +
        "Qual a melhor data e horário para o Irmão nos receber?\n\n" +
        "Fraternalmente,\nChancelaria — {loja}",
    },
    {
      categoria: "presenca",
      assunto: "Relatório de visitas do mês (aos visitantes)",
      texto:
        "Estimados Irmãos,\n\n" +
        "Informamos que foram realizadas as visitas fraternas do mês, com o seguinte resumo:\n\n" +
        "• Visitas realizadas: {valor}\n• Irmãos visitados: {meses}\n\n" +
        "Agradecemos aos irmãos que se dispuseram a visitar e convidamos os demais para o próximo mês.\n\n" +
        "Fraternalmente,\nChancelaria — {loja}",
    },
    {
      categoria: "convocacao",
      assunto: "Convocação para sessão",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Convocamos o Irmão a comparecer à nossa sessão de {mes}, no dia {data}, às 20h00, " +
        "no Templo da {loja}, devidamente paramentado.\n\n" +
        "Pauta: {valor}\n\n" +
        "Contamos com a sua presença. Em caso de impedimento, solicito a gentileza de avisar com antecedência.\n\n" +
        "Fraternalmente,\nSecretaria — {loja}",
    },
    {
      categoria: "convocacao",
      assunto: "Lembrete de sessão (véspera)",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Lembramos ao Irmão que amanhã, {data}, temos os nossos trabalhos.\n\n" +
        "Sua presença é indispensável para a harmonia do quadro.\n\nFraternalmente,\n{loja}",
    },
    {
      categoria: "convocacao",
      assunto: "Convocação de sessão magna",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "O Venerável Mestre convoca todos os obreiros para Sessão Magna no dia {data}, às 20h00, " +
        "no Templo da {loja}.\n\n" +
        "Pauta: {valor}\n\nTraje: obrigatório o uso da paramentação completa.\n\nFraternalmente,\nSecretaria — {loja}",
    },
    {
      categoria: "aniversario",
      assunto: "Feliz aniversário, Irmão!",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Hoje é dia de festa! Em nome de todos os irmãos do quadro da {loja}, " +
        "desejamos ao Irmão um feliz aniversário, com muita saúde, paz e luz no seu caminhar.\n\n" +
        "Que o Grande Arquiteto do Universo o abençoe hoje e sempre.\n\n" +
        "Um forte abraço fraterno de toda a Loja!",
    },
    {
      categoria: "acolhimento",
      assunto: "Votos de pronto restabelecimento",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Soube da sua indisposição e, em nome de todos os irmãos da {loja}, desejo ao Irmão o pronto " +
        "restabelecimento e a rápida volta ao nosso convívio.\n\n" +
        "Se precisar de algo, conte com a Loja e com cada um de nós.\n\nFraternalmente,\n{loja}",
    },
    {
      categoria: "acolhimento",
      assunto: "Votos de pesar",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Recebemos com grande pesar a triste notícia. Em nome de toda a Loja {loja}, " +
        "apresentamos os mais sinceros sentimentos de pesar e solidariedade.\n\n" +
        "O Grande Arquiteto do Universo o fortaleça e o console, juntamente com sua família. " +
        "Estamos à disposição, neste e sempre.\n\nFraternalmente,\n{loja}",
    },
    {
      categoria: "acolhimento",
      assunto: "Boas-vindas ao novo irmão",
      texto:
        "Estimado Irmão {nome}, paz e bem!\n\n" +
        "Em nome do Venerável Mestre e de todos os obreiros da {loja}, damos ao Irmão as boas-vindas!\n\n" +
        "Qualquer dúvida sobre os trabalhos, os horários ou as contribuições, conte com a Secretaria, " +
        "a Chancelaria e a Tesouraria. Nossa Loja é a sua casa.\n\nFraternalmente,\n{loja}",
    },
    {
      categoria: "fraternidade",
      assunto: "Convite para reunião da Fraternidade Feminina",
      texto:
        "Estimada Família do Irmão {nome}, paz e bem!\n\n" +
        "Convidamos todos para a nossa próxima reunião da Fraternidade Feminina, no dia {data}, às 19h30, " +
        "no Templo da {loja}.\n\n" +
        "Toda participação é muito bem-vinda!\n\nFraternalmente,\nFraternidade Feminina — {loja}",
    },
    {
      categoria: "institucional",
      assunto: "Alteração de dia/horário de sessão",
      texto:
        "Estimados Irmãos,\n\n" +
        "Informamos que a sessão de {mes}, inicialmente marcada para {data}, foi alterada.\n\n" +
        "A Secretaria avisará a todos assim que a nova data e horário forem confirmados.\n\n" +
        "Agradecemos a compreensão e a presença de todos.\n\nFraternalmente,\nSecretaria — {loja}",
    },
    {
      categoria: "institucional",
      assunto: "Aviso geral da Loja",
      texto:
        "Estimados Irmãos,\n\n" +
        "{valor}\n\n" +
        "Contamos com a presença e a colaboração de todos.\n\nFraternalmente,\nVenerável Mestre — {loja}",
    },
  ];

  const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  /** Troca os espaços {nome}, {valor}... pelos dados informados. */
  function preencher(texto, dados = {}) {
    return String(texto || "").replace(/\{([a-z_]+)\}/gi, (achado, chave) => {
      const valor = dados[chave];
      return valor === undefined || valor === null || valor === "" ? achado : String(valor);
    });
  }

  /** Dados padrão (Loja, data, mês) usados em todos os modelos. */
  function dadosPadrao() {
    const hoje = new Date();
    return {
      loja: LOJA,
      data: hoje.toLocaleDateString("pt-BR"),
      mes: MESES[hoje.getMonth()],
      valor: "",
      pendentes: "",
      meses: "",
      detalhes: "",
      saidas: "",
      saldo: "",
    };
  }

  window.PRESETS_COMUNICADO = { LOJA, CATEGORIAS, MODELOS, preencher, dadosPadrao };
})();
