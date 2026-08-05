// Central de Sinais — a parte PURA: o que é um sinal e quando um achado do
// detector vira linha nova, atualização ou silêncio.
//
// Sem estado, alerta não é gestão, é ruído: o e-mail de lib/alertas.ts repete
// todo dia e ninguém registra "eu vi" nem "virou plano". Este motor dá estado
// ao alerta — e o estado é o que obriga o descarte a ter motivo e o que impede
// o mesmo aviso de voltar amanhã como se fosse novidade.
//
// Mesmo contrato de lib/bi.ts e lib/anomalias.ts: funções puras, sem Prisma.
// Quem consulta e grava é lib/sinais-registro.ts; quem clica é a tela sinais/.
import { somarDiasUTC } from "@/lib/datas";

// ---------------------------------------------------------------
// Vocabulário
// ---------------------------------------------------------------

export type TipoSinal =
  | "ANOMALIA_DESLIGAMENTO" // radar de desvio (lib/anomalias.ts)
  | "PLANO_VENCIDO" // AL09 (lib/alertas.ts)
  | "DESLIGAMENTOS_CONCENTRADOS" // AL10
  | "TAXA_RESPOSTA_BAIXA"; // AL08

export type NivelUnidadeSinal = "grupo" | "marca" | "empresa" | "setor";

export type GravidadeSinal = "critica" | "alta" | "atencao";

export type StatusSinal = "ABERTO" | "RECONHECIDO" | "EM_PLANO" | "DESCARTADO" | "SILENCIADO";

export const TIPO_SINAL = [
  { value: "ANOMALIA_DESLIGAMENTO", label: "Desligamentos fora da própria média" },
  { value: "PLANO_VENCIDO", label: "Plano de ação vencido" },
  { value: "DESLIGAMENTOS_CONCENTRADOS", label: "Desligamentos concentrados" },
  { value: "TAXA_RESPOSTA_BAIXA", label: "Taxa de resposta baixa" },
] as const;

export const STATUS_SINAL = [
  { value: "ABERTO", label: "Aberto" },
  { value: "RECONHECIDO", label: "Reconhecido" },
  { value: "EM_PLANO", label: "Virou plano" },
  { value: "DESCARTADO", label: "Descartado" },
  { value: "SILENCIADO", label: "Silenciado" },
] as const;

export const GRAVIDADE_SINAL = [
  { value: "critica", label: "Crítica" },
  { value: "alta", label: "Alta" },
  { value: "atencao", label: "Atenção" },
] as const;

export const tipoSinalLabel = (v: string) => TIPO_SINAL.find(t => t.value === v)?.label ?? v;
export const statusSinalLabel = (v: string) => STATUS_SINAL.find(s => s.value === v)?.label ?? v;
export const gravidadeSinalLabel = (v: string) =>
  GRAVIDADE_SINAL.find(g => g.value === v)?.label ?? v;

/** Sinal que ainda espera desfecho — é o que a aba "Abertos" e o contador do topo contam. */
export const STATUS_SINAL_VIVOS: StatusSinal[] = ["ABERTO", "RECONHECIDO", "EM_PLANO"];

// ---------------------------------------------------------------
// Regras de silêncio e reincidência
// ---------------------------------------------------------------

/**
 * Um descarte vale por 60 dias: a mesma situação não volta a virar sinal nesse
 * prazo (respeita o julgamento de quem descartou), e o silêncio por descarte
 * repetido dura o mesmo tanto. Um número só, de propósito — dois prazos
 * diferentes para "quanto vale um descarte" seria regra que ninguém decora.
 */
export const SILENCIO_DIAS = 60;

/**
 * Descartado 2× seguidas na MESMA unidade e MESMO tipo → o próximo sinal nasce
 * SILENCIADO e vai para a aba própria — nunca some sem rastro. É o pacto de
 * confiança da tela: quem descartou duas vezes já disse que aquilo não é
 * problema ali; insistir pela terceira vez ensina o time a ignorar a Central.
 */
export const DESCARTES_SEGUIDOS_PARA_SILENCIO = 2;

// ---------------------------------------------------------------
// Contratos de entrada
// ---------------------------------------------------------------

/** O que um detector produz. `observado`/`esperado` já são frase, não número: cada detector tem unidade própria (%, dias, pessoas) e a tela não deve reformatar. */
export type CandidatoSinal = {
  tipo: TipoSinal;
  /**
   * Identidade da OCORRÊNCIA, sem componente de tempo para condição contínua
   * (AL10 vale enquanto a janela de 90 dias acusar) e com o mês embutido para
   * evento datado (anomalia de junho/2026 ≠ anomalia de julho/2026). É por ela
   * que o cron atualiza a linha existente em vez de criar outra.
   */
  chaveDedupe: string;
  nivelUnidade: NivelUnidadeSinal;
  unidadeId: string;
  unidadeNome: string;
  /** CNPJ para o recorte da tela (`empresasVisiveis`). Nulo em sinal de grupo/marca. */
  empresaId: string | null;
  /** A frase do cartão, pronta — a mesma que o detector já usa no e-mail/painel. */
  titulo: string;
  observado: string;
  esperado: string;
  /** O que ficou fora da conta, para o rodapé do cartão. Honestidade de dado. */
  recorte: string | null;
  gravidade: GravidadeSinal;
};

