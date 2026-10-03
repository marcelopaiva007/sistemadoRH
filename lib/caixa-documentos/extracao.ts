// Caixa de documentos — o contrato com a IA: o que se pede, em que formato ela
// responde, e como a resposta é limpa antes de valer alguma coisa.
//
// Puro (sem banco, sem chamada de rede) para ser testado por
// scripts/test-caixa-documentos.ts. A chamada em si mora em ./ia.ts.
//
// Regra de casa (mesma de lib/delegacoes/classificador.ts): a IA LÊ, nunca
// inventa. Tudo que ela devolve chega aqui como `unknown` e só sobrevive o que
// passa na validação — enum fora da lista vira OUTRO, data que não existe vira
// nula, CPF com dígito verificador errado some. Na dúvida, o item vai para a
// fila de conferência; nunca para a ficha de alguém.
import { cpfValido, apenasDigitosCpf } from "@/lib/cpf";
import { pisValido } from "@/lib/pis";
import { apenasDigitosCnpj, cnpjValido } from "@/lib/cnpj";
import { normalizarTexto } from "@/lib/text";
import { NORMAS_REGULAMENTADORAS, RESULTADOS_EXAME, TIPOS_EXAME } from "@/lib/constants-sst";
import { VALORES_TIPO_CAIXA, type TipoCaixa } from "./tipos";

const TIPOS_ASO = TIPOS_EXAME.map((t) => t.value) as string[];
const RESULTADOS_ASO = RESULTADOS_EXAME.map((r) => r.value) as string[];
const NORMAS = NORMAS_REGULAMENTADORAS.map((n) => n.value) as string[];

/** Que folha é o contracheque — parte da chave de "mesmo documento". */
export const TIPOS_FOLHA = ["MENSAL", "ADIANTAMENTO", "DECIMO_TERCEIRO", "FERIAS", "COMPLEMENTAR", "PLR"] as const;

// ---------------------------------------------------------------------------
// O formato da resposta (structured outputs — JSON schema estrito)
// ---------------------------------------------------------------------------

// A API aceita no máximo 16 campos com tipo "ou nulo" por esquema — este teria
// 19. Então nada aqui é anulável: campo não lido volta como "" (texto), 0
// (número) ou "NAO_LIDO" (lista), e a limpeza abaixo transforma cada um desses
// em null. O efeito é o mesmo; o esquema é que fica aceitável.
const TXT = (d: string) => ({ type: "string", description: `${d} "" se não estiver impresso ou legível.`.trim() });
const INT = (d: string) => ({ type: "integer", description: `${d} 0 se não estiver impresso.`.trim() });
const LISTA = (valores: readonly string[], d: string) => ({ type: "string", enum: ["NAO_LIDO", ...valores], description: d });

const CAMPOS = {
  dataDocumento: TXT("Data de emissão/realização, AAAA-MM-DD."),
  competencia: TXT("Mês de referência do contracheque/recibo, AAAA-MM."),
  tipoFolha: LISTA(TIPOS_FOLHA, "Só para contracheque: mensal, adiantamento, 13º (DECIMO_TERCEIRO), férias, complementar ou PLR."),
  anoCalendario: INT("Ano-calendário do informe de rendimentos."),
  validoAte: TXT("Validade impressa no documento, AAAA-MM-DD."),
  asoTipo: LISTA(TIPOS_ASO, "Só para ASO: o tipo do exame assinalado; NAO_LIDO nos demais."),
  asoResultado: LISTA(RESULTADOS_ASO, "Só para ASO: o resultado assinalado; NAO_LIDO nos demais."),
  restricoes: TXT("Só para ASO apto com restrição: a restrição escrita."),
  medico: TXT("Nome do médico."),
  crm: TXT("CRM do médico."),
  clinica: TXT("Clínica."),
  dataInicio: TXT("Só para atestado: primeiro dia de afastamento, AAAA-MM-DD."),
  dataFim: TXT("Só para atestado: último dia de afastamento, AAAA-MM-DD."),
  dias: INT("Só para atestado: dias de afastamento."),
  norma: TXT("Só para certificado de NR: a norma, ex. NR-35, NR-10, NR-10 SEP."),
  cargaHoraria: INT("Só para certificado: carga horária em horas."),
  descricao: TXT("Uma linha que ajude o RH a reconhecer o documento, sem dados de saúde nem valores."),
} as const;

