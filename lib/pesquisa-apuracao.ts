// Apuração pergunta a pergunta — o que a tela de Resultados não mostrava.
//
// POR QUE EXISTE. Até 15/08/2026 a tela de Resultados só calculava MÉDIA por
// dimensão GPTW e por setor. Isso serve para pesquisa de clima, onde toda
// pergunta é uma nota de 1 a 5 e a leitura é o agregado. Não serve para mais
// nada:
//
//   • MÚLTIPLA ESCOLHA não aparecia. E média de múltipla escolha nem existe —
//     "Nunca usei / 1 vez / 2 a 3 vezes" não tem média, tem DISTRIBUIÇÃO.
//   • TEXTO LIVRE não aparecia. A pergunta que mais explica o número — "por
//     que você não usou?" — ficava gravada e invisível.
//
// Na prática, uma pesquisa de uso de benefício era possível de criar, de
// enviar e de responder, e impossível de ler. Este módulo é a leitura.
//
// Puro e sem I/O: recebe perguntas e respostas já carregadas, devolve o que a
// tela desenha. Testável sem banco (scripts/test-pesquisa-apuracao.ts).

export type PerguntaParaApurar = {
  id: string;
  ordem: number;
  enunciado: string;
  tipo: string;
  opcoes: { id: string; texto: string; ordem: number }[];
};

export type ItemRespondido = {
  perguntaId: string;
  valorNumerico: number | null;
  valorTexto: string | null;
  opcaoId: string | null;
};

export type FatiaDaDistribuicao = {
  rotulo: string;
  quantidade: number;
  /** 0 a 100, arredondado — sobre quem respondeu ESTA pergunta. */
  percentual: number;
};

export type ApuracaoPergunta = {
  perguntaId: string;
  ordem: number;
  enunciado: string;
  tipo: string;
  /** Quem respondeu esta pergunta. Nem todos respondem todas (opcionais). */
  respondentes: number;
  /** Vazia em texto livre. Em numérica, uma fatia por nota dada. */
  distribuicao: FatiaDaDistribuicao[];
  /** Só em pergunta numérica. */
  media: number | null;
  /** Só em texto livre, na ordem em que chegaram. */
  textos: string[];
};

const TIPOS_NUMERICOS = new Set(["LIKERT_5", "FREQ_0_4", "NPS_10"]);

/** O percentual é sobre QUEM RESPONDEU a pergunta, não sobre o total de respostas. */
function comPercentual(
  contagem: Map<string, number>,
  respondentes: number,
  ordenar?: (a: string, b: string) => number,
): FatiaDaDistribuicao[] {
  const chaves = [...contagem.keys()];
  if (ordenar) chaves.sort(ordenar);
  return chaves.map((rotulo) => {
    const quantidade = contagem.get(rotulo)!;
    return {
      rotulo,
      quantidade,
      percentual: respondentes === 0 ? 0 : Math.round((quantidade / respondentes) * 100),
    };
  });
}

export function apurarPorPergunta(
  perguntas: PerguntaParaApurar[],
  itens: ItemRespondido[],
): ApuracaoPergunta[] {
  const porPergunta = new Map<string, ItemRespondido[]>();
  for (const item of itens) {
    (porPergunta.get(item.perguntaId) ?? porPergunta.set(item.perguntaId, []).get(item.perguntaId)!).push(item);
  }

  return [...perguntas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((p) => {
      const respondidos = porPergunta.get(p.id) ?? [];

      if (p.tipo === "TEXT") {
        // Texto em branco não é resposta: conta como quem pulou, senão o
        // "12 responderam" incluiria doze linhas vazias.
        const textos = respondidos
          .map((i) => (i.valorTexto ?? "").trim())
          .filter((t) => t.length > 0);
        return {
          perguntaId: p.id, ordem: p.ordem, enunciado: p.enunciado, tipo: p.tipo,
          respondentes: textos.length, distribuicao: [], media: null, textos,
        };
      }

      if (p.tipo === "MULTIPLE_CHOICE") {
        const rotuloDaOpcao = new Map(p.opcoes.map((o) => [o.id, o.texto]));
        const ordemDaOpcao = new Map(p.opcoes.map((o) => [o.texto, o.ordem]));
        const contagem = new Map<string, number>();
        let respondentes = 0;
        for (const item of respondidos) {
          if (!item.opcaoId) continue;
          // Opção apagada depois de já respondida: a resposta continua valendo
          // e não pode sumir da conta — vira uma fatia nomeada em vez de um
          // buraco silencioso no total.
          const rotulo = rotuloDaOpcao.get(item.opcaoId) ?? "(opção removida)";
          contagem.set(rotulo, (contagem.get(rotulo) ?? 0) + 1);
          respondentes++;
        }
        // Na ordem em que as opções aparecem no formulário — "Nunca / 1 vez /
        // 2 a 3 vezes" só se lê como escala se ficar nessa ordem. Ordenar por
        // quantidade embaralharia a escala.
        const distribuicao = comPercentual(contagem, respondentes, (a, b) =>
          (ordemDaOpcao.get(a) ?? 999) - (ordemDaOpcao.get(b) ?? 999),
        );
        return {
          perguntaId: p.id, ordem: p.ordem, enunciado: p.enunciado, tipo: p.tipo,
          respondentes, distribuicao, media: null, textos: [],
        };
      }

      if (TIPOS_NUMERICOS.has(p.tipo)) {
        const notas = respondidos
          .map((i) => i.valorNumerico)
          .filter((v): v is number => v !== null && v !== undefined);
        const contagem = new Map<string, number>();
        for (const n of notas) contagem.set(String(n), (contagem.get(String(n)) ?? 0) + 1);
        // A DISTRIBUIÇÃO vem junto da média de propósito: média 3 pode ser
        // "todo mundo achou mediano" ou "metade adorou e metade odiou", e as
        // duas pedem decisões opostas.
        const distribuicao = comPercentual(contagem, notas.length, (a, b) => Number(a) - Number(b));
        return {
          perguntaId: p.id, ordem: p.ordem, enunciado: p.enunciado, tipo: p.tipo,
          respondentes: notas.length,
          distribuicao,
          media: notas.length === 0 ? null : notas.reduce((s, n) => s + n, 0) / notas.length,
          textos: [],
        };
      }

      return {
        perguntaId: p.id, ordem: p.ordem, enunciado: p.enunciado, tipo: p.tipo,
        respondentes: respondidos.length, distribuicao: [], media: null, textos: [],
      };
    });
}
