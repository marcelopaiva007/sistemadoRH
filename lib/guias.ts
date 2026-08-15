// Roteiro dos guias explicativos de cada tela do módulo RH — o texto que o
// player de `components/guia-tela.tsx` narra passo a passo.
//
// POR QUE ISTO EXISTE: quem alimenta o sistema é o time do setor de RH, e a
// pergunta que trava a pessoa nunca é "onde clico" — é "o que eu coloco aqui e
// por que isso é feito". Um manual em PDF morre desatualizado na primeira
// entrega; um vídeo gravado morre no primeiro botão que muda de lugar. Então o
// guia mora junto do código: é texto versionado, aparece na própria tela e sobe
// no mesmo PR de quem mexeu na tela.
//
// MANUTENÇÃO: mexeu numa tela e mudou o que se alimenta nela? A entrada
// correspondente aqui muda no mesmo commit. Tela nova entra na lateral
// (`rh-empresa-nav.tsx`) E aqui — sem entrada aqui, o botão "Como usar esta
// tela" simplesmente não aparece, e a funcionária fica sem a explicação
// justamente na tela que ela nunca viu antes.
//
// LINGUAGEM: quem lê é o RH, não quem programa. Nada de "registro", "entidade",
// "sincronizar" — é "ficha", "pessoa", "aparece em". Cada passo responde uma
// coisa só, em no máximo três frases: o player narra em voz de tela, e texto
// longo faz a pessoa parar de acompanhar a animação.

/**
 * Tipo de animação que ilustra o passo. Cada cena é um desenho esquemático da
 * tela — não uma captura: captura envelhece, esquema não. Ver
 * `components/guia-cena.tsx` para o que cada uma faz com `rotulos`.
 */
export type CenaTipo =
  /** Tabela ganhando linhas. `rotulos` = colunas. */
  | "tabela"
  /** Formulário sendo preenchido campo a campo. `rotulos` = nomes dos campos. */
  | "formulario"
  /** Cartões de número. `rotulos` = "Rótulo|Valor". */
  | "cartoes"
  /** Caixas ligadas por seta, acendendo em sequência. `rotulos` = etapas. */
  | "fluxo"
  /** Itens sendo marcados. `rotulos` = itens. */
  | "checklist"
  /** Aviso destacado com ação. `rotulos` = [título, detalhe, ação]. */
  | "alerta"
  /** Grade de dias do mês. `rotulos` = legenda. */
  | "calendario"
  /** Mensagem saindo do sistema para a pessoa. `rotulos` = [de, texto, para]. */
  | "envio"
  /** Barras crescendo. `rotulos` = nomes das barras. */
  | "grafico"
  /** Busca digitando e filtrando. `rotulos` = [termo, ...resultados]. */
  | "busca";

export type PassoGuia = {
  /** Título curto do passo — vira o capítulo clicável na lista. */
  titulo: string;
  /** A narração. Até três frases, na língua de quem usa o sistema. */
  fala: string;
  cena: CenaTipo;
  rotulos: string[];
  /** Só quando o tempo calculado pelo texto não serve (ex.: cena mais lenta). */
  segundos?: number;
};

export type Guia = {
  /** Primeiro segmento da rota depois de /rh/<empresa>. "" é a tela de Pendências. */
  slug: string;
  titulo: string;
  /** Uma frase: por que esta tela existe. Fica fixa no topo do player. */
  paraQue: string;
  /** Uma frase: o que se alimenta aqui. Fica fixa no rodapé do player. */
  alimenta: string;
  passos: PassoGuia[];
};

/** Palavras por segundo de leitura confortável em voz de tela. */
const RITMO_LEITURA = 2.4;

/** Quanto tempo um passo fica no ar: o tempo de ler a fala, com piso e teto. */
export function duracaoDoPasso(passo: PassoGuia): number {
  if (passo.segundos) return passo.segundos;
  const palavras = passo.fala.trim().split(/\s+/).length;
  return Math.min(16, Math.max(5, Math.round(palavras / RITMO_LEITURA)));
}

export function duracaoDoGuia(guia: Guia): number {
  return guia.passos.reduce((total, passo) => total + duracaoDoPasso(passo), 0);
}

/** "3 min" / "50 s" — o rótulo de duração que o botão e o player mostram. */
export function rotuloDeDuracao(segundos: number): string {
  if (segundos < 90) return `${segundos} s`;
  return `${Math.round(segundos / 60)} min`;
}