export const ESQUEMA_RESPOSTA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "paginas", "documentos"],
  properties: {
    resumo: {
      type: "string",
      description:
        "Uma frase sobre o que estas páginas contêm: tipos e quantidades, SEM nomes, CPF ou valores (ex.: \"Contracheques de agosto/2026 de 8 pessoas e um ASO\").",
    },
    paginas: {
      type: "array",
      description: "Uma entrada por página recebida.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pagina", "pessoas", "identificadores"],
        properties: {
          pagina: { type: "integer", description: "O número N do rótulo '=== Página N do arquivo ==='." },
          pessoas: { type: "integer", description: "Quantas pessoas DIFERENTES têm dados pessoais nesta página." },
          identificadores: {
            type: "array",
            items: { type: "string" },
            description: "Os CPFs e os PIS/PASEP/NIT de titulares impressos nesta página.",
          },
        },
      },
    },
    documentos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "tipo",
          "paginaInicio",
          "paginaFim",
          "continuaAntes",
          "continuaDepois",
          "nome",
          "cpf",
          "pis",
          "cnpjEmpregador",
          "confianca",
          "campos",
        ],
        properties: {
          tipo: { type: "string", enum: [...VALORES_TIPO_CAIXA] },
          paginaInicio: { type: "integer", description: "O número N do rótulo da primeira página do documento." },
          paginaFim: { type: "integer", description: "O número N do rótulo da última página do documento." },
          continuaAntes: { type: "boolean", description: "O documento começou antes da primeira página recebida." },
          continuaDepois: { type: "boolean", description: "O documento continua depois da última página recebida." },
          nome: TXT("Nome completo do TITULAR, exatamente como impresso."),
          cpf: TXT("CPF do TITULAR, dígito a dígito, só se impresso."),
          pis: TXT("PIS/PASEP/NIT do TITULAR, dígito a dígito, só se impresso."),
          cnpjEmpregador: TXT("CNPJ do EMPREGADOR, só se impresso."),
          confianca: { type: "number", description: "De 0 a 1: certeza de que tipo, pessoa e campos estão certos." },
          campos: {
            type: "object",
            additionalProperties: false,
            required: Object.keys(CAMPOS),
            properties: CAMPOS,
          },
        },
      },
    },
  },
} as const;

