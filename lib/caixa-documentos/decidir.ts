// Caixa de documentos — grava sozinho ou manda conferir?
//
// Puro: todos os fatos que dependem de banco (duplicata, sobreposição de
// ausência, página compartilhada) chegam prontos. A regra é uma lista de
// motivos: se sobrar QUALQUER motivo, o item vai para a conferência com todos
// eles escritos — o RH vê de uma vez por que a IA não gravou.
import { CONFIANCA_MINIMA, DESTINO, JANELA_PAGINAS, MOTIVO_FORA_DO_ESCOPO, type TipoCaixa } from "./tipos";
import type { CamposLidos, InventarioPaginas } from "./extracao";
import type { Identificacao } from "./identificar";

/**
 * O que falta para gravar este tipo — usado pela decisão automática E pela
 * confirmação manual (o RH não consegue gravar um ASO sem resultado, igual ao
 * formulário da ficha).
 */
export function faltasParaGravar(tipo: TipoCaixa, c: CamposLidos): string[] {
  const faltas: string[] = [];
  if (c.validoAte && c.dataDocumento && c.validoAte < c.dataDocumento) {
    faltas.push("A validade é anterior à data do documento.");
  }
  switch (tipo) {
    case "ASO":
      if (!c.asoTipo) faltas.push("Falta o tipo do exame (admissional, periódico...).");
      if (!c.asoResultado) faltas.push("Falta o resultado (apto, apto com restrição, inapto).");
      if (!c.dataDocumento) faltas.push("Falta a data do exame.");
      if (c.asoResultado === "APTO_COM_RESTRICAO" && !c.restricoes) faltas.push("Apto com restrição sem a restrição escrita.");
      break;
    case "CONTRACHEQUE":
      if (!c.competencia) faltas.push("Falta o mês de referência (competência).");
      break;
    case "INFORME_RENDIMENTOS":
      if (!c.anoCalendario) faltas.push("Falta o ano-calendário.");
      break;
    case "ATESTADO": {
      if (!c.dataInicio) faltas.push("Falta o primeiro dia do afastamento.");
      if (!c.dataFim && !c.dias) faltas.push("Falta o último dia (ou a quantidade de dias) do afastamento.");
      if (c.dataInicio && c.dataFim && c.dataFim < c.dataInicio) faltas.push("O fim do afastamento é anterior ao início.");
      // Com as duas coisas escritas, elas têm de bater: "3 dias a partir de
      // 10/09" lido com fim 13/09 daria 4 dias abonados sem ninguém ver.
      if (c.dataInicio && c.dataFim && c.dias && c.dataFim >= c.dataInicio) {
        const corridos = Math.round((Date.parse(`${c.dataFim}T00:00:00Z`) - Date.parse(`${c.dataInicio}T00:00:00Z`)) / 86_400_000) + 1;
        if (corridos !== c.dias) {
          faltas.push(`O último dia e o nº de dias não batem (${corridos} dia(s) no período, ${c.dias} escrito) — deixe só o certo.`);
        }
      }
      break;
    }
    case "CERTIFICADO_NR":
      if (!c.norma) faltas.push("A norma (NR) não foi reconhecida.");
      if (!c.dataDocumento) faltas.push("Falta a data do treinamento.");
      break;
    default:
      break;
  }
  return faltas;
}

/**
 * As páginas deste item podem virar um arquivo só dele?
 *
 * Não, se outro item do mesmo arquivo usa alguma dessas páginas (duas pessoas
 * na mesma folha). E, para o que vai ao PORTAL, também não se o inventário da
 * IA não mostra, em CADA página, exatamente uma pessoa e o CPF (ou PIS) dela —
 * é a segunda fonte, que pega o caso em que a IA listou só uma das duas
 * pessoas da página, ou errou a página.
 */
