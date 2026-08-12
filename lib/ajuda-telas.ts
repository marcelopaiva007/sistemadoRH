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
      "Acompanha as batidas do dia — cada uma com a foto de quem bateu —, trata ajustes de ponto (PTRP), organiza jornadas e escalas e gera os arquivos fiscais AFD e AEJ exigidos pela Portaria MTP nº 671/2021.",
    comoFazer: [
      {
        acao: "Conferir a foto de quem bateu o ponto",
        passos: [
          "Abra a aba \"Monitor de Presença\".",
          "Embaixo do nome de cada pessoa aparecem as batidas do dia, com o horário.",
          "Batida com ícone de câmera tem foto: clique no horário para abrir a foto tirada naquele momento.",
          "Batida com câmera cortada foi registrada SEM foto — o colaborador cancelou ou a câmera falhou. Vale perguntar o porquê.",
        ],
      },
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
      "Desde 12/08/2026 o portal pede uma foto ao bater o ponto. A batida NUNCA é impedida pela câmera — sem foto ela vale igual, só aparece marcada aqui. A foto é dado pessoal: cada visualização fica registrada na auditoria, como RG e atestado.",
      "Batidas anteriores a 12/08/2026 não têm foto, e isso é esperado — a câmera não existia no fluxo.",
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

  usuarios: {
    oQueFaz:
      "Cria e administra os logins do sistema: papel de cada um, quais empresas ou marcas a pessoa acessa e — desde 12/08/2026 — qual ficha de colaborador é aquele login, o que faz o gestor ver o próprio time.",
    comoFazer: [
      {
        acao: "Fazer um gestor ver o time dele na tela \"Meu Setor\"",
        passos: [
          "Na linha do usuário, clique no ícone de corrente (\"Vincular empresa\").",
          "No topo do diálogo, em \"Ficha de colaborador\", busque a pessoa pelo nome ou CPF e clique em \"Vincular\".",
          "Confira nas fichas dos colaboradores o campo \"Reporta a\": é ele que diz quem faz parte do time — não o setor.",
          "Pronto: no próximo acesso do gestor, \"Meu Setor\" abre com o time dele.",
        ],
      },
      {
        acao: "Dar acesso a uma empresa ou marca",
        passos: [
          "No mesmo diálogo \"Vincular\", abaixo da ficha, escolha o escopo: marca inteira ou CNPJ específico.",
          "Marca cobre todos os CNPJs dela, inclusive os cadastrados depois. CNPJ é pontual — e é o único que comporta Gestor de Setor.",
          "Salve. Os acessos aparecem como etiquetas na coluna \"Acesso\".",
        ],
      },
      {
        acao: "Desfazer um vínculo de ficha",
        passos: [
          "Abra \"Vincular\" no usuário e clique em \"Desvincular\" ao lado da ficha.",
          "O login continua funcionando normalmente — só deixa de ter time na tela \"Meu Setor\".",
        ],
      },
    ],
    cuidados: [
      "Vincular a ficha NÃO muda permissão nenhuma. Acesso é decidido pelos vínculos de empresa e marca; a ficha só responde \"quem é esta pessoa na folha\".",
      "A ficha é opcional de propósito: ADMIN e o pessoal do RH normalmente não têm ficha na empresa que administram, e continuam trabalhando sem ela.",
      "Uma ficha só pode ser o login de UMA conta. Se a busca não encontra alguém, ou a pessoa está inativa, ou já tem login, ou está numa empresa que este usuário não acessa.",
      "A busca por CPF funciona com pedaço do número, sem pontos. Por nome, bastam 2 letras.",
      "Quem monta o time do gestor é o campo \"Reporta a\" na ficha de cada colaborador — vincular a ficha do gestor sem preencher o \"Reporta a\" do time dele resulta numa tela vazia.",
    ],
  },

  "meu-setor": {
    oQueFaz:
      "A tela do gestor de setor: o time dele — tempo de casa, férias, avaliação, primeiros meses — e o clima do setor nas pesquisas, sem passar pelos módulos do RH inteiro.",
    comoFazer: [
      {
        acao: "Ler a situação do time",
        passos: [
          "O bloco \"Meu time\" lista quem reporta a você, com tempo de casa, férias a vencer, avaliação do ciclo e quem nunca acessou o portal.",
          "Use os filtros de setor, sinal e busca para achar alguém específico.",
          "Os números são os MESMOS que o RH vê na tela \"Time\" — vocês nunca leem versões diferentes da mesma equipe.",
        ],
      },
      {
        acao: "Acompanhar o clima do setor",
        passos: [
          "O bloco \"Clima do setor\" mostra as médias por dimensão das pesquisas ativas e encerradas.",
          "Os números só aparecem com um mínimo de respostas — é o que preserva o anonimato de quem respondeu.",
        ],
      },
    ],
    cuidados: [
      "Tela vazia tem dois motivos diferentes, e ela diz qual é: ou o seu login ainda não foi ligado à sua ficha (peça ao RH: Cadastros → Usuários → Vincular), ou ninguém tem você no campo \"Reporta a\" da ficha.",
      "O time vem do \"Reporta a\", não do setor. Você pode liderar gente de outro setor — ela aparece aqui do mesmo jeito.",
      "Salário, CPF e documentos do time NÃO aparecem nesta tela, de propósito. Gestor vê sinal de gestão, não ficha completa.",
    ],
  },

  "avisos-gestor": {
    oQueFaz:
      "Mostra exatamente o que cada gestor receberia pelo Telegram sobre o time dele — contrato por prazo vencendo, férias a vencer, hora extra acima do limite — antes de o envio automático ser ligado.",
    comoFazer: [
      {
        acao: "Conferir o que sairia hoje",
        passos: [
          "Cada cartão é um gestor; o texto no cartão é a mensagem literal, como chegaria no celular dele.",
          "\"Sem Telegram\" no cartão significa que aquele gestor não receberia nada — falta vincular o Telegram na ficha dele.",
          "O rodapé diz quantos colaboradores ativos estão sem supervisor na ficha: sobre esses, ninguém é avisado, porque o sistema não sabe a quem avisar.",
        ],
      },
    ],
    cuidados: [
      "NADA é enviado por esta tela, nem ao abri-la. O envio automático está desligado e ligá-lo é uma decisão à parte.",
      "Quando o envio for ligado, o mesmo assunto sobre a mesma pessoa não se repete antes de 7 dias — o gestor não é bombardeado.",
      "A tela continua útil depois de ligar: é onde se responde \"por que fulano recebeu isso?\" sem abrir log nenhum.",
    ],
  },
} as const satisfies Record<string, AjudaDaTelaConteudo>;

export type ChaveAjuda = keyof typeof AJUDA_DAS_TELAS;
