// Motor de cálculo da matriz de risco NR-01 (riscos psicossociais / PGR).
//
// Modelo, em cada grupo (empresa inteira, setor ou cargo) e dimensão:
//   - escore individual = média dos itens da dimensão em pontos de RISCO 0-4
//     (pergunta invertida/fator de proteção: risco = 4 - resposta);
//   - EXPOSTO = respondente com escore individual >= 2.0 na dimensão;
//   - PROBABILIDADE (1-5) = função da % de expostos do grupo
//     (<10%=1, <25%=2, <50%=3, <75%=4, >=75%=5);
//   - SEVERIDADE (1-5) = função da intensidade média entre os expostos
//     (sem expostos=1; <2.5=2, <3.0=3, <3.5=4, >=3.5=5);
//   - NÍVEL DE RISCO (NR) = P x S (matriz 5x5):
//     1-4 BAIXO (verde), 5-9 MÉDIO (amarelo), 10-16 ALTO (laranja),
//     17-25 CRÍTICO (vermelho).
// Anonimato: grupos com menos de AMOSTRA_MINIMA_ANONIMATO respostas não expõem
// números (flag amostraInsuficiente) — mesma regra do restante do módulo de RH.
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";
import { DIMENSOES_NR01, type DimensaoNR01 } from "@/lib/nr01-modelo";

export type NivelRisco = "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";

export const NIVEIS_RISCO: Record<
  NivelRisco,
  { label: string; cor: string; corBg: string }
> = {
  BAIXO: { label: "Baixo", cor: "#16a34a", corBg: "#dcfce7" },
  MEDIO: { label: "Médio", cor: "#ca8a04", corBg: "#fef9c3" },
  ALTO: { label: "Alto", cor: "#ea580c", corBg: "#ffedd5" },
  CRITICO: { label: "Crítico", cor: "#dc2626", corBg: "#fee2e2" },
};

export type PerguntaCalc = {
  id: string;
  codigo: string | null;
  enunciado: string;
  dimensao: string | null;
  invertida: boolean;
};

export type RespostaCalc = {
  setorNomeSnapshot: string;
  posicaoNomeSnapshot: string;
  itens: { perguntaId: string; valorNumerico: number | null }[];
};

export type ResultadoDimensao = {
  dimensao: DimensaoNR01;
  label: string;
  mediaRisco: number; // 0-4
  escore100: number; // 0-100 (quanto maior, pior)
  pctExpostos: number; // 0-100
  probabilidade: number; // 1-5
  severidade: number; // 1-5
  nr: number; // 1-25
  nivel: NivelRisco;
  // Pergunta com maior risco médio da dimensão — direciona o plano de ação.
  perguntaCritica: { codigo: string; enunciado: string; mediaRisco: number } | null;
};

export type ResultadoGrupo = {
  grupo: string; // "GERAL" | nome do setor | nome do cargo
  respostas: number;
  amostraInsuficiente: boolean;
  dimensoes: ResultadoDimensao[];
  indiceGeral100: number; // média dos escores das dimensões (0-100)
  nivelGeral: NivelRisco; // pior nível entre as dimensões (conservador, PGR)
};

export type ResultadoNR01 = {
  totalRespostas: number;
  geral: ResultadoGrupo;
  porSetor: ResultadoGrupo[];
  porCargo: ResultadoGrupo[];
};

export function classificarNR(nr: number): NivelRisco {
  if (nr >= 17) return "CRITICO";
  if (nr >= 10) return "ALTO";
  if (nr >= 5) return "MEDIO";
  return "BAIXO";
}

export function probabilidadePorExposicao(pctExpostos: number): number {
  if (pctExpostos >= 75) return 5;
  if (pctExpostos >= 50) return 4;
  if (pctExpostos >= 25) return 3;
  if (pctExpostos >= 10) return 2;
  return 1;
}

export function severidadePorIntensidade(mediaEntreExpostos: number | null): number {
  if (mediaEntreExpostos === null) return 1; // ninguém exposto
  if (mediaEntreExpostos >= 3.5) return 5;
  if (mediaEntreExpostos >= 3.0) return 4;
  if (mediaEntreExpostos >= 2.5) return 3;
  return 2;
}

const LIMIAR_EXPOSICAO = 2.0;

const ORDEM_NIVEL: NivelRisco[] = ["BAIXO", "MEDIO", "ALTO", "CRITICO"];
export function piorNivel(niveis: NivelRisco[]): NivelRisco {
  return niveis.reduce<NivelRisco>(
    (pior, n) => (ORDEM_NIVEL.indexOf(n) > ORDEM_NIVEL.indexOf(pior) ? n : pior),
    "BAIXO",
  );
}

// Risco 0-4 de um item respondido, aplicando a inversão de fator de proteção.
export function riscoDoItem(valor: number, invertida: boolean): number {
  const v = Math.max(0, Math.min(4, valor));
  return invertida ? 4 - v : v;
}