export function paginasSoDele(
  item: {
    paginaInicio: number;
    paginaFim: number;
    /** CPF e PIS desta pessoa JÁ marcados (sigilo.ts) — é assim que o inventário os guarda. */
    ids: string[];
  },
  outros: { paginaInicio: number; paginaFim: number }[],
  inventario: InventarioPaginas | null,
  vaiAoPortal: boolean,
): boolean {
  if (outros.some((o) => o.paginaInicio <= item.paginaFim && o.paginaFim >= item.paginaInicio)) return false;
  if (!vaiAoPortal) return true;
  const ids = item.ids.filter(Boolean);
  if (ids.length === 0) return false;
  for (let p = item.paginaInicio; p <= item.paginaFim; p++) {
    const pagina = inventario?.[String(p)];
    if (!pagina || pagina.pessoas !== 1) return false;
    if (!ids.some((id) => pagina.ids.includes(id))) return false;
  }
  return true;
}

/**
 * Este outro item do arquivo "ocupa" as páginas dele — ou seja, elas mostram
 * alguém que não é `pessoa`? Descartar um item NÃO libera as páginas: o
 * contracheque do Bruno descartado continua impresso na folha que a Ana
 * receberia. Não ocupam: a página sem pessoa (capa, guia, boleto), o item sem
 * nenhuma pessoa lida (página que a leitura não apontou — o inventário ainda
 * confere quem está nela) e o item da MESMA pessoa (a IA leu o mesmo documento
 * duas vezes, ou são dois documentos dela na mesma folha).
 *
 * `marcas`: CPF/PIS lidos do item, já marcados (sigilo.ts). O item descartado
 * perde o CPF lido mas guarda as marcas, justamente para esta pergunta.
 */
export function ocupaAsPaginas(
  o: { tipo: string; status: string; colaboradorId: string | null; nomeLido: string | null; motivo: string | null; marcas: string[] },
  pessoa: { id: string | null; marcas: string[] },
): boolean {
  if (o.tipo === "NAO_E_DE_COLABORADOR") return false;
  if (o.motivo?.startsWith(MOTIVO_FORA_DO_ESCOPO)) return true;
  if (pessoa.id && o.colaboradorId === pessoa.id) return false;
  if (o.marcas.some((m) => pessoa.marcas.includes(m))) return false;
  return !!o.nomeLido || !!o.colaboradorId || o.marcas.length > 0;
}

/**
 * Na conferência manual: as páginas escolhidas, para a pessoa escolhida.
 *
 * - OUTRA_PESSOA: alguma página tem mais de uma pessoa, ou só identificadores
 *   de outra pessoa. Não vai ao portal — nenhuma confirmação muda isso.
 * - DUVIDA: a leitura não garante (página sem inventário, sem CPF/PIS lido).
 *   O RH, que está vendo as páginas, pode confirmar.
 * - OK: cada página tem só esta pessoa (ou ninguém — página sem dado pessoal).
 */
export function conferenciaDasPaginas(
  de: number,
  ate: number,
  inventario: InventarioPaginas | null,
  idsDaPessoa: string[],
  /**
   * A ficha tem CPF E PIS: aí qualquer identificador de titular impresso na
   * página, se não é um dos dois, é de outra pessoa. Com só um deles, um PIS
   * na página (contracheque que só traz o PIS) pode ser o dela — dúvida.
   */
  conheceTodosOsIds: boolean,
): "OK" | "DUVIDA" | "OUTRA_PESSOA" {
  const meus = idsDaPessoa.filter(Boolean);
  let duvida = false;
  for (let p = de; p <= ate; p++) {
    const pagina = inventario?.[String(p)];
    if (!pagina) {
      duvida = true;
      continue;
    }
    if (pagina.pessoas >= 2) return "OUTRA_PESSOA";
    if (pagina.pessoas === 0) continue;
    if (!pagina.ids.some((id) => meus.includes(id))) {
      if (pagina.ids.length > 0 && conheceTodosOsIds) return "OUTRA_PESSOA";
      duvida = true;
    }
  }
  return duvida ? "DUVIDA" : "OK";
}

/**
 * Páginas do bloco fora de qualquer documento lido — a leitura pulou alguém
 * (ou a página). Não somem: viram itens para conferir. Fica de fora só a que
 * a leitura disse não ter pessoa nenhuma (capa, resumo da folha).
 */
