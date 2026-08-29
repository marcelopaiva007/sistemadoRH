// O catálogo de permissões dos dois sistemas — a fonte única do que existe
// para conceder.
//
// Onda 1 do controle de acesso fino (24/08/2026, decisão do CEO): montar a
// fundação SEM mudar nada na tela. Nenhuma guarda usa este arquivo ainda; ele
// existe para os Perfis referenciarem permissões reais e para a tela da Onda 2
// desenhar a matriz a partir de uma lista só, alinhada com o menu.
//
// Uma permissão é uma string `sistema:area:acao`:
//   - `rh:folha:ver`, `rh:folha:editar`
//   - `processos:contratos:editar`
//
// As áreas espelham os itens do menu (rh-empresa-nav.tsx e processos-nav.tsx):
// é o vocabulário que o RH já usa, então a matriz de permissão fala a mesma
// língua da navegação. Área nova no menu = área nova aqui, no mesmo commit.

export type Acao = "ver" | "editar";

export const ACOES: Acao[] = ["ver", "editar"];

export type Area = {
  /** Slug do item no menu — casa com a URL. */
  slug: string;
  /** Rótulo exibido, o mesmo do menu. */
  label: string;
  /**
   * Áreas que são só leitura por natureza (Auditoria, Placar, Relatórios): não
   * geram permissão de `editar`. Marcar aqui evita permissão que não protege
   * nada — e uma matriz com caixa de "editar" que não faz nada ensina que a
   * matriz mente.
   */
  soLeitura?: boolean;
};

export type GrupoDeAreas = {
  titulo: string;
  areas: Area[];
};

/**
 * As áreas do módulo de RH, agrupadas como o menu agrupa. Ordem e títulos
 * copiados de app/(app)/rh/[empresaId]/rh-empresa-nav.tsx para a matriz de
 * permissão e o menu nunca discordarem.
 */
export const AREAS_RH: GrupoDeAreas[] = [
  {
    titulo: "Ciclo de vida",
    areas: [
      { slug: "colaboradores", label: "Colaboradores" },
      { slug: "organograma", label: "Organograma" },
      { slug: "vagas", label: "Vagas" },
      { slug: "candidatos", label: "Talentos" },
      { slug: "integracoes", label: "Integrações" },
      { slug: "desligamentos", label: "Desligamentos" },
    ],
  },
  {
    titulo: "Departamento pessoal",
    areas: [
      { slug: "ponto", label: "Ponto Eletrônico" },
      { slug: "aprovacoes", label: "Aprovações" },
      { slug: "mensagens", label: "Mensagens" },
      { slug: "avisos-gestor", label: "Avisos ao gestor" },
      { slug: "vencimentos", label: "Vencimentos" },
      { slug: "ferias", label: "Férias" },
      { slug: "escalas", label: "Escalas" },
      { slug: "beneficios", label: "Benefícios" },
      { slug: "entregas", label: "Entregas" },
      { slug: "folha", label: "Folha" },
    ],
  },
  {
    titulo: "Desempenho & desenvolvimento",
    areas: [
      { slug: "avaliacoes", label: "Avaliações" },
      { slug: "metas", label: "Metas & PDI" },
      { slug: "treinamentos", label: "Treinamentos" },
      { slug: "reconhecimento", label: "Reconhecimento" },
      { slug: "pesquisas", label: "Pesquisas" },
    ],
  },
  {
    titulo: "Saúde & segurança",
    areas: [
      { slug: "conformidade", label: "Conformidade" },
      { slug: "acidentes", label: "Acidentes / CAT" },
    ],
  },
  {
    titulo: "Gestão",
    areas: [
      { slug: "painel", label: "Painel executivo", soLeitura: true },
      { slug: "placar", label: "Placar do grupo", soLeitura: true },
      { slug: "painel-setor", label: "Painel do setor", soLeitura: true },
      { slug: "sinais", label: "Central de Sinais" },
      { slug: "lideranca", label: "Malha de liderança", soLeitura: true },
      { slug: "time", label: "Meu time", soLeitura: true },
      { slug: "dashboard", label: "Risco psicossocial (NR-01)" },
      { slug: "planos-acao", label: "Planos de ação" },
      { slug: "relatorios", label: "Relatórios", soLeitura: true },
      { slug: "assistente", label: "Assistente" },
    ],
  },
  {
    titulo: "Configuração",
    areas: [
      { slug: "configuracoes", label: "Visão geral" },
      { slug: "setores", label: "Setores" },
      { slug: "posicoes", label: "Cargos" },
      { slug: "estrutura", label: "Marcas & CNPJs" },
      { slug: "canais", label: "Canais de envio" },
      { slug: "lembretes", label: "Lembretes" },
      { slug: "tipos-beneficio", label: "Tipos de benefício" },
      { slug: "catalogos", label: "Catálogos" },
    ],
  },
  {
    titulo: "Administração",
    areas: [
      { slug: "importacoes", label: "Importações" },
      { slug: "auditoria", label: "Auditoria", soLeitura: true },
      // "papeis" saiu do catálogo em 26/08/2026 junto com o item de menu: a
      // tela virou redirect para /cadastros/perfis, e o cadastro de acesso
      // (usuários + perfis) é governado por requireGestaoUsuarios, fora da
      // matriz por-tela — dar "ver/editar perfis" via perfil seria deixar um
      // perfil conceder acesso a quem edita perfis.
    ],
  },
];

