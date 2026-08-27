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

/**
 * Radicais são PARECIDOS o bastante para sugerir fusão só quando a diferença
 * é erro de digitação — nunca quando é substantivo trocado.
 *
 * Até 27/08/2026 a comparação rodava Levenshtein na STRING INTEIRA do radical,
 * e isso confundia "Gerente de Vendas" com "Gerente de Redes" (radicais "de
 * gerente vendas" / "de gerente redes", ~82% parecidos como string): duas
 * palavras batiam ("de", "gerente") e só "vendas"/"redes" — um SUBSTANTIVO,
 * não erro de grafia — divergia. A tela oferecia "Unificar este grupo" pronto
 * para juntar um cargo comercial com um técnico de rede num clique.
 *
 * A régua agora é PALAVRA A PALAVRA: mesmo número de palavras, todas iguais
 * MENOS NO MÁXIMO UMA — e essa uma só conta como "digitação" se ela própria
 * for ≥85% parecida (typo real: "finaceiro"~"financeiro"). Palavra totalmente
 * diferente ("vendas"/"redes") nunca aprova, não importa a nota da string
 * inteira.
 */
function radicaisParecidosPorDigitacao(radicalA: string, radicalB: string): boolean {
  const palavrasA = radicalA.split(" ").filter(Boolean);
  const palavrasB = radicalB.split(" ").filter(Boolean);
  if (palavrasA.length !== palavrasB.length) return false;

  const restanteB = [...palavrasB];
  const divergentes: string[] = [];
  for (const palavra of palavrasA) {
    const i = restanteB.indexOf(palavra);
    if (i >= 0) restanteB.splice(i, 1);
    else divergentes.push(palavra);
  }
  // Todas batem: já é o caso de radical idêntico, tratado antes de chegar aqui.
  if (divergentes.length === 0) return true;
  // Mais de uma palavra diferente = cargos distintos, não erro de digitação.
  if (divergentes.length > 1 || restanteB.length > 1) return false;

  const [unicaA] = divergentes;
  const [unicaB] = restanteB;
  if (unicaA.length <= 4 || unicaB.length <= 4) return false;
  return similaridadeLevenshtein(unicaA, unicaB) >= 0.85;
}

/** Agrupa posições/cargos por semelhança semântica, gramatical e fonética. */
export function agruparCargosSemelhantes(
  posicoes: {
    id: string;
    nome: string;
    /** A marca do CNPJ do cargo. É a fronteira da fusão. */
    marcaId: string;
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
      // Mesma MARCA: fundir atravessando marca é recusado pela guarda
      // (guarda-unificacao.ts), então o grupo nasce dentro de uma marca só.
      if (outra.marcaId !== pos.marcaId) return false;
      if (alocados.has(outra.id)) return false;
      const radicalOutra = extrairRadicalCargo(outra.nome);
      if (radical === radicalOutra) return true;
      return radicaisParecidosPorDigitacao(radical, radicalOutra);
    });

    if (semelhantes.length > 1) {
      semelhantes.forEach((p) => alocados.add(p.id));

      // Ordena por colaboradores count desc -> mais popular primeiro
      semelhantes.sort((a, b) => b.colaboradoresCount - a.colaboradoresCount);

      const totalColabs = semelhantes.reduce((acc, p) => acc + p.colaboradoresCount, 0);

      // Sugere o nome mais representativo
      const sugestao = semelhantes[0].nome.trim();

      grupos.set(`${pos.marcaId}:${radical}`, {
        chaveStem: radical,
        sugestaoNome: sugestao,
        posicoes: semelhantes,
        totalColaboradores: totalColabs,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.posicoes.length - a.posicoes.length);
}