export function paginasSemDocumento(
  inicio: number,
  fim: number,
  itens: { paginaInicio: number; paginaFim: number }[],
  inventario: InventarioPaginas,
): number[] {
  const soltas: number[] = [];
  for (let p = inicio; p <= fim; p++) {
    if (itens.some((i) => i.paginaInicio <= p && i.paginaFim >= p)) continue;
    if (inventario[String(p)]?.pessoas === 0) continue;
    soltas.push(p);
  }
  return soltas;
}

/**
 * Até onde o RH pode ver e mover as páginas de um item: JANELA_PAGINAS antes e
 * depois do que a LEITURA apontou — não do intervalo atual, que muda a cada
 * gravação/desfazer (ancorado nele, a janela "andaria" 5 páginas por volta).
 */
export function janelaDoItem(lidas: { de: number; ate: number }, totalDePaginas: number): { de: number; ate: number } {
  return { de: Math.max(1, lidas.de - JANELA_PAGINAS), ate: Math.min(totalDePaginas, lidas.ate + JANELA_PAGINAS) };
}

export type FatosDoBanco = {
  /**
   * Mensagens prontas do que o banco impede: o mesmo documento já gravado para
   * a pessoa, atestado em cima de outra ausência, contracheque de um mês fora
   * do vínculo...
   */
  impedimentos: string[];
  /** As páginas não são só desta pessoa (ver paginasSoDele). */
  paginasCompartilhadas: boolean;
};

export type Decisao = { acao: "GRAVAR" } | { acao: "CONFERIR"; motivos: string[] };

export function decidir(
  item: { tipo: TipoCaixa; confianca: number; campos: CamposLidos; avisos: string[] },
  identificacao: Identificacao,
  fatos: FatosDoBanco,
): Decisao {
  const motivos: string[] = [];

  if (item.tipo === "NAO_E_DE_COLABORADOR") {
    return { acao: "CONFERIR", motivos: ["Não parece documento de colaborador — descarte se for isso mesmo."] };
  }
  if (DESTINO[item.tipo] === null) {
    motivos.push("Tipo de documento sem lugar automático no sistema — escolha o destino.");
  }

  if (identificacao.tipo === "SUGESTAO" || identificacao.tipo === "NENHUM") {
    motivos.push(identificacao.motivo);
  }

  if (item.confianca < CONFIANCA_MINIMA) {
    motivos.push(`A IA não teve certeza da leitura (${Math.round(item.confianca * 100)}%).`);
  }
  motivos.push(...item.avisos);
  motivos.push(...faltasParaGravar(item.tipo, item.campos));
  // Sem o tipo da folha, 13º, férias e rescisão entrariam como a folha mensal
  // do mês — e bloqueariam o contracheque mensal verdadeiro como repetido.
  if (item.tipo === "CONTRACHEQUE" && item.campos.competencia && !item.campos.tipoFolha) {
    motivos.push("O tipo da folha (mensal, 13º, férias...) não foi lido.");
  }
  // Resultado que muda o trabalho da pessoa não entra em silêncio: o RH vê
  // antes de gravar (e avisa o gestor, se for o caso).
  if (item.tipo === "ASO" && item.campos.asoResultado === "INAPTO") {
    motivos.push("ASO com resultado INAPTO — confira antes de gravar.");
  }
  if (item.tipo === "ASO" && item.campos.asoResultado === "APTO_COM_RESTRICAO") {
    motivos.push("ASO apto COM RESTRIÇÃO — confira a restrição antes de gravar.");
  }

  if (fatos.paginasCompartilhadas) {
    motivos.push("As mesmas páginas têm documento de outra pessoa — separar o arquivo mostraria um para o outro.");
  }
  motivos.push(...fatos.impedimentos);

  const unicos = [...new Set(motivos)];
  return unicos.length === 0 ? { acao: "GRAVAR" } : { acao: "CONFERIR", motivos: unicos };
}