export type SinalParaDecisao = {
  id: string;
  status: string;
  /** Quando o status atual foi definido — é dele que se conta a validade de um descarte. */
  statusEm: Date;
  silenciadoAte: Date | null;
};

export type DecisaoRegistro =
  | { acao: "criar"; status: "ABERTO"; silenciadoAte: null }
  | { acao: "criar"; status: "SILENCIADO"; silenciadoAte: Date }
  | { acao: "confirmar"; sinalId: string }
  | { acao: "nada"; motivo: "DESCARTE_RECENTE" };

// ---------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------

/**
 * Descartes consecutivos mais recentes da (tipo, unidade), do mais novo para
 * trás. SILENCIADO não conta nem quebra a sequência: nasceu calado pela regra,
 * não pelo julgamento de uma pessoa — só RECONHECIDO/EM_PLANO/ABERTO quebram,
 * porque são a prova de que alguém voltou a tratar o assunto como real.
 */
export function descartesSeguidos(
  historicoDaUnidade: { status: string; statusEm: Date }[],
): { seguidos: number; ultimoEm: Date | null } {
  let seguidos = 0;
  let ultimoEm: Date | null = null;
  for (const s of historicoDaUnidade) {
    if (s.status === "SILENCIADO") continue;
    if (s.status !== "DESCARTADO") break;
    seguidos++;
    if (!ultimoEm) ultimoEm = s.statusEm;
  }
  return { seguidos, ultimoEm };
}

/**
 * O que fazer com um achado do detector, dado o que já existe no banco.
 *
 * - Ninguém com a mesma chave → criar (aberto, ou silenciado se a unidade
 *   acumulou descartes — ver `descartesSeguidos`).
 * - Chave viva (ABERTO/RECONHECIDO/EM_PLANO) → confirmar: a situação continua
 *   de pé, a linha existente ganha `confirmadoEm` e a frase atualizada. Nunca
 *   uma segunda linha — duas linhas para o mesmo fato é a definição de ruído.
 * - Chave SILENCIADA dentro do prazo → confirmar (o rastro continua na aba de
 *   silenciados, atualizado). Prazo vencido → volta a criar, ABERTO: o
 *   silêncio dura 60 dias e não se renova sozinho — renová-lo é decisão
 *   humana, com mais um descarte.
 * - Chave DESCARTADA há menos de 60 dias → nada. Recriar no dia seguinte ao
 *   descarte diria "seu julgamento não vale"; depois de 60 dias, se a situação
 *   PERSISTE, ela merece voltar à mesa.
 *
 * `historicoDaUnidade` = sinais da mesma (tipo, nivelUnidade, unidadeId),
 * qualquer chave, do mais recente para o mais antigo por `statusEm`.
 */
export function decidirRegistro(
  ultimoDaChave: SinalParaDecisao | null,
  historicoDaUnidade: { status: string; statusEm: Date }[],
  hoje: Date,
): DecisaoRegistro {
  if (!ultimoDaChave) return criacao(historicoDaUnidade, hoje);

  if (STATUS_SINAL_VIVOS.includes(ultimoDaChave.status as StatusSinal)) {
    return { acao: "confirmar", sinalId: ultimoDaChave.id };
  }

  if (ultimoDaChave.status === "SILENCIADO") {
    if (ultimoDaChave.silenciadoAte && ultimoDaChave.silenciadoAte > hoje) {
      return { acao: "confirmar", sinalId: ultimoDaChave.id };
    }
    return criacao(historicoDaUnidade, hoje);
  }

  // DESCARTADO
  if (somarDiasUTC(ultimoDaChave.statusEm, SILENCIO_DIAS) > hoje) {
    return { acao: "nada", motivo: "DESCARTE_RECENTE" };
  }
  return criacao(historicoDaUnidade, hoje);
}

function criacao(
  historicoDaUnidade: { status: string; statusEm: Date }[],
  hoje: Date,
): DecisaoRegistro {
  const descartes = descartesSeguidos(historicoDaUnidade);
  if (descartes.seguidos >= DESCARTES_SEGUIDOS_PARA_SILENCIO && descartes.ultimoEm) {
    // A janela conta do ÚLTIMO DESCARTE, não da criação do sinal novo — senão
    // cada detecção diária empurraria o fim do silêncio para a frente e "60
    // dias" viraria "para sempre enquanto a situação durar".
    const ate = somarDiasUTC(descartes.ultimoEm, SILENCIO_DIAS);
    if (ate > hoje) return { acao: "criar", status: "SILENCIADO", silenciadoAte: ate };
  }
  return { acao: "criar", status: "ABERTO", silenciadoAte: null };
}
