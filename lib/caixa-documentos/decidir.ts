// Caixa de documentos — grava sozinho ou manda conferir?
//
// Puro: todos os fatos que dependem de banco (duplicata, sobreposição de
// ausência, página compartilhada) chegam prontos. A regra é uma lista de
// motivos: se sobrar QUALQUER motivo, o item vai para a conferência com todos
// eles escritos — o RH vê de uma vez por que a IA não gravou.
import { CONFIANCA_MINIMA, DESTINO, type TipoCaixa } from "./tipos";
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
  item: { paginaInicio: number; paginaFim: number; cpf: string | null; pis?: string | null },
  outros: { paginaInicio: number; paginaFim: number }[],
  inventario: InventarioPaginas | null,
  vaiAoPortal: boolean,
): boolean {
  if (outros.some((o) => o.paginaInicio <= item.paginaFim && o.paginaFim >= item.paginaInicio)) return false;
  if (!vaiAoPortal) return true;
  const ids = [item.cpf, item.pis].filter((x): x is string => !!x);
  if (ids.length === 0) return false;
  for (let p = item.paginaInicio; p <= item.paginaFim; p++) {
    const pagina = inventario?.[String(p)];
    if (!pagina || pagina.pessoas !== 1) return false;
    if (!ids.some((id) => pagina.ids.includes(id))) return false;
  }
  return true;
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