/**
 * As áreas do módulo Processos & Ativos, na ordem de processos-nav.tsx. A
 * Central de Pendências (`pendencias`) é a raiz do módulo — ver sem editar,
 * porque agir nela é agir na origem (o veículo, o contrato), coberto pelas
 * outras áreas.
 */
export const AREAS_PROCESSOS: GrupoDeAreas[] = [
  {
    titulo: "Central",
    areas: [
      { slug: "pendencias", label: "Pendências", soLeitura: true },
      { slug: "painel", label: "Painel", soLeitura: true },
    ],
  },
  {
    titulo: "Frota",
    areas: [
      { slug: "panorama", label: "Panorama", soLeitura: true },
      { slug: "frota", label: "Veículos" },
      { slug: "multas", label: "Multas" },
      { slug: "condutores", label: "Condutores" },
      { slug: "consumo", label: "Consumo" },
      { slug: "manutencoes", label: "Manutenções" },
      { slug: "analise", label: "Análise", soLeitura: true },
    ],
  },
  {
    titulo: "Contratos",
    areas: [
      { slug: "contratos", label: "Contratos" },
      { slug: "contrapartes", label: "Contrapartes" },
    ],
  },
];

/**
 * As áreas do módulo Delegações, na ordem de `delegacoes-nav.tsx`.
 *
 * "Recebidas" é só leitura de permissão porque agir nela (aceitar, repactuar,
 * entregar) é direito de QUEM É O RESPONSÁVEL daquela demanda, não de quem tem
 * a permissão da tela — a máquina de estados decide isso por demanda, olhando
 * quem é o dono. Permissão de tela aqui responde "você enxerga esta lista?";
 * quem responde "você pode agir NESTA demanda?" é lib/delegacoes/estados.ts.
 * O mesmo vale para o Painel, que é a leitura da Direção.
 */
export const AREAS_DELEGACOES: GrupoDeAreas[] = [
  {
    titulo: "Minhas demandas",
    areas: [
      { slug: "recebidas", label: "Recebidas", soLeitura: true },
      // `editar` aqui = criar demanda nova. É por isso que esta área não é só
      // leitura, e é por isso que não existe área "Nova demanda": delegar é
      // uma ação da tela de quem delega, não um item de menu à parte.
      { slug: "delegadas", label: "Delegadas por mim" },
    ],
  },
];

export type Sistema = {
  slug: string;
  nome: string;
  grupos: GrupoDeAreas[];
};

/** Os três sistemas e suas áreas — o que a matriz de permissão desenha. */
export const SISTEMAS: Sistema[] = [
  { slug: "rh", nome: "Pessoas (RH)", grupos: AREAS_RH },
  { slug: "processos", nome: "Processos & Ativos", grupos: AREAS_PROCESSOS },
  { slug: "delegacoes", nome: "Delegações", grupos: AREAS_DELEGACOES },
];

/** Toda permissão que existe, `sistema:area:acao`, na ordem do catálogo. */
export function todasAsPermissoes(): string[] {
  const saida: string[] = [];
  for (const sistema of SISTEMAS) {
    for (const grupo of sistema.grupos) {
      for (const area of grupo.areas) {
        saida.push(`${sistema.slug}:${area.slug}:ver`);
        if (!area.soLeitura) saida.push(`${sistema.slug}:${area.slug}:editar`);
      }
    }
  }
  return saida;
}

