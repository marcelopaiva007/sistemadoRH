// Validação, no servidor, dos itens que chegam do formulário público de
// pesquisa (/responder/[token]) — 26/11/2026.
//
// Até 25/11/2026 o envio só conferia o formato (zod) e se as obrigatórias
// estavam presentes: um `perguntaId` de OUTRA pesquisa, uma `opcaoId` de outra
// pergunta, um 37 numa escala de 1 a 5 ou a mesma pergunta duas vezes eram
// gravados como vieram e entravam direto nas médias (auditoria de
// 25/11/2026). A rota é pública e o payload é JSON montado no navegador — não
// dá para confiar em nada dele além do token.
//
// Arquivo sem "use server" e sem banco, de propósito: a regra é pura e roda em
// scripts/test-clima-anonimato.ts.

export type PerguntaDoEnvio = {
  id: string;
  tipo: string;
  obrigatoria: boolean;
  opcoes: { id: string }[];
};

export type ItemEnviado = {
  perguntaId: string;
  valorNumerico?: number;
  valorTexto?: string;
  opcaoId?: string;
};

export type ItemValidado = {
  perguntaId: string;
  valorNumerico: number | null;
  valorTexto: string | null;
  opcaoId: string | null;
};

/** Faixa aceita por tipo de pergunta numérica (inclusive nas duas pontas). */
export const FAIXA_POR_TIPO: Record<string, { min: number; max: number }> = {
  LIKERT_5: { min: 1, max: 5 },
  FREQ_0_4: { min: 0, max: 4 },
  NPS_10: { min: 0, max: 10 },
};

/** Teto de um comentário aberto — folga larga para texto real. */
export const TAMANHO_MAXIMO_TEXTO = 5000;

export type ResultadoValidacaoEnvio =
  | { ok: true; itens: ItemValidado[] }
  | { ok: false; error: string };

export function validarItensEnvio(
  perguntas: PerguntaDoEnvio[],
  itens: ItemEnviado[],
): ResultadoValidacaoEnvio {
  const perguntaPorId = new Map(perguntas.map((p) => [p.id, p]));
  const vistas = new Set<string>();
  const validados: ItemValidado[] = [];

  for (const item of itens) {
    const pergunta = perguntaPorId.get(item.perguntaId);
    if (!pergunta) return { ok: false, error: "Respostas inválidas: há uma pergunta que não é desta pesquisa." };
    if (vistas.has(pergunta.id)) return { ok: false, error: "Respostas inválidas: a mesma pergunta veio repetida." };
    vistas.add(pergunta.id);

    const faixa = FAIXA_POR_TIPO[pergunta.tipo];
    if (faixa) {
      const v = item.valorNumerico;
      if (v === undefined || !Number.isInteger(v) || v < faixa.min || v > faixa.max) {
        return { ok: false, error: `Respostas inválidas: nota fora da escala (${faixa.min} a ${faixa.max}).` };
      }
      // Só a nota é gravada — texto ou opção que viessem junto são descartados.
      validados.push({ perguntaId: pergunta.id, valorNumerico: v, valorTexto: null, opcaoId: null });
      continue;
    }

    if (pergunta.tipo === "MULTIPLE_CHOICE") {
      if (!item.opcaoId || !pergunta.opcoes.some((o) => o.id === item.opcaoId)) {
        return { ok: false, error: "Respostas inválidas: opção que não pertence à pergunta." };
      }
      validados.push({ perguntaId: pergunta.id, valorNumerico: null, valorTexto: null, opcaoId: item.opcaoId });
      continue;
    }

    if (pergunta.tipo === "TEXT") {
      const texto = (item.valorTexto ?? "").trim();
      // Texto em branco não é resposta: não grava (e não conta como
      // respondida para a checagem de obrigatória logo abaixo).
      if (texto.length === 0) continue;
      if (texto.length > TAMANHO_MAXIMO_TEXTO) {
        return { ok: false, error: `Resposta aberta longa demais (máximo ${TAMANHO_MAXIMO_TEXTO} caracteres).` };
      }
      validados.push({ perguntaId: pergunta.id, valorNumerico: null, valorTexto: texto, opcaoId: null });
      continue;
    }

    // Tipo que este validador não conhece: recusa em vez de gravar às cegas.
    return { ok: false, error: "Respostas inválidas: tipo de pergunta não reconhecido." };
  }

  const respondidas = new Set(validados.map((i) => i.perguntaId));
  if (perguntas.some((p) => p.obrigatoria && !respondidas.has(p.id))) {
    return { ok: false, error: "Responda todas as perguntas obrigatórias." };
  }

  return { ok: true, itens: validados };
}
