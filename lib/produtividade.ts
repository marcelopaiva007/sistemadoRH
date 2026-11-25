// Produtividade da equipe de RH — contagem de ações no AuditLog por conta de
// sistema (ADMIN/DIRETORIA/RH_MANAGER/GESTOR_SETOR), curada em categorias de
// processo. Funções puras: recebem os registros já buscados do banco e
// devolvem números prontos pra tela; nada aqui toca o Prisma, mesmo contrato
// de lib/bi.ts, pra dar pra testar sem banco.
//
// É contagem de EVENTOS de auditoria, não medida de esforço: editar um campo
// da ficha conta igual a gerar um checklist inteiro. E "Colaborador" — a
// entidade mais usada no sistema — cobre mais de um processo (ficha, admissão,
// desligamento, movimentação) sob o mesmo rótulo, porque a auditoria não
// distingue qual fluxo de negócio disparou a gravação. Serve pra ver quem está
// atuando e em que área, não pra avaliação de desempenho isolada.

export type CategoriaProdutividade =
  | "Ciclo de vida"
  | "Departamento Pessoal"
  | "Desempenho & Desenvolvimento"
  | "Saúde & Segurança"
  | "Pesquisas & Reconhecimento"
  | "Gestão & Configuração";

export const CATEGORIAS_PRODUTIVIDADE: CategoriaProdutividade[] = [
  "Ciclo de vida",
  "Departamento Pessoal",
  "Desempenho & Desenvolvimento",
  "Saúde & Segurança",
  "Pesquisas & Reconhecimento",
  "Gestão & Configuração",
];

// entidade (AuditLog.entidade) → categoria. Espelha os 5 blocos de navegação
// do sistema (ver README) + "Gestão & Configuração" pra o que é administração
// do sistema em si, não trabalho de RH sobre gente.
const CATEGORIA_POR_ENTIDADE: Record<string, CategoriaProdutividade> = {
  // Ciclo de vida — recrutamento, onboarding, movimentação, desligamento formal
  Vaga: "Ciclo de vida",
  Candidatura: "Ciclo de vida",
  ChecklistIntegracao: "Ciclo de vida",
  ChecklistDesligamento: "Ciclo de vida",
  EntrevistaDesligamento: "Ciclo de vida",
  Movimentacao: "Ciclo de vida",

  // Departamento Pessoal — ficha, dossiê, férias, ausências, benefícios, folha, escala
  Colaborador: "Departamento Pessoal",
  Dependente: "Departamento Pessoal",
  DocumentoColaborador: "Departamento Pessoal",
  Ausencia: "Departamento Pessoal",
  SolicitacaoFerias: "Departamento Pessoal",
  BeneficioColaborador: "Departamento Pessoal",
  CompetenciaFolha: "Departamento Pessoal",
  EventoFolha: "Departamento Pessoal",
  EscalaTurno: "Departamento Pessoal",

  // Desempenho & Desenvolvimento
  AvaliacaoDesempenho: "Desempenho & Desenvolvimento",
  CicloAvaliacao: "Desempenho & Desenvolvimento",
  Meta: "Desempenho & Desenvolvimento",
  PlanoDesenvolvimento: "Desempenho & Desenvolvimento",
  Treinamento: "Desempenho & Desenvolvimento",
  ParticipacaoTreinamento: "Desempenho & Desenvolvimento",
  PlanoAcao: "Desempenho & Desenvolvimento",
  Sinal: "Desempenho & Desenvolvimento",

  // Saúde & Segurança
  RequisitoNR: "Saúde & Segurança",
  CertificadoNR: "Saúde & Segurança",
  ExameOcupacional: "Saúde & Segurança",
  EntregaEPI: "Saúde & Segurança",
  AcidenteTrabalho: "Saúde & Segurança",

  // Pesquisas & Reconhecimento
  Pesquisa: "Pesquisas & Reconhecimento",
  SurveyToken: "Pesquisas & Reconhecimento",
  Reconhecimento: "Pesquisas & Reconhecimento",
  MensagemPortal: "Pesquisas & Reconhecimento",
  PortalSessao: "Pesquisas & Reconhecimento",

  // Gestão & Configuração
  Marca: "Gestão & Configuração",
  Empresa: "Gestão & Configuração",
  ConfiguracaoLembrete: "Gestão & Configuração",
  ImportacaoArquivo: "Gestão & Configuração",
  SegredoApp: "Gestão & Configuração",
  User: "Gestão & Configuração",
  UserEmpresa: "Gestão & Configuração",
  UserMarca: "Gestão & Configuração",
  AssistenteRH: "Gestão & Configuração",
};

/** Entidade fora do mapa cai em "Gestão & Configuração" em vez de sumir da conta. */
export function categoriaDaEntidade(entidade: string): CategoriaProdutividade {
  return CATEGORIA_POR_ENTIDADE[entidade] ?? "Gestão & Configuração";
}

