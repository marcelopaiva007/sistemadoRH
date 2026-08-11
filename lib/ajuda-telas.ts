// Texto de ajuda das telas — alimenta o botão "?" ao lado do título
// (components/ajuda-da-tela.tsx).
//
// POR QUE TEXTO E NÃO VÍDEO. O plano original previa 7 vídeos de 2 minutos.
// Texto ganha em quase tudo aqui: quem precisa de uma resposta não assiste dois
// minutos para achá-la; quando uma tela muda de comportamento — como o Ponto
// mudou em 11/08/2026 — corrigir um parágrafo leva um minuto e regravar um
// vídeo não; e vídeo desatualizado é pior que ajuda nenhuma, porque ensina
// errado com cara de oficial. `videoUrl` fica reservado: se um dia alguém
// gravar, encaixa sem refazer nada.
//
// MANUTENÇÃO. Estrutura fixa de propósito — texto livre vira parágrafo que
// ninguém lê. "Cuidados" é o bloco que mais vale: são as armadilhas reais,
// tiradas do comportamento do código, não do que seria bonito dizer.
//
// Ao mudar o comportamento de uma destas telas, atualize o texto no MESMO
// commit. É a mesma regra do lib/atualizacoes.ts, pelo mesmo motivo.

export type AjudaComoFazer = {
  /** O objetivo, do jeito que a pessoa pensa nele. */
  acao: string;
  /** Passos na ordem, com o nome exato dos botões da tela. */
  passos: string[];
};

export type AjudaDaTelaConteudo = {
  /** Uma frase: o que esta tela resolve. */
  oQueFaz: string;
  comoFazer: AjudaComoFazer[];
  /** As armadilhas. O bloco mais útil — e o mais fácil de escrever errado. */
  cuidados: string[];
  /** Reservado. Se um dia houver vídeo, a ajuda passa a oferecê-lo também. */
  videoUrl?: string;
};

