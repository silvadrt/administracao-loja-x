// ============================================================
// Lembretes explicativos (dicas).
// Cada tela e cada ação tem um texto curto que aparece quando o
// mouse passa por cima do item de menu, do botão ou do filtro.
// ============================================================
(function () {
  "use strict";

  const PAGINAS = {
    inicio: "Painel de abertura: mostra os números da Loja, os próximos trabalhos, os aniversariantes do dia e os atalhos para as telas.",
    venerancia: "Quadro de Oficiais: as três luzes, os cargos oficiais e os complementares. Aqui também se troca o mandato.",
    atas: "Livro de Atas (Secretário e Venerável): registre a ata de cada sessão, marque o envio ao GOB, imprima ou salve em PDF e arquive. Ata arquivada não pode mais ser alterada.",
    sessoes: "Sessões: cadastro das sessões e trabalhos, com a chamada de presença de cada um.",
    calendario: "Calendário: visão do mês com as sessões, eventos e aniversários marcados nos dias.",
    comunicados: "Comunicados: mensagens para os irmãos, com modelos prontos (dívida, ausência, convocação...) e envio por WhatsApp.",
    documentos: "Envios ao GOB: controle do que enviar à Potência (ata aprovada, pedidos de iniciação, filiação, desligamento, transferência, votação, kit placet), com prazo, protocolo e situação.",
    financeiro: "Financeiro: mensalidades e contribuições. Gere o mês, marque pagamentos e acompanhe o que está pendente.",
    caixa: "Caixa: entradas e saídas do dinheiro da Loja — água, luz, GOB, obras, retiradas, doações e beneficência.",
    "relatorio-financeiro": "Relatório Financeiro: todas as entradas e saídas da Loja no período, com totais e saldo, pronto para imprimir.",
    "relatorio-irmao": "Relatório por Irmão: o que cada irmão já pagou, o que está pendente e o histórico mês a mês.",
    irmaos: "Irmãos: cadastro completo (CIM, grau, contatos, situação). A ficha mostra os dados e a família do irmão.",
    familia: "Família: cadastro dos familiares de cada irmão, com nome, parentesco e aniversários.",
    frequencia: "Livro de Frequência: a chamada das sessões e as visitações realizadas e recebidas, com o resumo de cada irmão.",
    relatorios: "Relatórios da Chancelaria: frequência, aniversariantes, família e cadastro de irmãos — para ver na tela ou imprimir.",
    loja: "A Loja: nome oficial, potência, endereço, contatos, data de fundação e emblema.",
    potencias: "Potências: contatos das potências (GOB, GOB-GO) e das lojas irmãs.",
    fraternidade: "Fraternidade Feminina: quadro de sócias, com contatos, aniversários e vínculo com os irmãos.",
    config: "Configurações: sua conta, usuários do sistema e auditoria (quem fez o quê).",
  };

  const ACOES = {
    novo: "Cria um registro novo. Os campos com * são obrigatórios.",
    editar: "Abre este registro para corrigir ou completar as informações.",
    excluir: "Apaga este registro. Esta ação não pode ser desfeita.",
    ficha: "Abre a ficha completa, com os dados e a família do irmão.",
    frequencia: "Abre a chamada desta sessão para marcar presença, ausência ou justificativa.",
    whatsapp: "Abre o WhatsApp com a mensagem pronta para enviar a este contato.",
    imprimir: "Abre a versão para papel. Na janela de impressão escolha “Salvar como PDF” para gerar o arquivo.",
    arquivar: "Guarda a ata no arquivo morto, mantendo tudo registrado e fora da lista do dia a dia.",
    atualizar: "Recarrega a lista com os dados mais recentes do servidor.",
    salvar: "Grava as informações no sistema.",
    cancelar: "Fecha sem gravar nada.",
    fechar: "Fecha esta janela.",
    buscar: "Filtra a lista conforme você digita.",
    trocar_mandato: "Encerra todos os cargos do mandato atual e abre um quadro novo, em branco, para o mandato seguinte.",
    definir: "Escolhe o irmão que vai ocupar este cargo.",
    liberar: "Deixa o cargo vago novamente (o histórico da pessoa continua registrado).",
    gerar_mes: "Cria as mensalidades do mês escolhido para todos os irmãos ativos.",
    marcar_pago: "Registra que esta contribuição foi recebida.",
    preset: "Modelo de mensagem pronto: escolha um, o sistema preenche os dados e você ajusta antes de enviar.",
    saida: "Dinheiro que saiu do caixa da Loja (conta a pagar, obra, retirada...).",
    entrada: "Dinheiro que entrou no caixa da Loja.",
    dica: "Passe o mouse sobre os itens para ver esta explicação em qualquer tela.",
  };

  const FILTROS = {
    ano: "Mostra somente os registros deste ano.",
    mes: "Mostra somente os registros deste mês.",
    de: "Início do período que você quer ver.",
    ate: "Fim do período que você quer ver.",
    status: "Filtra pela situação do registro.",
    tipo: "Filtra pelo tipo do registro.",
    situacao: "Filtra pela situação do irmão (ativo, afastado, visitante...).",
    irmao: "Escolha o irmão para ver o relatório dele.",
    categoria: "Filtra pelo motivo (água, luz, GOB, obras...).",
    busca: "Procura por qualquer parte do texto.",
  };

  window.DICAS = { PAGINAS, ACOES, FILTROS };
})();