export interface RegistroAuditoriaSimples {
  usuarioId: string | null;
  usuarioNome: string | null;
  usuarioRole: string | null;
  entidade: string;
  createdAt: Date;
}

export interface LinhaProdutividade {
  usuarioId: string;
  usuarioNome: string;
  usuarioRole: string | null;
  total: number;
  porCategoria: Record<CategoriaProdutividade, number>;
  ultimaAcaoEm: Date;
}

function categoriasZeradas(): Record<CategoriaProdutividade, number> {
  return Object.fromEntries(CATEGORIAS_PRODUTIVIDADE.map((c) => [c, 0])) as Record<
    CategoriaProdutividade,
    number
  >;
}

// 26/11/2026: a tela passou a agregar no banco (groupBy por conta + entidade)
// em vez de trazer cada linha do AuditLog de 30 dias para somar em memória —
// eram dezenas de milhares de linhas por abertura. O banco devolve uma linha
// por (conta, nome, papel, entidade) com a contagem e a ação mais recente; as
// funções abaixo trabalham sobre esse formato. As versões por registro
// continuam existindo (viram grupos de 1) para os testes e quem ainda tiver a
// lista crua.
export interface GrupoAuditoria {
  usuarioId: string | null;
  usuarioNome: string | null;
  usuarioRole: string | null;
  entidade: string;
  quantidade: number;
  ultimaEm: Date;
}

function registrosComoGrupos(registros: RegistroAuditoriaSimples[]): GrupoAuditoria[] {
  return registros.map((r) => ({
    usuarioId: r.usuarioId,
    usuarioNome: r.usuarioNome,
    usuarioRole: r.usuarioRole,
    entidade: r.entidade,
    quantidade: 1,
    ultimaEm: r.createdAt,
  }));
}

/**
 * Uma linha por conta de sistema, da mais para a menos ativa no período, a
 * partir dos grupos já contados pelo banco. Ignora grupo sem `usuarioId` (ator
 * do portal/público). Se a mesma conta aparece com nomes ou papéis diferentes
 * (renomeada, promovida), fica o nome/papel do grupo com a ação mais recente.
 */
export function produtividadeDeGruposPorUsuario(grupos: GrupoAuditoria[]): LinhaProdutividade[] {
  const porUsuario = new Map<string, LinhaProdutividade>();

  for (const g of grupos) {
    if (!g.usuarioId) continue;
    let linha = porUsuario.get(g.usuarioId);
    if (!linha) {
      linha = {
        usuarioId: g.usuarioId,
        usuarioNome: g.usuarioNome ?? "(sem nome)",
        usuarioRole: g.usuarioRole,
        total: 0,
        porCategoria: categoriasZeradas(),
        ultimaAcaoEm: g.ultimaEm,
      };
      porUsuario.set(g.usuarioId, linha);
    }
    linha.total += g.quantidade;
    linha.porCategoria[categoriaDaEntidade(g.entidade)] += g.quantidade;
    if (g.ultimaEm > linha.ultimaAcaoEm) {
      linha.ultimaAcaoEm = g.ultimaEm;
      linha.usuarioNome = g.usuarioNome ?? linha.usuarioNome;
      linha.usuarioRole = g.usuarioRole;
    }
  }

  return [...porUsuario.values()].sort((a, b) => b.total - a.total);
}

/** Total por categoria a partir dos grupos — mesma ordem de CATEGORIAS_PRODUTIVIDADE. */
export function produtividadeDeGruposPorCategoria(grupos: GrupoAuditoria[]): LinhaCategoria[] {
  const totais = categoriasZeradas();
  for (const g of grupos) {
    if (!g.usuarioId) continue;
    totais[categoriaDaEntidade(g.entidade)] += g.quantidade;
  }
  return CATEGORIAS_PRODUTIVIDADE.map((categoria) => ({ categoria, total: totais[categoria] }));
}

/**
 * Uma linha por conta de sistema, da mais para a menos ativa no período.
 * Ignora registro sem `usuarioId` — é o caso do portal do colaborador, que audita
 * a própria pessoa (não uma conta de sistema) via `ator` em `registrarAuditoria`;
 * quem chama esta função já deve ter filtrado a consulta por papel de sistema.
 */
export function produtividadePorUsuario(registros: RegistroAuditoriaSimples[]): LinhaProdutividade[] {
  return produtividadeDeGruposPorUsuario(registrosComoGrupos(registros));
}

export interface LinhaCategoria {
  categoria: CategoriaProdutividade;
  total: number;
}

/** Total geral por categoria, pro resumo no topo da tela — mesma ordem de CATEGORIAS_PRODUTIVIDADE. */
export function produtividadePorCategoria(registros: RegistroAuditoriaSimples[]): LinhaCategoria[] {
  return produtividadeDeGruposPorCategoria(registrosComoGrupos(registros));
}