export function montarInstrucoes(bloco: { inicio: number; fim: number; totalPaginas: number | null }): string {
  const trecho =
    bloco.totalPaginas && bloco.totalPaginas > 1
      ? `Você recebe as páginas ${bloco.inicio} a ${bloco.fim} de um arquivo de ${bloco.totalPaginas} páginas. Cada página vem depois de um rótulo "=== Página N do arquivo ===".`
      : "Você recebe o arquivo inteiro. Cada página vem depois de um rótulo \"=== Página N do arquivo ===\" (uma imagem é a página 1).";
  return [
    "Você lê documentos de RH de uma empresa brasileira, em geral enviados pelo escritório de contabilidade.",
    trecho,
    "Liste cada documento de cada pessoa: uma entrada por pessoa e por documento. Um contracheque em duas vias da mesma pessoa é UMA entrada. Se uma página tiver documentos de duas pessoas, crie duas entradas com a mesma página.",
    "Regras:",
    "- Páginas: use SEMPRE o N do rótulo '=== Página N do arquivo ==='. Nunca o número impresso no rodapé do documento.",
    "- LEIA, não deduza. O que não estiver impresso de forma legível fica \"\" (texto), 0 (número) ou NAO_LIDO (lista). Nunca invente CPF, CNPJ, nome ou data.",
    "- nome e cpf: do TITULAR do documento (o empregado, o paciente, o aluno) — nunca de dependente, pensionista, médico, testemunha ou responsável. Os dois vêm do mesmo quadro de identificação.",
    "- cpf e pis: copie dígito a dígito; se algum dígito estiver ilegível, deixe \"\" — não complete.",
    "- cnpjEmpregador: o CNPJ da empresa EMPREGADORA — não o da clínica, do sindicato ou da contabilidade.",
    "- Datas impressas no Brasil são DD/MM/AAAA: devolva como AAAA-MM-DD. Competência como AAAA-MM.",
    "- ASO: asoTipo (admissional, periódico, retorno ao trabalho, mudança de função, demissional) e asoResultado conforme o que estiver assinalado.",
    "- Contracheque: competencia e tipoFolha (mensal, adiantamento, 13º, férias, complementar, PLR).",
    "- Atestado: dataInicio, dataFim e/ou dias de afastamento.",
    "- NÃO extraia valores em dinheiro (salário, descontos, líquido) nem diagnóstico ou CID: esses dados não são usados.",
    "- Página que não é documento de ninguém (capa, resumo geral, guia de imposto) → NAO_E_DE_COLABORADOR.",
    "- Documento de uma pessoa que não se encaixa nos tipos (ficha de EPI, CAT, advertência) → OUTRO_DO_COLABORADOR, com descricao.",
    "- Em paginas, para CADA página: quantas pessoas diferentes aparecem com dados pessoais (0 para capa ou resumo) e os CPFs e PIS de titulares impressos nela.",
    "- confianca baixa quando a digitalização estiver ruim, o tipo for incerto ou a pessoa não estiver clara.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// O que sobra depois da limpeza
// ---------------------------------------------------------------------------

export type CamposLidos = {
  dataDocumento: string | null;
  competencia: string | null;
  tipoFolha: string | null;
  anoCalendario: number | null;
  validoAte: string | null;
  asoTipo: string | null;
  asoResultado: string | null;
  restricoes: string | null;
  medico: string | null;
  crm: string | null;
  clinica: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  dias: number | null;
  norma: string | null;
  cargaHoraria: number | null;
  descricao: string | null;
};

export type ItemLido = {
  tipo: TipoCaixa;
  paginaInicio: number;
  paginaFim: number;
  continuaAntes: boolean;
  continuaDepois: boolean;
  nome: string | null;
  cpf: string | null;
  pis: string | null;
  cnpj: string | null;
  confianca: number;
  campos: CamposLidos;
  /** O que a limpeza teve de descartar ou supor — vai para o motivo da conferência. */
  avisos: string[];
};

type Bruto = Record<string, unknown>;

const obj = (v: unknown): Bruto => (v && typeof v === "object" && !Array.isArray(v) ? (v as Bruto) : {});

function textoLimpo(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function inteiroLimpo(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= min && n <= max ? n : null;
}

/** "2026-02-30" não existe: a data tem de sobreviver à ida e volta. */
export function dataValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 1950 || ano > 2100) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return t;
}

export function competenciaValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) return null;
  const [ano, mes] = [Number(m[1]), Number(m[2])];
  if (ano < 1990 || ano > 2100 || mes < 1 || mes > 12) return null;
  return t;
}

/** "NR 35", "nr-35", "NR-10 SEP" → valor da lista; o resto → null. */
export function normaValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = normalizarTexto(v).toUpperCase().replace(/\s+/g, " ");
  if (/DIRE[CÇ][AÃ]O DEFENSIVA/.test(t)) return "DIRECAO-DEFENSIVA";
  const m = /NR[\s-]*0?(\d{1,2})(\s*[-/]?\s*SEP)?/.exec(t);
  if (!m) return null;
  const numero = String(Number(m[1])).padStart(2, "0");
  const valor = m[2] ? `NR-${numero}-SEP` : `NR-${numero}`;
  return NORMAS.includes(valor) ? valor : null;
}

