import { normalizarTexto } from "@/lib/text";

export type GrupoCargoSemelhante = {
  chaveStem: string;
  sugestaoNome: string;
  posicoes: {
    id: string;
    nome: string;
    colaboradoresCount: number;
    vagasCount: number;
    ativo: boolean;
  }[];
  totalColaboradores: number;
};

// Dicionário de normalização de termos equivalentes
const SIGLAS_E_EQUIVALENCIAS: Record<string, string> = {
  adm: "administrativo",
  admin: "administrativo",
  administrativa: "administrativo",
  aux: "auxiliar",
  asst: "assistente",
  assist: "assistente",
  sup: "supervisor",
  superv: "supervisor",
  supervisora: "supervisor",
  coord: "coordenador",
  coordenadora: "coordenador",
  ger: "gerente",
  gerent: "gerente",
  tec: "tecnico",
  tecnica: "tecnico",
  op: "operador",
  operadora: "operador",
  operacional: "operador",
  rh: "recursos humanos",
  ti: "tecnologia da informacao",
  tech: "tecnologia da informacao",
  vendedora: "vendedor",
  consultora: "consultor",
  atendente: "atendimento",
  recepcionista: "recepcao",
};

/** Normaliza e extrai radical comparativo para detectar sinônimos e variações de gênero/abrev. */
export function extrairRadicalCargo(nome: string): string {
  let texto = normalizarTexto(nome);

  // Remove sufixos de gênero (a), /a, (o/a)
  texto = texto
    .replace(/\s*\(\s*[ao]\s*\)/g, "")
    .replace(/\s*\/[ao]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();

  const palavras = texto.split(/\s+/).filter(Boolean);

  const palavrasMapeadas = palavras.map((p) => {
    // Aplica dicionário de siglas/sinônimos
    if (SIGLAS_E_EQUIVALENCIAS[p]) return SIGLAS_E_EQUIVALENCIAS[p];

    // Remove desinência de gênero feminina simples no final da palavra
    if (p.length > 4 && p.endsWith("ora")) {
      return p.slice(0, -3) + "or";
    }
    if (p.length > 4 && p.endsWith("a") && !p.endsWith("ista") && !p.endsWith("ia")) {
      return p.slice(0, -1) + "o";
    }
    return p;
  });

  return palavrasMapeadas.sort().join(" ");
}

/** Calcula similaridade percentual de Levenshtein entre duas strings */
function similaridadeLevenshtein(str1: string, str2: string): number {
  const s1 = normalizarTexto(str1);
  const s2 = normalizarTexto(str2);
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  const maxLen = Math.max(m, n);
  return 1 - dp[m][n] / maxLen;
}

/** Agrupa posições/cargos por semelhança semântica, gramatical e fonética. */
export function agruparCargosSemelhantes(
  posicoes: {
    id: string;
    nome: string;
    colaboradoresCount: number;
    vagasCount: number;
    ativo: boolean;
  }[],
): GrupoCargoSemelhante[] {
  const grupos = new Map<string, GrupoCargoSemelhante>();
  const alocados = new Set<string>();

  // Passagem 1: Agrupamento por radical normalizado
  for (const pos of posicoes) {
    if (alocados.has(pos.id)) continue;
    const radical = extrairRadicalCargo(pos.nome);

    const semelhantes = posicoes.filter((outra) => {
      if (alocados.has(outra.id)) return false;
      const radicalOutra = extrairRadicalCargo(outra.nome);
      if (radical === radicalOutra) return true;

      // Similaridade leve de Levenshtein para pequenos erros de digitação (> 82%)
      if (radical.length > 4 && radicalOutra.length > 4) {
        return similaridadeLevenshtein(radical, radicalOutra) >= 0.82;
      }
      return false;
    });

    if (semelhantes.length > 1) {
      semelhantes.forEach((p) => alocados.add(p.id));

      // Ordena por colaboradores count desc -> mais popular primeiro
      semelhantes.sort((a, b) => b.colaboradoresCount - a.colaboradoresCount);

      const totalColabs = semelhantes.reduce((acc, p) => acc + p.colaboradoresCount, 0);

      // Sugere o nome mais representativo
      const sugestao = semelhantes[0].nome.trim();

      grupos.set(radical, {
        chaveStem: radical,
        sugestaoNome: sugestao,
        posicoes: semelhantes,
        totalColaboradores: totalColabs,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.posicoes.length - a.posicoes.length);
}
