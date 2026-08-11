// Catálogo central de tipos de pesquisa — fase 0 do roadmap de 02/08/2026
// (ver docs/RD-001_regra_vinculo_ativo.md e lib/data/pesquisas-rh-seed.json,
// a fonte do dado abaixo).
//
// Hoje cada tipo de pesquisa (CLIMA, NR01) tem template hardcoded em arquivo
// próprio, e o resto do código bifurca com `if (modelo === "CLIMA")`. Esse
// padrão já dói com 2 tipos — o seed descreve 20. Este módulo é o ponto único
// de metadata por tipo (elegibilidade de vínculo, cadência, camada); quem
// precisa dessa metadata lê daqui em vez de reproduzir a bifurcação.
//
// `raw` carrega o conteúdo completo do seed (dimensões/itens/regras
// especiais) tal como veio. Nenhum tipo novo (P01-FRPRT em diante) tem motor
// de cálculo ou tela própria ainda — `implementado: false` — isso é
// construído caso a caso nas próximas fases, usando `raw` como fonte; por
// enquanto só a elegibilidade de vínculo (`elegibilidadeVinculo`) é
// consumida de verdade, por lib/pesquisa-vinculo.ts.
import seed from "@/lib/data/pesquisas-rh-seed.json";

export type ElegibilidadeVinculo = "ativo" | "experiencia" | "ferias" | "aviso_previo" | "desligado";

export type DefinicaoPesquisa = {
  codigo: string;
  id: string;
  nome: string;
  camada: string | null;
  cadencia: string | null;
  escalaPadrao: string | null;
  elegibilidadeVinculo: ElegibilidadeVinculo[];
  anonima: boolean;
  gatilho: string | null;
  saida: string[] | null;
  obrigatoriaLegal: boolean;
  // false para tudo que só existe como especificação (seed) — nenhuma tela,
  // cron ou motor de cálculo lê `raw` ainda.
  implementado: boolean;
  raw: unknown;
};

type PesquisaDoSeed = {
  codigo: string;
  id: string;
  nome: string;
  camada?: string;
  cadencia?: string;
  escala_padrao?: string;
  elegibilidade_vinculo?: string[];
  anonima?: boolean;
  gatilho?: string;
  saida?: string[];
  obrigatoria_legal?: boolean;
};

function daSeed(p: PesquisaDoSeed): DefinicaoPesquisa {
  return {
    codigo: p.codigo,
    id: p.id,
    nome: p.nome,
    camada: p.camada ?? null,
    cadencia: p.cadencia ?? null,
    escalaPadrao: p.escala_padrao ?? null,
    elegibilidadeVinculo: (p.elegibilidade_vinculo ?? []) as ElegibilidadeVinculo[],
    anonima: p.anonima ?? false,
    gatilho: p.gatilho ?? null,
    saida: p.saida ?? null,
    obrigatoriaLegal: p.obrigatoria_legal ?? false,
    implementado: false,
    raw: p,
  };
}

const DO_SEED: Record<string, DefinicaoPesquisa> = Object.fromEntries(
  (seed as { pesquisas: PesquisaDoSeed[] }).pesquisas.map((p) => [p.id, daSeed(p)]),
);

// CLIMA e NR01 são os dois tipos hoje em produção — não vêm do seed. O seed
// tem P03-CLIMA e P01-FRPRT como variantes NOVAS e distintas (42 itens/8
// dimensões vs. 35/6 do NR01 atual), e o RD-001 decidiu que elas COEXISTEM
// com estas, não substituem: mudar a pergunta invalidaria a série histórica
// já entregue como PGR/relatório de clima. A elegibilidade abaixo é a mesma
// que lib/pesquisa-vinculo.ts já aplicava de forma binária antes deste
// catálogo existir — RD-001, matriz "Clima/NR-1" (ativo + experiência +
// férias; fora afastamento INSS/licença-maternidade/suspensão e desligado).
const LEGADO: Record<string, DefinicaoPesquisa> = {
  CLIMA: {
    codigo: "CLIMA",
    id: "CLIMA",
    nome: "Pesquisa de Clima (atual, GPTW)",
    camada: "L2_diagnostico",
    cadencia: "trimestral_ou_anual",
    escalaPadrao: null,
    elegibilidadeVinculo: ["ativo", "experiencia", "ferias"],
    anonima: true,
    gatilho: null,
    saida: null,
    obrigatoriaLegal: false,
    implementado: true,
    raw: null,
  },
  NR01: {
    codigo: "NR01",
    id: "NR01",
    nome: "Avaliação de Riscos Psicossociais (NR-01/PGR, atual)",
    camada: "L2_diagnostico",
    cadencia: "anual",
    escalaPadrao: null,
    elegibilidadeVinculo: ["ativo", "experiencia", "ferias"],
    anonima: true,
    gatilho: null,
    saida: ["PGR"],
    obrigatoriaLegal: true,
    implementado: true,
    raw: null,
  },
};

export const CATALOGO_PESQUISAS: Record<string, DefinicaoPesquisa> = { ...LEGADO, ...DO_SEED };

export function definicaoPesquisa(modelo: string): DefinicaoPesquisa {
  const def = CATALOGO_PESQUISAS[modelo];
  if (!def) {
    throw new Error(`Tipo de pesquisa desconhecido no catálogo: "${modelo}" (lib/pesquisas-catalogo.ts).`);
  }
  return def;
}