function enumOuNulo(v: unknown, lista: readonly string[]): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return lista.includes(t) ? t : null;
}

export function normalizarCampos(v: unknown): CamposLidos {
  const c = obj(v);
  return {
    dataDocumento: dataValida(c.dataDocumento),
    competencia: competenciaValida(c.competencia),
    tipoFolha: enumOuNulo(c.tipoFolha, TIPOS_FOLHA),
    anoCalendario: inteiroLimpo(c.anoCalendario, 1990, 2100),
    validoAte: dataValida(c.validoAte),
    asoTipo: enumOuNulo(c.asoTipo, TIPOS_ASO),
    asoResultado: enumOuNulo(c.asoResultado, RESULTADOS_ASO),
    restricoes: textoLimpo(c.restricoes, 500),
    medico: textoLimpo(c.medico, 120),
    crm: textoLimpo(c.crm, 40),
    clinica: textoLimpo(c.clinica, 120),
    dataInicio: dataValida(c.dataInicio),
    dataFim: dataValida(c.dataFim),
    dias: inteiroLimpo(c.dias, 1, 365),
    norma: normaValida(c.norma),
    cargaHoraria: inteiroLimpo(c.cargaHoraria, 1, 2000),
    descricao: textoLimpo(c.descricao, 160),
  };
}

/** Por página do arquivo: quantas pessoas aparecem e os CPFs/PIS de titulares impressos. */
export type InventarioPaginas = Record<string, { pessoas: number; ids: string[] }>;

/**
 * Limpa a resposta de UM bloco de páginas. As páginas já vêm como páginas DO
 * ARQUIVO: cada uma foi enviada com o rótulo "=== Página N do arquivo ===", e a
 * IA devolve o N — não conta páginas. Número fora do bloco não é "ajeitado":
 * o item fica sem páginas confiáveis e vai para a conferência.
 */
export function normalizarBloco(
  bruto: unknown,
  bloco: { inicio: number; fim: number },
): { resumo: string | null; itens: ItemLido[]; inventario: InventarioPaginas } {
  const raiz = obj(bruto);

  // Inventário por página. Página que a IA não descreveu fica de fora — e
  // fatia com página sem inventário não vai sozinha para o portal
  // (decidir.ts trata ausência como "não sei").
  const inventario: InventarioPaginas = {};
  for (const cru of Array.isArray(raiz.paginas) ? raiz.paginas.slice(0, 1000) : []) {
    const p = obj(cru);
    const pagina = inteiroLimpo(p.pagina, bloco.inicio, bloco.fim);
    const pessoas = inteiroLimpo(p.pessoas, 0, 500);
    if (pagina === null || pessoas === null) continue;
    const ids = (Array.isArray(p.identificadores) ? p.identificadores : [])
      .map((c) => (typeof c === "string" ? c.replace(/\D/g, "") : ""))
      .filter((c) => c.length === 11 && (cpfValido(c) || pisValido(c)));
    inventario[String(pagina)] = { pessoas, ids: [...new Set(ids)] };
  }

  const lista = Array.isArray(raiz.documentos) ? raiz.documentos : [];
  const itens: ItemLido[] = [];

  for (const cru of lista.slice(0, 500)) {
    const d = obj(cru);
    const avisos: string[] = [];

    const tipoLido = String(d.tipo ?? "").trim().toUpperCase();
    const tipo = (VALORES_TIPO_CAIXA as string[]).includes(tipoLido) ? (tipoLido as TipoCaixa) : "OUTRO_DO_COLABORADOR";
    if (tipo !== tipoLido) avisos.push("Tipo não reconhecido.");

    let ini = inteiroLimpo(d.paginaInicio, bloco.inicio, bloco.fim);
    let fim = inteiroLimpo(d.paginaFim, bloco.inicio, bloco.fim);
    if (ini === null || fim === null || fim < ini) {
      avisos.push("A IA não indicou com clareza em que páginas está este documento — escolha as páginas ao gravar.");
      ini = bloco.inicio;
      fim = bloco.fim;
    }

    const cpfDigitos = typeof d.cpf === "string" ? apenasDigitosCpf(d.cpf) : "";
    const cpf = cpfDigitos && cpfValido(cpfDigitos) ? cpfDigitos : null;
    if (cpfDigitos && !cpf) avisos.push("CPF lido não é válido.");

    const pisDigitos = typeof d.pis === "string" ? d.pis.replace(/\D/g, "") : "";
    const pis = pisDigitos && pisValido(pisDigitos) ? pisDigitos : null;
    if (pisDigitos && !pis) avisos.push("PIS lido não é válido.");

    const cnpjDigitos = typeof d.cnpjEmpregador === "string" ? apenasDigitosCnpj(d.cnpjEmpregador) : "";
    const cnpj = cnpjDigitos && cnpjValido(cnpjDigitos) ? cnpjDigitos : null;

    const confianca =
      typeof d.confianca === "number" && Number.isFinite(d.confianca) ? Math.min(1, Math.max(0, d.confianca)) : 0;

    itens.push({
      tipo,
      paginaInicio: ini,
      paginaFim: fim,
      continuaAntes: d.continuaAntes === true,
      continuaDepois: d.continuaDepois === true,
      nome: textoLimpo(d.nome, 160),
      cpf,
      pis,
      cnpj,
      confianca,
      campos: normalizarCampos(d.campos),
      avisos,
    });
  }

  return { resumo: textoLimpo(raiz.resumo, 300), itens, inventario };
}

