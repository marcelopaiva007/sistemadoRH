// Caixa de documentos — a chamada à IA (impuro). O que se pede e como a
// resposta é limpa mora em ./extracao.ts, testado sem rede.
//
// Só servidor. A chave é a mesma do Assistente de RH (segredo global, env ou
// banco cifrado): sem ela, a Caixa aceita arquivos mas não lê — a tela avisa.
import Anthropic from "@anthropic-ai/sdk";
import { segredo, CHAVE_ANTHROPIC } from "@/lib/segredos";
import { ESQUEMA_RESPOSTA, montarInstrucoes } from "./extracao";

/**
 * Claude Opus 5 lê melhor digitalização ruim e tabela de contracheque do que os
 * modelos menores; o custo (~US$ 1-3 por folha de 200 páginas) é pequeno perto
 * do tempo do RH conferindo à mão. Trocar para "claude-sonnet-5" (o modelo do
 * Assistente) barateia ~2,5x — decisão de negócio, não técnica.
 */
export const MODELO_CAIXA = "claude-opus-5";

/**
 * Prazo de UMA chamada. A rota que processa tem maxDuration 300 s; sobram ~60 s
 * para baixar o arquivo, recortar e gravar. Sem retry dentro da chamada: quem
 * tenta de novo é a próxima rodada (com o bloco pela metade se foi tempo).
 */
const PRAZO_MS = 230_000;
const MAX_TOKENS = 24_000;

export type Leitura =
  | { ok: true; bruto: unknown; tokensEntrada: number; tokensSaida: number; modelo: string }
  | {
      ok: false;
      erro: string;
      /** Resposta não coube ou estourou o tempo: tentar de novo com menos páginas. */
      reduzirBloco: boolean;
      /** Recusa / formato: não adianta repetir igual. */
      definitivo: boolean;
      /**
       * A conta da IA recusou (chave inválida, sem permissão, sem crédito): o
       * problema não é deste arquivo. Pausa tudo sem gastar tentativas e sem
       * marcar páginas como "não lidas".
       */
      pausar?: boolean;
      tokensEntrada: number;
      tokensSaida: number;
    };

export type EntradaLeitura = {
  /**
   * Uma parte por página, cada uma com o número DA PÁGINA NO ARQUIVO. Vão
   * separadas, cada qual depois de um rótulo "=== Página N do arquivo ===":
   * a IA devolve o N que leu, em vez de contar páginas — um erro de contagem
   * mandaria o contracheque de cada pessoa para o portal do vizinho.
   */
  partes: { numero: number; bytes: Uint8Array; mimeType: "application/pdf" | "image/jpeg" }[];
  bloco: { inicio: number; fim: number; totalPaginas: number | null };
  /** O arquivo inteiro — só o extrator de teste usa (lê a "resposta" dos metadados). */
  original?: Uint8Array;
};

export type Extrator = (entrada: EntradaLeitura) => Promise<Leitura>;

export function extratorClaude(chave: string): Extrator {
  const client = new Anthropic({ apiKey: chave, maxRetries: 0, timeout: PRAZO_MS });

  return async ({ partes, bloco }) => {
    const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const parte of partes) {
      const dados = Buffer.from(parte.bytes).toString("base64");
      conteudo.push({ type: "text", text: `=== Página ${parte.numero} do arquivo ===` });
      conteudo.push(
        parte.mimeType === "application/pdf"
          ? { type: "document", title: `Página ${parte.numero}`, source: { type: "base64", media_type: "application/pdf", data: dados } }
          : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: dados } },
      );
    }
    conteudo.push({ type: "text", text: montarInstrucoes(bloco) });

    try {
      const stream = client.beta.messages.stream(
        {
          model: MODELO_CAIXA,
          max_tokens: MAX_TOKENS,
          // Recusa de um modelo cai no próximo da cadeia, dentro da mesma
          // chamada (fallback do servidor da Anthropic).
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_RESPOSTA } },
          messages: [{ role: "user", content: conteudo }],
        },
        { signal: AbortSignal.timeout(PRAZO_MS) },
      );
      const resposta = await stream.finalMessage();
      const { tokensEntrada, tokensSaida } = somarUso(resposta.usage);

      if (resposta.stop_reason === "refusal") {
        return { ok: false, erro: "A IA se recusou a ler estas páginas.", reduzirBloco: false, definitivo: true, tokensEntrada, tokensSaida };
      }
      if (resposta.stop_reason === "max_tokens") {
        return { ok: false, erro: "A resposta da IA não coube — vou ler menos páginas por vez.", reduzirBloco: true, definitivo: false, tokensEntrada, tokensSaida };
      }
      const bruto = lerJson(resposta.content);
      if (bruto === undefined) {
        return { ok: false, erro: "A leitura veio num formato inesperado.", reduzirBloco: false, definitivo: false, tokensEntrada, tokensSaida };
      }
      return { ok: true, bruto, tokensEntrada, tokensSaida, modelo: resposta.model };
    } catch (e) {
      const zero = { tokensEntrada: 0, tokensSaida: 0 };
      if (e instanceof Anthropic.APIUserAbortError || (e instanceof Error && e.name === "TimeoutError")) {
        return { ok: false, erro: "A leitura demorou demais — vou ler menos páginas por vez.", reduzirBloco: true, definitivo: false, ...zero };
      }
      const semCredito =
        e instanceof Anthropic.APIError &&
        (e.status === 402 || (e.status === 400 && /credit|billing|saldo/i.test(e.message)));
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || semCredito) {
        return {
          ok: false,
          erro: "A leitura automática parou: a conta da IA recusou o acesso (chave ou crédito). Nada foi perdido — avise o administrador.",
          reduzirBloco: false,
          definitivo: false,
          pausar: true,
          ...zero,
        };
      }
      if (e instanceof Anthropic.RateLimitError) {
        return { ok: false, erro: "Muitas leituras ao mesmo tempo — tento de novo em instantes.", reduzirBloco: false, definitivo: false, ...zero };
      }
      if (e instanceof Anthropic.BadRequestError) {
        console.error("[caixa-documentos] requisição recusada", e.message);
        return { ok: false, erro: "A IA não conseguiu abrir estas páginas.", reduzirBloco: false, definitivo: true, ...zero };
      }
      console.error("[caixa-documentos] falha na leitura", e);
      return { ok: false, erro: "Falha ao falar com a IA — tento de novo.", reduzirBloco: false, definitivo: false, ...zero };
    }
  };
}

