// Envio de contracheques — regra pura (sem banco): em que pé está cada
// contracheque da competência, do ponto de vista do RH.

/** Dado do botão do aviso no Telegram: o webhook responde mandando o link do portal. */
export const CALLBACK_ABRIR_PORTAL = "portal:abrir";

export type Situacao =
  | "NAO_ENVIADO"
  | "SEM_CANAL"
  | "ENVIADO"
  | "CIENTE"
  | "ABERTO"
  | "CONFIRMADO"
  | "ATRASADO"
  | "BLOQUEADO";

export const SITUACAO_LABEL: Record<Situacao, string> = {
  NAO_ENVIADO: "Não enviado",
  SEM_CANAL: "Sem como avisar",
  ENVIADO: "Avisado — não abriu",
  CIENTE: "Ciente no Telegram",
  ABERTO: "Abriu — falta assinar",
  CONFIRMADO: "Assinado com foto",
  ATRASADO: "Atrasado (> 5 dias)",
  BLOQUEADO: "Bloqueado (5 erros)",
};

export function situacaoDo(
  recibo: {
    enviadoEm: Date | null;
    canal: string | null;
    vistoEm: Date | null;
    confirmadoEm: Date | null;
    bloqueadoEm?: Date | null;
    cienciaTelegramEm?: Date | null;
  } | null,
  agora?: Date
): Situacao {
  if (!recibo) return "NAO_ENVIADO";
  if (recibo.confirmadoEm) return "CONFIRMADO";
  if (recibo.bloqueadoEm) return "BLOQUEADO";
  if (recibo.vistoEm) return "ABERTO";
  if (recibo.cienciaTelegramEm) return "CIENTE";
  if (!recibo.enviadoEm) return "NAO_ENVIADO";
  if (!recibo.canal) return "SEM_CANAL";
  if (agora && (agora.getTime() - recibo.enviadoEm.getTime()) / (24 * 60 * 60 * 1000) > 5) {
    return "ATRASADO";
  }
  return "ENVIADO";
}

export const TIPOS_FOLHA_LABEL: Record<string, string> = {
  MENSAL: "Mensal",
  ADIANTAMENTO: "Adiantamento",
  DECIMO_TERCEIRO: "13º salário",
  FERIAS: "Férias",
  COMPLEMENTAR: "Complementar",
  PLR: "PLR",
};

/** O tipo de folha guardado na chave de duplicata do contracheque ("CONTRACHEQUE:2026-08:MENSAL"). */
export function tipoFolhaDaChave(chave: string | null): string {
  const partes = (chave ?? "").split(":");
  return partes[0] === "CONTRACHEQUE" && partes[2] && TIPOS_FOLHA_LABEL[partes[2]] ? partes[2] : "MENSAL";
}

/** "2026-08" a partir da competência guardada (1º dia do mês, UTC). */
export function chaveDaCompetencia(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "08/2026" (e o tipo de folha, quando não é a mensal): o que a pessoa lê. */
export function rotuloDoContracheque(competencia: Date, tipoFolha: string): string {
  const mes = `${String(competencia.getUTCMonth() + 1).padStart(2, "0")}/${competencia.getUTCFullYear()}`;
  return tipoFolha === "MENSAL" ? mes : `${mes} (${TIPOS_FOLHA_LABEL[tipoFolha] ?? tipoFolha})`;
}

/** "AAAA-MM" válido → 1º dia do mês em UTC; senão null. */
export function competenciaDoTexto(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(ano, mes - 1, 1));
}
