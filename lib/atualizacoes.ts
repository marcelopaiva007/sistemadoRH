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