function mesmaPessoa(a: ItemLido, b: ItemLido): boolean {
  if (a.cpf && b.cpf) return a.cpf === b.cpf;
  if (a.pis && b.pis) return a.pis === b.pis;
  if (a.nome && b.nome) return normalizarTexto(a.nome) === normalizarTexto(b.nome);
  // A continuação de um documento longo muitas vezes não repete o cabeçalho
  // (nome, CPF): sem identidade nenhuma, vale o tipo e a sequência de páginas.
  return !b.cpf && !b.pis && !b.nome;
}

/**
 * Junta o documento que atravessou a fronteira entre dois blocos (terminou um
 * bloco com "continua depois" e começou o seguinte com "continua antes").
 * Sem isso, um contracheque de duas páginas cortado ao meio viraria dois.
 */
export function juntarFronteiras(itens: ItemLido[]): ItemLido[] {
  const ordenados = [...itens].sort((a, b) => a.paginaInicio - b.paginaInicio || a.paginaFim - b.paginaFim);
  const saida: ItemLido[] = [];
  for (const item of ordenados) {
    const anterior = saida.find(
      (a) =>
        a.continuaDepois &&
        item.continuaAntes &&
        a.tipo === item.tipo &&
        item.paginaInicio === a.paginaFim + 1 &&
        mesmaPessoa(a, item),
    );
    if (!anterior) {
      saida.push({ ...item, avisos: [...item.avisos] });
      continue;
    }
    anterior.paginaFim = item.paginaFim;
    anterior.continuaDepois = item.continuaDepois;
    anterior.confianca = Math.min(anterior.confianca, item.confianca);
    anterior.cpf ??= item.cpf;
    anterior.pis ??= item.pis;
    anterior.cnpj ??= item.cnpj;
    anterior.nome ??= item.nome;
    const c = anterior.campos as Record<string, unknown>;
    for (const [k, v] of Object.entries(item.campos)) if (c[k] === null) c[k] = v;
    anterior.avisos.push(...item.avisos);
  }
  // O que sobrou com a ponta solta não achou a outra metade: pode estar
  // incompleto (ou a metade é de outra pessoa). Vai para a conferência.
  for (const item of saida) {
    if (item.continuaAntes || item.continuaDepois) {
      item.avisos.push("O documento parece continuar em páginas que não foram achadas junto dele.");
    }
  }
  return saida;
}