type Uso = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Soma tudo o que foi cobrado — inclusive a tentativa recusada antes do fallback e o cache. */
function somarUso(uso: Uso & { iterations?: Uso[] | null }): { tokensEntrada: number; tokensSaida: number } {
  const partes = uso.iterations?.length ? uso.iterations : [uso];
  let tokensEntrada = 0;
  let tokensSaida = 0;
  for (const u of partes) {
    tokensEntrada += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    tokensSaida += u.output_tokens ?? 0;
  }
  return { tokensEntrada, tokensSaida };
}

/**
 * O JSON da resposta. Se um modelo recusou no meio e o seguinte continuou
 * (fallback), o texto vem em mais de um bloco: tenta tudo junto e, se não
 * fechar, só o que veio depois do último ponto de troca.
 */
function lerJson(conteudo: { type: string; text?: string }[]): unknown {
  const textos = (lista: { type: string; text?: string }[]) =>
    lista.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  try {
    return JSON.parse(textos(conteudo));
  } catch {
    const troca = conteudo.map((b) => b.type).lastIndexOf("fallback");
    if (troca < 0) return undefined;
    try {
      return JSON.parse(textos(conteudo.slice(troca + 1)));
    } catch {
      return undefined;
    }
  }
}

/**
 * Extrator de TESTE: devolve a leitura que o próprio PDF carrega no campo
 * "Assunto" (JSON), sem rede nem custo. Existe para o teste de ponta a ponta
 * local (scripts/.tmp-e2e) e para o smoke com banco — e só liga FORA de
 * produção, com a variável explícita. Em produção esta função nunca é usada.
 */
async function extratorDeTeste(): Promise<Extrator> {
  const { PDFDocument } = await import("pdf-lib");
  return async ({ original, bloco }) => {
    const zero = { tokensEntrada: 0, tokensSaida: 0, modelo: "teste" };
    if (!original) return { ok: true, bruto: { resumo: "imagem", paginas: [], documentos: [] }, ...zero };
    let assunto = "{}";
    try {
      assunto = (await PDFDocument.load(original, { updateMetadata: false })).getSubject() ?? "{}";
    } catch {
      /* imagem ou PDF sem metadados: leitura vazia */
    }
    // As páginas no JSON de teste já são páginas do arquivo, como a IA
    // devolveria lendo os rótulos.
    const todas = JSON.parse(assunto) as { paginas?: { pagina: number }[]; documentos?: { paginaInicio: number }[] };
    const dentro = (p: number) => p >= bloco.inicio && p <= bloco.fim;
    return {
      ok: true,
      bruto: {
        resumo: "leitura de teste",
        paginas: (todas.paginas ?? []).filter((p) => dentro(p.pagina)),
        documentos: (todas.documentos ?? []).filter((d) => dentro(Number(d.paginaInicio))),
      },
      ...zero,
    };
  };
}

function testeLigado(): boolean {
  return (
    process.env.CAIXA_DOCUMENTOS_EXTRATOR_TESTE === "1" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production"
  );
}

/** O extrator a usar agora, ou null quando a IA está desligada (sem chave). */
export async function obterExtrator(): Promise<Extrator | null> {
  if (testeLigado()) return extratorDeTeste();
  const chave = await segredo(CHAVE_ANTHROPIC);
  return chave ? extratorClaude(chave) : null;
}

export async function iaLigada(): Promise<boolean> {
  return testeLigado() || !!(await segredo(CHAVE_ANTHROPIC));
}
