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