export const GUIAS: Guia[] = [
  // ─────────────────────────── Porta de entrada ───────────────────────────
  {
    slug: "",
    titulo: "Pendências",
    paraQue: "É a lista do dia: tudo que está faltando ou vencendo, em ordem de urgência.",
    alimenta: "Nada é digitado aqui — cada cartão te leva para a tela onde a falta se resolve.",
    passos: [
      {
        titulo: "Comece o dia por aqui",
        fala: "Esta é a primeira tela depois de escolher a empresa. Ela varre a base e mostra o que está faltando: ficha sem salário, documento vencido, férias em risco, aprovação parada.",
        cena: "cartoes",
        rotulos: ["Férias vencidas|6", "Sem salário|12", "Documentos a vencer|4", "Aprovações|3"],
      },
      {
        titulo: "Cartão e lista são a mesma coisa",
        fala: "Clicar num cartão abre a lista exata daquele número, nome por nome. Se o cartão diz seis, a lista traz seis — é a mesma regra nos dois lugares.",
        cena: "tabela",
        rotulos: ["Nome", "Empresa", "Setor", "O que falta"],
      },
      {
        titulo: "Some quando você resolve",
        fala: "Não existe botão de dar baixa aqui. O cartão diminui sozinho quando o dado é corrigido na tela dele — é assim que a lista nunca mente.",
        cena: "checklist",
        rotulos: ["Salário preenchido", "ASO renovado", "Férias programadas"],
      },
    ],
  },

  // ─────────────────────────── Ciclo de vida ───────────────────────────
  {
    slug: "colaboradores",
    titulo: "Colaboradores",
    paraQue: "É o cadastro de pessoas — a base de que todo o resto do sistema depende.",
    alimenta:
      "Nome, CPF, contato, setor, cargo, supervisor, data de admissão e salário de cada pessoa.",
    passos: [
      {
        titulo: "Tudo começa na ficha",
        fala: "Férias, folha, benefícios, avaliação e pesquisa de clima leem daqui. Ficha incompleta não dá erro na tela — ela faz a pessoa desaparecer dos cálculos, e isso é pior.",
        cena: "fluxo",
        rotulos: ["Ficha da pessoa", "Férias e folha", "Avaliação e clima"],
      },
      {
        titulo: "Os quatro campos que não podem faltar",
        fala: "Data de admissão manda nas férias e no tempo de casa. Salário manda no custo. Setor e supervisor montam o organograma. Sem esses quatro, a pessoa existe mas não conta em nada.",
        cena: "formulario",
        rotulos: ["Data de admissão", "Salário base", "Setor", "Supervisor"],
      },
      {
        titulo: "Contato é o que abre o portal",
        fala: "E-mail e Chat ID do Telegram são opcionais no cadastro, mas é por eles que saem o convite do portal, o lembrete de pesquisa e o aviso de documento vencendo. Sem contato, a pessoa não recebe nada.",
        cena: "envio",
        rotulos: ["Sistema", "Sua avaliação está aberta", "Colaborador"],
      },
      {
        titulo: "Quem sai é desativado, nunca apagado",
        fala: "Desativar tira a pessoa dos totais, das pendências, dos benefícios e dos convites — e mantém a ficha e o histórico inteiros. Apagar destruiria o histórico que a fiscalização pede.",
        cena: "alerta",
        rotulos: [
          "Desativar colaborador",
          "A ficha e o histórico continuam guardados",
          "Confirmar desativação",
        ],
      },
      {
        titulo: "Confira o aviso de ficha duplicada",
        fala: "Quando duas fichas ativas têm o mesmo telefone ou nome quase igual, aparece um aviso no topo. O sistema não escolhe qual é a certa — quem decide é você, olhando CPF, admissão e histórico.",
        cena: "alerta",
        rotulos: [
          "2 prováveis duplicadas",
          "Mesmo telefone em fichas diferentes",
          "Conferir fichas",
        ],
      },
    ],
  },
  {
    slug: "organograma",
    titulo: "Organograma",
    paraQue: "Mostra quem responde a quem, desenhado na hora a partir das fichas.",
    alimenta:
      "Nada é desenhado aqui: o campo supervisor de cada ficha é o que monta a árvore.",
    passos: [
      {
        titulo: "O desenho é consequência, não cadastro",
        fala: "Ninguém arrasta caixinha aqui. A árvore é montada na hora a partir do campo supervisor de cada colaborador, então ela muda sozinha quando alguém troca de líder.",
        cena: "fluxo",
        rotulos: ["Supervisor na ficha", "Árvore montada na hora", "Organograma na tela"],
      },
      {
        titulo: "Buraco no desenho é buraco no cadastro",
        fala: "Pessoa aparecendo soltinha, fora de qualquer equipe, quer dizer ficha sem supervisor. A correção é na ficha do colaborador, não aqui.",
        cena: "alerta",
        rotulos: ["3 pessoas fora da árvore", "Ficha sem supervisor preenchido", "Abrir a ficha"],
      },
      {
        titulo: "Use para conferir depois de uma mudança",
        fala: "Depois de promoção, troca de gestor ou fechamento de setor, abra aqui: é o jeito mais rápido de ver se a estrutura ficou como devia.",
        cena: "checklist",
        rotulos: ["Cada pessoa tem líder", "Nenhum líder sobrecarregado", "Setores conferem"],
      },
    ],
  },
  {
    slug: "vagas",
    titulo: "Vagas",
    paraQue: "Controla as vagas abertas e por qual etapa cada candidato está passando.",
    alimenta: "Título, cargo, cidade, descrição e faixa salarial de cada vaga aberta.",
    passos: [
      {
        titulo: "Abra a vaga antes de divulgar",
        fala: "A vaga cadastrada aqui é a mesma que aparece na página pública de carreiras. O que você escreve na descrição e na faixa salarial é o que o candidato lê.",
        cena: "formulario",
        rotulos: ["Título da vaga", "Cargo", "Cidade", "Faixa salarial"],
      },
      {
        titulo: "Cada vaga tem seu funil",
        fala: "Abrindo a vaga você vê o quadro de candidatos por etapa. Mover a pessoa de etapa é o que dá visibilidade de onde o processo está travado.",
        cena: "fluxo",
        rotulos: ["Inscrito", "Entrevista", "Proposta", "Admitido"],
      },
      {
        titulo: "Inscrição manual também vale",
        fala: "Candidato que chegou por indicação ou entregou currículo na portaria você inscreve pelo botão de inscrever candidato, com nome, contato e currículo em PDF ou foto.",
        cena: "formulario",
        rotulos: ["Nome", "E-mail", "Cidade", "Currículo (até 4 MB)"],
      },
      {
        titulo: "Aprovado vira ficha na hora",
        fala: "Quando o candidato é admitido, os dados dele viram ficha de colaborador aqui mesmo — sem digitar nome e CPF de novo em outra tela.",
        cena: "fluxo",
        rotulos: ["Candidato aprovado", "Admitir", "Ficha de colaborador"],
      },
    ],
  },
  {
    slug: "candidatos",
    titulo: "Talentos",
    paraQue: "Guarda todo mundo que já se candidatou, mesmo em vaga que já fechou.",
    alimenta: "Nada de novo: é a busca no histórico de candidaturas que já entraram.",
    passos: [
      {
        titulo: "O currículo bom não se perde",
        fala: "Candidato reprovado numa vaga por falta de posição continua aqui. Antes de publicar vaga nova, procure aqui primeiro — costuma ser mais rápido que recomeçar a divulgação.",
        cena: "busca",
        rotulos: ["eletricista", "João — Eletricista, Betim", "Ana — Eletricista, Contagem"],
      },
      {
        titulo: "Busque pelo fragmento que você lembra",
        fala: "A busca aceita nome, e-mail e cidade. Se você digitar números, ela procura também em telefone e CPF — porque na prática a gente lembra de um pedaço, não do cadastro inteiro.",
        cena: "busca",
        rotulos: ["9884", "Maria — (31) 9 9884-...", "Carlos — CPF ...9884..."],
      },
    ],
  },
  {
    slug: "integracoes",
    titulo: "Integrações",
    paraQue: "Acompanha a trilha de entrada de quem acabou de ser admitido.",
    alimenta: "Os itens da trilha de integração de cada recém-admitido, marcados conforme acontecem.",
    passos: [
      {
        titulo: "Todos os recém-chegados numa tela",
        fala: "Aqui você vê o que está travando a entrada de cada pessoa nova, sem precisar abrir ficha por ficha. Trilha parada é a causa mais comum de desligamento nos primeiros noventa dias.",
        cena: "tabela",
        rotulos: ["Nome", "Admissão", "Trilha", "Falta"],
      },
      {
        titulo: "Marque o que já foi feito",
        fala: "Cada item concluído sai da lista de pendências da pessoa. Item que fica em aberto sem motivo faz o painel de integração parecer pior do que é.",
        cena: "checklist",
        rotulos: ["Documentos entregues", "Uniforme e EPI", "Treinamento inicial", "Acesso ao portal"],
      },
    ],
  },
  {
    slug: "desligamentos",
    titulo: "Desligamentos",
    paraQue: "Rastreia o que falta fechar depois que a data de desligamento entra na ficha.",
    alimenta:
      "O andamento do checklist de saída e o registro de que a entrevista de desligamento foi feita.",
    passos: [
      {
        titulo: "O motivo formal fica na ficha",
        fala: "Data e motivo do desligamento são preenchidos na ficha do colaborador. Esta tela é o passo seguinte: o que ainda falta encerrar depois que a saída foi registrada.",
        cena: "fluxo",
        rotulos: ["Data na ficha", "Checklist de saída", "Entrevista feita"],
      },
      {
        titulo: "Feche o checklist item por item",
        fala: "Devolução de equipamento, acesso cortado, documentação assinada. É a lista que evita descobrir três meses depois que ficou crachá ou notebook na rua.",
        cena: "checklist",
        rotulos: ["Equipamento devolvido", "Acessos removidos", "Documentos assinados"],
      },
      {
        titulo: "A entrevista de saída vira dado",
        fala: "Registrar que a entrevista foi feita é o que alimenta a leitura de por que as pessoas saem. Sem ela, sobra o número de turnover sem explicação nenhuma.",
        cena: "grafico",
        rotulos: ["Salário", "Gestor", "Rotina", "Outra proposta"],
      },
    ],
  },

  // ─────────────────────── Departamento pessoal ───────────────────────
  {
    slug: "aprovacoes",
    titulo: "Aprovações",
    paraQue: "Junta num lugar só tudo que está esperando uma decisão sua.",
    alimenta: "A decisão: aprovar ou recusar férias programadas, ausências e documentos do portal.",
    passos: [
      {
        titulo: "A fila do RH numa tela",
        fala: "Férias que o colaborador programou, ausência que ele registrou e documento que ele mandou pelo portal chegam todos aqui. Não é preciso caçar em três telas diferentes.",
        cena: "tabela",
        rotulos: ["Pessoa", "Tipo", "Enviado em", "Decisão"],
      },
      {
        titulo: "Sua decisão volta para a pessoa",
        fala: "Aprovando ou recusando, a resposta aparece no portal de quem pediu. Pedido parado aqui é pessoa esperando sem saber se foi visto.",
        cena: "envio",
        rotulos: ["RH", "Suas férias foram aprovadas", "Colaborador"],
      },
      {
        titulo: "Aprovar férias tem efeito no cálculo",
        fala: "Férias aprovadas entram no saldo e tiram a pessoa do risco de pagamento em dobro. Enquanto o pedido está parado, o risco continua contando na tela de Férias.",
        cena: "alerta",
        rotulos: ["Risco de dobra", "Aprovação pendente há 12 dias", "Decidir agora"],
      },
    ],
  },
  {
    slug: "mensagens",
    titulo: "Mensagens",
    paraQue: "É o Fale com o RH: o que o colaborador escreve pelo portal chega aqui.",
    alimenta: "A resposta escrita para cada mensagem — ela volta no portal de quem escreveu.",
    passos: [
      {
        titulo: "Canal direto com o colaborador",
        fala: "A pessoa escreve no portal, a mensagem cai nesta tela. É o caminho oficial para dúvida de folha, pedido de documento e reclamação.",
        cena: "envio",
        rotulos: ["Colaborador", "Preciso do meu holerite de março", "RH"],
      },
      {
        titulo: "O que você responde aqui, ela lê no portal",
        fala: "A resposta não sai por e-mail nem WhatsApp: ela aparece no portal da própria pessoa. Isso mantém a conversa registrada e no lugar certo.",
        cena: "envio",
        rotulos: ["RH", "Enviei para o seu portal", "Colaborador"],
      },
    ],
  },
  {
    slug: "vencimentos",
    titulo: "Vencimentos",
    paraQue: "Mostra o que está vencendo ou já venceu: documento, NR, ASO e EPI.",
    alimenta:
      "As datas de validade — renovar o documento na tela dele é o que apaga o alerta aqui.",
    passos: [
      {
        titulo: "Prazo que passou custa multa",
        fala: "Certificado de NR, exame ocupacional e entrega de EPI têm validade e são o que a fiscalização pede primeiro. Esta tela existe para nenhum deles vencer sem aviso.",
        cena: "tabela",
        rotulos: ["Pessoa", "O que vence", "Validade", "Situação"],
      },
      {
        titulo: "Três cores, três urgências",
        fala: "Vencido, vencendo nos próximos dias e regular. Trabalhe de cima para baixo: vencido é problema de hoje, vencendo é agenda da semana.",
        cena: "cartoes",
        rotulos: ["Vencidos|7", "Vencem em 30 dias|15", "Regulares|182"],
      },
      {
        titulo: "Férias não estão aqui",
        fala: "Férias têm tela própria de propósito. Documento vencido se renova; férias vencidas viram passivo em dobro, e misturar as duas coisas fazia o alerta mais caro se perder no meio dos certificados.",
        cena: "fluxo",
        rotulos: ["Documento vencido", "Renovar", "Resolvido"],
      },
    ],
  },
  {
    slug: "ferias",
    titulo: "Férias",
    paraQue: "Mostra o saldo de férias de cada pessoa e quem está em risco de pagamento em dobro.",
    alimenta:
      "A programação e a conciliação do saldo — os períodos são calculados pela data de admissão.",
    passos: [
      {
        titulo: "O saldo é calculado, não digitado",
        fala: "O sistema deriva cada período aquisitivo da data de admissão mais as férias já registradas. Data de admissão errada na ficha significa saldo errado aqui.",
        cena: "fluxo",
        rotulos: ["Data de admissão", "Períodos calculados", "Saldo na tela"],
      },
      {
        titulo: "Risco de dobra é o alerta mais caro",
        fala: "Quem tem um ano ou mais de casa e nenhuma férias aprovada no último ano entra em risco de dobra: a lei manda pagar em dobro o período concedido em atraso. Só resolve concedendo.",
        cena: "alerta",
        rotulos: ["6 pessoas em risco de dobra", "Passivo dobra se não for concedido", "Programar férias"],
      },
      {
        titulo: "Quem entrou com histórico antigo precisa conciliar",
        fala: "Pessoa que já tinha férias tiradas antes do sistema aparece sem histórico. Use conciliar saldo atual para lançar o que já foi gozado, senão ela aparece devendo férias que já tirou.",
        cena: "formulario",
        rotulos: ["Colaborador", "Saldo atual de dias", "Observações"],
      },
      {
        titulo: "Programadas ficam na aba ao lado",
        fala: "As férias já marcadas ficam em Programadas, com data de início e fim. É o que a operação usa para não deixar dois do mesmo setor fora na mesma semana.",
        cena: "calendario",
        rotulos: ["Férias programadas", "Feriado", "Dia normal"],
      },
      {
        titulo: "Valores só somados",
        fala: "O custo do passivo aparece por CNPJ ou pelo grupo, nunca por pessoa. Isso é proposital: valor individual permitiria deduzir o salário de cada um.",
        cena: "cartoes",
        rotulos: ["Passivo do grupo|R$ 412 mil", "Em risco de dobra|R$ 88 mil", "Pessoas|6"],
      },
    ],
  },
  {
    slug: "escalas",
    titulo: "Escalas",
    paraQue: "É a grade semanal de plantão e turno por setor.",
    alimenta: "Quem está de plantão em cada dia da semana, setor por setor.",
    passos: [
      {
        titulo: "Responde uma pergunta só",
        fala: "Quem está de plantão em cada dia. Não há cálculo de hora extra nem banco de horas aqui — de propósito, é a grade que a operação de campo pediu.",
        cena: "calendario",
        rotulos: ["Plantão", "Folga", "Turno da noite"],
      },
      {
        titulo: "Monte por setor",
        fala: "A grade é por setor, então o gestor abre e vê só a equipe dele. Preencher a semana inteira evita a ligação de sábado perguntando quem cobre.",
        cena: "tabela",
        rotulos: ["Pessoa", "Seg a Sex", "Sábado", "Domingo"],
      },
    ],
  },
  {
    slug: "beneficios",
    titulo: "Benefícios",
    paraQue: "Mostra quanto a empresa gasta por tipo de benefício e quantas pessoas têm cada um.",
    alimenta:
      "A concessão de benefício é feita na ficha da pessoa; aqui é a visão somada.",
    passos: [
      {
        titulo: "O custo real do pacote",
        fala: "Um cartão por tipo, com valor mensal e quantas pessoas recebem. É o número que vai para orçamento e para negociação com fornecedor.",
        cena: "cartoes",
        rotulos: ["Plano de saúde|R$ 38 mil", "Vale-transporte|R$ 12 mil", "Alimentação|R$ 27 mil"],
      },
      {
        titulo: "Só o que está vigente entra na conta",
        fala: "Benefício com data de fim no passado sai do custo automaticamente. Por isso preencher a data de fim quando o benefício é encerrado importa: sem ela, ele pesa para sempre.",
        cena: "formulario",
        rotulos: ["Tipo de benefício", "Valor", "Início", "Fim"],
      },
      {
        titulo: "Conceder é na ficha da pessoa",
        fala: "Esta tela é leitura. Para dar ou encerrar um benefício, abra a ficha do colaborador e use conceder benefício — o número aqui se atualiza sozinho.",
        cena: "fluxo",
        rotulos: ["Ficha da pessoa", "Conceder benefício", "Custo somado aqui"],
      },
    ],
  },
  {
    slug: "entregas",
    titulo: "Entregas ao colaborador",
    paraQue:
      "Registra o que a empresa entregou a cada pessoa e cobra dela a confirmação de que recebeu.",
    alimenta:
      "O tipo do item, a data da entrega e para quem foi. A confirmação não se preenche aqui: ela chega quando o colaborador clica em Recebi no portal.",
    passos: [
      {
        titulo: "Entrega de muita gente de uma vez",
        fala: "Escolha o tipo, a data e marque todo mundo que recebeu. Cento e setenta cartões entregues no mesmo dia viram um lançamento só, não cento e setenta formulários.",
        cena: "formulario",
        rotulos: ["Tipo", "Data da entrega", "Descrição", "Colaboradores"],
      },
      {
        titulo: "Quem confirma é o colaborador",
        fala: "Assim que você registra, a pessoa recebe uma mensagem do bot no Telegram pedindo para confirmar, e o aviso fica no topo do portal dela até ela tocar em Recebi. Enquanto isso não acontece, a linha fica vermelha aqui. Quem não tem Telegram vinculado não recebe aviso — a tela conta quantos ficaram de fora.",
        cena: "envio",
        rotulos: ["Sistema de RH", "O RH registrou uma entrega em seu nome — confirme no portal", "Colaborador"],
      },
      {
        titulo: "A tela abre no que falta",
        fala: "O filtro já vem em aguardando confirmação, porque é essa a pergunta do dia a dia: quem ainda não confirmou. Para ver tudo, troque o filtro para todas.",
        cena: "busca",
        rotulos: ["Aguardando confirmação", "Maria Souza · Cartão", "João Lima · Notebook"],
      },
      {
        titulo: "Devolução e engano são coisas diferentes",
        fala: "Notebook e crachá voltam no desligamento: use devolvido. Lançou para a pessoa errada e ela ainda não confirmou? Aí sim apague. Depois de confirmada, o sistema não deixa apagar — a confirmação é a prova de que ela recebeu.",
        cena: "alerta",
        rotulos: [
          "Entrega já confirmada",
          "Não pode ser apagada — registre a devolução",
          "Registrar devolução",
        ],
      },
      {
        titulo: "Falta um tipo de item na lista?",
        fala: "Cadeira, chip de celular, ferramenta: clique em novo tipo, ali mesmo no formulário, dê o nome e salve. O tipo entra no catálogo da empresa na hora — sem sair da tela e sem perder quem você já marcou.",
        cena: "formulario",
        rotulos: ["+ novo tipo", "Nome do tipo", "Salvar"],
      },
      {
        titulo: "O histórico de cada pessoa fica na ficha",
        fala: "Na ficha do colaborador, a aba Entregas lista tudo que aquela pessoa recebeu, com a situação de cada item. É onde se olha no desligamento — e dá para registrar uma entrega individual por lá também.",
        cena: "tabela",
        rotulos: ["Item", "Entregue em", "Situação"],
      },
    ],
  },
  {
    slug: "folha",
    titulo: "Folha",
    paraQue: "Guarda os eventos variáveis de cada mês antes de mandar para a contabilidade.",
    alimenta: "A competência do mês e cada evento lançado nela: pessoa, rubrica e valor.",
    passos: [
      {
        titulo: "Um mês, uma competência",
        fala: "Cada mês é uma competência aberta separadamente, com ano e mês. Abrir a competência é o primeiro passo — sem ela não há onde lançar nada.",
        cena: "formulario",
        rotulos: ["Ano", "Mês", "Abrir competência"],
      },
      {
        titulo: "Lance evento por evento",
        fala: "Hora extra, falta, adiantamento, comissão: cada lançamento tem colaborador, rubrica, valor e observação. A observação é o que salva na hora de explicar o número depois.",
        cena: "formulario",
        rotulos: ["Colaborador", "Rubrica", "Valor", "Observações"],
      },
      {
        titulo: "Confira antes de fechar",
        fala: "Abra a competência e revise a lista inteira antes de enviar. Depois de fechada, ela registra quem fechou e quando — é esse registro que responde à contabilidade.",
        cena: "checklist",
        rotulos: ["Eventos conferidos", "Valores batem", "Competência fechada"],
      },
    ],
  },

  // ────────────────── Desempenho & desenvolvimento ──────────────────
  {
    slug: "avaliacoes",
    titulo: "Avaliações",
    paraQue: "Controla os ciclos de avaliação de desempenho, do abrir ao encerrar.",
    alimenta: "O ciclo — nome, tipo, início e fim — e quem avalia quem dentro dele.",
    passos: [
      {
        titulo: "Abra o ciclo com data de início e fim",
        fala: "O ciclo é a campanha: nome, tipo, início e fim. A data de fim é o que faz o sistema cobrar quem não respondeu — ciclo sem prazo não gera lembrete.",
        cena: "formulario",
        rotulos: ["Nome do ciclo", "Tipo", "Início", "Fim"],
      },
      {
        titulo: "Quem avalia quem",
        fala: "Por padrão o supervisor da ficha é o avaliador. Quando alguém trocou de gestor no meio do ciclo, use adicionar avaliador extra em vez de mexer no organograma.",
        cena: "fluxo",
        rotulos: ["Colaborador avaliado", "Supervisor", "Avaliador extra"],
      },
      {
        titulo: "Acompanhe o placar da campanha",
        fala: "O topo mostra a cobertura por CNPJ, a fila de cada avaliador e o gap entre autoavaliação e nota do gestor. É por onde você sabe quem cobrar.",
        cena: "grafico",
        rotulos: ["Empresa A", "Empresa B", "Empresa C", "Empresa D"],
      },
      {
        titulo: "Encerrar é o que consolida",
        fala: "Enquanto o ciclo está aberto, as notas ainda mudam. Encerrar fecha o resultado e é o que libera a leitura de nine-box e a comparação com o ciclo anterior.",
        cena: "checklist",
        rotulos: ["Todos avaliados", "Gaps revisados", "Ciclo encerrado"],
      },
    ],
  },
  {
    slug: "metas",
    titulo: "Metas & PDI",
    paraQue: "Reúne as metas da empresa, por pessoa ou por setor, com progresso.",
    alimenta: "Título, descrição, tipo, prazo e o percentual de progresso de cada meta.",
    passos: [
      {
        titulo: "Meta é de pessoa ou de setor, nunca das duas",
        fala: "Ao criar, escolha um dos dois. Meta de setor cobra a equipe inteira; meta de colaborador cobra uma pessoa e entra na conversa de desempenho dela.",
        cena: "formulario",
        rotulos: ["Título", "Tipo: pessoa ou setor", "Início", "Fim"],
      },
      {
        titulo: "Progresso em percentual",
        fala: "Atualizar o progresso é o que faz a meta virar acompanhamento em vez de lista de intenções. Meta parada em zero perto do prazo é o sinal que esta tela existe para dar.",
        cena: "grafico",
        rotulos: ["Meta 1", "Meta 2", "Meta 3", "Meta 4"],
      },
      {
        titulo: "PDI fica na ficha da pessoa",
        fala: "O plano de desenvolvimento individual é por colaborador e mora na ficha dele, junto das ações de desenvolvimento. Aqui é a visão consolidada de metas da empresa.",
        cena: "fluxo",
        rotulos: ["Ficha da pessoa", "Ação de desenvolvimento", "PDI"],
      },
    ],
  },
  {
    slug: "treinamentos",
    titulo: "Treinamentos",
    paraQue: "É o catálogo de treinamentos e a matriz de quem já participou de quê.",
    alimenta: "Nome, categoria, carga horária, descrição e as competências que o treinamento desenvolve.",
    passos: [
      {
        titulo: "Cadastre o treinamento uma vez",
        fala: "Nome, categoria e carga horária. As competências desenvolvidas são o que transforma a lista de cursos em matriz de competências depois.",
        cena: "formulario",
        rotulos: ["Nome", "Categoria", "Carga horária (h)", "Competências"],
      },
      {
        titulo: "Depois registre quem participou",
        fala: "A participação é o que preenche a matriz. Treinamento cadastrado e sem ninguém marcado não diz nada sobre a capacitação do time.",
        cena: "tabela",
        rotulos: ["Pessoa", "Treinamento", "Data", "Carga"],
      },
      {
        titulo: "Treinamento de NR não é aqui",
        fala: "Capacitação obrigatória de segurança — NR-10, NR-35 e as demais — vive em Conformidade, porque lá ela tem validade e vira alerta de vencimento.",
        cena: "fluxo",
        rotulos: ["NR obrigatória", "Conformidade", "Alerta de vencimento"],
      },
    ],
  },
  {
    slug: "reconhecimento",
    titulo: "Reconhecimento",
    paraQue: "Mostra quem está completando tempo de casa, com destaque nos marcos redondos.",
    alimenta: "Nada é digitado: a data de admissão da ficha é o que gera a lista.",
    passos: [
      {
        titulo: "A lista sai da data de admissão",
        fala: "Um, cinco, dez anos: os marcos redondos ganham destaque; os outros anos aparecem na lista sem realce. Tudo derivado da data de admissão da ficha.",
        cena: "cartoes",
        rotulos: ["10 anos|2 pessoas", "5 anos|7 pessoas", "1 ano|14 pessoas"],
      },
      {
        titulo: "Use no começo do mês",
        fala: "Abra no início de cada mês para preparar homenagem, publicação ou mensagem. É o tipo de coisa que só é boa quando é lembrada antes, não depois.",
        cena: "calendario",
        rotulos: ["Aniversário de casa", "Marco redondo", "Dia normal"],
      },
    ],
  },
  {
    slug: "pesquisas",
    titulo: "Pesquisas",
    paraQue: "Cria e acompanha as pesquisas: clima, eNPS, integração e desligamento.",
    alimenta: "Título, tipo, perguntas e opções de cada pesquisa — e o disparo dos convites.",
    passos: [
      {
        titulo: "Escolha o tipo antes de escrever",
        fala: "Clima, eNPS, integração e desligamento têm leituras diferentes e relatórios diferentes. O tipo escolhido é o que define como o resultado vai ser lido.",
        cena: "formulario",
        rotulos: ["Título", "Tipo", "Descrição", "Dimensão GPTW"],
      },
      {
        titulo: "Monte as perguntas",
        fala: "Cada pergunta tem enunciado, tipo e as opções de resposta. Pergunta ligada a uma dimensão GPTW é o que permite comparar a empresa com o mercado depois.",
        cena: "checklist",
        rotulos: ["Enunciado escrito", "Tipo de resposta", "Opções listadas"],
      },
      {
        titulo: "Convite vai pelo canal cadastrado",
        fala: "O convite sai por Telegram ou e-mail conforme o que está na ficha da pessoa. Quem não tem contato cadastrado não recebe — e não responder por isso vira baixa adesão que não é desinteresse.",
        cena: "envio",
        rotulos: ["Sistema", "Sua pesquisa de clima está aberta", "Colaborador"],
      },
      {
        titulo: "Excluir apaga as respostas",
        fala: "A exclusão pede confirmação em duas etapas e diz quantas respostas vão junto, porque é irreversível. Numa lista, o risco de verdade é clicar na linha errada.",
        cena: "alerta",
        rotulos: ["Excluir pesquisa", "184 respostas serão apagadas", "Confirmar exclusão"],
      },
      {
        titulo: "O resultado sai em Relatórios",
        fala: "A pesquisa fechada gera relatório na tela de Relatórios, no bloco de pesquisas de gestão. É de lá que sai o material da reunião.",
        cena: "fluxo",
        rotulos: ["Pesquisa fechada", "Relatórios", "Reunião"],
      },
    ],
  },

  // ─────────────────────── Saúde & segurança ───────────────────────
  {
    slug: "conformidade",
    titulo: "Conformidade",
    paraQue: "Cruza o que a lei exige por função com o que a empresa consegue comprovar.",
    alimenta:
      "A matriz de NRs por função, mais os certificados e exames ocupacionais de cada pessoa.",
    passos: [
      {
        titulo: "Primeiro o que se exige",
        fala: "A matriz diz qual NR cada função precisa. Sem a matriz preenchida, o sistema não tem como saber que falta algo — ninguém aparece irregular por falta de exigência cadastrada.",
        cena: "tabela",
        rotulos: ["Função", "NR exigida", "Periodicidade", "Pessoas"],
      },
      {
        titulo: "Depois o que se comprova",
        fala: "Certificado de NR e exame ocupacional com data de validade. É a comprovação que muda a situação da pessoa de irregular para regular.",
        cena: "formulario",
        rotulos: ["Pessoa", "Certificado / ASO", "Emissão", "Validade"],
      },
      {
        titulo: "A situação é calculada na hora",
        fala: "Regular, vencendo ou irregular sai do cruzamento entre exigência e comprovação, sempre no momento em que você abre a tela. Não existe campo de situação para alguém marcar à mão.",
        cena: "cartoes",
        rotulos: ["Regulares|164", "Vencendo|21", "Irregulares|9"],
      },
      {
        titulo: "Irregular é risco de fiscalização",
        fala: "Pessoa exercendo função que exige NR sem certificado válido é autuação e, num acidente, responsabilidade da empresa. Este é o número para zerar primeiro.",
        cena: "alerta",
        rotulos: ["9 irregulares", "Função exige NR sem certificado válido", "Ver lista"],
      },
    ],
  },
  {
    slug: "acidentes",
    titulo: "Acidentes / CAT",
    paraQue: "Consolida os acidentes de trabalho e o andamento de cada CAT.",
    alimenta: "O registro do acidente e a emissão da CAT correspondente.",
    passos: [
      {
        titulo: "CAT pendente vem primeiro",
        fala: "A comunicação de acidente de trabalho tem prazo legal de um dia útil. É o item de prazo mais curto do sistema e o que mais pega numa fiscalização quando fica para trás.",
        cena: "alerta",
        rotulos: ["1 CAT pendente", "Prazo legal: 1 dia útil", "Emitir CAT"],
      },
      {
        titulo: "Registre o acidente com o que se sabe",
        fala: "Data, pessoa, o que aconteceu e afastamento. Registro incompleto ainda é melhor que registro nenhum — o que não pode é o acidente não existir no sistema.",
        cena: "formulario",
        rotulos: ["Colaborador", "Data do acidente", "Descrição", "Afastamento"],
      },
      {
        titulo: "O histórico virá cobrado",
        fala: "A série de acidentes por setor e por tipo é o que sustenta o programa de segurança e o que o auditor pede. Ela só existe se cada caso for registrado na hora.",
        cena: "grafico",
        rotulos: ["Produção", "Logística", "Manutenção", "Campo"],
      },
    ],
  },

  // ───────────────────────────── Gestão ─────────────────────────────
  {
    slug: "painel",
    titulo: "Painel executivo",
    paraQue: "É o BI de RH: turnover, movimentação, evolução do quadro e absenteísmo.",
    alimenta: "Nada é digitado: o painel lê o que as outras telas alimentaram.",
    passos: [
      {
        titulo: "Leitura, não digitação",
        fala: "Todo número aqui vem das fichas, dos desligamentos e das movimentações. Se um indicador parece errado, a correção é na tela de origem — nunca aqui.",
        cena: "fluxo",
        rotulos: ["Fichas e movimentações", "Painel", "Reunião de diretoria"],
      },
      {
        titulo: "Escolha a janela e o recorte",
        fala: "Três, seis, doze ou vinte e quatro meses, e o filtro de marca e CNPJ da lateral. Sem filtro, o painel mostra o grupo inteiro.",
        cena: "cartoes",
        rotulos: ["Turnover|14,2%", "Admissões|38", "Desligamentos|31", "Quadro|412"],
      },
      {
        titulo: "Gráfico e tabela são a mesma coisa",
        fala: "O alternador troca o desenho pela tabela dos mesmos números. Use a tabela quando precisar do valor exato para colar num documento.",
        cena: "grafico",
        rotulos: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"],
      },
      {
        titulo: "Cuidado com a média do grupo",
        fala: "Turnover do grupo esconde a diferença entre CNPJs: uma empresa em quarenta por cento e outra em zero podem virar uma linha de trinta. Para ver CNPJ por CNPJ, use o Placar.",
        cena: "alerta",
        rotulos: ["Média esconde extremos", "Um CNPJ em 40%, outro em 0%", "Abrir o Placar"],
      },
    ],
  },
  {
    slug: "placar",
    titulo: "Placar do grupo",
    paraQue: "Desfaz a média: um CNPJ por linha, lado a lado.",
    alimenta: "Nada é digitado: é a mesma base do Painel, sem juntar os CNPJs.",
    passos: [
      {
        titulo: "Uma linha por empresa",
        fala: "O Painel soma marcas inteiras e produz uma média que ninguém tem. Aqui cada CNPJ aparece sozinho, e é onde se vê qual empresa puxa o número do grupo.",
        cena: "tabela",
        rotulos: ["Empresa", "Quadro", "Turnover", "Absenteísmo"],
      },
      {
        titulo: "Empresa pequena não vira taxa",
        fala: "Abaixo de um mínimo de pessoas a taxa deixa de significar algo — uma saída em cinco pessoas é vinte por cento. Essas empresas aparecem sinalizadas em vez de entrarem no ranking.",
        cena: "alerta",
        rotulos: ["Amostra pequena", "Taxa não é significativa com 5 pessoas", "Ler com cuidado"],
      },
      {
        titulo: "Salário incompleto invalida a soma",
        fala: "Quando poucos têm salário cadastrado, o custo somado parece real e não é. A tela avisa em vez de mostrar o número — corrigir é preencher salário nas fichas.",
        cena: "cartoes",
        rotulos: ["Cobertura de salário|4%", "Custo|não exibido", "Fichas a preencher|37"],
      },
    ],
  },
  {
    slug: "sinais",
    titulo: "Central de Sinais",
    paraQue: "É onde o alerta ganha dono, prazo e desfecho — deixa de ser aviso solto.",
    alimenta: "A resposta ao sinal: quem cuida, até quando, e se virou plano de ação ou foi descartado.",
    passos: [
      {
        titulo: "Os alertas chegam sozinhos",
        fala: "Uma vez por dia o sistema varre a base e grava os sinais: desligamento fora do padrão, líder sobrecarregado, férias vencidas, documento irregular.",
        cena: "alerta",
        rotulos: ["3 sinais novos hoje", "Pico de saídas no setor de Produção", "Assumir"],
      },
      {
        titulo: "Alerta sem dono é ruído",
        fala: "Assumir o sinal e dar prazo é o que separa gestão de aviso. Sem esse passo, o time aprende a ignorar a tela em um mês — e aí os sinais que importam também passam batido.",
        cena: "formulario",
        rotulos: ["Responsável", "Prazo", "O que vai ser feito"],
      },
      {
        titulo: "Dois desfechos possíveis",
        fala: "Virou plano de ação, ou foi descartado com motivo obrigatório. O motivo escrito é o que permite, meses depois, saber se o descarte foi certo.",
        cena: "fluxo",
        rotulos: ["Sinal", "Plano de ação", "ou Descarte com motivo"],
      },
      {
        titulo: "Sinal do grupo aparece para todos",
        fala: "Sinais de um CNPJ seguem sua permissão. Sinal do grupo aparece para todo mundo que entra aqui: o pico do grupo é contexto do seu CNPJ também.",
        cena: "cartoes",
        rotulos: ["Do seu CNPJ|4", "Do grupo|2", "Em aberto|6"],
      },
    ],
  },
  {
    slug: "lideranca",
    titulo: "Malha de liderança",
    paraQue: "Mostra quantos diretos cada líder carrega e onde o cadastro se contradiz.",
    alimenta: "Nada aqui: a correção é no campo supervisor e no marcador de gestor da ficha.",
    passos: [
      {
        titulo: "Quantos cada líder carrega",
        fala: "Líder com diretos demais não consegue avaliar, dar feedback nem aprovar férias no prazo. O número por líder é o que mostra onde a estrutura precisa de mais um nível.",
        cena: "grafico",
        rotulos: ["Líder A", "Líder B", "Líder C", "Líder D"],
      },
      {
        titulo: "Sempre pelo grupo inteiro",
        fala: "A leitura é de tudo que você enxerga, não do CNPJ da URL. Neste grupo a liderança atravessa CNPJ: um líder com cinquenta e sete diretos parece ter sete se você olhar só a empresa onde ele está cadastrado.",
        cena: "alerta",
        rotulos: ["57 diretos no grupo", "7 se olhado por CNPJ isolado", "Ver a malha inteira"],
      },
      {
        titulo: "Divergência de cadastro é conserto de ficha",
        fala: "Quando o marcador de gestor e o campo supervisor discordam, a pessoa aparece aqui. Ela não some enquanto a ficha não for corrigida.",
        cena: "checklist",
        rotulos: ["Marcado como gestor", "Tem diretos apontando para ele", "Cadastro confere"],
      },
    ],
  },
  {
    slug: "time",
    titulo: "Meu time",
    paraQue: "É a leitura de uma equipe pessoa a pessoa, com o bloco dos primeiros 90 dias.",
    alimenta: "Nada é digitado: escolha o setor e leia. Cada correção é na ficha da pessoa.",
    passos: [
      {
        titulo: "Uma equipe, todos os sinais juntos",
        fala: "Tempo de casa, férias, nota do ciclo, ficha e acesso ao portal na mesma linha. É a tela para preparar conversa de gestor, não para digitar.",
        cena: "tabela",
        rotulos: ["Pessoa", "Tempo de casa", "Férias", "Avaliação"],
      },
      {
        titulo: "Escolha o setor no seletor",
        fala: "A tela abre no grupo e você escolhe o setor. O gestor de verdade vê o próprio recorte entrando no portal — e é o mesmo motor de cálculo, então os números batem.",
        cena: "busca",
        rotulos: ["Produção", "Produção — 42 pessoas", "Logística — 18 pessoas"],
      },
      {
        titulo: "Os primeiros 90 dias em destaque",
        fala: "Quem chegou há pouco tem bloco separado. É a janela em que a saída é mais provável e mais evitável — e a única em que dá para agir a tempo.",
        cena: "cartoes",
        rotulos: ["Novos (90 dias)|5", "Trilha em aberto|2", "Sem portal|1"],
      },
    ],
  },
  {
    slug: "dashboard",
    titulo: "Risco psicossocial (NR-01)",
    paraQue: "É o painel exigido pela NR-01: risco psicossocial por setor, com zona e prazo.",
    alimenta:
      "Os planos de ação por setor — o índice sai da avaliação NR-01, não de digitação.",
    passos: [
      {
        titulo: "É obrigação legal, não métrica de engajamento",
        fala: "A NR-01 exige o levantamento de risco psicossocial e tem relatório técnico próprio. Isto não é pesquisa de clima: são instrumentos diferentes com obrigação diferente.",
        cena: "alerta",
        rotulos: ["NR-01", "Levantamento de risco psicossocial obrigatório", "Ver por setor"],
      },
      {
        titulo: "Cada setor tem zona e prazo",
        fala: "O índice classifica o setor numa zona, e cada zona traz o prazo que ela exige e a cadeia de escalonamento. Até risco baixo tem prazo — a norma manda monitorar também.",
        cena: "tabela",
        rotulos: ["Setor", "Índice", "Zona", "Prazo"],
      },
      {
        titulo: "Crie o plano direto do setor",
        fala: "O botão do setor abre o plano já com prazo da zona preenchido. Falta você dizer a ação e o responsável — sem isso o número vermelho fica sendo só etiqueta.",
        cena: "formulario",
        rotulos: ["Ação", "Responsável", "Prazo da zona", "Descrição"],
      },
      {
        titulo: "Setor pequeno não aparece",
        fala: "Abaixo do corte de anonimato o setor fica fora, para não expor resposta individual. O rodapé diz quantos ficaram de fora, então você sabe o que não está vendo.",
        cena: "cartoes",
        rotulos: ["Setores avaliados|11", "Fora por anonimato|3", "Em zona crítica|2"],
      },
    ],
  },
  {
    slug: "planos-acao",
    titulo: "Planos de ação",
    paraQue: "É onde toda decisão de RH ganha ação, responsável e prazo.",
    alimenta: "A ação, o responsável, o prazo e o setor de cada plano.",
    passos: [
      {
        titulo: "Serve para qualquer origem",
        fala: "Plano que veio de clima, de NR-01, de anomalia de desligamento, de líder sobrecarregado — ou de nenhuma origem, só uma decisão de reunião. Tudo cabe aqui.",
        cena: "fluxo",
        rotulos: ["Sinal ou pesquisa", "Plano de ação", "Prazo cobrado"],
      },
      {
        titulo: "Três campos que fazem o plano existir",
        fala: "Ação, responsável e prazo. Plano sem responsável nomeado não é acompanhado por ninguém; plano sem prazo nunca está atrasado, e por isso nunca é feito.",
        cena: "formulario",
        rotulos: ["Ação", "Responsável", "Prazo", "Setor (opcional)"],
      },
      {
        titulo: "O atraso é cobrado sozinho",
        fala: "Plano que passa do prazo vira alerta na Central de Sinais. É o que fecha o ciclo: o sistema levanta o problema, você registra a ação, e ele cobra a ação de volta.",
        cena: "alerta",
        rotulos: ["2 planos atrasados", "Prazo vencido há 8 dias", "Rever prazo"],
      },
    ],
  },
  {
    slug: "relatorios",
    titulo: "Relatórios",
    paraQue: "Gera os relatórios prontos: pesquisas de gestão num bloco, NR-01 em outro.",
    alimenta: "Nada é digitado: escolha o relatório e o período e gere.",
    passos: [
      {
        titulo: "Dois blocos separados de propósito",
        fala: "Pesquisas de gestão — clima, eNPS — de um lado; avaliações NR-01 do outro. A NR-01 é obrigação de segurança com relatório técnico próprio; misturada, ela parece só mais uma métrica.",
        cena: "cartoes",
        rotulos: ["Pesquisas de gestão|4", "Avaliações NR-01|2", "Exportações|CSV e PDF"],
      },
      {
        titulo: "Sempre da empresa da tela",
        fala: "Diferente do Painel, o relatório é escopado ao CNPJ em que você está. Para outro CNPJ, troque de empresa na lateral antes de gerar.",
        cena: "fluxo",
        rotulos: ["Empresa da tela", "Relatório gerado", "PDF ou CSV"],
      },
    ],
  },
  {
    slug: "assistente",
    titulo: "Assistente",
    paraQue: "Responde pergunta escrita em português sobre os dados da empresa.",
    alimenta: "A pergunta. Nada do que você escreve altera dado nenhum.",
    passos: [
      {
        titulo: "Pergunte como você falaria",
        fala: "Quantas pessoas estão em risco de dobra de férias. Quem venceu ASO neste mês. Qual setor teve mais saída no trimestre. Sem filtro para montar, sem relatório para procurar.",
        cena: "busca",
        rotulos: [
          "quem está com ASO vencido?",
          "9 pessoas com ASO vencido",
          "3 vencem nos próximos 30 dias",
        ],
      },
      {
        titulo: "Só leitura, e só da sua empresa",
        fala: "O assistente não altera nem apaga nada, e a empresa é fixada pelo sistema — não dá para pedir dado de empresa que você não enxerga.",
        cena: "fluxo",
        rotulos: ["Sua pergunta", "Leitura dos dados permitidos", "Resposta"],
      },
      {
        titulo: "Toda pergunta fica registrada",
        fala: "Cada consulta entra na trilha de auditoria, com quem perguntou e quando. É exigência de LGPD e vale para todo mundo, inclusive a diretoria.",
        cena: "tabela",
        rotulos: ["Quem", "Quando", "Pergunta", "Dados lidos"],
      },
    ],
  },

  // ──────────────────────────── Configuração ────────────────────────────
  {
    slug: "configuracoes",
    titulo: "Visão geral (configuração)",
    paraQue: "É o mapa do que se configura, com o status real de cada área.",
    alimenta: "Nada aqui: cada cartão leva para a tela que é dona daquele ajuste.",
    passos: [
      {
        titulo: "Status, não só link",
        fala: "Cada cartão diz como a área está de verdade — SMTP desligado, todos os lembretes no horário padrão. Isso evita descobrir que o e-mail está desligado só quando um convite falha.",
        cena: "cartoes",
        rotulos: ["Canais|SMTP desligado", "Lembretes|no padrão", "Tipos de benefício|só o padrão"],
      },
      {
        titulo: "Comece por aqui em empresa nova",
        fala: "A ordem que funciona: setores, cargos, canais de envio, tipos de benefício. Depois disso o cadastro de pessoas tem onde se encaixar.",
        cena: "checklist",
        rotulos: ["Setores criados", "Cargos criados", "Canal de envio ligado", "Benefícios cadastrados"],
      },
    ],
  },
  {
    slug: "setores",
    titulo: "Setores",
    paraQue: "São as áreas da empresa — base do organograma e de quase todo filtro.",
    alimenta: "O nome de cada setor da empresa.",
    passos: [
      {
        titulo: "Cadastro simples, efeito grande",
        fala: "Só o nome. Mas é o setor que agrupa gente no organograma, na escala, no risco psicossocial e em todo filtro do sistema.",
        cena: "formulario",
        rotulos: ["Nome do setor"],
      },
      {
        titulo: "Setor errado esconde problema",
        fala: "Nome duplicado ou quase igual divide a mesma área em duas, e aí nenhuma das duas atinge o mínimo de pessoas para as taxas aparecerem. Padronize o nome antes de cadastrar.",
        cena: "alerta",
        rotulos: ["Produção e Produçao", "Duas áreas para a mesma equipe", "Padronizar nome"],
      },
      {
        titulo: "Desative em vez de apagar",
        fala: "Setor desativado sai das listas novas e mantém o histórico de quem passou por ele. Apagar levaria o histórico junto.",
        cena: "fluxo",
        rotulos: ["Setor encerrado", "Desativar", "Histórico preservado"],
      },
    ],
  },
  {
    slug: "posicoes",
    titulo: "Cargos",
    paraQue: "São as posições que os colaboradores ocupam.",
    alimenta: "O nome de cada cargo da empresa.",
    passos: [
      {
        titulo: "O cargo é a chave da conformidade",
        fala: "É pelo cargo que a matriz de NR sabe qual treinamento e qual exame a pessoa precisa. Cargo genérico demais faz a exigência de segurança não encontrar ninguém.",
        cena: "fluxo",
        rotulos: ["Cargo da pessoa", "Matriz de NR", "Exigência cobrada"],
      },
      {
        titulo: "Nome padronizado, sempre",
        fala: "Escolha um jeito de escrever e mantenha. Auxiliar de Produção e Aux. Produção viram dois cargos, e aí a mesma função aparece dividida em todo relatório.",
        cena: "formulario",
        rotulos: ["Nome da posição"],
      },
    ],
  },
  {
    slug: "estrutura",
    titulo: "Marcas & CNPJs",
    paraQue: "Cadastra a estrutura do grupo: marcas, CNPJs, razões sociais e logos.",
    alimenta: "Marca com nome e cor, e cada CNPJ com razão social, nome fantasia e cidade.",
    passos: [
      {
        titulo: "Esta tela é do grupo, não da empresa",
        fala: "Diferente das outras telas de configuração, aqui você vê e mexe na estrutura inteira. É o único lugar onde o grupo aparece por completo.",
        cena: "fluxo",
        rotulos: ["Grupo", "Marca", "CNPJ"],
      },
      {
        titulo: "Primeiro a marca, depois o CNPJ",
        fala: "A marca agrupa CNPJs e é o que a árvore da lateral usa para filtrar. A cor da marca pinta a interface de quem está trabalhando dentro dela.",
        cena: "formulario",
        rotulos: ["Nome da marca", "Cor da marca", "Logo"],
      },
      {
        titulo: "CNPJ é a empresa de verdade",
        fala: "Razão social, nome fantasia, CNPJ e cidade. É esse cadastro que aparece em relatório, folha e documento — nome fantasia bonito não substitui razão social correta.",
        cena: "formulario",
        rotulos: ["Razão social", "Nome fantasia", "CNPJ", "Cidade"],
      },
    ],
  },
  {
    slug: "canais",
    titulo: "Canais de envio",
    paraQue: "É por onde o sistema fala com o colaborador: Telegram e e-mail.",
    alimenta: "O token do bot do Telegram e os dados de SMTP.",
    passos: [
      {
        titulo: "Sem canal, ninguém recebe nada",
        fala: "Convite de portal, lembrete de pesquisa, aviso de documento vencendo: tudo sai por aqui. Canal desligado não dá erro na tela — as mensagens simplesmente não saem.",
        cena: "envio",
        rotulos: ["Sistema", "Convite do portal", "Colaborador"],
      },
      {
        titulo: "Dois canais, papéis diferentes",
        fala: "Telegram tem entrega quase imediata e é o que funciona com quem trabalha em campo. E-mail serve para o que precisa ficar registrado na caixa da pessoa.",
        cena: "cartoes",
        rotulos: ["Telegram|ligado", "SMTP|desligado", "Envios hoje|38"],
      },
      {
        titulo: "Confira o status antes de disparar",
        fala: "Antes de abrir pesquisa ou mandar convite para muita gente, olhe se o canal está ligado. Descobrir depois significa reenviar tudo.",
        cena: "checklist",
        rotulos: ["Telegram respondendo", "SMTP testado", "Pronto para disparar"],
      },
    ],
  },
  {
    slug: "lembretes",
    titulo: "Lembretes",
    paraQue: "Define a que hora os avisos automáticos saem, no fuso de Brasília.",
    alimenta: "O horário de cada aviso automático do sistema.",
    passos: [
      {
        titulo: "O sistema cobra sozinho, no horário que você marca",
        fala: "Alertas de RH, convites, lembrete de pesquisa e lembrete de portal saem uma vez por dia. Aqui você escolhe a hora de cada um.",
        cena: "calendario",
        rotulos: ["Alertas de RH — 8h", "Convites — 9h", "Lembretes — 14h"],
      },
      {
        titulo: "Horário mal escolhido custa adesão",
        fala: "Lembrete de pesquisa às seis da manhã chega enquanto a pessoa dorme e é lido de madrugada, quando ninguém responde. Encaixe no começo do turno de quem vai receber.",
        cena: "grafico",
        rotulos: ["6h", "8h", "12h", "14h", "18h"],
      },
      {
        titulo: "Isto vale para o sistema inteiro",
        fala: "É configuração global, mesmo estando dentro da rota de uma empresa. Mudar aqui muda o horário para todas as empresas do grupo.",
        cena: "alerta",
        rotulos: ["Configuração global", "Vale para todas as empresas", "Confirmar mudança"],
      },
    ],
  },
  {
    slug: "tipos-beneficio",
    titulo: "Tipos de benefício",
    paraQue: "É a lista de benefícios que a empresa pode conceder.",
    alimenta: "O nome de cada tipo próprio da empresa, somado ao catálogo padrão.",
    passos: [
      {
        titulo: "Catálogo padrão mais os seus",
        fala: "Os tipos comuns já vêm prontos. Aqui você acrescenta o que é próprio desta empresa — cesta, auxílio-creche, o que existir no acordo.",
        cena: "formulario",
        rotulos: ["Nome do tipo"],
      },
      {
        titulo: "É o que aparece na hora de conceder",
        fala: "Cadastrar o tipo é o passo antes de conceder benefício na ficha da pessoa. E é por tipo que o custo aparece somado na tela de Benefícios.",
        cena: "fluxo",
        rotulos: ["Tipo cadastrado", "Concedido na ficha", "Custo somado"],
      },
    ],
  },
  {
    slug: "catalogos",
    titulo: "Catálogos",
    paraQue: "São as nove listas que alimentam campos de escolha por todo o sistema.",
    alimenta: "Itens próprios desta empresa em cada lista — o padrão continua sempre disponível.",
    passos: [
      {
        titulo: "Uma aba por lista",
        fala: "Motivo de desligamento, tipo de documento, categoria de treinamento e mais. Cada aba é uma lista que aparece como opção em alguma tela do sistema.",
        cena: "tabela",
        rotulos: ["Categoria", "Itens padrão", "Itens próprios", "Ativos"],
      },
      {
        titulo: "Somar, não substituir",
        fala: "O catálogo padrão nunca sai. O que você cadastra aqui entra junto, só nesta empresa — então dá para ter a lista do grupo mais o vocabulário de cada operação.",
        cena: "checklist",
        rotulos: ["Itens padrão mantidos", "Itens próprios somados", "Válido só nesta empresa"],
      },
      {
        titulo: "Algumas listas pedem cor ou validade",
        fala: "Onde a lista tem cor, ela pinta a etiqueta na tela. Onde tem validade em meses, o item entra sozinho no controle de vencimentos.",
        cena: "formulario",
        rotulos: ["Nome do item", "Cor", "Validade (meses)"],
      },
    ],
  },

  // ──────────────────────────── Administração ────────────────────────────
  {
    slug: "importacoes",
    titulo: "Importações",
    paraQue: "Carrega colaboradores em massa por planilha CSV, com conferência antes de gravar.",
    alimenta: "A planilha de colaboradores — e a conferência antes de confirmar a gravação.",
    passos: [
      {
        titulo: "Para carga grande, não para o dia a dia",
        fala: "Serve para trazer a base de uma empresa nova ou uma folha de admissão inteira. Uma pessoa só continua sendo mais rápido cadastrar direto na tela de Colaboradores.",
        cena: "fluxo",
        rotulos: ["Planilha CSV", "Conferência", "Fichas criadas"],
      },
      {
        titulo: "A conferência é o passo que importa",
        fala: "Antes de gravar, o sistema mostra o que entendeu de cada linha. É aqui que se pega coluna trocada e data no formato errado — depois de gravar, o conserto é ficha por ficha.",
        cena: "tabela",
        rotulos: ["Linha", "Nome", "O que será gravado", "Aviso"],
      },
      {
        titulo: "O histórico fica registrado",
        fala: "Cada importação guarda quando foi, quem fez e quantas linhas entraram. É o que permite entender depois de onde veio um dado estranho.",
        cena: "tabela",
        rotulos: ["Data", "Quem importou", "Linhas", "Resultado"],
      },
    ],
  },
  {
    slug: "auditoria",
    titulo: "Auditoria",
    paraQue: "É a trilha de LGPD: quem mexeu ou baixou dado pessoal, quando e o quê.",
    alimenta: "Nada — a trilha é gravada pelo sistema e esta tela é somente leitura.",
    passos: [
      {
        titulo: "Exigência de LGPD, não curiosidade",
        fala: "A lei pede saber quem acessou dado pessoal de funcionário. Salário, conta bancária, CPF e documento estão entre os campos acompanhados de perto.",
        cena: "tabela",
        rotulos: ["Quando", "Quem", "O que fez", "Sobre quem"],
      },
      {
        titulo: "Ninguém apaga, nem quem é administrador",
        fala: "A trilha só recebe registro novo — não há como editar nem excluir, e esta tela não tem botão para isso. Trilha que se apaga não serve de prova.",
        cena: "alerta",
        rotulos: ["Somente leitura", "Registro não pode ser editado nem apagado", "Entendi"],
      },
      {
        titulo: "Use quando surgir a dúvida",
        fala: "Quem mudou este salário. Quem baixou a lista de CPFs no mês passado. É a tela que responde, com data e nome.",
        cena: "busca",
        rotulos: ["salário", "12/07 — Ana alterou salário", "03/07 — Carlos exportou CSV"],
      },
    ],
  },
  {
    slug: "papeis",
    titulo: "Papéis e permissões",
    paraQue: "Documenta o que cada papel do sistema pode ver e fazer.",
    alimenta: "Nada: é leitura. Trocar o papel de alguém é feito na tela de Usuários.",
    passos: [
      {
        titulo: "É a régua, não o controle",
        fala: "A tela mostra o que já está em vigor: o que cada papel enxerga e o que consegue mudar. Ela não altera permissão nenhuma.",
        cena: "tabela",
        rotulos: ["Papel", "O que enxerga", "O que pode mudar", "Telas"],
      },
      {
        titulo: "Consulte antes de dar acesso",
        fala: "Antes de escolher o papel de uma pessoa nova, leia aqui o que aquele papel abre. Papel largo demais é o jeito mais comum de dado sensível vazar sem ninguém agir de má-fé.",
        cena: "checklist",
        rotulos: ["Papel confere com a função", "Só as empresas necessárias", "Acesso concedido"],
      },
      {
        titulo: "A troca é em Usuários",
        fala: "Quem muda papel e empresa de um usuário é a tela de Usuários, no menu de cima. Aqui é só onde se confere o que a mudança significa.",
        cena: "fluxo",
        rotulos: ["Ler o papel aqui", "Trocar em Usuários", "Acesso ajustado"],
      },
    ],
  },
];

const PORTAL_DE_GUIAS = new Map(GUIAS.map((guia) => [guia.slug, guia]));

/**
 * Acha o guia da rota aberta. Recebe o pathname inteiro e usa o primeiro
 * segmento depois de /rh/<empresa> — sub-rota herda o guia da tela mãe
 * (/ferias/programadas usa o guia de Férias, e é o certo: é a mesma tarefa).
 */
export function guiaDaRota(pathname: string, empresaId: string): Guia | undefined {
  const base = `/rh/${empresaId}`;
  if (!pathname.startsWith(base)) return undefined;
  const resto = pathname.slice(base.length).replace(/^\//, "");
  const slug = resto.split("/")[0] ?? "";
  return PORTAL_DE_GUIAS.get(slug);
}
