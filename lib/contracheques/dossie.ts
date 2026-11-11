// Regras puras para lançamento manual de contracheques no Dossiê
// do Colaborador (substituição de pendente, deduplicação e bloqueio de assinado).

import {
  competenciaDoTexto,
  rotuloDoContracheque,
  chaveDaCompetencia,
  TIPOS_FOLHA_LABEL,
} from "./situacao";

export type MetadadosContrachequeManual = {
  competencia: Date;
  tipoFolha: string;
  chaveDedupe: string;
  mesAno: string;
  rotulo: string;
  descricaoPadrao: string;
};

export type ParamsMetadadosContracheque = {
  competencia?: string | null;
  tipoFolha?: string | null;
  descricao?: string | null;
};

export function inferirCompetenciaDeTexto(texto?: string | null): Date | null {
  if (!texto) return null;
  // Tenta formato YYYY-MM
  const matchIso = /(\d{4})-(\d{2})/.exec(texto);
  if (matchIso) {
    const comp = competenciaDoTexto(`${matchIso[1]}-${matchIso[2]}`);
    if (comp) return comp;
  }
  // Tenta formato MM/YYYY
  const matchBr = /(\d{1,2})\/(\d{4})/.exec(texto);
  if (matchBr) {
    const mes = Number(matchBr[1]);
    const ano = Number(matchBr[2]);
    if (ano >= 2000 && ano <= 2100 && mes >= 1 && mes <= 12) {
      return new Date(Date.UTC(ano, mes - 1, 1));
    }
  }
  return null;
}

export function resolverMetadadosContrachequeManual(
  params: ParamsMetadadosContracheque
): MetadadosContrachequeManual | null {
  const compStr = (params.competencia ?? "").trim();
  let competencia: Date | null = null;

  if (compStr) {
    competencia = competenciaDoTexto(compStr);
    if (!competencia) {
      return null;
    }
  } else {
    competencia = inferirCompetenciaDeTexto(params.descricao);
    if (!competencia) {
      return null;
    }
  }

  const tipo = (params.tipoFolha ?? "").trim();
  const tipoFolha = tipo && TIPOS_FOLHA_LABEL[tipo] ? tipo : "MENSAL";
  const aaaaMm = chaveDaCompetencia(competencia);
  const chaveDedupe = `CONTRACHEQUE:${aaaaMm}:${tipoFolha}`;
  const mesAno = `${String(competencia.getUTCMonth() + 1).padStart(2, "0")}/${competencia.getUTCFullYear()}`;
  const rotulo = rotuloDoContracheque(competencia, tipoFolha);
  const descricaoPadrao = `Competência ${rotulo}`;

  return {
    competencia,
    tipoFolha,
    chaveDedupe,
    mesAno,
    rotulo,
    descricaoPadrao,
  };
}

export type DocumentoExistenteParaDecisao = {
  id: string;
  arquivoId: string | null;
  recibo?: {
    id: string;
    confirmadoEm: Date | null;
  } | null;
} | null;

export type DecisaoSegundoContracheque =
  | { acao: "CRIAR" }
  | {
      acao: "SUBSTITUIR_PENDENTE";
      documentoId: string;
      arquivoAnteriorId: string | null;
      reciboId: string | null;
    }
  | {
      acao: "BLOQUEAR_JA_ASSINADO";
      error: string;
    };

export function decidirSegundoContrachequeDossie(
  existente: DocumentoExistenteParaDecisao,
  rotulo: string
): DecisaoSegundoContracheque {
  if (!existente) {
    return { acao: "CRIAR" };
  }

  if (existente.recibo?.confirmadoEm) {
    return {
      acao: "BLOQUEAR_JA_ASSINADO",
      error: `Já existe contracheque assinado com foto para ${rotulo}. Para substituí-lo por uma nova via, acesse Contracheques e utilize a opção "Invalidar recibo" antes de anexar no Dossiê.`,
    };
  }

  return {
    acao: "SUBSTITUIR_PENDENTE",
    documentoId: existente.id,
    arquivoAnteriorId: existente.arquivoId,
    reciboId: existente.recibo?.id ?? null,
  };
}