/**
 * Um "grant" de perfil cobre esta permissão exata?
 *
 * O grant pode ser exato (`rh:folha:editar`) ou curinga:
 *   - `*` cobre tudo (perfil Administrador);
 *   - `rh:*` cobre todo o módulo de RH;
 *   - `rh:folha:*` cobre ver e editar Folha.
 *
 * Curinga existe para o SEED e para "dar o módulo inteiro" com um clique sem
 * gravar 90 linhas — a tela da Onda 2 pode expandir em permissões exatas na
 * hora de editar. `editar` NUNCA implica `ver` aqui: quem monta o perfil
 * concede os dois, e a tela cuida de manter os dois juntos. Implicar em código
 * esconderia um perfil que edita mas, na matriz, aparece sem "ver".
 */
export function grantCobre(grant: string, permissao: string): boolean {
  if (grant === "*") return true;
  if (grant === permissao) return true;
  if (grant.endsWith(":*")) {
    const prefixo = grant.slice(0, -1); // "rh:*" -> "rh:", "rh:folha:*" -> "rh:folha:"
    return permissao.startsWith(prefixo);
  }
  return false;
}

/** Uma permissão é coberta por QUALQUER grant da lista? */
export function algumGrantCobre(grants: string[], permissao: string): boolean {
  return grants.some((g) => grantCobre(g, permissao));
}

/** Os sistemas (slugs) que estes grants alcançam — para o seletor do topo. */
export function sistemasDosGrants(grants: string[]): string[] {
  return SISTEMAS.filter((s) => todasAsPermissoes().some((p) => p.startsWith(`${s.slug}:`) && algumGrantCobre(grants, p)))
    .map((s) => s.slug);
}

/**
 * Os PERFIS SEMENTE — o seed que a Onda 1 grava para reproduzir EXATAMENTE o
 * acesso de hoje. Nada de tela muda; estes existem para o modelo novo devolver
 * o mesmo alcance que o papel devolvia, e é o que o teste
 * scripts/test-permissoes.ts prova.
 *
 * Fiel de propósito, não idealizado: hoje o acesso é grosso — Admin, Diretoria
 * e Gestor de RH enxergam OS DOIS sistemas inteiros (components/modulos.ts), e
 * Gestor de Setor fica só no próprio setor. A DIFERENCIAÇÃO que o CEO quer
 * (uns só no RH, permissão por tela) é o trabalho da Onda 2, editando estes
 * perfis e criando outros. Semear já diferenciado tiraria acesso de alguém no
 * dia da virada — exatamente o que a Onda 1 promete não fazer.
 *
 * `papelDeOrigem` diz de qual `User.role` cada perfil é o retrato: a migration
 * usa isso para vincular cada usuário existente ao seu perfil.
 */
export type PerfilSemente = {
  id: string;
  nome: string;
  descricao: string;
  papelDeOrigem: string;
  grants: string[];
};

export const PERFIS_SEMENTE: PerfilSemente[] = [
  {
    id: "perfil-semente-admin",
    nome: "Administrador",
    descricao: "Acesso total aos dois sistemas, incluindo Marcas & CNPJs e configuração.",
    papelDeOrigem: "ADMIN",
    grants: ["*"],
  },
  {
    id: "perfil-semente-diretoria",
    nome: "Diretoria",
    descricao: "Acesso total aos dois sistemas (mesmo alcance de hoje). A distinção de CNPJ vem na Onda 2.",
    papelDeOrigem: "DIRETORIA",
    grants: ["*"],
  },
  {
    id: "perfil-semente-rh",
    nome: "Gestor de RH",
    descricao: "Os dois sistemas, como hoje. Ajuste para 'só RH' editando este perfil na Onda 2.",
    papelDeOrigem: "RH_MANAGER",
    grants: ["rh:*", "processos:*"],
  },
  {
    id: "perfil-semente-gestor-setor",
    nome: "Gestor de Setor",
    descricao: "Só o próprio setor — o escopo restrito que já existe hoje.",
    papelDeOrigem: "GESTOR_SETOR",
    grants: ["rh:time:ver", "rh:colaboradores:ver"],
  },
];