function calcularGrupo(
  grupo: string,
  respostas: RespostaCalc[],
  perguntasPorId: Map<string, PerguntaCalc>,
): ResultadoGrupo {
  const dimensoes = Object.keys(DIMENSOES_NR01) as DimensaoNR01[];

  // escores individuais por dimensão (média dos itens de cada respondente)
  const escoresPorDimensao = new Map<DimensaoNR01, number[]>(
    dimensoes.map((d) => [d, []]),
  );
  // soma/contagem de risco por pergunta (para achar a pergunta crítica)
  const riscoPorPergunta = new Map<string, { soma: number; n: number }>();

  for (const resposta of respostas) {
    const somaPorDim = new Map<DimensaoNR01, { soma: number; n: number }>();
    for (const item of resposta.itens) {
      if (item.valorNumerico === null) continue;
      const pergunta = perguntasPorId.get(item.perguntaId);
      if (!pergunta?.dimensao || !(pergunta.dimensao in DIMENSOES_NR01)) continue;
      const dim = pergunta.dimensao as DimensaoNR01;
      const risco = riscoDoItem(item.valorNumerico, pergunta.invertida);
      const acc = somaPorDim.get(dim) ?? { soma: 0, n: 0 };
      acc.soma += risco;
      acc.n++;
      somaPorDim.set(dim, acc);
      const accP = riscoPorPergunta.get(item.perguntaId) ?? { soma: 0, n: 0 };
      accP.soma += risco;
      accP.n++;
      riscoPorPergunta.set(item.perguntaId, accP);
    }
    for (const [dim, acc] of somaPorDim) {
      if (acc.n > 0) escoresPorDimensao.get(dim)!.push(acc.soma / acc.n);
    }
  }

  const resultadoDimensoes: ResultadoDimensao[] = dimensoes.map((dim) => {
    const escores = escoresPorDimensao.get(dim)!;
    const n = escores.length;
    const mediaRisco = n ? escores.reduce((a, b) => a + b, 0) / n : 0;
    const expostos = escores.filter((e) => e >= LIMIAR_EXPOSICAO);
    const pctExpostos = n ? (expostos.length / n) * 100 : 0;
    const mediaEntreExpostos = expostos.length
      ? expostos.reduce((a, b) => a + b, 0) / expostos.length
      : null;
    const probabilidade = probabilidadePorExposicao(pctExpostos);
    const severidade = severidadePorIntensidade(mediaEntreExpostos);
    const nr = probabilidade * severidade;

    let perguntaCritica: ResultadoDimensao["perguntaCritica"] = null;
    for (const [perguntaId, acc] of riscoPorPergunta) {
      const pergunta = perguntasPorId.get(perguntaId);
      if (pergunta?.dimensao !== dim || acc.n === 0) continue;
      const media = acc.soma / acc.n;
      if (!perguntaCritica || media > perguntaCritica.mediaRisco) {
        perguntaCritica = {
          codigo: pergunta.codigo ?? "?",
          enunciado: pergunta.enunciado,
          mediaRisco: media,
        };
      }
    }

    return {
      dimensao: dim,
      label: DIMENSOES_NR01[dim].label,
      mediaRisco,
      escore100: (mediaRisco / 4) * 100,
      pctExpostos,
      probabilidade,
      severidade,
      nr,
      nivel: classificarNR(nr),
      perguntaCritica,
    };
  });

  const indiceGeral100 =
    resultadoDimensoes.reduce((a, d) => a + d.escore100, 0) /
    (resultadoDimensoes.length || 1);

  return {
    grupo,
    respostas: respostas.length,
    amostraInsuficiente: respostas.length < AMOSTRA_MINIMA_ANONIMATO,
    dimensoes: resultadoDimensoes,
    indiceGeral100,
    nivelGeral: piorNivel(resultadoDimensoes.map((d) => d.nivel)),
  };
}

export function calcularNR01(
  perguntas: PerguntaCalc[],
  respostas: RespostaCalc[],
): ResultadoNR01 {
  const perguntasPorId = new Map(perguntas.map((p) => [p.id, p]));

  const porChave = (chave: (r: RespostaCalc) => string): ResultadoGrupo[] => {
    const grupos = new Map<string, RespostaCalc[]>();
    for (const r of respostas) {
      const k = chave(r) || "Desconhecido";
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(r);
    }
    return [...grupos.entries()]
      .map(([nome, rs]) => calcularGrupo(nome, rs, perguntasPorId))
      .sort((a, b) => b.indiceGeral100 - a.indiceGeral100);
  };

  return {
    totalRespostas: respostas.length,
    geral: calcularGrupo("GERAL", respostas, perguntasPorId),
    porSetor: porChave((r) => r.setorNomeSnapshot),
    porCargo: porChave((r) => r.posicaoNomeSnapshot),
  };
}
