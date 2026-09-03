// Histórico de atualizações do sistema — alimenta a tela "Atualizações" da
// administração (app/(app)/atualizacoes).
//
// MANUTENÇÃO (regra de entrega, ver AGENTS.md): toda entrega que sobe a
// `version` do package.json adiciona a entrada correspondente NO TOPO desta
// lista, no mesmo commit. Se a versão sobe e a entrada não entra aqui, a
// tela passa a mentir por omissão.
//
// Data e horário são textos prontos (dd/mm/aaaa e HH:mm) de propósito: isto é
// registro editorial mantido à mão, não dado de banco — sem fuso, parse ou
// migration. Entregas antigas anteriores à tela foram consolidadas por faixa de
// versão a partir do histórico do git.

export type Atualizacao = {
  /** "1.54.0", ou faixa consolidada de entregas próximas ("1.49.0–1.51.1"). */
  versao: string;
  /** dd/mm/aaaa, texto pronto para exibição. */
  data: string;
  /** HH:mm, horário da publicação. Pode faltar em entradas históricas consolidadas. */
  horario?: string;
  /** Resumo de uma linha, em linguagem de quem usa o sistema. */
  titulo: string;
  /** O que mudou, item a item. */
  itens: string[];
};

export const ATUALIZACOES: Atualizacao[] = [
  {
    versao: "1.164.0",
    data: "03/09/2026",
    horario: "22:15",
    titulo: "Busca global: Ctrl K acha qualquer tela ou pessoa",
    itens: [
      "Na barra de topo há um campo de busca (ou Ctrl K / ⌘K de qualquer tela): digite o nome de uma tela (\"Férias\", \"Emplacamento\", \"Reuniões\") ou de uma pessoa e vá direto com Enter.",
      "Pessoas aparecem com CPF mascarado, setor e CNPJ, e só as dos CNPJs que você enxerga — o mesmo recorte de todas as telas.",
      "As telas listadas são as mesmas dos menus laterais dos três sistemas, respeitando o que o seu perfil alcança.",
    ],
  },
  {
    versao: "1.163.0",
    data: "03/09/2026",
    horario: "21:50",
    titulo: "Faxina de cores: âmbar, verde, azul e roxo saem de 97 arquivos",
    itens: [
      "As 340 cores soltas que sobravam pelo sistema (avisos em âmbar, sucessos em verde-esmeralda, etiquetas em azul e roxo, cinzas de várias famílias) passaram para as cores do visual novo: aviso é texto cinza, sucesso é o único verde, erro e prazo são o vermelho, o resto é tinta.",
      "As ilustrações da tela inicial do RH ficaram em escala de cinza.",
      "Limpeza interna: 307 classes do tema escuro (que já não existia) foram removidas do código.",
      "Organograma, Assistente, Relatórios, Metas, Integrações e Configuração já vinham no visual novo pelos componentes de base — esta versão só tira as cores que restavam.",
    ],
  },
  {
    versao: "1.162.0",
    data: "03/09/2026",
    horario: "21:30",
    titulo: "Títulos de tela e estados vazios no padrão novo, em 48 telas",
    itens: [
      "O título de cada tela (Colaboradores, Vagas, Férias, Escalas, Folha, Placar, Importações…) passou para o tamanho e peso do visual novo — 25px em peso 800 — nas 39 telas que ainda usavam o antigo.",
      "O círculo cinza dos estados vazios (\"Nenhum colaborador encontrado\" e afins) virou o quadrado de superfície, em 16 lugares.",
      "Abas em pílula que ainda tinham estilo próprio passaram para o sublinhado; o último cartão com sombra em volta de uma tabela saiu.",
    ],
  },
  {
    versao: "1.161.0",
    data: "03/09/2026",
    horario: "21:10",
    titulo: "Tela de login em duas metades",
    itens: [
      "A entrada do sistema ganhou a metade vermelha com o FASTMAI, a frase \"Pessoas, processos e delegações do grupo\" e as marcas; o formulário fica à direita, sem cartão, com \"Esqueci minha senha\" ao lado do campo de senha e o botão Entrar com a seta.",
      "No rodapé, o caminho para quem é colaborador: o portal é pelo celular.",
      "No celular a metade vermelha vira uma faixa no topo. A versão do sistema continua visível antes de entrar.",
    ],
  },
  {
    versao: "1.160.0",
    data: "03/09/2026",
    horario: "20:50",
    titulo: "Portal do colaborador: barra de cinco botões embaixo, e a tela inicial com o que há para fazer",
    itens: [
      "As nove abas do topo viraram uma barra fixa embaixo da tela, com cinco destinos: Início · Ponto · Documentos · Fale com RH · Meus dados. Um pontinho vermelho avisa quando há documento em conferência ou campo faltando no cadastro.",
      "Início mostra o ponto (bater e ver as marcações do dia), a lista \"Para você fazer\" (avaliação pendente, cadastro incompleto) e dois números: banco de horas e tempo de casa. Cada item da lista leva direto para a tela certa.",
      "Documentos reúne o que já existe, o envio de novos e os atestados; Meus dados reúne atualizar e conferir o cadastro. Avaliação e equipe (para quem tem) abrem a partir do Início, com o caminho de volta no topo.",
      "Tudo com toque de pelo menos 44px e texto de 14px ou mais.",
    ],
  },
  {
    versao: "1.159.0",
    data: "03/09/2026",
    horario: "20:20",
    titulo: "Painéis e gráficos no visual novo: tinta e vermelho, sem grade",
    itens: [
      "Os gráficos dos painéis (executivo, setor, avaliações, pesquisas, clima, NR-01, Processos, frota) trocaram o azul, o verde e o âmbar por duas cores: tinta para a série principal e vermelho para o que é negativo ou crítico (desligamentos, alerta). Os demais recortes ficam em cinza.",
      "A grade pontilhada atrás dos gráficos saiu; o eixo fica só com os rótulos. A caixa que aparece ao passar o mouse perdeu o canto arredondado e a sombra.",
      "Os números de destaque do Painel executivo e do painel de Avaliações viraram a faixa sem moldura, como nas outras telas.",
      "Verde continua sendo o único sinal de \"em dia\" / \"bom\", e só onde já era.",
    ],
  },
  {
    versao: "1.158.0",
    data: "03/09/2026",
    horario: "19:40",
    titulo: "Ficha do colaborador: as 19 abas viraram um índice lateral em 6 grupos",
    itens: [
      "A fileira de 19 abas deu lugar a um índice à esquerda, agrupado: Cadastro (Ficha, Dependentes, Dossiê) · Tempo (Férias, Ausências) · Segurança (SST, EPIs, Acidentes) · Carreira (Movimentações, Desempenho, Metas & PDI, Treinamentos, Disciplinar) · Patrimônio (Benefícios, Entregas) · Ciclo (Integração, Desligamento).",
      "Cada item mostra a contagem à direita e um \"!\" vermelho quando há algo a resolver (férias vencidas, SST irregular).",
      "O cabeçalho ganhou o quadrado com as iniciais, e os três botões soltos (Ativar/Desativar, Desvincular Telegram, Cobrar cadastro) foram para um único botão \"Ações\".",
      "Links antigos com ?tab= continuam abrindo direto na aba certa.",
      "Correção: as versões 1.156.0 e 1.157.0 não chegaram a ser publicadas — o build falhava na tela de Pendências. Esta versão traz as três de uma vez.",
    ],
  },
  {
    versao: "1.157.0",
    data: "03/09/2026",
    horario: "18:50",
    titulo: "Central de aprovações: uma fila só, da mais antiga para a mais nova",
    itens: [
      "Férias, documentos, ausências e ajustes de ponto deixaram de ser quatro blocos separados e viraram UMA lista, ordenada pelo tempo de espera — o item mais antigo é o primeiro da tela.",
      "No topo, um filtro por tipo com as contagens (Todas · Férias · Documentos · Ausências · Ponto); cada linha mostra o tipo, há quantos dias espera, quem pediu, o que pediu, e os dois botões.",
      "À direita ficam as últimas decisões registradas e o lembrete de que recusar sempre pede motivo.",
      "Nada mudou no que os botões fazem: aprovar continua um clique, recusar continua abrindo o campo de motivo (obrigatório em documento e em ajuste de ponto).",
    ],
  },
  {
    versao: "1.156.0",
    data: "03/09/2026",
    horario: "18:20",
    titulo: "Botões, cartões e tabelas no visual novo — e a tela de Pendências redesenhada",
    itens: [
      "Botões, etiquetas, cartões, campos, abas, tabelas e caixas de diálogo passaram todos para o visual novo de uma vez: sem cantos arredondados, sem sombras, tabela com cabeçalho em caixa alta e linhas separadas por régua.",
      "Pendências agora abre com quatro números (prazo legal ou vencido · esperando decisão · cadastro e dados · em dia) e três colunas pela natureza da ação — cada item mostra o número, o que é e o porquê em uma linha.",
      "Colaboradores: a barra de filtros ficou na ordem fixa (busca · setor · cargo · situação · limpar) com a contagem de resultados à direita, e os botões de ação em massa só aparecem quando há alguém marcado, numa barra escura no topo da lista.",
      "Os números de destaque (o \"148 ativos\" do topo das telas) perderam a moldura e ganharam tamanho: agora são uma faixa separada por réguas.",
    ],
  },
  {
    versao: "1.155.0",
    data: "03/09/2026",
    horario: "17:40",
    titulo: "Barra de topo de uma linha e lateral com grupos que recolhem",
    itens: [
      "A barra de topo tem uma linha só: os sistemas (Pessoas, Processos & Ativos, Delegações) viraram abas de texto ao lado do logo; o seletor de marca/CNPJ continua no meio; e tudo o que é seu — Início, Produtividade RH, Atualizações, Usuários e perfis, Conta, Sair e a versão — mora no menu do seu nome, à direita.",
      "A lateral dos três sistemas é a mesma: 216px, sem ícones, item ativo marcado por uma barra vermelha à esquerda. Os grupos (Ciclo de vida, Departamento pessoal, Frota…) recolhem ao clicar no título e lembram como você deixou; o grupo da tela aberta nunca recolhe.",
      "No RH, \"Pendências\" fica no topo da lateral com o total do CNPJ aberto.",
      "A logo da marca saiu da lateral: ela aparece no seletor de marca/CNPJ da barra, em toda tela.",
      "Sem mudança de tela, de dado ou de permissão — só onde as coisas ficam.",
    ],
  },
  {
    versao: "1.154.0",
    data: "03/09/2026",
    horario: "16:30",
    titulo: "Visual novo: Modernist — tinta sobre papel, uma cor só",
    itens: [
      "O sistema inteiro trocou de roupa: fundo papel, texto tinta e o vermelho do FASTMAI como única cor de destaque — no botão principal, no item ativo e no que tem prazo. O índigo e os cantos arredondados saíram.",
      "Fonte nova (Archivo) em tudo; títulos mais pesados e um pouco menores; números sempre alinhados em coluna.",
      "O tema escuro saiu: ele nunca foi desenhado para o visual novo. O botão de sol/lua desapareceu da barra de topo.",
      "A cor de cada marca deixou de pintar botões e menus dentro do CNPJ — a marca continua identificada pelo nome no seletor e pela logo na lateral.",
      "Só a pintura mudou: nenhuma tela, campo ou regra de acesso foi alterada. A reorganização das telas vem nas próximas versões.",
    ],
  },
  {
    versao: "1.153.2",
    data: "03/09/2026",
    horario: "14:30",
    titulo: "Mais correções de segurança: relatórios, exportações, uploads e recuperação de senha",
    itens: [
      "O título dos relatórios em PDF passa a ser exibido como texto puro — um nome de colaborador ou de campanha mal-intencionado não executa mais nada ao abrir o relatório.",
      "Anexos (dossiê, atestados, currículos) passam a ter o conteúdo conferido contra o formato informado — um arquivo que se diz PDF mas não é, é recusado.",
      "Na inscrição pública de vagas, quem já é candidato não tem mais seus dados ou currículo sobrescritos por quem apenas informe o CPF; a candidatura na vaga é registrada normalmente.",
      "Pedir recuperação de senha passou a ter limite por e-mail e origem, e um teto diário por endereço e no total, evitando bombardeio de mensagens e o esgotamento da cota diária de envio. A tela de login já barrava por tempo quem erra a senha repetidamente.",
      "Ajustes internos: o backup do banco não expõe mais a senha na lista de processos, as tarefas automáticas comparam o segredo em tempo constante, e mensagens de erro internas não vão mais ao chamador.",
    ],
  },
  {
    versao: "1.153.0",
    data: "01/09/2026",
    horario: "00:30",
    titulo: "Delegações: Reuniões — marque uma vez, convoque todo mundo",
    itens: [
      "Novo item Reuniões no menu: assunto, data e hora, local, pauta e os convocados (com pesquisa e favoritos). Ao marcar, CADA convocado recebe a própria demanda — no Telegram e no e-mail, como qualquer demanda.",
      "Aceitar a demanda é confirmar presença; quem não confirmar é lembrado pela cobrança automática de sempre, na régua da criticidade escolhida.",
      "A tela da reunião mostra quem confirmou, quem ainda não, e o atalho para cada demanda. Depois da reunião, encerre aceitando a participação entregue ou dando a baixa direta em quem compareceu.",
      "No detalhe de cada demanda de reunião, aparece de qual reunião ela nasceu.",
    ],
  },
  {
    versao: "1.152.0",
    data: "31/08/2026",
    horario: "21:40",
    titulo: "Frota: tela de Emplacamento — o mês de cada placa e o \"está tudo em dia\"",
    itens: [
      "Novo item Emplacamento no menu da Frota: cada veículo com o mês de pagamento do licenciamento derivado do FINAL DA PLACA, pelo calendário oficial do DETRAN-PB 2026 (final 1 vence em março, final 0 em dezembro).",
      "Semáforo por veículo — em dia, vence em breve (30 dias), vencido, não emplacado, sem calendário — e a resposta no topo da tela: \"frota toda em dia\" ou quantos veículos pedem atenção.",
      "Um clique em \"Marcar em dia\" registra o licenciamento do ano na ficha do veículo (aba de documentos, onde o comprovante pode ser anexado depois); dá para desfazer enquanto não houver arquivo anexado. Tudo com auditoria.",
      "Veículo com a UF de emplacamento vazia no cadastro é calculado pelo calendário da Paraíba, com o aviso \"(UF? → PB)\" na linha — preencher a UF no cadastro remove a suposição.",
    ],
  },
  {
    versao: "1.151.0",
    data: "31/08/2026",
    horario: "20:45",
    titulo: "Delegações: baixa direta como concluída, e a demanda vai só para colaboradores",
    itens: [
      "Quem delegou agora pode dar baixa numa demanda como CONCLUÍDA sem esperar a entrega formal — para quando ela se resolveu por fora (numa conversa, por outro caminho). O motivo é obrigatório e fica no histórico no lugar da entrega.",
      "A baixa direta não mede o responsável: não conta como entrega dele, não entra no % no prazo nem gera tempo de trabalho no painel de entregas — diferente de cancelar, que registra a demanda como não feita.",
      "O responsável é avisado na hora, por Telegram e e-mail, de que não precisa mais entregar nada naquela demanda.",
      "Na criação e na transferência de demanda, o seletor de pessoas agora lista SÓ colaboradores — os usuários do sistema saíram, porque a cobrança pelo bot depende do Telegram, que é vinculado à ficha de colaborador.",
    ],
  },
  {
    versao: "1.144.0",
    data: "30/08/2026",
    horario: "00:01",
    titulo: "Delegações: horas estimadas por demanda e um Relatório com histórico e exportação",
    itens: [
      "Ao montar a demanda pela IA, ela agora também sugere quantas horas de trabalho aquilo deve levar — você confirma ou ajusta antes de enviar, igual já faz com prazo e critério de aceite. Sem base no contexto, ela assume um padrão e avisa.",
      "\"Como andam as entregas\" (em Delegadas por mim) ganhou duas colunas: a média de horas estimadas e quantas entregas ficaram dentro do que se planejou.",
      "Novo item de menu, Relatório (só Direção): a mesma conta, mas do grupo inteiro, com período (7/30/90 dias) e exportação em CSV.",
      "Novo e-mail semanal para a Direção, toda segunda de manhã, com o resumo de como o grupo está entregando.",
    ],
  },
  {
    versao: "1.143.0",
    data: "30/08/2026",
    horario: "00:40",
    titulo: "Delegações: a IA lê a resposta do responsável, e o digest por e-mail entra no ar",
    itens: [
      "Quando o responsável escreve em texto livre (pelo Telegram ou pelo painel), a IA agora lê e classifica: no prazo, em risco, travado esperando alguém, ou pedindo uma decisão sua.",
      "Só quando o pedido é claramente para VOCÊ decidir é que você é avisado na hora — pelos dois canais. Nos outros casos, o sistema anota e segue: em risco, oferece repactuação ao responsável; travado, registra o que está travando; no prazo, só fica registrado.",
      "Se a IA não tem certeza (confiança baixa), a classificação nunca vira \"precisa da sua decisão\" — incerteza nunca interrompe você.",
      "O Painel (item do menu) já estava pronto para isso: agora que a classificação existe de verdade, o filtro por classificação passa a aparecer sozinho lá.",
      "Novo digest por e-mail, 2x por dia (7h e 18h): um resumo do que você delegou, respeitando o retorno que você pediu para cada demanda (diário, semanal, duas vezes por semana, só quando atrasar, ou só na entrega). Atrasadas e em risco aparecem primeiro.",
    ],
  },
  {
    versao: "1.142.0",
    data: "29/08/2026",
    horario: "22:20",
    titulo: "Delegações: o Painel — todas as demandas do grupo, num lugar só",
    itens: [
      "Item novo no menu, só para Admin e Diretoria: \"Painel\". Mostra TODAS as demandas do sistema — de quem foi pedido, para quem, prazo e o que está em dia ou atrasado.",
      "Semáforo geral no topo (🟢 no prazo · 🟡 em risco ou repactuada · 🔴 atrasada · ⚪ aguardando aceite) — clique num número para filtrar só aquele grupo. Exceções (atrasadas e em risco) aparecem primeiro na lista.",
      "Filtros por pessoa, empresa e criticidade; um toque mostra ou esconde o histórico (encerradas e canceladas).",
      "A tela é preparada para o classificador de IA do próximo PR: quando ele existir e começar a rotular as respostas, os rótulos que ele gerar aparecem sozinhos como filtro aqui — hoje, sem classificador, esse filtro simplesmente não aparece.",
    ],
  },
  {
    versao: "1.141.0",
    data: "29/08/2026",
    horario: "21:40",
    titulo: "Delegações: a demanda chega por e-mail também, e a cobrança automática entra no ar",
    itens: [
      "Toda demanda enviada agora chega por Telegram E por e-mail ao responsável — os dois canais são tentados sempre, não é um substituindo o outro.",
      "Motor de cobrança automática (PR 5): o sistema passa a cobrar sozinho, no horário certo, sem precisar de ninguém empurrar. A régua se adapta ao PRAZO de cada demanda — não é um horário fixo, é uma porcentagem do tempo entre o envio e o prazo (40/70/90% para crítica, 60/90% para alta, 75% para normal), então uma demanda de 2 dias e uma de 20 dias cobram nas proporções certas, em momentos diferentes.",
      "Depois do prazo vencido, a cobrança escala por 4 dias (D+0 a D+3): cresce o tom, some Telegram e e-mail juntos, e nas demandas críticas a Direção é avisada diretamente a partir do segundo dia de atraso, com o painel marcando vermelho.",
      "Regra do aceite (24h para crítica, 48h para alta, 72h para normal) também passa a cobrar sozinha: sem aceite dentro do prazo, o sistema lembra o responsável e liga o sinal de risco.",
      "Uma repactuação de prazo desloca a régua inteira automaticamente — não precisa reconfigurar nada, os próximos toques recalculam sozinhos a partir do novo prazo.",
    ],
  },
  {
    versao: "1.140.1",
    data: "29/08/2026",
    horario: "20:35",
    titulo: "Delegações: a marca e o cargo aparecem junto do nome, na hora de escolher a pessoa",
    itens: [
      "No seletor de pessoas e no gerenciador de favoritos, quem tem ficha no RH agora aparece com a marca na frente do nome e o cargo logo depois — antes só o nome (e o tipo) apareciam.",
      "Quem opera o sistema sem ficha ligada (conta pura) continua aparecendo só com o nome, sem inventar marca ou cargo.",
    ],
  },
  {
    versao: "1.140.0",
    data: "29/08/2026",
    horario: "20:20",
    titulo: "Delegações: painel de como andam as entregas, por pessoa",
    itens: [
      "Nova seção em \"Delegadas por mim\": para cada pessoa a quem você já delegou, quantas demandas estão com ela agora, quantas atrasadas, o percentual entregue no prazo, quantas devoluções e repactuações, e o tempo médio até entregar.",
      "\"Tempo até entregar\" conta do aceite até a entrega — é tempo corrido com a demanda na mão, não apontamento de horas trabalhadas, que o sistema não tem. A tela diz isso com todas as letras.",
      "O painel olha o histórico inteiro que você delegou, inclusive demandas já encerradas — não só as que ainda estão em aberto.",
    ],
  },
  {
    versao: "1.139.0",
    data: "29/08/2026",
    horario: "19:55",
    titulo: "Delegações: pesquisa de pessoas para montar a lista de favoritos",
    itens: [
      "Em \"Escolher favoritos\", agora há um campo de pesquisa pelo nome — com acento ou sem. Antes era preciso rolar a lista inteira do quadro para achar alguém.",
      "Os favoritos ficam fixados no topo da lista do gerenciador, fáceis de desmarcar; o resto do quadro aparece conforme você digita.",
      "Os atalhos de favoritos também aparecem no formulário de preencher à mão, acima do campo Responsável — um toque escolhe a pessoa.",
    ],
  },
  {
    versao: "1.138.0",
    data: "29/08/2026",
    horario: "19:10",
    titulo: "Delegações no Telegram: a demanda chega no celular, e dá para responder por lá",
    itens: [
      "Ao delegar, a pessoa recebe a demanda no Telegram — com o prazo e o critério de aceite junto, que é o que ela está aceitando — e três botões: Aceito, Repactuar prazo e Preciso de contexto.",
      "Depois do aceite, ela responde sem abrir nada: escrever no bot vira andamento registrado; \"15/09 fornecedor atrasou\" repactua o prazo com motivo (o prazo combinado fica guardado); e \"ENTREGA\" seguido da prova registra a entrega.",
      "Os botões de cobrança — No prazo, Em risco, Travado e Entregar — já funcionam. O disparo automático deles, no horário certo, é a próxima entrega.",
      "Quem não tem Telegram vinculado continua respondendo pelo Portal do RH; e quem delega é avisado na hora quando a mensagem não pôde ser entregue.",
    ],
  },
  {
    versao: "1.137.1",
    data: "29/08/2026",
    horario: "18:20",
    titulo: "Delegações: quem é usuário e quem é colaborador, e favoritos no topo",
    itens: [
      "Na hora de escolher para quem delegar, cada pessoa agora vem marcada na frente do nome: [Usuário] responde pelas telas do sistema; [Colaborador] responde pelo Portal do RH, no celular. Antes essa informação vinha no fim da linha e sumia quando o nome era comprido.",
      "Seus favoritos aparecem no topo da lista, antes de todo mundo — e agora você também pode favoritar quem só tem ficha, não só quem tem login.",
      "Correção: depois de delegar uma vez a um funcionário sem login, ele sumia da lista e não dava para delegar de novo para a mesma pessoa. Corrigido.",
    ],
  },
  {
    versao: "1.137.0",
    data: "29/08/2026",
    horario: "18:20",
    titulo: "Delegar virou duas coisas: para quem, e o que você precisa",
    itens: [
      "Agora dá para delegar a QUALQUER pessoa: quem usa o sistema recebe nas telas de Delegações; quem não tem login recebe no Portal do Colaborador — o mesmo que já usa para bater ponto —, onde vê o que foi pedido, o prazo e o critério de aceite, e pode aceitar, dar notícia e entregar. Sem senha e sem cadastro novo: a entrada continua sendo pelo bot do Telegram.",
      "Delegar não exige mais preencher formulário. Você escolhe a pessoa, escreve o pedido como falaria (\"preciso do orçamento do gerador da torre 12, pelo menos três fornecedores, até sexta\") e a IA monta a demanda inteira: título, critério de aceite, prazo, criticidade, tipo de evidência e frequência de retorno.",
      "Antes de virar demanda, a tela mostra o que a IA ASSUMIU por conta própria — por exemplo, \"prazo: você não disse até quando, assumi 5 dias\". Você confere e delega num clique, ou ajusta o que quiser. O combinado é seu, então ele passa pelos seus olhos.",
      "Favoritos: marque com a estrela as pessoas para quem você delega sempre e elas passam a aparecer como atalho, na frente da lista, na hora de criar a demanda.",
      "Quem preferir continuar preenchendo os campos à mão tem o botão \"Preencher à mão\", com o formulário completo de antes.",
    ],
  },
  {
    versao: "1.136.0",
    data: "29/08/2026",
    horario: "16:40",
    titulo: "Delegações no ar: delegar, acompanhar e cobrar num lugar só",
    itens: [
      "O sistema ganhou um terceiro módulo, \"Delegações\", ao lado de Pessoas (RH) e Processos & Ativos. Ele registra o que a Direção pede, para quem, com que prazo e com que critério de aceite — e guarda a história inteira de cada demanda.",
      "Duas telas: \"Recebidas\" mostra o que pediram a você, do prazo mais curto ao mais longo, com as que esperam seu aceite no topo; \"Delegadas por mim\" mostra o que você pediu, com as entregas que aguardam o seu aval em destaque.",
      "Ao delegar, o sistema exige o critério de aceite — como saber que ficou pronto — e o prazo. Sem os dois a demanda não é salva, de propósito: é o que evita a cobrança virar discussão sobre o que era para ter sido feito.",
      "Quem executa aceita, reporta andamento, pede repactuação de prazo com motivo e entrega anexando a evidência combinada. Quem encerra é sempre quem pediu — o responsável chega até \"entregue\" e para ali.",
      "Por enquanto o acesso é da Direção. Para liberar outras pessoas, use Usuários e perfis; a cobrança automática pelo Telegram e o painel da Direção chegam nas próximas versões.",
    ],
  },
  {
    versao: "1.135.0",
    data: "28/08/2026",
    horario: "22:50",
    titulo: "Delegações: a fundação do terceiro sistema (ainda sem tela)",
    itens: [
      "Nasce por dentro o módulo Delegações — o motor que vai registrar as demandas da Direção e cobrar o responsável no prazo certo. Esta entrega é só a fundação: as tabelas no banco e as regras do jogo, validadas no servidor (toda demanda tem critério de aceite e prazo; um único responsável; quem encerra é sempre quem pediu; entrega exige evidência; mudar prazo fica registrado com motivo, sem apagar o prazo combinado).",
      "Nada muda na tela ainda: o item \"Delegações\" no topo, as telas e a cobrança pelo Telegram chegam nas próximas versões.",
    ],
  },
  {
    versao: "1.134.3",
    data: "27/08/2026",
    horario: "23:55",
    titulo: "Tarefas automáticas: segredo só pelo cabeçalho seguro",
    itens: [
      "As tarefas agendadas (backup do banco, envios e cobranças automáticas) deixaram de aceitar o segredo de disparo pela URL — ele passa só pelo cabeçalho seguro que o próprio agendador usa. Fecha a chance de esse segredo aparecer em registros de acesso. Nada muda no funcionamento dos agendamentos.",
    ],
  },
  {
    versao: "1.134.2",
    data: "27/08/2026",
    horario: "23:40",
    titulo: "Exportações de CSV e Relatório de Clima mais seguros",
    itens: [
      "Os arquivos CSV (folha e indicadores) agora neutralizam texto que o Excel interpretaria como fórmula — um nome ou observação começando com \"=\" não executa mais nada ao abrir a planilha. Valores numéricos, inclusive descontos negativos, continuam iguais.",
      "No Relatório de Clima, os nomes de setor listados passam a ser exibidos como texto puro, fechando uma brecha em que um nome de setor mal-intencionado poderia rodar script na tela de quem abre o relatório.",
    ],
  },
  {
    versao: "1.134.1",
    data: "27/08/2026",
    horario: "23:10",
    titulo: "Documento disciplinar e definição de líder respeitam o que você enxerga",
    itens: [
      "Abrir o documento de uma medida disciplinar e definir o líder de um colaborador agora só alcançam CNPJs que você realmente vê. Antes, num caso de borda (acesso a um único CNPJ de uma marca com vários), dava para chegar num colaborador de CNPJ irmão que não aparece em tela nenhuma.",
      "A troca de líder passou a registrar na auditoria da empresa certa — a do próprio colaborador —, não a da tela onde a mudança foi feita.",
    ],
  },
  {
    versao: "1.134.0",
    data: "27/08/2026",
    horario: "22:10",
    titulo: "Gestor de setor fica no seu setor — de verdade",
    itens: [
      "O gestor de setor agora só enxerga e mexe no próprio time, pela tela \"Meu Setor\". Antes, digitando o endereço de outra tela na barra, ele conseguia abrir os dados de toda a empresa — isso foi fechado.",
      "O que o gestor faz do time dele continua igual: por exemplo, gerar a trilha de integração de um recém-chegado que reporta a ele segue funcionando normalmente.",
      "Nada muda para os perfis Administrativo, Diretoria e Gestor de RH.",
    ],
  },
  {
    versao: "1.133.1",
    data: "27/08/2026",
    horario: "21:30",
    titulo: "Segurança: multa não muda mais de empresa, e o limite de tentativas de login volta a valer",
    itens: [
      "Editar uma infração da frota agora só funciona se a multa for de um veículo que você tem acesso — antes, num caso de borda, uma edição podia mover a multa de outra empresa para a sua sem aviso.",
      "O bloqueio de 5 tentativas de senha erradas em 15 minutos passou a usar o endereço real de quem tenta; um detalhe técnico deixava esse limite ser contornado. Nada muda para quem usa o sistema normalmente.",
    ],
  },
  {
    versao: "1.133.0",
    data: "27/08/2026",
    horario: "19:30",
    titulo: "Excluir um veículo cadastrado por engano",
    itens: [
      "A placa em duplicidade que veio da importação da frota agora pode sair do sistema: cada veículo ganhou o botão de excluir, com a confirmação \"Tem certeza que deseja excluir este veículo?\" — um clique, sem redigitar a placa.",
      "Quando o veículo tem histórico, o diálogo lista antes o que será apagado junto (infrações, manutenções e as demais tabelas ligadas ao veículo). O documento anexado não vira lixo: o arquivo é limpo junto, sem deixar PDF órfão guardado.",
      "A exclusão vale a partir de qualquer tela da frota consolidada, e fica registrada na auditoria da empresa dona do veículo.",
    ],
  },
  {
    versao: "1.132.0",
    data: "27/08/2026",
    horario: "19:00",
    titulo: "Anexar o documento do veículo: CRLV, licenciamento, seguro e laudos",
    itens: [
      "O botão \"Documento\" de cada veículo virou a papelada do carro num lugar só: além do tipo e da data de vencimento, agora dá para ANEXAR o arquivo em PDF ou foto (até 4 MB) — CRLV-e, licenciamento, apólice, vistoria, laudo, nota fiscal.",
      "Cada documento anexado pode ser aberto na hora, baixado, substituído (escolher outro arquivo troca o anterior) ou excluído — e excluir o documento leva o arquivo junto, sem deixar rastro guardado.",
      "A data de vencimento continua sendo o que gera o alerta: o veículo com licenciamento vencendo aparece na lista de Veículos e na Central de Pendências. Documento sem vencimento (nota fiscal, ATPV) fica cadastrado sem cobrar prazo.",
      "Quem baixa um anexo fica registrado na auditoria, e só entra quem tem acesso àquela empresa e ao sistema Processos & Ativos.",
    ],
  },
  {
    versao: "1.131.0",
    data: "27/08/2026",
    horario: "18:00",
    titulo: "Duas melhorias da auditoria de Setores e Cargos",
    itens: [
      "Corrigido um falso positivo na \"Análise de Cargos Semelhantes\": ela podia sugerir fundir cargos com nomes parecidos mas função diferente (ex.: \"Gerente de Vendas\" com \"Gerente de Redes\"). Agora só sugere fusão quando a diferença é mesmo erro de digitação — troca de substantivo nunca mais entra como \"semelhante\".",
      "Tipos de Benefício ganhou as ferramentas que Setores e Cargos já tinham: a tela mostra quantas concessões usam cada tipo, e um botão remove de uma vez os tipos sem nenhum uso.",
    ],
  },
  {
    versao: "1.130.0",
    data: "27/08/2026",
    horario: "17:10",
    titulo: "Arquivo \"Demitidos\": os desligados históricos saem das telas",
    itens: [
      "Os 71 desligados que estavam no setor \"Não definido\" e os 80 nos cargos \"Não definido\"/\"Inativo\" foram movidos para um setor e um cargo chamados \"Demitidos\" — inativos e OCULTOS: não aparecem nas telas de Setores e Cargos nem nos formulários. Os registros antigos, vazios, foram apagados.",
      "As telas de Setores e Cargos agora mostram só a estrutura de quem trabalha. Desligado que tinha setor/cargo REAL continua onde estava — é isso que sustenta o turnover por setor.",
      "Sentinela reforçada: se algum ATIVO um dia cair em \"Demitidos\" ou \"Não definido\", vira pendência e entra no e-mail de cobrança do RH — mesmo alarme nas lacunas da tela inicial.",
    ],
  },
  {
    versao: "1.129.1",
    data: "27/08/2026",
    horario: "16:40",
    titulo: "Setores e Cargos contam só quem está trabalhando",
    itens: [
      "As telas de Setores e de Cargos passam a contar SOMENTE colaboradores ativos — demitido é história, não lotação. Os totais das telas agora batem com os painéis de gente ativa (225 hoje).",
      "Os arquivos históricos (setor/cargo \"Não definido\", cargo \"Inativo\") aparecem com contagem 0 — e continuam protegidos: a remoção de \"sem funcionários\" segue olhando o vínculo total, então registro com desligados históricos nunca é oferecido para exclusão.",
    ],
  },
  {
    versao: "1.129.0",
    data: "27/08/2026",
    horario: "16:00",
    titulo: "Cargos e Tipos de Benefício: mesmo conserto e mesma organização de Setores",
    itens: [
      "Editar, ativar/desativar ou excluir um cargo ou tipo de benefício de QUALQUER CNPJ agora funciona de qualquer tela — a ação valida pela empresa do registro, não pela da URL, e as mensagens de erro dizem a verdade (era o mesmo defeito corrigido em Setores).",
      "As duas telas ficaram agrupadas: uma linha por nome (com o total e em quantos CNPJs existe), clique para abrir os registros por CNPJ, onde vivem as ações. Tipos de Benefício passou a dizer a qual empresa cada tipo pertence — antes nem mostrava.",
      "O formulário de novo tipo de benefício ganhou o seletor de CNPJ, como o de Setores.",
    ],
  },
  {
    versao: "1.128.0",
    data: "27/08/2026",
    horario: "15:00",
    titulo: "Contrato de aluguel se cadastra dentro de Aluguéis a receber",
    itens: [
      "A tela Aluguéis a receber ganhou o cadastro completo do contrato de aluguel: inquilino, imóvel, CNPJ dono, valor mensal, vigência e status — e o lápis para editar. Cadastrou, escolheu o dia de vencimento, gerou as parcelas: tudo sem sair da tela.",
      "A tela de Contratos deixou de mostrar (e de oferecer) contratos de Receita — lá ficam só os demais: torres, terrenos, fornecedores, prestadores. Aluguel não se mistura com despesa.",
      "Contratos de aluguel em rascunho ou encerrados aparecem no cadastro, mas ficam fora dos totais e não geram parcela — os números continuam batendo com a Central.",
    ],
  },
  {
    versao: "1.127.0",
    data: "27/08/2026",
    horario: "14:00",
    titulo: "Busca de placa na tela de Veículos",
    itens: [
      "A tela Frota › Veículos ganhou uma barra de busca: digite a placa — com ou sem hífen, maiúscula ou minúscula (KLU-5G08 e klu5g08 acham o mesmo carro) — e a lista filtra na hora.",
      "O mesmo campo também busca por modelo, empresa e motorista. Pedido do RH, para localizar rápido numa frota de dezenas de veículos.",
    ],
  },
  {
    versao: "1.126.0",
    data: "27/08/2026",
    horario: "13:15",
    titulo: "Tela de Setores agrupada: uma linha por setor, CNPJs dentro",
    itens: [
      "A tela de Setores deixou de mostrar um registro por CNPJ — \"Administrativo\" legítimo em 3 empresas aparecia 3 vezes e parecia repetição. Agora é uma linha por SETOR, com a soma de colaboradores, vagas e metas, e o número de CNPJs onde ele existe.",
      "Clique na linha para abrir os CNPJs: é lá que vivem as ações (editar, ativar/desativar, unificar, excluir), agindo sempre num registro concreto.",
      "O cartão \"Total de Setores\" passa a contar setores de verdade (nomes), com o número de registros por CNPJ como legenda.",
    ],
  },
  {
    versao: "1.125.0",
    data: "27/08/2026",
    horario: "12:30",
    titulo: "Ativo sem setor vira pendência — e entra no e-mail de cobrança do RH",
    itens: [
      "Todo colaborador ativo que estiver no setor \"Não definido\" aparece agora na tela de Pendências (grupo Cadastro), com atalho direto para a lista filtrada — e entra no e-mail diário de cobrança que o gestor do RH recebe.",
      "Sem setor, a pessoa fica invisível no Painel do setor, no placar e no turnover por setor — por isso deixou de ser só uma nota na tela inicial e virou cobrança.",
      "Hoje a pendência nasce zerada: a organização dos setores de 27/08 apontou setor real para todo mundo que está trabalhando. Ela fica de vigia para os próximos cadastros e importações.",
    ],
  },
  {
    versao: "1.124.2",
    data: "27/08/2026",
    horario: "07:45",
    titulo: "Setores: editar setor de outro CNPJ funciona (e o erro fala a verdade)",
    itens: [
      "A tela de Setores lista o grupo inteiro, mas editar, ativar/desativar ou excluir um setor de outro CNPJ falhava — e a mensagem culpava um \"nome duplicado\" que não existia. Agora cada ação confere o acesso pela empresa do próprio setor, e funciona a partir de qualquer tela.",
      "As mensagens de erro foram separadas: \"nome já existe\" só aparece quando o nome de fato já existe naquela empresa; setor que não está mais lá responde \"setor não encontrado\".",
      "O formulário \"Novo Setor\" ganhou o seletor de empresa: dá para criar o setor em qualquer CNPJ visível, sem trocar de tela (antes ele nascia sempre na empresa da URL, sem avisar).",
      "Desativar/ativar um setor agora avisa quando dá errado — antes o clique falhava em silêncio.",
    ],
  },
  {
    versao: "1.124.1",
    data: "26/08/2026",
    horario: "20:15",
    titulo: "Centrysol fecha o conjunto de logos",
    itens: [
      "A logo da Centrysol foi cadastrada — as quatro marcas do grupo agora têm logo no seletor do topo, no menu lateral e em Estrutura.",
    ],
  },
  {
    versao: "1.124.0",
    data: "26/08/2026",
    horario: "20:10",
    titulo: "A logo da marca em tamanho de verdade",
    itens: [
      "Dentro de uma empresa, a logo da marca aparece no topo do menu lateral — tanto no RH quanto em Processos & Ativos. Quem está trabalhando numa marca vê a logo dela o tempo todo, não só o nome.",
      "No seletor do topo, quando uma marca está acionada, a logo aparece em tamanho legível nas telas largas (no celular continua o selo compacto, que não briga por espaço).",
      "Marca sem logo cadastrada não reserva espaço nenhum — nada muda para ela.",
    ],
  },
  {
    versao: "1.123.3",
    data: "26/08/2026",
    horario: "19:55",
    titulo: "VAPT ganha logo",
    itens: [
      "O wordmark da VAPT identifica a marca no seletor do topo e em Estrutura. Só falta a Centrysol.",
    ],
  },
  {
    versao: "1.123.2",
    data: "26/08/2026",
    horario: "19:45",
    titulo: "LM Telecom também ganha logo",
    itens: [
      "O símbolo da L&M (extraído da arte oficial) passa a identificar a marca no seletor do topo e em Estrutura. Faltam Centrysol e VAPT.",
    ],
  },
  {
    versao: "1.123.1",
    data: "26/08/2026",
    horario: "19:35",
    titulo: "Mobility é a primeira marca com logo",
    itens: [
      "A logo da Mobility foi cadastrada — aparece no seletor de marca do topo e no cartão dela em Estrutura. As demais marcas seguem com o selo de iniciais até enviarem as suas.",
    ],
  },
  {
    versao: "1.123.0",
    data: "26/08/2026",
    horario: "19:45",
    titulo: "A logo da marca aparece onde você trabalha",
    itens: [
      "O seletor de marca/CNPJ da barra de topo passa a mostrar a logo da marca em que você está — de relance, sem ler o nome. Marca sem logo continua com o selo de iniciais na cor dela.",
      "Em Estrutura (Marcas & CNPJs), o cartão de cada marca exibe a logo cadastrada, e o formulário de edição mostra a logo atual antes de você substituí-la.",
      "O lugar de subir a logo já existia (Estrutura → Editar marca → arquivo PNG/JPG/SVG/WebP até 2 MB, ou um endereço https) — o que faltava era ela aparecer em algum lugar depois de enviada. Agora aparece.",
    ],
  },
  {
    versao: "1.122.1",
    data: "26/08/2026",
    horario: "19:25",
    titulo: "O título da aba acompanha a marca",
    itens: [
      "A aba do navegador passa a dizer \"FASTMAI | Sistema do RH\" (e \"Portal do Colaborador | FASTMAI\" no portal) — antes ainda dizia LM Telecom, contrariando a marca que a tela já mostrava.",
    ],
  },
  {
    versao: "1.122.0",
    data: "26/08/2026",
    horario: "19:10",
    titulo: "O sistema agora se chama FASTMAI",
    itens: [
      "A logo FASTMAI — a marca do produto — substitui a da L&M em todo o sistema: barra de topo, login, esqueci/redefinir senha e Portal do colaborador.",
      "O símbolo acompanha o tema: escuro no fundo claro, branco no modo escuro, com o \"MAI\" sempre no vermelho da marca.",
      "A logo da L&M permanece onde a marca é a da empresa, não a do sistema: página de carreiras (Trabalhe conosco) e respostas por link externo.",
    ],
  },
  {
    versao: "1.121.1",
    data: "26/08/2026",
    horario: "11:50",
    titulo: "O endereço do sistema é um só: rh.assinelm.com",
    itens: [
      "Quem entrar pelos endereços técnicos da Vercel (sistemado-rh-two.vercel.app) é devolvido automaticamente para rh.assinelm.com, mantendo a página e os parâmetros. Antes acontecia o inverso: entrando por rh.assinelm.com, o primeiro redirecionamento jogava para o endereço da Vercel.",
      "Links antigos salvos com o endereço da Vercel continuam funcionando — só passam a abrir no endereço oficial.",
    ],
  },
  {
    versao: "1.121.0",
    data: "26/08/2026",
    horario: "11:30",
    titulo: "Painel do setor: todos os setores lado a lado",
    itens: [
      "O Painel do setor abre agora com a tabela de TODOS os setores — ativos, turnover, entradas × saídas, férias vencidas, avaliações pendentes e % com menos de 1 ano de casa, um setor por linha, com a linha do total como referência. Clique num setor e a análise completa dele abre logo abaixo.",
      "A mesma régua vale na tabela e no detalhe — os números nunca discordam entre a visão geral e o mergulho.",
      "Setores digitados com caixa diferente (\"Administrativo\" e \"ADMINISTRATIVO\") passam a contar como um só em todo o painel. Grafias realmente diferentes continuam separadas de propósito: é o painel mostrando o que precisa ser fundido na tela de Setores.",
    ],
  },
  {
    versao: "1.120.4",
    data: "26/08/2026",
    horario: "11:00",
    titulo: "Atualizações desce para a segunda linha",
    itens: [
      "Na primeira linha da barra ficam só os sistemas, a marca/CNPJ e Usuários e perfis. Atualizações passa para a navegação da segunda linha, ao lado de Início e Produtividade RH.",
    ],
  },
  {
    versao: "1.120.3",
    data: "26/08/2026",
    horario: "10:45",
    titulo: "Nome do usuário e Sair descem para a segunda linha",
    itens: [
      "A primeira linha da barra fica inteira para o que é dos sistemas: seletor de sistema, marca/CNPJ, Usuários e perfis e Atualizações — com respiro.",
      "Nome, papel, versão, tema e o botão Sair passam para a direita da segunda linha, ao lado da navegação. O bloco da conta não rola de lado — o Sair fica sempre à mão.",
    ],
  },
  {
    versao: "1.120.2",
    data: "26/08/2026",
    horario: "10:30",
    titulo: "Barra de topo: fim da sobreposição e do nome quebrado",
    itens: [
      "O seletor de marca/CNPJ e o de sistema não passam mais por cima dos itens vizinhos quando a linha aperta — cada pedaço agora encolhe e trunca no lugar de invadir o do lado.",
      "O nome do usuário não quebra mais em duas linhas estourando a barra: nome, papel e versão truncam em uma linha cada (o nome completo aparece ao passar o mouse).",
      "Os rótulos de Usuários e perfis e Atualizações só aparecem por extenso em telas largas; no restante ficam os ícones, com dica ao passar o mouse.",
    ],
  },
  {
    versao: "1.120.1",
    data: "26/08/2026",
    horario: "10:00",
    titulo: "Usuários e perfis sobem para o topo, ao lado do nome dos sistemas",
    itens: [
      "A primeira linha da barra virou a área do que vale para TODOS os sistemas: o seletor de sistema, o de marca/CNPJ e, agora ao lado deles, Usuários e perfis e Atualizações.",
      "A segunda linha fica só com a navegação de páginas do usuário (Início, Produtividade RH). O que é de um sistema específico continua no menu de dentro dele.",
      "Em telas estreitas os rótulos encolhem para ícones — nada passa a rolar de lado na barra.",
    ],
  },
  {
    versao: "1.120.0",
    data: "26/08/2026",
    horario: "09:00",
    titulo: "Um cadastro só de usuários e perfis, no topo, para os dois sistemas",
    itens: [
      "Usuários e perfis de acesso viraram uma área única — \"Usuários e perfis\", na barra de topo — que serve os dois sistemas (Pessoas/RH e Processos & Ativos). As duas telas agora andam juntas, em abas.",
      "É na criação do perfil que se escolhe o alcance: acesso aos dois sistemas inteiros, a um só, ou a telas específicas de cada um — e o usuário recebe o perfil no próprio cadastro.",
      "A tela antiga \"Papéis e permissões\", dentro do menu do RH, saiu: era a documentação do modelo antigo e confundia com o cadastro novo. Quem tiver o link antigo cai direto em Perfis de acesso.",
    ],
  },
  {
    versao: "1.119.0",
    data: "26/08/2026",
    horario: "02:00",
    titulo: "Painel do setor: a gestão de cada setor num olhar",
    itens: [
      "Nova tela Gestão › Painel do setor: escolha um setor e leia o quadro dele — ativos, turnover comparado com a empresa/grupo, entradas × saídas, férias vencidas, avaliações pendentes, acesso ao portal e a evolução mês a mês. É o zoom que faltava entre o Painel executivo (grupo) e o Placar (CNPJs).",
      "O gestor de setor passa a ver ESTES MESMOS números na tela Meu Setor, restritos ao setor dele — gestor e diretoria nunca leem valores diferentes do mesmo setor. Salário não aparece em nada disto.",
      "A evolução do quadro passa a usar a foto mensal (a medição real que o sistema tira todo dia 5) nos meses em que ela existe, e diz quais meses são medidos e quais são reconstituídos do cadastro.",
      "Correção no menu lateral: abrir uma tela não acende mais outro item de nome parecido.",
    ],
  },
  {
    versao: "1.118.1",
    data: "26/08/2026",
    horario: "01:00",
    titulo: "Limpeza de dependências e correções de segurança da cadeia",
    itens: [
      "Cinco bibliotecas que o sistema não usava mais (formulários react-hook-form e gráficos 3D three.js, sobras de versões antigas) foram removidas — instalação menor e menos superfície para vulnerabilidade.",
      "Correções de segurança em dependências internas aplicadas onde havia versão compatível; as PRs de atualização automática abertas desde 13/08 ficam resolvidas.",
      "Nada muda na tela: é manutenção da fundação do sistema.",
    ],
  },
  {
    versao: "1.118.0",
    data: "25/08/2026",
    horario: "23:30",
    titulo: "Panorama da frota: o retrato consolidado dos carros",
    itens: [
      "Nova tela Frota › Panorama para diretoria e gerência: quantos veículos há em circulação, de que tipo, com que motorização e propriedade, onde ficam lotados (cidade-base e setor) e que idade têm — tudo consolidado no escopo de empresas/marcas selecionado na barra.",
      "Mostra a saúde do cadastro num olhar: quantos veículos estão com cadastro incompleto, quantos não estão emplacados e exatamente quais campos essenciais faltam na frota — com atalho para cobrar na Central de Pendências.",
      "Quando a frota está espalhada em vários CNPJs, uma tabela por empresa mostra onde cada veículo está — é aí que a frota importada em lote sob a empresa provisória \"A definir\" aparece esperando ser atribuída ao CNPJ certo.",
    ],
  },
  {
    versao: "1.117.0",
    data: "25/08/2026",
    horario: "22:30",
    titulo: "Cadastro de veículo: todos os campos da frota",
    itens: [
      "O cadastro de veículo passa a ter todos os campos da planilha da frota: ano de fabricação, quilometragem, Renavam, chassi, cidade-base, setor, se está emplacado, e o motorista informado — além dos que já tinha.",
      "Na edição, dá para trocar a empresa (CNPJ) dona do veículo — é assim que se tira um carro da empresa provisória \"A definir\" da importação em lote e coloca no CNPJ certo.",
      "Veículo com placa provisória ou fora do padrão pode ser editado sem travar: a validação de placa só cobra o formato quando você troca a placa, não quando mantém a que veio da importação.",
    ],
  },
  {
    versao: "1.116.0",
    data: "25/08/2026",
    horario: "20:00",
    titulo: "Central de Pendências: veículo com cadastro incompleto",
    itens: [
      "Todo veículo em circulação a que falte um dos campos essenciais — Renavam, chassi, marca, modelo, ano de fabricação ou UF de emplacamento — passa a aparecer na Central de Pendências dizendo exatamente o que completar.",
      "A cobrança escala com o tempo: o veículo nasce com 30 dias de prazo a partir do cadastro (aparece como atenção), e vai ficando mais urgente se ninguém completa. Completou os campos, some da lista.",
      "Serve para a frota importada em lote (o que vier sem dado cai aqui) e para qualquer veículo cadastrado à mão. Veículo vendido ou baixado não entra — só o que está rodando.",
    ],
  },
  {
    versao: "1.115.1",
    data: "25/08/2026",
    horario: "10:00",
    titulo: "Crons de lembrete pausam de madrugada (economia de banco)",
    itens: [
      "Os 7 crons de comunicação (alertas, cobranças, lembretes, avisos) deixam de rodar entre 20:00 e 07:00 (horário de Brasília), todos os dias. Antes eles acordavam o banco a cada 15 minutos a noite inteira só para checar o horário e não fazer nada.",
      "Nenhuma notificação deixa de sair: todo o trabalho já acontecia entre 08:00 e 19:00, dentro da janela mantida. O banco passa a poder dormir de madrugada, reduzindo o consumo de computação.",
      "Backup, foto mensal e detecção de pendências continuam nos horários de sempre — rodam uma vez ao dia, não são o que pesava.",
    ],
  },
  {
    versao: "1.115.0",
    data: "25/08/2026",
    horario: "08:30",
    titulo: "Criar usuário já escolhendo o perfil de acesso",
    itens: [
      "No cadastro de um usuário novo, agora dá para marcar o perfil de acesso na mesma tela — não precisa mais criar o usuário e depois ir em Perfis atribuir. O papel escolhido já sugere o perfil correspondente; ajuste se quiser.",
      "Vale também na edição: os perfis do usuário aparecem marcados e você adiciona ou tira ali mesmo.",
      "Com isso, a área de Usuários fecha o ciclo: cria perfis, cria usuários e conecta os dois sem sair dela.",
    ],
  },
  {
    versao: "1.114.0",
    data: "25/08/2026",
    horario: "07:30",
    titulo: "Controle de acesso: o sistema passa a OBEDECER os perfis (por sistema)",
    itens: [
      "A partir de agora, o acesso a cada sistema (Pessoas/RH e Processos & Ativos) segue o perfil da pessoa, não mais o cargo dela. Um perfil só de RH deixa de entrar em Processos — inclusive pela URL direta —, e vice-versa; a barra de topo mostra só os sistemas que a pessoa tem.",
      "Ninguém perde acesso na virada: os perfis padrão já concedem os dois sistemas a quem tinha, e quem porventura ainda não tiver perfil continua pelo cargo, como antes. A partir daqui, para deixar alguém 'só no RH', é editar o perfil dele em Usuários › Perfis de acesso.",
      "A permissão fina por TELA (ver/editar cada área) já é configurável na tela de perfis; o sistema obedecê-la tela a tela é o próximo passo — por ora ela organiza e planeja o acesso.",
    ],
  },
  {
    versao: "1.113.0",
    data: "25/08/2026",
    horario: "05:00",
    titulo: "Processos & Ativos: recebimento de aluguéis",
    itens: [
      "Nova tela \"Aluguéis a receber\" no módulo: para cada imóvel do grupo alugado a terceiro, o sistema gera as parcelas mensais e você marca o que foi recebido.",
      "Um aluguel é um contrato de categoria Receita. Na tela, escolha o dia do vencimento e gere as parcelas: contrato com prazo de fim já nasce com o termo inteiro; contrato sem prazo (indeterminado) gera 12 meses por vez, e o botão \"Estender parcelas\" continua ali para você gerar os próximos quando precisar.",
      "Três números no topo: a receber (em aberto), em atraso (o que passou do vencimento sem entrar) e recebido. Parcela vencida sem receber vira pendência na Central de Pendências, com data e dono.",
      "Recebeu no mês diferente do previsto (reajuste, desconto)? Registre o valor real. Marcou a parcela errada? O botão de desfazer volta ela para \"em aberto\".",
    ],
  },
  {
    versao: "1.112.0",
    data: "24/08/2026",
    horario: "13:30",
    titulo: "Correções de segurança: acesso a CNPJ, ficha disciplinar, unificação e bot",
    itens: [
      "Criar, editar e excluir CNPJ (e marca) passa a ser exclusivo do Administrador — antes qualquer papel de RH conseguia, e podia mover um CNPJ de marca para ganhar acesso a uma empresa inteira. A tela agora esconde esses botões de quem não é Admin.",
      "Registrar advertência/suspensão na ficha de um colaborador agora confere que a pessoa é da empresa certa — antes dava para gravar na ficha de alguém de outro CNPJ.",
      "Unificar setores ou cargos parecidos passa a respeitar a marca: não dá mais para, num clique, fundir setores de marcas diferentes e misturar colaboradores. E toda unificação passa a deixar registro na Auditoria.",
      "Bot do Telegram: para se vincular pela primeira vez com o CPF, agora é preciso informar também a data de nascimento — impede que alguém que saiba só o CPF de um colega assuma o portal dele. Quem compartilha o contato pelo botão continua igual.",
    ],
  },
  {
    versao: "1.111.3",
    data: "24/08/2026",
    horario: "03:05",
    titulo: "Some o seletor de CNPJ vazio nas telas fora de uma empresa",
    itens: [
      "Em Início, Usuários, Produtividade e Atualizações não existe CNPJ em contexto — e mesmo assim o seletor de CNPJ aparecia ao lado do de marca como um traço solto (\"—\") com uma seta, parecendo um controle quebrado. Agora ele só aparece quando você está dentro de uma empresa.",
      "Nessas telas fica só \"Selecionar marca\": escolher a marca é o que leva para dentro, e o CNPJ vem depois.",
    ],
  },
  {
    versao: "1.111.2",
    data: "24/08/2026",
    horario: "02:40",
    titulo: "Os dois sistemas lado a lado, e os menus do topo voltam a abrir por cima",
    itens: [
      "Trocar de sistema agora é UM clique: Pessoas (RH) e Processos & Ativos ficam lado a lado na barra de topo, com o atual destacado — em vez de escondidos atrás de um menu que precisava abrir.",
      "Corrigido: os menus da barra de topo (marca e CNPJ) abriam PRESOS dentro da barra, obrigando a rolar para escolher. A causa era a proteção contra rolagem lateral no celular, que sem querer também prendia o eixo vertical. Agora eles voltam a abrir por cima da página.",
      "A etiqueta de versão passou para baixo do seu nome, no canto direito — ela responde \"estou vendo a entrega nova?\", que é assunto da sua conta, não de em que sistema você está.",
      "Em telas estreitas, os dois sistemas aparecem como ícones e a logo dá lugar ao que se opera (sistema, marca e CNPJ), para tudo caber sem rolagem lateral.",
    ],
  },
  {
    versao: "1.111.1",
    data: "24/08/2026",
    horario: "02:00",
    titulo: "Barra de topo: o seletor de sistema virou uma pílula igual às de marca",
    itens: [
      "O seletor de sistema (Pessoas / Processos & Ativos) era texto solto com uma setinha, do lado das pílulas de marca e CNPJ — três controles com três aparências. Agora ele é uma pílula com borda igual às outras duas: os três alinhados, mesma altura, lendo como um grupo só.",
      "A etiqueta de versão saiu de dentro do botão (onde ficava amontoada embaixo do nome) e passou a aparecer ao lado, leve e discreta — continua visível no topo, como antes.",
    ],
  },
  {
    versao: "1.111.0",
    data: "24/08/2026",
    horario: "01:10",
    titulo: "Controle de acesso: perfis com permissão por tela",
    itens: [
      "Nova tela \"Perfis de acesso\" (dentro de Usuários): monte pacotes de permissão marcando, tela por tela, o que cada perfil vê e edita nos dois sistemas — RH e Processos & Ativos. Dê o perfil à pessoa em vez de configurar cada uma na mão.",
      "Dá para dar mais de um perfil por pessoa (o acesso é a soma), criar perfis próprios (\"Analista de Frota\", \"Só leitura\") e ligar/desligar um sistema inteiro de uma vez, inclusive telas que vierem no futuro.",
      "Os quatro perfis padrão (Administrador, Diretoria, Gestor de RH, Gestor de Setor) começam reproduzindo exatamente o acesso que cada um já tinha — ninguém perde nada. A partir daí você ajusta: por exemplo, deixar um Gestor de RH só no RH é editar o perfil dele.",
      "Por enquanto os perfis servem para ORGANIZAR e planejar o acesso; a troca para o sistema passar a OBEDECER os perfis (e o fechamento dos furos de segurança que isso traz) vem na próxima entrega, tela por tela, com cuidado para nada quebrar.",
    ],
  },
  {
    versao: "1.110.1",
    data: "24/08/2026",
    horario: "00:20",
    titulo: "O sistema volta a caber na tela do celular",
    itens: [
      "No telefone, a página inteira rolava para o lado: a barra de topo (logo, módulo, marca, CNPJ, tema, usuário, sair) somava 888 pixels numa tela de 375 e empurrava todo o conteúdo junto, em todas as telas. Agora os itens encolhem e a barra cabe.",
      "O menu do RH no celular era a lista vertical inteira — 23 itens, quase duas telas de menu antes de qualquer conteúdo. Virou uma faixa horizontal rolável no topo, como já era no módulo de Processos: de 1760 pixels de altura para 74.",
      "No modo escuro, o item selecionado do menu era o MENOS legível da lista: ele usava a cor da marca como texto, que fica abaixo do contraste mínimo sobre fundo escuro. O item continua marcado pela cor da marca na barra e no fundo, mas o texto passa a usar a cor do tema.",
      "Seu nome e cargo somem da barra de topo em telas estreitas (o atalho para a conta continua ali, no ícone) — era o pedaço que mais roubava espaço no celular.",
    ],
  },
  {
    versao: "1.110.0",
    data: "23/08/2026",
    horario: "23:30",
    titulo: "Processos & Ativos: contratos — o segundo domínio do módulo",
    itens: [
      "Nova área \"Contratos\" no módulo, com duas telas: os contratos (torres, terrenos, postes, prefeituras, condomínios, fornecedores, prestadores PJ e clientes B2B) e as contrapartes — quem assina do outro lado.",
      "A contraparte é cadastrada UMA vez para o grupo inteiro, não por CNPJ: o mesmo locador que aluga torre para duas empresas do grupo aparece uma vez só. É o endereço de notificação formal dela que recebe o aviso de não-renovação, então mantê-lo em um lugar só evita o aviso ir para o endereço desatualizado de uma das fichas.",
      "Três prazos novos passam a cobrar sozinhos na Central de Pendências, com data e dono: a data-limite para avisar que o contrato NÃO será renovado (crítica quando a renovação é automática — passou, renova sozinho por mais um ciclo e sair depois custa multa), o fechamento da janela da ação renovatória de locação não residencial (12 a 6 meses antes do fim; perdida, o direito decai e não se recupera) e o mês-base do reajuste contratado.",
      "O sistema recusa cadastrar reajuste com periodicidade menor que 12 meses: a cláusula seria nula de pleno direito. E a data do próximo reajuste é ancorada no início do contrato, não no ano corrente — um contrato bienal cai sempre no mesmo ano do ciclo, independente do dia em que alguém abre a tela.",
      "Contrato encerrado não some da base: continua sendo prova do que foi combinado. A lista abre filtrada em \"Vigente\" para o que ainda tem prazo correndo não competir com arquivo morto.",
      "Botão \"Aplicar reajuste\" na linha do contrato: registra a data em que o reajuste passou a valer (e o novo valor, se mudou), fecha a pendência e reagenda o próximo ciclo a partir dali.",
      "O gestor escolhido no contrato passa a ser o dono das pendências dele na Central — antes o campo era preenchido e não tinha efeito nenhum.",
      "Suspender um contrato não faz mais o prazo da ação renovatória desaparecer da Central. Suspender a execução não suspende prazo legal, e o alerta seguia essa regra errada.",
      "Dispensar um alerta de reajuste agora vale só para aquele ano — antes desligava o alerta daquele contrato para sempre.",
      "O CNPJ do contrato pode ser corrigido na edição. Como contrato não se apaga, um cadastro no CNPJ errado não tinha conserto.",
    ],
  },
  {
    versao: "1.109.2",
    data: "23/08/2026",
    horario: "21:40",
    titulo: "Exportação de Indicadores (CSV/PDF) agora exporta o que a tela está mostrando",
    itens: [
      "Filtrar o Painel por \"Todas as marcas\", por uma marca ou por um CNPJ e clicar em \"CSV\" ou \"PDF\" agora exporta exatamente esse recorte. Antes, os dois sempre exportavam a marca do endereço da tela, ignorando qualquer filtro escolhido.",
      "O título do relatório e o nome do arquivo baixado também passam a dizer o escopo certo — o nome da marca quando é uma só, ou \"Grupo inteiro\" quando o recorte cruza mais de uma.",
    ],
  },
  {
    versao: "1.109.1",
    data: "23/08/2026",
    horario: "21:10",
    titulo: "Corrigido: \"Todas as marcas\" não mudava nada na tela inicial da empresa",
    itens: [
      "Escolher \"Todas as marcas\" no seletor do topo limpava o filtro da URL, mas a tela inicial de cada empresa continuava mostrando só os CNPJs da mesma marca de antes — o clique parecia não fazer nada. Agora, sem filtro, a tela inicial mostra todas as empresas que você enxerga, do mesmo jeito que o seletor promete.",
    ],
  },
  {
    versao: "1.109.0",
    data: "23/08/2026",
    horario: "15:50",
    titulo: "Processos & Ativos: Painel — a leitura de diretoria",
    itens: [
      "Novo Painel no módulo: seis indicadores (pendências vencidas, vencendo em 7 dias, sem responsável, multas a indicar, CNHs vencendo em 60 dias, veículos ativos) e dois gráficos — o custo da frota mês a mês (combustível/energia, manutenção e multas empilhados, com multa em vermelho: é a única das três que é desperdício puro) e os 5 veículos que mais custaram em 12 meses.",
      "A divisão entre as telas é proposital: a Central é a fila de quem executa (cada linha tem dono e botão), a Análise é a tabela completa de quem investiga, o Painel é o resumo de quem decide — nada nele tem botão de ação; agir é descer à Central.",
      "Os números do Painel usam os mesmos cortes da Central — painel que discorda da fila mata a confiança nos dois.",
    ],
  },
  {
    versao: "1.108.0",
    data: "23/08/2026",
    horario: "15:20",
    titulo: "Frota: consumo, manutenções e a análise de custo",
    itens: [
      "Frota › Consumo: registro de abastecimento (litros) ou recarga (kWh, para elétrico — o cadastro do veículo ganhou o campo de motorização). Cada registro pede o hodômetro, e é dele que sai o rendimento (km/l ou km/kWh) entre um abastecimento e o próximo. O consumo é atribuído a quem está com o carro — dá para corrigir.",
      "Frota › Manutenções: o histórico de cada carro (preventiva, revisão, corretiva, pneus, sinistro), com valor e oficina. Preenchendo a próxima revisão, ela vira aviso na Central de Pendências — o carro avisa antes de quebrar na rua.",
      "Frota › Análise: os últimos 12 meses calculados dos registros. Por veículo: km rodados, gasto com combustível/energia, manutenção, multas, total e R$/km — com destaque para quem acumula corretiva. Por condutor: rendimento médio ao volante e multas indicadas. É a tela que aponta os veículos que estão custando caro e diferencia quem cuida de quem gasta.",
      "Honestidade dos números: sem hodômetro registrado a análise diz \"sem dado\", nunca zero; condutor com menos de 3 abastecimentos aparece como \"poucos dados\" em vez de liderar ranking por sorte; multa só conta para o condutor que foi indicado.",
    ],
  },
  {
    versao: "1.107.0",
    data: "23/08/2026",
    horario: "11:30",
    titulo: "Processos & Ativos: frota e a Central de Pendências (onda 1)",
    itens: [
      "A Central de Pendências é a tela de abertura do módulo: tudo que vence, dos domínios que já existem, numa lista só — com a data, quantos dias faltam, e quem responde. Vencidas no topo, depois o que vence em 7 dias, depois em 30. Pendência SEM responsável aparece em bloco próprio, antes de tudo: prazo que não é de ninguém não vai ser resolvido por ninguém.",
      "Cada pendência tem um botão que resolve (\"Indicar condutor\", \"Abrir veículo\"), não um link de \"ver\". E pode ser dispensada com motivo escrito — sem isso um alarme falso fica eterno e a lista inteira perde a confiança.",
      "Frota › Veículos: placa, modelo, estado de emplacamento, adesão ao SNE (com a data, porque o desconto de 40% só vale se a adesão for anterior à notificação), documentos com validade (licenciamento, IPVA, seguro — NÃO há DPVAT: foi revogado) e a entrega do veículo a um condutor.",
      "Frota › Condutores: botão \"Importar do cadastro\" cria de uma vez os condutores a partir dos colaboradores que têm CNH no cadastro do RH, já puxando a validade do documento — ninguém digita motorista um a um. Categoria e EAR se conferem depois: isso o documento não diz sozinho.",
      "Frota › Condutores: habilitação, validade da CNH (copiada do documento, não calculada), EAR, exame toxicológico e pontuação — com o limite certo para cada caso (40 com EAR; 20, 30 ou 40 sem EAR, conforme as gravíssimas do ano) e o aviso de quando o curso preventivo que zera os pontos já pode ser feito.",
      "Frota › Multas: o auto de infração com todos os relógios que ele dispara, o principal sendo os 30 dias para indicar o condutor — passou, a empresa paga 3× o valor. Ao clicar em \"Indicar condutor\", o sistema já diz quem estava com o veículo naquele dia e hora, pelo registro de entrega. Confirma-se com um clique.",
      "Pontos da CNH só entram na conta do condutor quando ele é indicado. E sete infrações do CTB não pontuam mesmo sendo graves — por isso \"pontua?\" é lido no auto, não deduzido da gravidade.",
      "Um processo automático roda todo dia às 6h20 e mantém a Central em dia. O botão \"Atualizar agora\" faz a mesma coisa na hora.",
    ],
  },
  {
    versao: "1.106.0",
    data: "23/08/2026",
    horario: "09:10",
    titulo: "Novo módulo: Processos & Ativos, com troca de módulo na barra de topo",
    itens: [
      "O sistema deixou de ser um módulo só. Ao lado do logo, onde antes estava escrito \"Sistema de RH\" como texto fixo, agora há um seletor: clicando nele aparecem os módulos disponíveis e dá para trocar de um para o outro sem voltar à tela inicial.",
      "Nasce o módulo Processos & Ativos — o lugar de processos, documentos, contratos, frota (documentação dos carros) e patrimônio. É a outra metade do trabalho de quem faz RH e compliance neste grupo, e até hoje não tinha sistema nenhum: vivia em pasta de computador e e-mail.",
      "O módulo está EM CONSTRUÇÃO e ainda não guarda dado. A tela de abertura descreve o que cada área vai controlar e em que ordem — Frota e Central de Pendências primeiro, depois Contratos e Patrimônio, por último Documentos e Processos. O critério da ordem é um só: quanto dinheiro sai hoje, de forma certa e recorrente, se continuar sem controle.",
      "A mesma tela lista cinco ações que NÃO dependem do sistema e já estão custando dinheiro — a primeira delas, aderir ao SNE para receber multa por meio eletrônico, perde desconto a cada semana que passa.",
      "A marca/CNPJ escolhida viaja junto na troca de módulo: quem está na LM Telecom e vai para Processos & Ativos continua na LM Telecom, com o mesmo filtro aplicado.",
      "O seletor de marca/CNPJ passou a funcionar dentro de qualquer módulo. Antes ele só reconhecia as telas do RH — dentro do módulo novo, trocar de CNPJ jogaria a pessoa de volta no RH sem avisar.",
      "Nada do módulo de RH mudou de lugar. A etiqueta com a versão do sistema continua no mesmo canto, agora dentro do seletor de módulo.",
    ],
  },
  {
    versao: "1.105.2",
    data: "23/08/2026",
    horario: "08:40",
    titulo: "Correções no seletor de marca/CNPJ do topo",
    itens: [
      "Voltou o \"Todas as marcas\": escolher uma marca no seletor era caminho sem volta — não havia como pedir de novo a visão somada do grupo a não ser editando o endereço à mão. O item está de volta no topo da lista de marcas, com o mesmo ícone da lateral antiga.",
      "Corrigido um erro sério: escolher uma marca com mais de um CNPJ (a LM Telecom tem 5) estando dentro de outra marca deixava o sistema com um pé em cada lugar. Telas como Pendências e Colaboradores apareciam ZERADAS, e — pior — o que fosse cadastrado ali (abrir competência de folha, por exemplo) ia para o CNPJ antigo, sem avisar. Agora o sistema entra de fato na marca escolhida.",
      "Trocar de CNPJ com a ficha de um colaborador aberta dava \"página não encontrada\" (a ficha é de outra empresa) e o botão Voltar do navegador não desfazia. Agora a troca leva para a lista da empresa nova.",
      "O painel do seletor não fica mais aberto por cima da tela ao usar o Voltar do navegador.",
    ],
  },
  {
    // Faixa: a 1.105.0 subiu sem entrada aqui (deploy de 22/08 à noite) e a
    // 1.105.1 corrigiu o defeito dela minutos depois. Consolidadas para quem
    // estiver rodando qualquer uma das duas achar a própria versão na lista.
    versao: "1.105.0–1.105.1",
    data: "22/08/2026",
    horario: "23:10",
    titulo: "Trocar de marca ou CNPJ sem voltar para a tela inicial",
    itens: [
      "A escolha de marca e CNPJ saiu da lateral (onde só existia depois de entrar numa empresa) e virou um seletor fixo no topo da tela, visível em qualquer lugar do sistema. Antes, para trocar de empresa era preciso voltar à tela inicial e clicar no cartão.",
      "O seletor tem duas partes: a da esquerda escolhe a marca (e mostra a visão somada de todos os CNPJs dela); a da direita entra num CNPJ específico. Com uma marca já escolhida, a lista da direita mostra só os CNPJs daquela marca, com a opção de voltar ao consolidado.",
      "A barra do topo passou a ter duas linhas — identidade (logo, marca/CNPJ, sua conta) em cima e o menu embaixo. Com o seletor novo somado aos itens do menu, \"Produtividade RH\" ficava cortado nas telas de notebook.",
      "A lista de marcas e CNPJs da lateral foi removida: fazia o mesmo papel do seletor do topo, num lugar mais difícil de alcançar. O filtro por marca/CNPJ continua funcionando igual em todas as telas.",
    ],
  },
  {
    versao: "1.104.0",
    data: "21/08/2026",
    horario: "20:30",
    titulo: "Disciplinar: excluir medida registrada por engano ou teste",
    itens: [
      "Cada medida disciplinar na ficha do colaborador ganhou o botão de excluir (ícone de lixeira) — para registro criado por engano ou durante teste do sistema. Antes não havia como remover, nem pedindo à TI.",
      "A exclusão exige um motivo escrito e guarda uma cópia integral do registro na trilha de auditoria, com quem excluiu e quando — dá para reverter um engano e responder por uma fiscalização. Medida aplicada de verdade não se exclui: se mantém no histórico.",
      "A via assinada anexada (se houver) é removida junto, sem deixar arquivo órfão no banco.",
    ],
  },
  {
    versao: "1.103.0",
    data: "21/08/2026",
    horario: "19:50",
    titulo: "Ponto: jornada de trabalho agora pode ser editada (e desativada)",
    itens: [
      "Cada cartão de jornada em Ponto → Jornadas & Escalas ganhou os botões \"Editar\" e \"Desativar\": dá para corrigir horários, carga diária, tolerância e dias úteis sem excluir e recriar nada. Antes, jornada salva era definitiva — não havia como alterar nem remover.",
      "O formulário também ganhou os campos que faltavam: carga diária (em horas), tolerância (máx. 10 min/dia — Art. 58 § 1º CLT), sábado/domingo úteis, e a opção de jornada de turno único (deixe o 2º turno vazio).",
      "Jornada desativada fica acinzentada na lista e pode ser reativada a qualquer momento — desativar não apaga o histórico.",
      "Corrigido: ao salvar uma jornada, a lista atualiza na hora (antes só aparecia depois de recarregar a página, o que dava a impressão de que não tinha salvado).",
    ],
  },
  {
    versao: "1.102.0",
    data: "21/08/2026",
    horario: "18:10",
    titulo: "Ponto: trava de IP — só bate ponto quem está na rede da empresa",
    itens: [
      "Nova seção \"Rede autorizada (trava de IP)\" em Ponto → Configurações, para empresa com IP fixo: cadastre o IP público do link (a tela mostra o seu IP atual e tem o botão \"Adicionar meu IP atual\") e ligue o bloqueio. Com a trava ativa, o ponto só registra com o celular no Wi-Fi da empresa — pelo 4G/5G a batida é recusada, com mensagem orientando a conectar no Wi-Fi.",
      "Aceita mais de um IP (separados por vírgula) para quem tem mais de um link. A trava pode valer junto com a cerca de GPS: o IP garante a rede, o GPS garante o lugar.",
      "Com o bloqueio desligado, a batida de fora da rede continua valendo, mas fica marcada como fora da rede no registro.",
    ],
  },
  {
    versao: "1.101.0",
    data: "21/08/2026",
    horario: "17:30",
    titulo: "Ponto: cerca de localização (GPS) e pedidos de ajuste/abono pelo colaborador",
    itens: [
      "O RH agora pode limitar ONDE se bate ponto: em Ponto → Configurações, a nova seção \"Localização permitida (cerca de GPS)\" cadastra as coordenadas da empresa (com botão \"Usar minha localização atual\") e o raio em metros. Com a trava ligada, batida fora do raio é recusada na hora — e a mensagem diz a quantos metros da empresa a pessoa estava.",
      "O celular passou a capturar a posição NO MOMENTO da batida, não mais a de quando a tela foi aberta — num app que ficava aberto, a posição velha podia ser de outro lugar. Se o GPS falhar, o rodapé do cartão avisa e oferece \"Tentar de novo\".",
      "Colaborador ganhou o cartão \"Ajustes e abonos\" (no portal e no app de ponto): dá para pedir ajuste de marcação (informando dia, qual marcação e o horário que deveria constar — para quando o celular, a internet ou o GPS falharem) e abono em dia de folga. Nada muda sozinho: o pedido cai na fila do RH, que aprova ou recusa com justificativa, e a pessoa acompanha o status no próprio cartão.",
      "Os pedidos chegam na aba Tratamento (PTRP) e na Central de Aprovações com a etiqueta \"Pedido do colaborador\", e contam no cartão \"Ajuste/abono de ponto a decidir\" da área de Pendências — inclusive no e-mail diário de cobrança.",
    ],
  },
  // Entrada escrita a posteriori a partir do commit d3475f6: a 1.100.2 subiu
  // por outra frente de trabalho sem registrar aqui, e sem ela quem estivesse
  // nessa versão não acharia o próprio número na lista.
  {
    versao: "1.100.2",
    data: "21/08/2026",
    titulo: "Lateral de marcas/CNPJs com selo e cor da marca",
    itens: [
      "A lista de marcas e CNPJs da lateral deixou de ser texto puro: cada marca ganhou um selo com as iniciais na cor dela, a marca selecionada ganha trilho e tinta na própria cor, e o cabeçalho mostra a contagem de CNPJs. O comportamento do filtro não mudou.",
    ],
  },
  {
    versao: "1.100.1",
    data: "21/08/2026",
    horario: "13:10",
    titulo: "App de Ponto: convite de instalação já na tela de entrada",
    itens: [
      "O convite \"Deixe o Ponto na tela do celular\" agora aparece também ANTES do login no /ponto, não só depois do PIN. No primeiro acesso — especialmente no iPhone, onde não existe o popup nativo de instalação — a pessoa via a tela de entrada e achava que não tinha app.",
      "Dispensar o convite uma vez continua valendo para as duas telas.",
    ],
  },
  {
    versao: "1.100.0",
    data: "21/08/2026",
    horario: "13:00",
    titulo: "Entregas: reenvio do lembrete de confirmação pelo Telegram",
    itens: [
      "Na tela de Entregas, a linha \"Aguardando confirmação\" ganhou o botão \"Reenviar\": manda de novo, pelo Telegram, o lembrete para o colaborador confirmar o recebimento pelo portal. Até aqui o aviso saía uma única vez, no registro — quem não respondia naquele dia só era cobrado por telefone.",
      "Também dá para reenviar em massa: o botão \"Reenviar lembrete (N)\" ao lado dos filtros age sobre o que o filtro mostra — dá para cobrar só os cartões de benefícios, por exemplo, sem tocar no resto.",
      "Quem tem mais de um item pendente recebe UM lembrete com todos em lista, não uma mensagem por item. Entrega já confirmada, devolvida ou de colaborador desligado fica de fora sozinha, mesmo se estiver no filtro.",
      "Quem não tem Telegram vinculado não recebe — a tela avisa quantas pessoas ficaram de fora para o RH cobrar pessoalmente, como já faz no registro.",
      "O reenvio não mexe no registro: não altera a data da entrega nem cria entrega nova, e fica na trilha de auditoria.",
    ],
  },
  {
    versao: "1.99.1",
    data: "20/08/2026",
    horario: "11:50",
    titulo: "Corte de desligamentos: dois ajustes da revisão",
    itens: [
      "Ao corrigir data e motivo de um desligamento pela tela de Desligamentos, a dispensa automática de offboarding agora respeita o corte de 16/08/2026: só dispensa sozinha desligamento anterior ao corte. Sem isso, uma importação futura poderia isentar em silêncio uma saída recente que deve ser cobrada.",
      "Na lista de Desligamentos, saída antiga (até 15/08/2026) sem checklist ou sem entrevista aparece com o selo neutro \"Histórico\" em vez de vermelho — vermelho na linha com o indicador do topo zerado dava a impressão de pendência onde a regra diz que não há.",
    ],
  },
  {
    versao: "1.99.0",
    data: "20/08/2026",
    horario: "11:20",
    titulo: "Pendências de desligamento passam a valer só para saídas a partir de 16/08/2026",
    itens: [
      "Decisão do CEO: desligamento até 15/08/2026 (inclusive) é anterior ao início do uso do sistema — veio da importação da base, e não há checklist nem entrevista possíveis de cobrar. Esses casos saem dos cartões \"Desligado sem checklist\", \"Desligado sem entrevista\" e \"Desligamento incompleto\", do indicador do topo e do e-mail diário (eram ~80 itens em cada cartão que ninguém tinha como fechar).",
      "De 16/08/2026 em diante, a saída acontece já dentro do sistema e o offboarding é cobrado normalmente.",
      "Nada foi apagado: os desligamentos antigos continuam na tela de Desligamentos e na ficha de cada pessoa, com o estado real do checklist — só deixam de contar como pendência. Os indicadores da tela de Desligamentos seguem a mesma régua, para o número do cartão bater com a tela.",
      "A dispensa individual de offboarding (botão na ficha) segue existindo para dispensar um caso novo pontual. Para os casos anteriores ao corte ela deixou de ter efeito na cobrança — a data já os exclui. Se o RH quiser tratar um desligamento antigo específico, o caminho é gerar o checklist dele na ficha: o andamento aparece na tela de Desligamentos normalmente.",
    ],
  },
  // Faixa consolidada: a 1.98.1 subiu sem passar por aqui (duas entregas em
  // paralelo no mesmo dia), e a 1.98.2 é esta entrada mais o número na tela.
  {
    versao: "1.98.1–1.98.2",
    data: "20/08/2026",
    horario: "10:55",
    titulo: "Foto do ponto: correções da revisão do mesmo dia",
    itens: [
      "Aparelho antigo que não conseguia processar a foto (alguns Androids e iPhones com sistema desatualizado) ficava SEM conseguir bater o ponto — a foto obrigatória virou beco sem saída nesses casos. Agora a leitura da foto tem três caminhos alternativos e cobre esses aparelhos; se mesmo assim falhar, a mensagem orienta a avisar o RH para registrar a marcação manualmente.",
      "Fechado um furo na regra do servidor: uma chamada direta com \"foto\" forjada (arquivo vazio ou lixo) passava pela validação e registrava a batida. Agora o conteúdo do arquivo é conferido — e um teste automático no CI garante que a regra não afrouxa num refactor futuro.",
      "Tocar em \"Cancelar\" enquanto a foto ainda estava sendo processada não cancelava — a batida registrava mesmo assim. Agora a tela trava durante o processamento e o cancelamento vale.",
      "Com a aba do ponto aberta na virada do dia, os botões ficavam presos em \"Registrado\" com as batidas de ontem; e um erro de rede na hora do registro podia esconder que o ponto JÁ tinha sido gravado. A lista de batidas agora se atualiza na virada do dia, ao voltar para a tela e também depois de um erro.",
      "Na tela de Pendências, o cartão \"Disciplinar sem assinatura\" agora abre a lista já filtrada em quem tem assinatura pendente; o cartão de mensagens deixou de divergir da tela quando havia mais de 200 abertas; e o KPI de entregas conta só colaborador ativo, igual ao cartão.",
    ],
  },
  {
    versao: "1.98.0",
    data: "20/08/2026",
    horario: "10:45",
    titulo: "Foto obrigatória ao bater o ponto",
    itens: [
      "A foto passou a ser OBRIGATÓRIA no registro do ponto — no portal e no app de ponto (CPF+PIN). O botão \"Registrar sem foto\" saiu: sem a foto, a batida não é registrada. Pedido do RH de 20/08: a foto confirma a identidade de quem bate e o local do registro.",
      "A regra vale no servidor, não só na tela: uma chamada direta ao sistema sem foto é recusada do mesmo jeito.",
      "Se a foto não sair (câmera cancelada ou falha), a tela avisa e deixa tentar de novo na hora. Aparelho sem câmera utilizável: o caminho é a inclusão manual pelo RH em Ponto → Tratamento (PTRP), com o motivo registrado.",
      "Batidas antigas sem foto continuam valendo e seguem marcadas como \"sem foto\" no Monitor de Presença — de 12 a 20/08 a foto era pedida mas opcional, e antes de 12/08 não existia.",
    ],
  },
  // As quatro entradas abaixo foram escritas a posteriori: as versões subiram
  // no master sem passar por aqui, e sem elas a tela pularia de 1.94.0 para
  // 1.98.0 — quem estivesse numa das quatro não acharia a própria versão na
  // lista, exatamente o que a regra do AGENTS.md existe para evitar.
  {
    versao: "1.97.1",
    data: "20/08/2026",
    horario: "10:20",
    titulo: "Pendências: cartão e tela de destino contam a mesma coisa",
    itens: [
      "Correção nos cartões novos de Pendências: o número de cada cartão passou a bater com a lista da tela que ele abre.",
      "Desligamentos importados de antes do sistema, que vieram sem o motivo registrado, deixaram de gerar cobrança permanente de checklist e entrevista de saída — a regra de não cobrar offboarding retroativo (07/08) passou a cobrir também esses casos.",
    ],
  },
  {
    versao: "1.97.0",
    data: "20/08/2026",
    horario: "09:58",
    titulo: "Mensagens do portal entram em Pendências e o menu avisa quando há mensagem sem resposta",
    itens: [
      "Mensagem do Fale com o RH sem resposta agora é pendência: aparece como cartão na tela de Pendências, no indicador do topo da tela do grupo e no e-mail diário de cobrança do RH.",
      "O item Mensagens do menu lateral ganhou um contador vermelho com a quantidade de mensagens sem resposta. Ele se atualiza a cada troca de tela e a cada minuto — mensagem nova aparece sem precisar recarregar.",
      "Outras sete filas que já existiam em telas do sistema também entraram em Pendências: ajuste de ponto a decidir, entrega sem confirmação, disciplinar sem assinatura, plano de ação vencido, desligado sem checklist, desligado sem entrevista e sinal sem triagem.",
    ],
  },
  {
    versao: "1.96.1",
    data: "20/08/2026",
    horario: "09:51",
    titulo: "Vínculo do Telegram segue o colaborador na troca de CNPJ",
    itens: [
      "Quem trocava de CNPJ dentro do grupo perdia o vínculo do Telegram e parava de receber convites e lembretes. O vínculo agora acompanha a pessoa na movimentação.",
    ],
  },
  {
    versao: "1.95.0",
    data: "18/08/2026",
    horario: "07:59",
    titulo: "App de ponto separado, com entrada por CPF e PIN",
    itens: [
      "O ponto ganhou um endereço próprio (/ponto): o colaborador entra com CPF e um PIN de 6 dígitos, sem precisar do link do portal pelo Telegram. Para quem bate ponto todo dia, é o caminho curto — e dá para deixar como ícone na tela do celular.",
      "A liberação é individual: o RH libera o ponto pessoa a pessoa na ficha, e só quem está liberado consegue registrar.",
    ],
  },
  {
    versao: "1.94.0",
    data: "15/08/2026",
    horario: "12:30",
    titulo: "Entregas: aviso no Telegram, aba na ficha e cadastro de tipo sem sair do formulário",
    itens: [
      "Registrou a entrega, a pessoa é avisada NA HORA pelo Telegram: o bot manda o que foi registrado e ensina o /portal para tocar em \"Recebi\". Antes o pedido de confirmação só aparecia quando ela abrisse o portal por conta própria — e ninguém abre. A tela passa a dizer quantos foram avisados e quantos não têm Telegram (desses, cobre a assinatura pessoalmente).",
      "A ficha do colaborador ganhou a aba Entregas, ao lado de EPIs: tudo que aquela pessoa recebeu, com a situação de cada item — aguardando confirmação, confirmada ou devolvida. É o relatório que se olha no desligamento, e onde o próprio RH responde \"o que fulano tem da empresa?\".",
      "Dá para registrar uma entrega individual direto da ficha — o notebook do recém-chegado se registra ali, sem ir à tela de lote.",
      "No formulário de registrar entrega, o botão \"+ novo tipo\" cadastra um tipo novo na hora (cadeira ergonômica, chip, ferramenta) sem sair da tela — e sem perder as pessoas que você já tinha marcado. O tipo entra no catálogo da empresa, o mesmo de Configuração → Catálogos.",
      "A tela de Catálogos agora abre direto na lista certa quando se chega por um link de outra tela, e o texto dela dizia \"9 listas\" com dez na tela — o número agora é contado, não escrito.",
    ],
  },
  {
    versao: "1.93.0",
    data: "15/08/2026",
    horario: "12:05",
    titulo: "Entregas ao colaborador: o cartão de benefícios sai com confirmação de quem recebeu",
    itens: [
      "Tela nova em Departamento pessoal → Entregas. Serve para cartão de benefícios, notebook, uniforme, crachá, chip de celular — qualquer coisa que a empresa entrega e precisa saber que chegou.",
      "O registro é EM LOTE: escolhe o tipo, a data e marca todo mundo que recebeu. Cento e setenta e um cartões entregues no mesmo dia viram um lançamento, não cento e setenta e um formulários.",
      "Quem confirma é o colaborador, no portal — não o RH. Assim que a entrega é registrada, aparece um aviso no topo do portal dele com o botão \"Recebi\". No cartão de benefícios isso deixa de ser burocracia e vira controle financeiro: é o cartão onde caem comissão e premiação, e a prova de recebimento tem que vir de quem recebeu.",
      "A tela abre já filtrada em \"aguardando confirmação\", porque é essa a pergunta do dia a dia: quem ainda não confirmou. Linha sem confirmação fica em vermelho.",
      "Entrega já confirmada não pode ser apagada — apagar seria apagar a prova. Se o item voltou (notebook, crachá), o caminho é registrar a devolução, que deixa rastro dos dois lados.",
      "A lista de tipos é sua: cadeira ergonômica, ferramenta, o que for — cadastre em Configuração → Catálogos → tipos de entrega, sem depender de nova versão do sistema.",
      "Também corrigido: o menu lateral mostrava \"Ponto Eletrônico\" e \"Ponto\" como dois itens, os dois abrindo a mesma tela.",
    ],
  },
  // Entrada escrita a posteriori: a 1.92.0 subiu no master (e57bb9f) sem
  // passar por aqui. Sem ela a tela pularia de 1.91.0 para 1.93.0 e quem
  // estivesse rodando a 1.92.0 não acharia sua própria versão na lista —
  // exatamente o que a regra do AGENTS.md existe para evitar.
  {
    versao: "1.92.0",
    data: "15/08/2026",
    horario: "11:41",
    titulo: "Gestor de setor sem setor apontado não deixa mais a tela em branco",
    itens: [
      "Quem entrava como gestor de setor sem ter um setor no vínculo caía numa tela que não carregava nada: o sistema mandava a pessoa para \"Meu setor\", e \"Meu setor\" devolvia para o início, num vai e volta sem fim. Aconteceu com o login do Matheus.",
      "Agora \"Meu setor\" é o fim da linha: quando falta o vínculo, a tela explica o que está faltando e onde consertar — Usuários → Vincular, feito por ADMIN ou DIRETORIA.",
      "As duas portas que criavam gestor sem setor foram fechadas: o convite passa a exigir o setor, e a edição não deixa promover alguém a gestor sem um vínculo ativo com setor.",
      "O botão Vincular agora aceita empresa em que a pessoa já está vinculada (marcada como \"já vinculado\") e salva como atualização. Antes, o filtro escondia justamente o vínculo que precisava de conserto.",
    ],
  },
  {
    versao: "1.91.0",
    data: "15/08/2026",
    horario: "10:25",
    titulo: "Resultados agora mostram cada pergunta — inclusive múltipla escolha e texto livre",
    itens: [
      "A tela de Resultados só mostrava média por dimensão e por setor, que serve para pesquisa de clima. Pesquisa com múltipla escolha — \"você usou o benefício?\" — dava para criar, enviar e responder, e não dava para LER: a tela ficava vazia.",
      "Agora cada pergunta aparece com sua distribuição: quantos escolheram cada opção e o percentual, na ordem do formulário. E as respostas de texto livre aparecem uma a uma — é onde mora o motivo por trás do número.",
      "Nas perguntas de nota, a distribuição vem JUNTO da média. Média 5 pode ser \"todo mundo achou mediano\" ou \"metade odiou e metade adorou\", e as duas pedem decisões opostas.",
      "O menu deixou de se chamar \"Pesquisas de clima\" e passou a ser só \"Pesquisas\": a ferramenta sempre serviu para qualquer pergunta ao time — desligamento e eNPS já estavam lá —, mas o nome fazia parecer que não.",
      "A opção \"pesquisa anônima\" parou de dizer apenas \"recomendado\" e passou a explicar quando cada escolha serve. Anônima é certa para clima e risco psicossocial; para uso de benefício ela atrapalha, porque o valor está justamente em saber quem não usa.",
    ],
  },
  {
    versao: "1.90.2",
    data: "14/08/2026",
    horario: "10:45",
    titulo: "Pendências: números dos cartões batem com a tela de destino",
    itens: [
      "Corrigido o bug recorrente onde cartões \"Esperando sua decisão\", \"Prazo correndo\" e \"Cadastro a completar\" mostravam números diferentes da tela que abriam. O link do popover agora passa ?empresas= para manter consistência.",
      "O filtro de marca viaja junto no clique, garantindo que a lista da empresa abra mostrando os MESMOS CNPJs que geraram o número do cartão.",
    ],
  },
  {
    versao: "1.90.1",
    data: "14/08/2026",
    horario: "04:06",
    titulo: "O sistema não pode mais ficar sem ADMIN por um clique na edição",
    itens: [
      "Excluir o último ADMIN ativo já era barrado. EDITAR não era: desmarcar \"ativo\" ou trocar o papel dele chegava ao mesmo lugar — sistema sem ninguém que administre empresas, sem tela para sair disso.",
      "Agora as três portas estão fechadas, com a mesma mensagem. Promover alguém a ADMIN continua sempre liberado: é a saída caso o sistema já esteja nessa situação.",
      "Também não dá mais para desativar o próprio usuário. A lista tem uma linha por pessoa e o engano é de um clique.",
    ],
  },
  {
    versao: "1.90.0",
    data: "14/08/2026",
    horario: "03:40",
    titulo: "Limite de jornada do estagiário agora é configurável na tela — com teto de 6h",
    itens: [
      "O RH define o limite em Ponto → Configurações, em horas por dia e por semana. Antes o número estava fixo no código e mudar dependia de uma nova versão do sistema.",
      "O teto é 6h por dia e 30h por semana — o que a Lei 11.788/2008 permite. Dá para REDUZIR como política da empresa; aumentar, não. Tentar salvar 8h devolve o motivo na tela.",
      "A trava vale mesmo se o número for alterado por fora da tela: o sistema trunca no teto legal toda vez que aplica a regra, não só na hora de salvar.",
      "MUDANÇA NO NÚMERO EM USO: até ontem o limite era 5h fixo. As empresas passam a 6h, que é o teto da lei. Quem quiser manter 5h, é só ajustar na tela — leva um minuto.",
      "A tela mostra a regra ao lado do campo, não só na mensagem de erro: quem preenche precisa saber o limite antes de tentar.",
    ],
  },
  {
    versao: "1.89.0",
    data: "14/08/2026",
    horario: "03:24",
    titulo: "Fim da primeira versão do ponto: um sistema só, e o cartão de bater ponto aparece uma vez",
    itens: [
      "Existiam DUAS versões do ponto eletrônico convivendo no sistema, gravando em tabelas diferentes. A primeira, mais simples, não tinha número de registro nem código de segurança e não aparecia em tela nenhuma — mas continuava aceitando gravação. Uma batida que caísse lá ficaria invisível para o RH e fora dos arquivos AFD e AEJ.",
      "Ela foi removida por inteiro, com as tabelas. Deu para apagar porque o ponto ainda está em implantação e nenhuma batida foi registrada — não havia registro de jornada a perder.",
      "O cartão de bater ponto aparecia duas vezes na tela inicial do portal: solto no topo e de novo dentro da aba \"Ponto Eletrônico\". Ficou só o do topo, sempre visível — marcar o ponto é a ação mais frequente, e exigir um clique em aba antes é atrito no celular. A aba segue com o banco de horas.",
      "Fecha a auditoria do ponto começada ontem: número de registro que podia repetir, marcação repetida sem trava no servidor, regra de estagiário que não rodava e agora a versão duplicada.",
    ],
  },
  {
    versao: "1.88.0",
    data: "14/08/2026",
    horario: "02:58",
    titulo: "Teto de jornada do estagiário passa a valer de verdade — avisando, não bloqueando",
    itens: [
      "A regra de 5h por dia e 30h por semana existia no código mas não rodava: ela estava na versão antiga do ponto, que nenhuma tela usa desde o mês passado. Na prática, um estagiário fechava 8 horas e o sistema aceitava calado.",
      "O cálculo também estava errado: contava da primeira entrada até agora, o que inclui o almoço. Quem entrasse às 8h e saísse às 13h com uma hora de intervalo aparecia com 5h em vez de 4h — e era barrado sem ter passado de nada. Agora soma os pares de marcação, como manda a jornada real.",
      "MUDANÇA DE COMPORTAMENTO: o sistema avisa, mas não recusa mais a marcação. Recusar a saída não impede ninguém de trabalhar — quando o sistema descobre, a pessoa já trabalhou. O que a recusa produzia era uma jornada com entrada e sem saída: o estagiário ficava sem registro da hora em que foi embora, e a empresa com uma pendência aberta no lugar de um fato datado.",
      "O aviso aparece para o estagiário na hora, dizendo quantas horas ele já tem e pedindo que fale com o supervisor. A marcação entra normalmente, e o excesso fica visível no ponto e no tratamento (PTRP).",
      "A semana conta de segunda a domingo, no horário de Brasília — não no do servidor, que roda em UTC e viraria o dia três horas antes.",
    ],
  },
  {
    versao: "1.87.2",
    data: "13/08/2026",
    horario: "22:25",
    titulo: "Ponto: a mesma marcação não entra duas vezes no mesmo dia",
    itens: [
      "A trava contra bater a mesma marcação duas vezes existia só no botão da tela — o servidor aceitava tudo. Toque duplo no celular, rede lenta reenviando ou uma chamada direta ao sistema registravam dez \"Entrada\" no mesmo dia, e sobrava para o RH limpar pelo tratamento de ponto.",
      "Agora o servidor confere antes de gravar, e a recusa diz o que a pessoa vê no botão: \"Você já registrou Entrada hoje\" — não um código.",
      "O dia considerado é o de Brasília, não o do servidor. Isso não é detalhe: o sistema roda em UTC, onde 21h de Brasília já é o dia seguinte. Uma trava que olhasse o dia do servidor deixaria passar a batida repetida de quem marca à noite — justamente o segundo turno.",
    ],
  },
  {
    versao: "1.87.1",
    data: "13/08/2026",
    horario: "21:56",
    titulo: "Ponto: o número do registro (NSR) não pode mais repetir",
    itens: [
      "Duas pessoas batendo o ponto no mesmo instante podiam receber o MESMO número sequencial de registro. O sistema lia \"qual o maior número até agora\" e somava 1 — e entre a leitura e a gravação cabia outra batida. Na virada de turno, com o time inteiro marcando junto, isso acontecia.",
      "Por que importa: o NSR é exigência da Portaria MTP 671/2021 e é ele que identifica cada linha no arquivo AFD entregue à fiscalização. Número repetido é arquivo malformado.",
      "Agora o banco recusa a repetição, e a batida que perder a disputa tenta de novo sozinha — o colaborador não vê erro nenhum, só o comprovante normal.",
      "Batidas já gravadas não foram renumeradas de propósito: o NSR faz parte do código de segurança (hash) de cada marcação, e reescrevê-lo em massa invalidaria registros de jornada que já existem. Se houver repetição antiga, a tela de exportação avisa na hora de gerar o AFD/AEJ, com o número exato, para o RH decidir antes de entregar à contabilidade.",
    ],
  },
  {
    versao: "1.87.0",
    data: "13/08/2026",
    horario: "10:15",
    titulo: "Estágiarios: limite de 5h/dia e 30h/semana reforçado no ponto",
    itens: [
      "Estágiarios agora têm validação obrigatória ao registrar ponto de saída: o sistema recusa se houver tentativa de trabalhar mais de 5 horas num dia ou mais de 30 horas na semana.",
      "O tipo de contrato \"Estágio\" já existia; agora tem as restrições de jornada automáticas. O portal mostra a classificação de estágiario em destaque na ficha.",
      "Estágiarios continuam excluídos do controle de férias CLT — já estava correto. A restrição é apenas na quantidade de horas trabalhadas.",
    ],
  },
  {
    versao: "1.86.0",
    data: "13/08/2026",
    horario: "09:40",
    titulo: "Varredura de duplicados agora cruza CPF, telefone e Telegram — e enxerga os desligados",
    itens: [
      "O aviso de prováveis duplicatas no topo de Colaboradores passa a procurar por CPF repetido, não só por telefone e nome parecido. CPF igual não é indício, é prova: é a mesma pessoa em duas fichas.",
      "E passa a incluir os DESLIGADOS na comparação. Era o buraco que importava: a ficha duplicada quase sempre é a antiga, encerrada — e é ela que fica segurando o Telegram da pessoa. A tela que deveria mostrar o conflito jurava que não havia nenhum.",
      "Cada achado vem com etiqueta do que fazer. \"Resolver agora\" é o que trava alguém hoje: duas fichas ativas com o mesmo CPF, ou uma ficha desligada segurando o Telegram — a causa exata do \"já está vinculado a outro colaborador\".",
      "\"Provável recontratação\" desce para o fim da lista. Uma ficha ativa e uma encerrada com o mesmo CPF costuma ser cadastro certo, não erro, e misturar isso com o resto encheria a tela de casos que não são problema.",
      "Quem segura Telegram aparece marcado na lista, em vermelho quando é uma ficha desligada. Dali é um clique até a ficha e outro no botão Desvincular.",
    ],
  },
  {
    versao: "1.85.0",
    data: "13/08/2026",
    horario: "08:52",
    titulo: "Pagamento por PIX-CPF, Telegram que se desvincula e busca por telefone",
    itens: [
      "O bloco \"Dados bancários\" saiu da ficha e do portal. No lugar entra o PIX, e a chave é o CPF do próprio colaborador — já preenchido, sem nada a digitar. O CPF é a única chave que não pode ser apontada para a conta de outra pessoa.",
      "Fica com o RH a parte que sobra: avisar o colaborador para deixar o CPF cadastrado como chave PIX na conta onde ele quer receber o salário.",
      "Por que isso é mais seguro: enquanto o portal aceitava banco, agência e conta, quem tomasse o Telegram de alguém podia trocar a conta de destino do próprio salário — e o RH só descobriria pelo aviso por e-mail, depois do fato. Não há mais o que trocar.",
      "A ficha ganhou o botão de DESVINCULAR o Telegram. Quando o bot recusa um colaborador com \"este Telegram já está vinculado a Fulano\", é aqui que se resolve: abra a ficha do Fulano que o bot nomeou e solte o vínculo — o aparelho fica livre na hora. Antes a mensagem mandava procurar o RH para uma correção que não existia em tela nenhuma.",
      "A busca de Colaboradores passa a achar por TELEFONE, colando o número em qualquer formato — com ou sem DDD, com ou sem o nono dígito. É como se descobre se um número está preso em outra ficha.",
      "E se a ficha que segura o número for de alguém já desligado, a busca avisa: \"mais 1 ficha casa com essa busca em desligados\", com um clique para mostrá-la. Antes a lista vinha vazia e parecia dizer que o número não estava em lugar nenhum.",
      "\"Cadastros incompletos\" parou de cobrar banco, agência e conta — dado que nenhuma tela aceita mais. O bot também parou de pedir isso por Telegram.",
    ],
  },
  {
    versao: "1.84.0",
    data: "13/08/2026",
    horario: "05:00",
    titulo: "Foto de referência na ficha: agora dá para comparar a batida com o rosto certo",
    itens: [
      "Faltava a outra metade da conferência de ponto. A foto da batida existia desde ontem, mas quem abria não tinha com o que comparar — ninguém reconhece 170 pessoas de memória.",
      "A ficha do colaborador passa a ter foto de referência, e ela se preenche sozinha: a primeira batida de cada pessoa vira a referência. Não é preciso reunir foto de ninguém para começar a usar.",
      "No Monitor de Presença, a referência aparece à esquerda das batidas do dia — é só clicar para ver o rosto e comparar.",
      "Referência que entrou sozinha fica marcada como \"a conferir\", em âmbar. É proposital: se justamente a primeira batida da pessoa tiver sido feita por outra, a referência nasceria errada e passaria a validar a fraude. Um clique do RH confirma, ou o RH envia uma foto melhor pela ficha — e aí ela já vale como conferida.",
      "A foto fica em armazenamento privado, fora do banco, e só abre para quem tem acesso à empresa. Cada visualização entra na trilha de auditoria, como RG e atestado.",
    ],
  },
  {
    versao: "1.83.3",
    data: "13/08/2026",
    horario: "04:00",
    titulo: "Auditoria do que foi entregue: três correções e a verificação automática completa",
    itens: [
      "Na tela inicial, clicar em \"Esperando sua decisão\" abria uma lista com o número TOTAL de pendências da marca — o cartão dizia 6 e a lista dizia 169. Agora cada cartão abre a lista do próprio grupo, e os dois números fecham.",
      "A foto da batida de ponto passou a aceitar também o formato PNG. Alguns celulares entregam a foto nesse formato quando não conseguem gerar o outro, e nesses casos a batida chegava marcada como \"sem foto\" sem que ninguém soubesse o motivo.",
      "Três verificações automáticas do sistema (desacoplamento do banco, portal do colaborador e reconhecimento) não estavam em nenhuma rotina: rodavam só quando alguém lembrava. Entraram para a verificação que roda a cada mudança — que é justamente o problema que essa rotina existe para acabar.",
      "Resultado da auditoria completa: 41 verificações automáticas, todas passando.",
    ],
  },
  {
    versao: "1.83.2",
    data: "13/08/2026",
    horario: "03:00",
    titulo: "Conferência de rosto no ponto: fica humana, e o porquê da decisão",
    itens: [
      "Foi decidido não contratar o serviço automático de comparação de rosto. A conferência das fotos de batida continua sendo feita por pessoa, no painel do Ponto — e o item sai da lista de próximas atualizações.",
      "O custo não foi o motivo: a comparação automática sairia por volta de R$ 85 por mês no volume atual (cerca de 15 mil batidas). O que pesou foi outra coisa — rosto processado por algoritmo é dado pessoal sensível pela LGPD, e exige consentimento específico de cada colaborador, política de retenção e de exclusão. A foto que uma pessoa do RH olha é bem mais simples juridicamente.",
      "A decisão pode ser revista a qualquer momento: se aparecer alguém batendo ponto pelo outro, o gasto se justifica com um caso concreto na mão.",
      "Fica registrada uma condição para essa conferência funcionar: a ficha do colaborador ainda não tem foto de referência, então quem confere não tem com o que comparar. Resolver isso é o próximo passo natural.",
    ],
  },
  {
    versao: "1.83.1",
    data: "13/08/2026",
    horario: "02:00",
    titulo: "Vídeos de treinamento saem da lista: o texto nas telas resolveu",
    itens: [
      "O item \"Vídeos curtos de treinamento\" estava em Próximas atualizações desde que o assunto surgiu. A decisão foi outra e já foi entregue: o botão \"Como usar\", com o passo a passo escrito, em cada tela do sistema.",
      "O texto se mostrou melhor que o vídeo para o uso real: dá para ler no meio de uma tarefa, buscar direto o trecho que interessa e corrigir na hora em que a tela muda — o que aconteceu várias vezes nesta semana.",
      "Nada some com isso. A ajuda continua no mesmo lugar de sempre, no \"?\" ao lado do título de cada tela.",
    ],
  },
  {
    versao: "1.83.0",
    data: "13/08/2026",
    horario: "01:10",
    titulo: "A tela inicial separa o que espera decisão do que é só acompanhamento",
    itens: [
      "O número \"Pendências\" somava 19 situações diferentes num só. Na prática isso escondia o que importa: hoje mesmo, \"163 cadastros incompletos\" e \"6 documentos esperando conferência\" moravam dentro do mesmo total de 169 — e o item que tinha gente esperando resposta sumia dentro do que não tem prazo nenhum.",
      "Agora são três blocos, cada um com uma pergunta: ESPERANDO SUA DECISÃO (aprovações, documentos a conferir, CAT a emitir — alguém está parado esperando o RH), PRAZO CORRENDO (ASO, NR, EPI, férias, contratos — a data é que aperta) e CADASTRO A COMPLETAR (falta dado, mas nada trava hoje).",
      "A cor acompanha a urgência: vermelho só onde há gente esperando, âmbar para o que vence, cor normal para cadastro. Assim um número alto de cadastro não parece incêndio.",
      "O cabeçalho deixou de dizer \"Sistema de RH — visão do grupo\" (que a barra de cima já informa) e passa a cumprimentar pelo nome, dizendo de imediato quantos itens esperam decisão. Quando não há nenhum, ele diz isso com todas as letras.",
      "Os números de contexto — colaboradores ativos, vagas abertas, integrações — continuam na tela, um pouco mais abaixo: são úteis para saber o tamanho do grupo, mas não mudam o que se faz agora.",
      "Nada foi retirado da conta: os três blocos somados dão exatamente o total de antes, e há teste automático garantindo que nenhuma pendência fique fora de um dos grupos.",
    ],
  },
  {
    versao: "1.82.0",
    data: "12/08/2026",
    horario: "19:30",
    titulo: "Verificação com banco de verdade no CI, avisos ao gestor prontos para ligar pela tela, e conexão com o banco sem avisos",
    itens: [
      "Os 27 testes de fumaça que exigiam um banco Postgres — e por isso só rodavam quando alguém lembrava — agora rodam sozinhos em todo PR, num banco descartável criado na hora, e passaram 27 de 27 na estreia. Antes disso já se pagaram: dois deles reprovaram no primeiro ensaio porque o banco novo não tinha regras que só existiam em SQL manual (o alvo único da meta e o título único de rascunho de pesquisa) — regras que agora são aplicadas e conferidas sempre.",
      "Ligar os avisos automáticos ao gestor virou um interruptor na tela de Lembretes — sem mexer em código. O disparo ficou agendado (8h, com prévia na tela Avisos ao gestor), mas NASCE DESLIGADO: nada é enviado até alguém ligar. Antes, o primeiro registro do agendador teria começado a enviar sozinho, sem essa escolha.",
      "A conexão com o banco passou a declarar por extenso o modo de segurança que já usava (verificação completa de certificado). Era a causa de um aviso técnico que apareceu 373 vezes só hoje nos registros do servidor, enterrando os erros de verdade no meio do ruído.",
    ],
  },
  {
    versao: "1.81.1",
    data: "12/08/2026",
    horario: "17:30",
    titulo: "Anexos enviados antes de 12/08 se perderam no armazenamento — a tela agora explica e diz o que fazer",
    itens: [
      "Ao abrir certos anexos na Central de Aprovações aparecia só um erro seco. A investigação (pelos registros do servidor) mostrou o motivo: entre a noite de 11/08 e a manhã de 12/08, o armazenamento de arquivos foi esvaziado e desconectado do sistema — os documentos enviados pelo portal antes disso perderam o conteúdo, embora continuem listados na fila.",
      "Esses arquivos não têm como ser recuperados. O caminho certo já existia na própria fila: o botão \"Devolver\", que remove o item e avisa o colaborador pelo Telegram para reenviar — e o reenvio funciona, porque o armazenamento foi religado hoje.",
      "O que muda nesta versão é a mensagem: em vez de um erro técnico, quem abre um anexo perdido lê o que aconteceu e o que fazer — o RH é orientado a devolver; o colaborador, a reenviar.",
      "Documentos enviados a partir de 12/08 à tarde não são afetados e abrem normalmente.",
    ],
  },
  {
    versao: "1.81.0",
    data: "12/08/2026",
    horario: "12:30",
    titulo: "Telegram \"vinculado a outro colaborador\": o bot agora diz a quem, e destrava sozinho os casos de ficha duplicada",
    itens: [
      "Um colaborador ficou travado hoje: ao enviar o CPF, o bot respondia \"este Telegram já está vinculado a outro colaborador — procure o RH\". Só que o RH não tinha como ajudar: o bot sabia em qual ficha o vínculo estava, mas não dizia, e ninguém acharia a ficha certa entre centenas na base.",
      "Agora o bot diz o primeiro nome de quem está com o vínculo. Com o nome, o RH abre a ficha da pessoa e ajusta o campo de Telegram — o caminho que a mensagem sempre prometeu passa a existir de verdade.",
      "Casos de cadastro duplicado se resolvem sozinhos: quando o \"outro colaborador\" tem o MESMO CPF — a mesma pessoa cadastrada em dois CNPJs do grupo — não é conflito, e o bot passa a responder \"você já está vinculado\" em vez de recusar.",
      "A escolha da ficha pelo CPF ficou previsível: preferência para a ficha que já tem este Telegram, depois para uma sem vínculo nenhum. Antes a escolha era imprevisível e podia cair exatamente na ficha errada.",
      "A tela Canais ganhou o cartão \"Armazenamento de arquivos\": o problema do envio de documentos desta manhã não aparecia em tela nenhuma do sistema — o RH soube por print. Agora, se o armazenamento estiver desligado, a tela mostra em vermelho, explica o efeito e o caminho exato para ligar.",
    ],
  },
  {
    versao: "1.80.2",
    data: "12/08/2026",
    horario: "09:20",
    titulo: "Envio de documentos pelo portal ativado — e as fotos do ponto começam a valer",
    itens: [
      "Dois colaboradores avisaram de manhã que o portal recusava documentos com a mensagem \"Armazenamento de arquivos não configurado\". Era exatamente isso: o cofre de arquivos — privado, fora do banco — nunca tinha sido ligado em produção. Foi ligado hoje.",
      "O envio de documentos pelo portal passa a funcionar. Quem tentou e não conseguiu só precisa reenviar — nenhum arquivo foi perdido, porque o sistema recusou antes de aceitar qualquer coisa.",
      "A foto da batida de ponto, publicada hoje mais cedo, dependia desse mesmo cofre. A partir de agora as fotos ficam guardadas e aparecem no Monitor de Presença. Batidas feitas antes deste momento continuam \"sem foto\", e isso é esperado.",
    ],
  },
  {
    versao: "1.80.1",
    data: "12/08/2026",
    horario: "08:10",
    titulo: "\"Como usar\" nas telas novas: vínculo de login, Meu Setor e avisos ao gestor",
    itens: [
      "As telas que nasceram hoje ganharam o botão \"?\" ao lado do título, com o passo a passo de como trabalhar nelas.",
      "Usuários: como ligar o login de um gestor à ficha dele para o time aparecer em \"Meu Setor\" — e o aviso de que quem monta o time é o campo \"Reporta a\" das fichas, não o setor.",
      "Meu Setor: o que o gestor vê, por que a tela pode abrir vazia (e qual dos dois motivos é o seu), e o que de propósito NÃO aparece ali (salário, CPF, documentos).",
      "Avisos ao gestor: como ler a prévia, o que significa \"Sem Telegram\" e a garantia de que nada é enviado por aquela tela.",
      "A ajuda do Ponto foi atualizada com a foto na batida: como conferir a foto de cada batida no Monitor de Presença e o que significa a câmera cortada (\"sem foto\").",
      "No portal do colaborador o caminho é outro, de propósito: as instruções aparecem na própria tela, na hora em que fazem falta — no convite de instalar e no aviso de foto pendente.",
    ],
  },
  {
    versao: "1.80.0",
    data: "12/08/2026",
    horario: "06:20",
    titulo: "Bater ponto agora tira foto — a prova de quem bateu",
    itens: [
      "Ficou decidido: o ponto é pelo celular, sem relógio físico para comprar e instalar. O que faltava era a prova de QUEM bateu — e é isso que entra agora.",
      "Ao tocar no botão de bater ponto no portal, a câmera da frente abre e a foto vai junto com o registro. No painel do ponto, o RH vê cada batida do dia com a foto ao lado — é clicar para conferir o rosto.",
      "A batida NUNCA é impedida pela câmera: se ela falhar ou a pessoa cancelar, dá para registrar mesmo assim, e a batida aparece como \"sem foto\" no painel — visível, para o RH cobrar. Ponto é obrigação legal; foto é evidência.",
      "A foto fica em armazenamento privado, fora do banco, e só abre para quem tem acesso à empresa — cada visualização entra na trilha de auditoria, como RG e atestado.",
      "Corrigido no mesmo pacote: o monitor de presença mostrava as batidas com 3 horas a mais (fuso do servidor). Mesma família do erro do arquivo fiscal corrigido hoje mais cedo.",
      "A conferência automática do rosto (comparar a selfie com uma foto de referência, sozinho) fica como decisão à parte, em \"Próximas atualizações\": é serviço pago por batida, e vale medir antes se a conferência humana resolve.",
    ],
  },
  {
    versao: "1.79.2",
    data: "12/08/2026",
    horario: "05:40",
    titulo: "Correção séria: o arquivo fiscal do ponto saía com 3 horas de diferença",
    itens: [
      "O AFD e o AEJ — os arquivos que se entregam à fiscalização do trabalho — gravavam as marcações no fuso do servidor, que é UTC. Na prática: quem bateu às 08:00 aparecia no arquivo como tendo batido às 11:00. Em TODAS as marcações.",
      "Havia um segundo efeito, pior perto da meia-noite: a marcação das 23:30 era gravada com a data do dia seguinte, porque o arquivo tirava a data de um relógio e a hora de outro.",
      "Os dois arquivos passam a gravar no horário de Brasília. Nada muda nas telas: o ponto sempre foi mostrado certo para o RH e para o colaborador — o erro estava só no arquivo de exportação fiscal.",
      "O teste automático não pegava porque só conferia se o CPF e o CNPJ apareciam no texto, sem olhar data e hora. Agora ele confere as duas coisas, inclusive na virada do dia.",
      "Quem já entregou arquivo AFD à contabilidade ou à fiscalização deve gerar de novo, pela mesma tela, e substituir.",
    ],
  },
  {
    versao: "1.79.1",
    data: "12/08/2026",
    horario: "05:20",
    titulo: "Próximas atualizações: o que falta em biometria e folha ficou específico",
    itens: [
      "Folha: o sistema da contabilidade é o Domínio, e isso deixou de ser pergunta. O que falta agora vem de lá — um arquivo de importação de exemplo e a lista de códigos de rubrica que o escritório usa (qual código é hora extra 50%, adicional noturno, falta, DSR). Esses códigos são cadastrados escritório a escritório; sem eles o arquivo sairia com o número certo na rubrica errada.",
      "Biometria: a ligação com o sistema não depende da marca do equipamento, como estava escrito antes. Todo relógio de ponto legal no Brasil é obrigado a gerar o arquivo AFD no formato da Portaria 671 — é esse arquivo que o sistema passaria a ler, venha ele de leitor digital ou de reconhecimento facial. O que a escolha do equipamento decide é preço e instalação, não o trabalho de integrar.",
      "Nada disso muda tela nenhuma: é a lista de \"Próximas atualizações\" deixando de dizer \"depende de escolher\" e passando a dizer exatamente o que pedir e a quem.",
    ],
  },
  {
    versao: "1.79.0",
    data: "12/08/2026",
    horario: "05:00",
    titulo: "O portal vira aplicativo na tela do celular",
    itens: [
      "O colaborador pode instalar o portal no celular e passar a abrir por um ícone, sem digitar endereço nem procurar o link antigo no Telegram. Aberto assim, ocupa a tela inteira e parece um aplicativo.",
      "No Android aparece um botão \"Instalar\" dentro do portal. No iPhone o convite explica o caminho — Compartilhar → Adicionar à Tela de Início — porque lá isso é sempre feito à mão, por decisão da Apple.",
      "É o mesmo portal de sempre: bater ponto, holerite, documentos, férias e falar com o RH. Nada muda para quem preferir continuar usando pelo navegador, e o convite some depois de dispensado.",
      "Continua exigindo internet, de propósito. O portal existe para bater ponto, e uma tela guardada no aparelho poderia aceitar uma batida que nunca chegou ao servidor — o colaborador iria embora achando que bateu.",
      "Entre as duas formas possíveis de app — publicar nas lojas ou instalar direto do site — foi feita a segunda: usa o portal que já existe, não depende de aprovação de loja e a correção chega na hora. Publicar nas lojas continua sendo possível mais adiante.",
    ],
  },
  {
    versao: "1.78.0",
    data: "12/08/2026",
    horario: "04:10",
    titulo: "O gestor passa a ver o próprio time ao entrar no sistema",
    itens: [
      "Até agora o sistema tinha dois cadastros que não se conheciam: o de usuários (quem tem login) e o de colaboradores (quem está na folha). Ninguém ligava um ao outro, então quando um gestor entrava com o login dele o sistema não sabia qual pessoa da folha ele era — e por isso nenhuma tela conseguia mostrar a equipe dele.",
      "Agora existe essa ligação. Em Cadastros → Usuários → Vincular, o RH aponta qual ficha de colaborador é cada login, buscando por nome ou CPF.",
      "Com o vínculo feito, a tela \"Meu Setor\" do gestor passa a abrir com o time dele — tempo de casa, férias a vencer, avaliação do ciclo, quem ainda não acessou o portal e quem está nos primeiros meses. São os mesmos números que o RH vê, saídos da mesma conta: gestor e RH não leem versões diferentes da mesma equipe.",
      "Quem monta o time é o campo \"Reporta a\" da ficha de cada colaborador, e não o setor. São coisas diferentes: um gestor pode liderar gente de mais de um setor.",
      "O vínculo é opcional e não muda permissão nenhuma. Quem é só do RH normalmente não tem ficha na empresa que administra e continua trabalhando igual. Sem vínculo, a tela explica o que falta em vez de aparecer vazia.",
    ],
  },
  {
    versao: "1.77.2",
    data: "12/08/2026",
    horario: "03:20",
    titulo: "A cobrança automática de cadastro nasce desligada",
    itens: [
      "Configurar um horário para a cobrança de cadastro não liga mais o envio sozinho. Ligar virou uma decisão à parte, com chave própria na tela de Lembretes — porque escolher quando algo sairia não é o mesmo que decidir que ele vai sair.",
      "A tela e o robô que dispara as mensagens passaram a consultar a mesma chave. Antes eram duas leituras separadas, e elas podiam discordar: a tela mostrar desligado e a mensagem sair mesmo assim.",
      "(Entrada escrita depois, em 12/08/2026: esta versão foi publicada sem registro aqui.)",
    ],
  },
  {
    versao: "1.77.1",
    data: "12/08/2026",
    horario: "02:50",
    titulo: "Verificação automática completa em todo PR",
    itens: [
      "A verificação automática que passou a rodar hoje ganhou também a checagem de estilo de código. Ela ficou desligada nas primeiras horas porque havia 10 erros antigos no projeto — e portão que nasce vermelho é portão que todo mundo aprende a ignorar. Os 10 foram corrigidos e o portão está ligado.",
      "Entre eles havia um problema real no portal: quem abria a tela de bater ponto e saía antes de a resposta chegar deixava o sistema tentando atualizar uma tela que não existia mais.",
      "Nada muda no que você vê. É a rede de proteção que impede uma correção nova de quebrar algo antigo sem ninguém perceber.",
    ],
  },
  {
    versao: "1.77.0",
    data: "12/08/2026",
    horario: "02:20",
    titulo: "\"Cadastros incompletos\" deixa de apontar para quase todo mundo",
    itens: [
      "O cartão marcava 163 dos 170 colaboradores ativos — 96% da base. Contador que aponta para quase todo mundo não é fila de trabalho, é ruído: ninguém abre uma lista de 163 pessoas, e o cartão acaba sendo ignorado junto com os que estão ao lado dele.",
      "A régua passou a ser só o que TRAVA alguma coisa: sem CPF ou data de admissão não há eSocial; sem dados bancários não há como pagar; sem nenhum contato não há como falar com a pessoa.",
      "RG e endereço saíram da conta. Continuam faltando e continuam visíveis na ficha de cada um — só deixaram de disputar atenção na tela de Pendências.",
      "A tela \"Avisos ao gestor\", quando não tem nada a mostrar, agora diz quantos colaboradores ativos estão sem supervisor na ficha. Sem esse número, tela vazia podia significar duas coisas opostas — não há situação a avisar, ou não há a quem avisar.",
    ],
  },
  {
    versao: "1.76.1",
    data: "12/08/2026",
    horario: "01:50",
    titulo: "Avisos ao gestor: régua de férias mais perto e saudação sem gritar",
    itens: [
      "O aviso de férias ao gestor passa a sair a 45 dias do prazo, e não a 90. A 90 dias a mesma linha se repetiria umas 12 vezes antes de a data chegar, e o gestor aprenderia a ignorar o bot — que é a pior falha possível aqui, porque o aviso continua saindo e ninguém lê. Férias já vencidas continuam avisando sempre.",
      "A saudação escrevia \"Olá, MARCELO\", porque o cadastro guarda nome em maiúsculas. Agora escreve \"Olá, Marcelo\".",
      "Os dois ajustes vieram de olhar a prévia com dados reais — o envio automático continua desligado.",
    ],
  },
  {
    versao: "1.76.0",
    data: "12/08/2026",
    horario: "01:30",
    titulo: "Cobrar o cadastro na hora, sem esperar o automático",
    itens: [
      "Até agora só a rotina automática cobrava o colaborador a completar a ficha. Quem quisesse mandar na hora — porque está falando com a pessoa, ou porque ela pediu de novo — não tinha por onde.",
      "Três lugares novos: botão \"Cobrar cadastro\" na ficha do colaborador, seleção em lote na lista de Colaboradores, e \"Rodar agora\" em Configuração → Lembretes.",
      "O botão de uma pessoa manda mesmo que ela já tenha sido cobrada há pouco: se alguém do RH clicou, decidiu cobrar. Já o \"Rodar agora\" respeita o intervalo normal — ali não é decisão sobre uma pessoa, é adiantar o relógio de todo mundo.",
      "Cobrar à mão não consome as tentativas da campanha automática nem adia a próxima. Sem essa separação, cobrar alguém pelo botão faria essa pessoa parar de receber os avisos automáticos, e ninguém perceberia.",
      "Quando alguém do lote não recebe, a tela diz quem e por quê — ficha já completa, ou sem Telegram e sem e-mail. Um \"pronto!\" que esconde falhas faria o RH acreditar que cobrou quem não cobrou.",
    ],
  },
  {
    versao: "1.75.0",
    data: "12/08/2026",
    horario: "00:20",
    titulo: "Avisos automáticos ao gestor (ainda desligados)",
    itens: [
      "O sistema passa a saber montar, para cada gestor, um aviso pelo Telegram sobre o time dele: contrato de experiência vencendo, férias a vencer ou já vencidas, e hora extra acima do limite do mês.",
      "Só entra o que o gestor decide. Nada de CPF faltando ou dado bancário — isso é assunto do DP, e aviso que o gestor não resolve ensina a ignorar os que ele resolve.",
      "O mesmo assunto sobre a mesma pessoa não se repete antes de 7 dias, para o aviso não virar ruído.",
      "IMPORTANTE: nada é enviado ainda. O disparo automático está desligado de propósito.",
      "Para conferir antes de ligar, o menu Departamento pessoal ganhou a tela \"Avisos ao gestor\": ela mostra, gestor por gestor, a mensagem exata que sairia — do jeito que a pessoa leria no celular. A tela não envia nada, e continua servindo depois, para responder \"por que fulano recebeu isso?\".",
      "Quem lidera é quem tem outras pessoas apontando para si como supervisor na ficha — a mesma definição que o portal já usa em \"Meu time\". Gestor sem Telegram vinculado não recebe, e continua aparecendo na pendência do RH.",
    ],
  },
  {
    versao: "1.74.0",
    data: "11/08/2026",
    horario: "23:30",
    titulo: "Ajuda \"Como usar\" nas telas e a lista do que vem a seguir",
    itens: [
      "Sete telas ganharam o botão \"Como usar\" ao lado do título: Ponto, Aprovações, Colaboradores, Férias, Disciplinar, Pesquisas de clima e Folha. Ele abre o que a tela faz, o passo a passo das ações principais e — o mais útil — os cuidados, que são as armadilhas reais de cada módulo.",
      "Foi escolhido texto no lugar de vídeo: quem precisa de uma resposta não assiste dois minutos para achá-la, e quando uma tela muda de comportamento o texto se corrige no mesmo dia. Vídeo desatualizado ensina errado com cara de oficial.",
      "A tela de Atualizações agora começa por \"Próximas atualizações\": o que está combinado para as próximas entregas e, quando algo depende de uma decisão, qual decisão é. Quando um item é publicado, ele sai dessa lista e passa para o histórico.",
    ],
  },
  {
    versao: "1.73.0",
    data: "11/08/2026",
    horario: "22:40",
    titulo: "Disciplinar: onde guardar a via assinada",
    itens: [
      "A aba Disciplinar da ficha ganhou \"Anexar via\" em cada ocorrência: depois de imprimir, colher a assinatura e digitalizar, o documento passa a ficar guardado no sistema. Antes o sistema gerava o papel e registrava que ele havia sido assinado, mas não tinha onde recebê-lo de volta — a via ficava na pasta física.",
      "Quando a via já está guardada, o botão vira \"Via assinada\" e abre o arquivo.",
      "Enviar uma via nova no lugar de outra apaga a anterior, para não sobrar arquivo sem tela por onde alcançá-lo.",
      "Aceita PDF, JPG, PNG ou WEBP, até 10 MB — o mesmo dos demais anexos do sistema.",
    ],
  },
  {
    // Escritas em 11/08/2026 a partir do que os commits das entregas #84 e #85
    // descrevem: as duas subiram a `version` sem registrar nada aqui, e a tela
    // ficou mostrando v1.72.0 com a lista parando em 1.70.1 — exatamente a
    // omissão que a regra do AGENTS.md existe para evitar.
    versao: "1.72.0",
    data: "11/08/2026",
    horario: "22:10",
    titulo: "Cobrança de cadastro também por e-mail, duas vezes por semana",
    itens: [
      "Quem tem Telegram e e-mail passa a receber a cobrança pelos dois canais na mesma rodada — não é substituto, é soma: a mensagem que a pessoa vê primeiro é a que resolve.",
      "Quem só tem e-mail entra na cobrança pela primeira vez. Antes ficava de fora por não ter Telegram, embora seja justamente quem menos fala com o RH.",
      "A cobrança passou a ser a cada 3 dias, e não a cada 7, com até 8 tentativas — mantendo a janela de aproximadamente um mês.",
      "O e-mail tem teto diário, e esta cobrança varre a base inteira. Para não repetir o que houve em 28/07, quando uma campanha consumiu a cota do dia e os convites de pesquisa não saíram, ela para de mandar e-mail antes de esgotar o orçamento e cede a vez. Ninguém deixa de ser cobrado: o Telegram não tem teto e o e-mail sai na rodada seguinte.",
      "Fica registrado por quais canais cada cobrança saiu — só os que aceitaram o envio.",
    ],
  },
  {
    versao: "1.71.0",
    data: "11/08/2026",
    horario: "21:40",
    titulo: "Sistema passa a cobrar o colaborador a completar a própria ficha",
    itens: [
      "O sistema passa a lembrar o colaborador, pelo Telegram, de completar o próprio cadastro e enviar os documentos que faltam — apenas o que ele mesmo resolve pelo portal.",
      "Semanal, no máximo 4 vezes, para não virar incômodo.",
    ],
  },
  {
    versao: "1.70.1",
    data: "11/08/2026",
    horario: "20:40",
    titulo: "Diretoria volta a conseguir gerar os relatórios em PDF",
    itens: [
      "Quem tem o papel Diretoria/Gestão recebia \"Sem acesso a esta empresa\" ao gerar o PDF das pesquisas — de clima e de NR-01 —, em qualquer empresa. Corrigido.",
      "O mesmo bloqueio atingia o download de qualquer anexo do sistema (atestados, documentos do portal, currículos), a planilha modelo de importação e o CSV da folha. Todos liberados.",
      "A causa era a mesma nas nove rotas envolvidas: cada uma decidia o acesso por conta própria, com cinco versões diferentes da regra, e as que falhavam não sabiam que Diretoria e Administrativo não têm vínculo empresa a empresa — o acesso deles é global. Agora todas usam a mesma verificação das telas.",
    ],
  },
  {
    versao: "1.70.0",
    data: "11/08/2026",
    horario: "19:10",
    titulo: "Ajustes de ponto entram na Central de Aprovações",
    itens: [
      "Os ajustes de ponto pendentes agora aparecem na Central de Aprovações, junto com férias, ausências e documentos — e podem ser aprovados ou rejeitados ali mesmo. Antes só existiam dentro da aba Tratamento do módulo Ponto, e a Central dizia reunir \"tudo que espera decisão\" sem incluí-los.",
      "O motivo da rejeição passa a ficar em campo próprio, separado do texto de quem pediu o ajuste. Até agora ele era colado dentro da justificativa do solicitante, o que reescrevia o pedido original a cada recusa — num registro que a fiscalização pode pedir, o que a pessoa escreveu tem que continuar sendo o que ela escreveu.",
      "As rejeições já gravadas foram separadas automaticamente onde dava para identificar a marca \"[Rejeitado por ...]\". As que não têm essa marca ficaram como estavam — separar por adivinhação seria pior.",
      "Ao rejeitar, o aviso de confirmação dizia \"Devolvido ao colaborador\" mesmo em férias e ausências, onde nada é devolvido. Agora cada fila usa o próprio nome da ação.",
    ],
  },
  {
    versao: "1.69.1",
    data: "11/08/2026",
    horario: "18:45",
    titulo: "Convites e lembretes automáticos deixam de falhar em silêncio",
    itens: [
      "Convites de pesquisa e lembretes do portal às vezes não saíam. As cinco rotinas automáticas do sistema rodavam todas no mesmo minuto e disputavam conexão com o banco; a que perdia simplesmente não enviava, sem avisar ninguém. Agora rodam espaçadas, e a disputa acabou.",
      "Nada muda no que você faz na tela — é a parte que roda sozinha, de quinze em quinze minutos.",
    ],
  },
  {
    versao: "1.69.0",
    data: "11/08/2026",
    horario: "18:20",
    titulo: "Pendências: novo cartão \"Cadastros incompletos\"",
    itens: [
      "A tela de Pendências ganhou o cartão \"Cadastros incompletos\": quantos colaboradores ativos estão com campo essencial em branco — CPF, contato, data de admissão, RG, endereço ou dados bancários.",
      "Clicar no cartão abre a lista de Colaboradores já filtrada só em quem tem dado faltando.",
      "Contato conta como faltando só quando não há nem email nem telefone — ter um dos dois basta.",
    ],
  },
  {
    // Duas entregas do mesmo dia (1.66.0 e 1.66.2, ambas de Ponto) consolidadas
    // aqui: nenhuma das duas chegou a ser publicada com esse número, porque a
    // linha `master` foi para 1.67.0 antes. Numerar por 1.66.x deixaria a
    // etiqueta da tela mostrando 1.68.0 e esta lista começando em 1.66.2 — o
    // usuário procuraria a versão que está vendo e não a encontraria.
    versao: "1.68.0",
    data: "11/08/2026",
    horario: "13:30",
    titulo: "Ponto: ajustes do PTRP passam a ter aprovação de verdade",
    itens: [
      "Segurança: exportar os arquivos fiscais (AFD/AEJ) e criar jornadas passam a exigir acesso à empresa. Antes, essas operações não conferiam permissão — quem estivesse logado podia baixar o histórico de batidas e o CPF de colaboradores de qualquer empresa informando o código dela.",
      "Todo ajuste ou abono de ponto entra como PENDENTE e precisa ser aprovado ou rejeitado — antes já nascia aprovado, no mesmo clique de quem o registrava.",
      "Quem aprova ou rejeita fica registrado com o nome de quem está logado. Até agora o sistema gravava sempre \"Gestor de RH\", um texto fixo que não correspondia a pessoa nenhuma — e a tela dizia que o ajuste era assinado digitalmente.",
      "O histórico passa a mostrar a situação real de cada ajuste (pendente, aprovado ou rejeitado). Antes todos apareciam como \"Aprovado\", independentemente do que estivesse gravado.",
      "Rejeitar exige escrever o motivo, num campo que abre na própria tela, e o aviso de erro aparece na própria linha em que se clicou.",
      "Duas pessoas decidindo o mesmo ajuste ao mesmo tempo não apagam mais a decisão uma da outra: quem chega depois recebe um aviso para recarregar.",
      "Ajustes pendentes não ficam mais presos: a lista de pendentes deixou de ter limite de 20 itens — o limite valia também para o que ainda precisava de decisão.",
      "Quem pediu o ajuste passa a ficar registrado na trilha de auditoria, e as aprovações e rejeições de ponto aparecem em \"Decisões recentes\" na Central de Aprovações — antes só férias e ausências apareciam ali.",
      "Ao lançar um ajuste, o colaborador agora é escolhido numa lista — antes era preciso colar o código interno dele.",
      "A data da ocorrência aparecia um dia antes do informado, por causa do fuso horário. Corrigido.",
      "Colaboradores desligados voltam a aparecer na lista de ajuste — é durante a rescisão que a correção de ponto costuma ser feita.",
    ],
  },
  {
    // Publicada em produção como v1.64.0 por volta das 09h30 e renumerada para
    // 1.67.0 na mesma manhã: a linha `main` já tinha usado 1.64.0 a 1.65.1 para
    // outras entregas, e dois números iguais na etiqueta da tela quebram a
    // única pergunta que ela existe para responder ("é a versão nova?").
    versao: "1.67.0",
    data: "11/08/2026",
    horario: "10:00",
    titulo: "Disciplinar: o sistema passa a gerar o documento para assinatura",
    itens: [
      "A aba Disciplinar da ficha do colaborador ganhou o botão \"Documento\" em cada ocorrência: abre a advertência, o comunicado de suspensão ou o termo já redigido, pronto para imprimir e assinar. Antes a tela só registrava a ocorrência e o status da assinatura — o papel a ser assinado nunca era produzido.",
      "Ao registrar uma nova medida, o sistema oferece o documento na hora, com o botão \"Abrir documento\".",
      "Cada tipo tem o texto e o fundamento legal próprios: advertência verbal e escrita, suspensão (art. 474 da CLT), justa causa, notificação de abandono de emprego com prazo de 48 horas, recusa/mau uso de EPI (art. 158), termo de dano ao patrimônio (art. 462, § 1º) e recusa a exame ocupacional.",
      "O documento sai com razão social e CNPJ da empresa, identificação completa do colaborador (CPF, matrícula, cargo, setor e admissão), motivo, circunstâncias e campos de assinatura do colaborador, da empresa e de duas testemunhas.",
      "Quando a recusa de assinatura já foi registrada com as duas testemunhas, o documento sai com a certidão de recusa e os nomes e CPFs das testemunhas preenchidos.",
      "Esta entrega chegou à produção primeiro como v1.64.0 e foi renumerada para v1.67.0 — o número 1.64.0 já pertencia à primeira fase do Design System.",
    ],
  },
  {
    versao: "1.65.1",
    data: "11/08/2026",
    horario: "08:20",
    titulo: "Trilha de navegação nas telas de detalhe",
    itens: [
      "As telas de dentro de uma pesquisa (dados, perguntas, convites, resultados e dashboard de clima) não tinham nenhum caminho de volta — só o botão do navegador. Agora mostram \"Início › Pesquisas de clima › nome da pesquisa\" no topo.",
      "Na ficha do colaborador, no ciclo de avaliação, na competência de folha e na vaga, o antigo link \"← Módulo\" virou a mesma trilha, que além de voltar mostra de quem (ou de que) é o registro aberto.",
    ],
  },
  {
    versao: "1.65.0",
    data: "11/08/2026",
    horario: "07:40",
    titulo: "Painel dividido em abas — menos rolagem, mais achabilidade",
    itens: [
      "O Painel vinha empilhando tudo numa página só (abertura, radar, indicadores, tempo de casa, quatro gráficos, custo e absenteísmo). Agora está em quatro abas, agrupadas pela pergunta que respondem: Resumo (como estamos), Quadro (quem é o time hoje), Movimento (o que mudou na janela) e Custo e faltas.",
      "O filtro de empresa e o rodapé de ressalvas continuam sempre visíveis, fora das abas: as ressalvas dizem o que os números não cobrem, e escondê-las atrás de um clique faria o número parecer mais completo do que é.",
      "Nenhum número mudou — é a mesma conta, só reorganizada na tela.",
    ],
  },
  {
    versao: "1.64.3",
    data: "11/08/2026",
    horario: "05:10",
    titulo: "Correção de legibilidade no tema escuro",
    itens: [
      "Quem usa o sistema no tema escuro (pelo botão da barra de topo ou porque o computador está configurado assim) passa a enxergar melhor: mensagens de erro dentro dos cartões, contorno dos campos de formulário, rótulo dos botões principais e textos de apoio estavam com contraste abaixo do mínimo recomendado.",
      "No tema claro, o contorno dos campos que ficam fora de um cartão e o destaque de foco do menu lateral também foram ajustados pelo mesmo motivo.",
      "Ícones e etiquetas coloridas de várias telas (unificação de cargos e setores, clima, produtividade, medidas disciplinares) ganharam versão própria para o tema escuro — antes ficavam lavados ou quase invisíveis.",
    ],
  },
  {
    versao: "1.64.2",
    data: "11/08/2026",
    horario: "04:50",
    titulo: "Fase 1 do Design System: marca de campo obrigatório",
    itens: [
      "Os campos de formulário podem passar a exibir o asterisco vermelho de obrigatório — antes cada tela precisava escrever o asterisco à mão, e só uma fazia isso.",
    ],
  },
  {
    versao: "1.64.1",
    data: "11/08/2026",
    horario: "04:30",
    titulo: "Fase 1 do Design System: etiquetas de situação unificadas",
    itens: [
      "As etiquetas coloridas de situação (férias, ausências, vagas, conformidade) passam a sair de um componente único — antes cada tela tinha a sua cópia, e a mesma vaga podia aparecer com cor diferente na lista e na tela de detalhe.",
    ],
  },
  {
    versao: "1.64.0",
    data: "11/08/2026",
    horario: "04:00",
    titulo: "Fase 1 do Design System: início — padronização de enum e documentação",
    itens: [
      "Central de Sinais: gravidade e nível de unidade dos sinais passam a ser gravados em maiúsculo, alinhado ao resto do sistema (não muda nada na tela, só a forma como o dado é guardado).",
      "Documentação técnica do banco de dados corrigida em 5 pontos que estavam desatualizados havia semanas.",
    ],
  },
  {
    versao: "1.63.9",
    data: "11/08/2026",
    horario: "03:10",
    titulo: "Ajuste: histórico de atualizações completo até a v1.63.7",
    itens: [
      "A tela de Atualizações estava sem as entradas de v1.63.3 a v1.63.7 — corrigido, agora mostra todas as entregas do período em ordem.",
    ],
  },
  {
    versao: "1.63.8",
    data: "11/08/2026",
    horario: "03:00",
    titulo: "Visual: imagens e ilustrações do setor de RH na tela inicial",
    itens: [
      "Tela inicial da empresa ganha banner de boas-vindas com ilustração temática de RH e cartões de indicadores com ícones mais visíveis.",
    ],
  },
  {
    versao: "1.63.7",
    data: "10/08/2026",
    horario: "20:42",
    titulo: "Correção: cargos e setores voltam a aparecer ao cadastrar colaborador em qualquer CNPJ",
    itens: [
      "Ao abrir um CNPJ específico sem cargos próprios, a lista de cargos/setores no cadastro de colaborador não aparece mais vazia — passa a mostrar o catálogo completo da marca, mesmo quando os cargos estão registrados em outro CNPJ do grupo.",
    ],
  },
  {
    versao: "1.63.6",
    data: "10/08/2026",
    horario: "20:35",
    titulo: "Correção: campos de Sexo, Estado civil e Escolaridade voltam a salvar na ficha",
    itens: [
      "Alterar Sexo, Estado civil ou Escolaridade na ficha do colaborador e salvar não mostra mais o valor antigo na tela — a página agora atualiza sozinha após salvar com sucesso.",
    ],
  },
  {
    versao: "1.63.5",
    data: "10/08/2026",
    horario: "20:20",
    titulo: "Correção: relatórios em PDF voltam a abrir para acesso por marca",
    itens: [
      "Relatórios em PDF (clima organizacional, pesquisas, indicadores, avaliações) não bloqueiam mais com \"Sem acesso a esta empresa\" para quem tem acesso pela marca — as quatro rotas passam a reconhecer o mesmo modelo de acesso por marca já usado na tela de Colaboradores.",
    ],
  },
  {
    versao: "1.63.4",
    data: "10/08/2026",
    horario: "18:07",
    titulo: "Ajuste: lista de Colaboradores abre na marca do CNPJ aberto, não no grupo inteiro",
    itens: [
      "A tela de Colaboradores mostrava os colaboradores de todos os CNPJs do grupo misturados. Passa a abrir só com os colaboradores da marca da empresa do caminho, com o filtro da lateral estreitando dentro dessa marca quando necessário.",
    ],
  },
  {
    versao: "1.63.3",
    data: "10/08/2026",
    horario: "14:59",
    titulo: "Ajuste: cartão de avaliação atrasada conta por ciclo, não por avaliação",
    itens: [
      "O cartão \"Avaliação atrasada\" na tela de Pendências contava cada avaliação pendente de um ciclo vencido — um ciclo esquecido com 235 avaliações pendentes virava 235 itens na lista e no e-mail de cobrança do RH. Passa a contar 1 por ciclo (\"Ciclo de avaliação a encerrar\"), com o detalhe de qual ciclo, atraso e avaliações pendentes.",
    ],
  },
  {
    versao: "1.63.2",
    data: "10/08/2026",
    horario: "12:50",
    titulo: "Correção: cadastro de colaborador volta a aceitar os cargos e setores unificados",
    itens: [
      "Cadastrar colaborador novo não é mais bloqueado com \"Posição inválida para essa empresa\": depois da unificação de cargos e setores por marca, o cargo escolhido pode estar registrado em outro CNPJ do grupo, e o sistema agora aceita qualquer cargo/setor da marca.",
      "A mesma correção vale para o bloco Estrutura da ficha e para as movimentações de carreira (promoção/transferência).",
      "Os seletores de setor e cargo da ficha passam a mostrar o catálogo unificado da marca — antes podiam aparecer quase vazios.",
      "No cadastro de colaborador, as listas de setor, cargo e líder mostram somente a marca da empresa em que a pessoa será registrada.",
    ],
  },
  {
    versao: "1.63.1",
    data: "10/08/2026",
    horario: "11:30",
    titulo: "Correção: motivo do desligamento volta a salvar na ficha do colaborador",
    itens: [
      "Salvar o bloco Vínculo da ficha só para preencher ou corrigir o motivo do desligamento não é mais bloqueado com pedido de data de admissão — o sistema tratava a data de saída como alterada por diferença de horário interno dos desligamentos importados.",
      "Corrigir salário ou contrato de ex-colaborador desligado sem motivo registrado também deixa de ser travado pelo mesmo problema.",
    ],
  },
  {
    versao: "1.63.0",
    data: "09/08/2026",
    horario: "21:00",
    titulo: "Fase 4 e 5: Finalização do Módulo Ponto Eletrônico (Exportadores AFD/AEJ e Dashboard C-Level)",
    itens: [
      "Gerador e exportador dos arquivos fiscais regulatórios AFD (Arquivo Fonte de Dados) e AEJ (Arquivo Eletrônico de Jornada) para download direto em formato .txt.",
      "Assinatura digital e vinculo de Hash SHA-256 por registro para conformidade total com a Portaria MTP nº 671/2021 (REP-P).",
      "Dashboard C-Level Executivo de Ponto com estimativa de custo de Horas Extras, valoração de passivo de Banco de Horas e auditoria de riscos CLT (Art. 59 e Art. 71).",
    ],
  },
  {
    versao: "1.62.0",
    data: "09/08/2026",
    horario: "20:30",
    titulo: "Fase 3: Central de Tratamento de Ponto (PTRP) e Gestão no RH",
    itens: [
      "Painel administrativo do RH para Ponto Eletrônico (/rh/[empresaId]/ponto) com 5 abas integradas.",
      "Monitor de Presença em Tempo Real com contadores visuais (Presentes, Em Intervalo, Atrasados e Ausentes).",
      "Central de Tratamento de Ponto (PTRP - Portaria MTP 671/2021) com justificativa obrigatória e auditoria por gestor.",
      "Cadastro de Jornadas e Escalas de Trabalho contratuais (tolerâncias CLT e carga diária).",
      "Vínculo do módulo Ponto Eletrônico na barra lateral de navegação do RH em Departamento Pessoal.",
    ],
  },
  {
    versao: "1.61.0",
    data: "09/08/2026",
    horario: "20:00",
    titulo: "Fase 2: Interface de Marcação de Ponto PWA e Banco de Horas no Portal",
    itens: [
      "Componente responsivo PWA p/ registro de ponto (1ª Entrada, 1ª Saída Almoço, 2ª Entrada e 2ª Saída Fim de Turno) com Relógio Brasília.",
      "Validação em tempo real de Geofencing GPS (latitude/longitude), IP de Rede Autorizado e Geração de Hash SHA-256 de imutabilidade.",
      "Emissão automática de Comprovante de Registro de Ponto Eletrônico instantâneo (com NSR e Hash SHA-256) no Portal do Colaborador.",
      "Cartão 'Meu Banco de Horas' com extrato mensal de créditos (H.E.), débitos (atrasos) e histórico de competências.",
    ],
  },
  {
    versao: "1.60.0",
    data: "09/08/2026",
    horario: "19:45",
    titulo: "Fase 1: Módulo de Ponto Eletrônico & Gestão de Jornada (REP-P / Portaria MTP 671/2021)",
    itens: [
      "Implantação dos modelos de dados Prisma no schema 'rh' (JornadaTrabalho, RegistroPonto append-only, TratamentoPonto PTRP, BancoHoras e ConfiguracaoPontoEmpresa).",
      "Motor de cálculo de regras trabalhistas CLT (Art. 58 tolerâncias de 10 min/dia, Art. 73 hora noturna ficta 52m30s, Art. 71 supressão de intervalo e reflexo no DSR Lei 605/49).",
      "Motor de segurança e integridade (Gerador de Hash SHA-256 por batida, validação de IP e geolocalização com Geofencing GPS).",
      "Gerador de arquivos fiscais regulatórios AFD (Arquivo Fonte de Dados) conforme Portaria MTP nº 671/2021.",
    ],
  },
  {
    versao: "1.59.5",
    data: "09/08/2026",
    horario: "17:15",
    titulo: "Redesign estilo Pill Chips para as abas da ficha do colaborador",
    itens: [
      "Substituição do layout rígido por contêiner flexível de pílulas (Pill Chips em formato Shadcn default), com fundo sutil, espaçamento adequado e destaque elegante para a aba ativa no tema escuro e claro.",
    ],
  },
  {
    versao: "1.59.4",
    data: "09/08/2026",
    horario: "17:00",
    titulo: "Layout de abas em duas linhas simétricas na ficha do colaborador",
    itens: [
      "Reformatação das 16 abas em 2 linhas horizontais simétricas e equilibradas de igual largura (8 abas na linha superior e 8 na inferior), garantindo excelente legibilidade e estrutura visual alinhada.",
    ],
  },
  {
    versao: "1.59.3",
    data: "09/08/2026",
    horario: "16:45",
    titulo: "Redesign da barra de abas da ficha do colaborador com rolagem horizontal suave",
    itens: [
      "Substituição da quebra em múltiplas linhas por uma barra única de navegação com rolagem horizontal suave (horizontal scroll track), preservando a elegância visual e a estrutura padronizada da plataforma.",
    ],
  },
  {
    versao: "1.59.2",
    data: "09/08/2026",
    horario: "16:30",
    titulo: "Ajuste de responsividade da barra de abas na ficha do colaborador",
    itens: [
      "Quebra automática de linha (flex-wrap) na barra de navegação por abas da Ficha do Colaborador, permitindo a visualização de todas as abas (incluindo Disciplinar, Integração e Desligamento) sem corte de tela.",
    ],
  },
  {
    versao: "1.59.1",
    data: "09/08/2026",
    horario: "16:00",
    titulo: "Correção de migração do banco para o módulo de Ocorrências Disciplinares",
    itens: [
      "Inclusão da migração de banco (Prisma) para criação automática da tabela OcorrenciaDisciplinar em produção.",
    ],
  },
  {
    versao: "1.59.0",
    data: "09/08/2026",
    horario: "15:45",
    titulo: "Módulo de Medidas Disciplinares e Notificações com Registro de Recusa",
    itens: [
      "Novo módulo de Ocorrências Disciplinares com suporte a Advertência Verbal, Advertência Escrita, Suspensão, Justa Causa, Abandono de Emprego, Uso de EPI, Dano Patrimonial e Recusa a Exames.",
      "Aba Disciplinar na Ficha do Colaborador com contadores visuais de gradação de penas (CLT Art. 482) e alertas de reincidência.",
      "Fluxo de assinatura digital/física com registro formal de Certidão de Recusa presenciada por 2 testemunhas.",
    ],
  },
  {
    versao: "1.58.0",
    data: "09/08/2026",
    horario: "15:00",
    titulo: "Dark mode, modernização de gráficos, organograma e preenchimento de vagas",
    itens: [
      "Suporte nativo a Dark Mode com alternador na barra superior e tema Indigo/Slate moderno (WCAG AA).",
      "Modernização de cores e suporte ao modo escuro nos gráficos Recharts em todas as telas.",
      "Redesign da visualização da árvore do organograma com zoom suave, expansão por ramo e cartões estilizados.",
      "Preenchimento automático de descrição e requisitos ao selecionar o cargo no cadastro de novas vagas.",
    ],
  },
  {
    versao: "1.57.0",
    data: "09/08/2026",
    horario: "14:30",
    titulo: "Refatoração do ranking de produtividade e melhorias visuais na topbar",
    itens: [
      "Modularização do cálculo de ranking de produtividade para execução segura em servidor e cliente.",
      "Ajustes visuais na barra superior (AppTopbar), cartões e indicadores com suporte a desfoque de fundo e bordas suavizadas.",
    ],
  },
  {
    versao: "1.56.23",
    data: "09/08/2026",
    horario: "03:45",
    titulo: "Remoção de cargos e setores sem colaboradores",
    itens: [
      "Funcionalidade de exclusão em lote de cargos e setores vagos (com 0 colaboradores cadastrados).",
      "Limpeza atômica automática de vínculos pendentes de vagas, metas, planos de ação e requisitos NR.",
    ],
  },
  {
    versao: "1.56.20–1.56.22",
    data: "09/08/2026",
    horario: "03:30",
    titulo: "Análise semântica e unificação de setores e cargos",
    itens: [
      "Algoritmo de agrupamento por semelhança semântica (ex: Vendas ↔ Comercial, RH ↔ Recursos Humanos, TI ↔ Tecnologia da Informação).",
      "Painel interativo de consolidação de grupos com escolha de setor/cargo principal e padronização do nome final.",
      "Melhorias de desempenho e otimização de imports na gestão de posições e departamentos.",
    ],
  },
  {
    versao: "1.56.16–1.56.19",
    data: "09/08/2026",
    horario: "03:00",
    titulo: "Modernização e higienização de setores e cargos",
    itens: [
      "Redesign visual das telas de Setores e Cargos & Funções com KPI cards, avatares coloridos por hash, barras de ocupação e busca rápida.",
      "Ferramenta de limpeza automática de duplicatas exatas de nomes.",
      "Ajuste de escopo: remoção de nomes de empresas na lista de setores e unificação de cargos para o catálogo geral da marca.",
    ],
  },
  {
    versao: "1.56.2–1.56.15",
    data: "08/08/2026",
    horario: "14:00",
    titulo: "Gerador nativo ultra-rápido de relatórios PDF e travas CI",
    itens: [
      "Substituição do Chromium por gerador nativo ultra-rápido para relatórios e PDFs A4.",
      "Inclusão de travas de segurança de build e verificação de bundling no script de release.",
    ],
  },
  {
    versao: "1.56.1",
    data: "08/08/2026",
    horario: "02:20",
    titulo: "Notificação de pendências sem Telegram e correções",
    itens: [
      "Inclusão do indicador e rótulo 'Sem Telegram vinculado' no motor de cobrança automática de pendências do RH.",
      "Auditoria completa de código e verificação de integridade antes do deploy em produção.",
    ],
  },
  {
    versao: "1.56.0",
    data: "07/08/2026",
    horario: "18:50",
    titulo: "Recuperação de senha confiável",
    itens: [
      "O link “Esqueci minha senha” passou a ficar acessível mesmo quando a proteção de rotas está ativa.",
      "Se o envio de e-mail falhar, a tela informa o problema de forma amigável e preserva tokens válidos anteriores.",
      "Documentação e modelo de configuração (.env.example) atualizados com os requisitos de SMTP.",
    ],
  },
  {
    versao: "1.55.3",
    data: "07/08/2026",
    horario: "18:47",
    titulo: "Horário em cada atualização",
    itens: [
      "A tela Atualizações agora mostra também o horário de publicação de cada versão, além da data.",
    ],
  },
  {
    versao: "1.55.2",
    data: "07/08/2026",
    horario: "18:38",
    titulo: "Filtro por empresa na Produtividade RH",
    itens: [
      "A tela Produtividade RH ganhou filtro por empresa/CNPJ, ao lado do filtro de período — sem seleção, mostra o grupo inteiro.",
    ],
  },
  {
    versao: "1.55.1",
    data: "07/08/2026",
    horario: "17:10",
    titulo: "Ícone de alerta nos blocos clicáveis da Liderança",
    itens: [
      'Os blocos "Sem supervisor" e "Divergência de cadastro" da tela de Liderança agora mostram o triângulo ao lado do número em alerta, como os demais indicadores — a cor deixa de ser o único sinal.',
    ],
  },
  {
    versao: "1.55.0",
    data: "07/08/2026",
    horario: "17:08",
    titulo: "Produtividade da equipe de RH",
    itens: [
      "Nova tela (menu do topo, Administração e Diretoria) mostra quantas ações cada conta de sistema registrou hoje, nos últimos 7 ou nos últimos 30 dias, agrupadas em 6 categorias de processo.",
      "É contagem de eventos da trilha de auditoria, não medida de esforço — serve para ver quem está atuando e em quê, não como avaliação isolada de desempenho.",
    ],
  },
  {
    versao: "1.54.0",
    data: "07/08/2026",
    horario: "15:21",
    titulo: "Tela de Atualizações na administração",
    itens: [
      "Histórico das versões publicadas — número, data e resumo do que mudou — visível para Administração e Diretoria.",
      "Regra de entrega atualizada: toda versão nova passa a registrar aqui o que foi alterado.",
    ],
  },
  {
    versao: "1.53.0",
    data: "07/08/2026",
    horario: "14:36",
    titulo: "Desligamentos antigos regularizados e férias programadas",
    itens: [
      "Desligamento importado (anterior ao sistema) com data e motivo preenchidos sai das pendências: checklist e entrevista são dispensados automaticamente — inclusive em massa para quem já estava preenchido.",
      'Lista de Desligamentos ganhou a marcação "Dispensada" na entrevista e um botão para abrir a ficha do colaborador direto na aba Desligamento.',
      "Tela nova de férias programadas: as férias aprovadas que ainda vão acontecer.",
    ],
  },
  {
    versao: "1.52.0",
    data: "07/08/2026",
    horario: "14:30",
    titulo: "Canal Fale com o RH",
    itens: [
      "Colaborador fala com o RH pelo portal (no lugar do planejamento de férias, que saiu do portal).",
      "Tela Mensagens no RH para ler e responder.",
    ],
  },
  {
    versao: "1.49.0–1.51.1",
    data: "07/08/2026",
    titulo: "Pendências que batem com as listas",
    itens: [
      "Cartão de pendência abre a lista com a mesma regra e o mesmo recorte de empresas que contou — números do cartão e da lista sempre iguais.",
      '"Sem Telegram vinculado" virou pendência de cobrança, com contagem consistente em todas as telas.',
      "Desligamentos: paginação de 20, edição rápida de data/motivo direto da lista e dispensa de checklist para desligamento antigo.",
      "Revisão visual dos indicadores (cartões de número).",
    ],
  },
  {
    versao: "1.47.0–1.48.1",
    data: "07/08/2026",
    titulo: "Férias e trilha de auditoria",
    itens: [
      "Tela de Férias mostra o progresso do período aquisitivo em curso e a lista de colaboradores paginada; link da listagem abre direto na aba Férias da ficha.",
      "Conciliação de saldo de férias para quem veio importado sem histórico de gozo.",
      "Auditoria passou a registrar criação e edição de colaborador, convites e exclusão de pesquisa e troca de senha.",
    ],
  },
  {
    versao: "1.44.0–1.46.0",
    data: "06/08/2026",
    titulo: "Filtro de empresas em todas as telas",
    itens: [
      "Filtro de marcas/CNPJs chegou às 7 telas que ainda liam só a empresa da rota.",
      "Pesquisa aberta virou pendência por prazo de encerramento, não por resposta faltando (responder é opcional).",
      "Aprovações, dados bancários no portal e aviso de bloco não salvo na ficha.",
    ],
  },
  {
    versao: "1.41.0–1.43.0",
    data: "05/08/2026",
    titulo: "Ondas de gestão",
    itens: [
      "Placar do grupo, malha de liderança, radar de anomalias e passivo de férias.",
      "Central de Sinais, zonas de risco NR-01, narrativa executiva, Meu Time e qualidade salarial.",
      "Desligamento estruturado, contrato de experiência e exposição SST.",
    ],
  },
  {
    versao: "1.36.0–1.40.2",
    data: "04/08/2026",
    titulo: "Segurança e operação",
    itens: [
      "Login com limite de 5 tentativas por usuário+IP em 15 minutos.",
      "Migrations do banco passaram a aplicar sozinhas no deploy de produção.",
      "Catálogos configuráveis ligados aos 9 formulários, dashboard executivo com curvas de 12 meses, tipos de benefício e cor por marca.",
    ],
  },
  {
    versao: "1.0.0–1.35.2",
    data: "até 04/08/2026",
    titulo: "Base do sistema",
    itens: [
      "Do sistema de pesquisa de clima ao RH completo: colaboradores, férias, folha, benefícios, treinamentos, avaliações, vagas, organograma, portal do colaborador e integrações.",
    ],
  },
];