export const AJUDA_DAS_TELAS = {
  ponto: {
    oQueFaz:
      "Acompanha as batidas do dia, trata ajustes de ponto (PTRP), organiza jornadas e escalas e gera os arquivos fiscais AFD e AEJ exigidos pela Portaria MTP nº 671/2021.",
    comoFazer: [
      {
        acao: "Corrigir ou abonar a batida de alguém",
        passos: [
          "Abra a aba \"Tratamento (PTRP)\".",
          "Em \"Novo tratamento\", escolha o colaborador na lista, o tipo (inclusão manual, abono por atestado, justificativa ou correção), a data da ocorrência e escreva o motivo.",
          "O ajuste entra como PENDENTE. Ele ainda não vale.",
          "Outra pessoa — não quem pediu — aprova ou rejeita, nesta mesma aba ou pela Central de Aprovações.",
        ],
      },
      {
        acao: "Aprovar ou rejeitar um ajuste",
        passos: [
          "Na lista de pendentes, clique em \"Aprovar\" ou \"Rejeitar\".",
          "Rejeitar abre um campo para o motivo, com no mínimo 5 caracteres. Ele é obrigatório.",
          "Seu nome fica gravado na decisão e na trilha de auditoria.",
        ],
      },
      {
        acao: "Gerar o arquivo para a fiscalização",
        passos: [
          "Abra \"Relatórios & Fiscal (AFD)\".",
          "Escolha AFD (registros de ponto) ou AEJ (jornada apurada).",
          "O arquivo sai no layout da Portaria 671, com o CNPJ da empresa.",
        ],
      },
    ],
    cuidados: [
      "Desde 11/08/2026 o ajuste NASCE PENDENTE. Antes ele já nascia aprovado no mesmo clique de quem o registrava — se você usava o sistema antes disso, o passo de aprovação é novo e sem ele o ajuste não tem efeito.",
      "Quem pede não deve ser quem aprova. O sistema registra os dois nomes separadamente, e é isso que a fiscalização olha.",
      "O motivo da rejeição fica em campo próprio, separado do texto de quem pediu. Ninguém reescreve o pedido do outro.",
      "Colaborador desligado continua aparecendo na lista de ajuste — é durante o cálculo da rescisão que a correção de ponto costuma ser feita.",
      "Ajustes anteriores a 11/08/2026 constam como aprovados por \"Gestor de RH\", um texto fixo que não corresponde a pessoa nenhuma. Não foram reescritos: adulterar histórico de auditoria seria pior que deixá-lo documentado.",
    ],
  },

  aprovacoes: {
    oQueFaz:
      "Reúne num lugar só tudo que espera uma decisão do RH: férias programadas, ausências registradas, documentos enviados pelo colaborador no portal e ajustes de ponto.",
    comoFazer: [
      {
        acao: "Decidir uma solicitação",
        passos: [
          "Cada fila é um cartão. Leia as linhas do item — elas trazem datas, quem registrou e quando.",
          "Se houver anexo, abra antes de decidir.",
          "Clique em aprovar ou reprovar. Em algumas filas o motivo é obrigatório ao recusar.",
        ],
      },
      {
        acao: "Conferir um documento do portal",
        passos: [
          "No cartão \"Documentos a conferir\", abra o anexo.",
          "Compare com os números que o próprio colaborador digitou, mostrados ao lado — é contra eles que se confere.",
          "\"Conferir\" aceita. \"Devolver\" apaga o arquivo e avisa a pessoa pelo Telegram.",
        ],
      },
    ],
    cuidados: [
      "A lista respeita o filtro de empresas da barra lateral. Se você não está vendo algo que esperava, confira o filtro antes de concluir que sumiu.",
      "\"Decisões recentes\" lê a trilha de auditoria — mostra as últimas 10 decisões de todas as filas, inclusive de ponto.",
      "Devolver um documento é destrutivo: o arquivo é apagado. A pessoa terá que enviar de novo.",
    ],
  },

  colaboradores: {
    oQueFaz:
      "A lista de todo mundo e a porta de entrada para a ficha completa — dados cadastrais, dependentes, dossiê, férias, ausências, saúde, carreira, benefícios, EPIs, desempenho, treinamentos e medidas disciplinares.",
    comoFazer: [
      {
        acao: "Achar quem tem dado faltando",
        passos: [
          "Na tela de Pendências, clique no cartão \"Cadastros incompletos\".",
          "A lista abre já filtrada só em quem tem campo essencial em branco.",
          "Os blocos \"Preenchimento da base\" da tela inicial abrem a lista filtrada por lacuna específica (sem CPF, sem salário, sem admissão…).",
        ],
      },
      {
        acao: "Registrar um desligamento",
        passos: [
          "Abra a ficha e use a aba correspondente, ou o módulo Desligamentos.",
          "Data e motivo são o que alimenta o cálculo de turnover e a pesquisa de desligamento.",
        ],
      },
    ],
    cuidados: [
      "Setor e cargo vêm do catálogo da MARCA, não do CNPJ. Um cargo criado numa empresa aparece nas irmãs da mesma marca — é catálogo unificado, não engano.",
      "A lista mostra ativos por padrão. Desligado só aparece com o filtro de status trocado.",
      "Cadastro incompleto trava pagamento e eSocial. Não é estatística: é fila de trabalho.",
    ],
  },

  ferias: {
    oQueFaz:
      "Controla período aquisitivo, saldo, programação e o passivo de férias — quem já pode gozar, quem está perto de vencer e quanto isso representa.",
    comoFazer: [
      {
        acao: "Programar férias de alguém",
        passos: [
          "Localize o colaborador em \"Situação por colaborador\".",
          "Escolha o período aquisitivo e as datas.",
          "A solicitação entra como PENDENTE e aparece na Central de Aprovações.",
        ],
      },
    ],
    cuidados: [
      "O período aquisitivo precisa ter 12 meses completos. Antes disso o sistema recusa, e está certo — é a CLT.",
      "São 30 dias por período. O abono pecuniário vai até 10 dias.",
      "Fracionar: no máximo 3 períodos, nenhum abaixo de 5 dias corridos, e um deles precisa ter ao menos 14.",
      "O alerta de vencimento começa 90 dias antes. Férias vencidas geram pagamento em dobro — é por isso que o aviso vem cedo.",
      "O histórico de gozo anterior à implantação do sistema é ESTIMADO. A tela avisa isso; confira contra a ficha em papel antes de decidir sobre caso antigo.",
    ],
  },

  disciplinar: {
    oQueFaz:
      "Registra advertências, suspensões, notificações e termos — e gera o documento formal pronto para imprimir, assinar e guardar de volta no sistema.",
    comoFazer: [
      {
        acao: "Aplicar uma medida disciplinar",
        passos: [
          "Na ficha do colaborador, aba \"Disciplinar\", clique em \"Nova Ocorrência\".",
          "Escolha o tipo, descreva o motivo e as circunstâncias.",
          "Clique em \"Documento\" para abrir o papel já redigido e imprima em duas vias.",
          "Colha as assinaturas e registre o resultado em \"Assinar / Recusa\".",
          "Digitalize a via assinada e guarde em \"Anexar via\".",
        ],
      },
      {
        acao: "Quando o colaborador se recusa a assinar",
        passos: [
          "Em \"Assinar / Recusa\", marque a recusa e informe NOME e CPF de duas testemunhas.",
          "O documento passa a sair com a certidão de recusa e os dados das testemunhas preenchidos.",
        ],
      },
    ],
    cuidados: [
      "O status de assinatura é uma AFIRMAÇÃO; a via anexada é a PROVA. Numa reclamatória o que se pede é o papel assinado — não deixe de digitalizar.",
      "Cada tipo tem fundamento legal próprio: suspensão pelo art. 474, EPI pelo art. 158, dano ao patrimônio pelo art. 462 §1º. O texto do documento já sai com o dele.",
      "Abandono de emprego tem prazo de 48 horas na notificação. O documento já traz isso.",
      "Anexar uma via nova substitui a anterior, que é apagada.",
      "O documento sai com a razão social da carteira do colaborador, que pode ser outra empresa do grupo — é essa que tem de constar no papel.",
    ],
  },

  pesquisas: {
    oQueFaz:
      "Ciclo completo de pesquisa: criar, montar perguntas, convidar, cobrar quem não respondeu e ler o resultado. Cobre clima (GPTW), eNPS, onboarding, desligamento e risco psicossocial (NR-01).",
    comoFazer: [
      {
        acao: "Rodar uma pesquisa do começo ao fim",
        passos: [
          "\"Nova Pesquisa\": título, modelo e se será anônima.",
          "Em \"Perguntas\", monte o questionário.",
          "Em \"Convites\", dispare para quem deve responder.",
          "Acompanhe a coluna Respostas. Os lembretes automáticos rodam sozinhos.",
          "Em \"Resultados\", leia os números; o PDF sai pelo botão de relatório.",
        ],
      },
    ],
    cuidados: [
      "Anônima é decisão de criação e não se desfaz depois. Pense antes: anonimato aumenta a sinceridade e impede qualquer recorte individual.",
      "Convite só chega a quem tem canal de contato. Cadastro sem e-mail nem Telegram fica de fora da conta.",
      "O relatório de clima precisa de volume mínimo para não expor ninguém por dedução — poucas respostas num setor pequeno identificam a pessoa.",
      "A NR-01 tem tela própria (\"Risco psicossocial\"), com plano de ação vinculado. Não é a mesma coisa que a pesquisa de clima.",
    ],
  },

  folha: {
    oQueFaz:
      "Lança os eventos variáveis do mês — horas extras, faltas, adicionais, descontos — organizados por competência, e exporta em CSV para o sistema de folha.",
    comoFazer: [
      {
        acao: "Fechar o mês",
        passos: [
          "Em \"Competências\", clique em \"Abrir competência\" e escolha o mês.",
          "Lance os eventos por colaborador, escolhendo a rubrica.",
          "Confira os totais.",
          "Exporte o CSV e feche a competência.",
        ],
      },
    ],
    cuidados: [
      "Competência é o mês de referência, não o mês do pagamento. Errar isso joga o evento no mês errado.",
      "A rubrica define natureza (provento ou desconto) e unidade. Rubrica trocada vira dinheiro a mais ou a menos.",
      "Hora extra acima do limite mensal vira pendência na tela de Pendências — é aviso, não bloqueio.",
      "Depois de fechada, a competência é referência do que foi pago. Reabrir muda o histórico.",
    ],
  },
} as const satisfies Record<string, AjudaDaTelaConteudo>;

export type ChaveAjuda = keyof typeof AJUDA_DAS_TELAS;
