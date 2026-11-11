// Invalidação de assinatura de contracheques — regras de domínio puras.
//
// Quando um contracheque é contestado (por exemplo, foto de assinatura inválida
// ou aparelho de terceiro), a assinatura é invalidada. O snapshot forense de
// auditoria é preservado com link imutável para a foto e comprovante anteriores,
// e o recibo volta ao estado pendente com novo token gerado.

import type { Situacao } from "./situacao";

export const TAMANHO_MINIMO_MOTIVO_INVALIDACAO = 10;

export type ValidacaoMotivo =
  | { ok: true; motivo: string }
  | { ok: false; error: string };

export function validarMotivoInvalidacao(motivo: string | null | undefined): ValidacaoMotivo {
  const limpo = (motivo ?? "").trim();
  if (limpo.length < TAMANHO_MINIMO_MOTIVO_INVALIDACAO) {
    return {
      ok: false,
      error: `O motivo da invalidação deve ter pelo menos ${TAMANHO_MINIMO_MOTIVO_INVALIDACAO} caracteres.`,
    };
  }
  return { ok: true, motivo: limpo };
}

export type ValidacaoElegibilidade =
  | { ok: true }
  | { ok: false; error: string };

export function podeInvalidarRecibo(
  recibo: { confirmadoEm: Date | null } | null | undefined
): ValidacaoElegibilidade {
  if (!recibo) {
    return { ok: false, error: "Contracheque não possui recibo gerado." };
  }
  if (!recibo.confirmadoEm) {
    return { ok: false, error: "Apenas contracheques já assinados/confirmados podem ter a assinatura invalidada." };
  }
  return { ok: true };
}

export type ReciboParaSnapshot = {
  id: string;
  documentoId: string;
  empresaId: string;
  colaboradorId: string;
  fotoArquivoId?: string | null;
  comprovanteArquivoId?: string | null;
  confirmadoIp?: string | null;
  confirmadoDispositivo?: string | null;
  confirmadoLocalizacao?: string | null;
  hashDocumento?: string | null;
  textoAceite?: string | null;
  canal?: string | null;
  enviadoEm?: Date | null;
  cienciaTelegramEm?: Date | null;
  vistoEm?: Date | null;
  codigoValidadoEm?: Date | null;
  canalCodigo?: string | null;
  confirmadoEm: Date;
};

export type AtorInvalidacao = {
  id: string;
  nome: string;
};

export function montarSnapshotInvalidacao(
  recibo: ReciboParaSnapshot,
  motivo: string,
  ator: AtorInvalidacao
) {
  return {
    reciboId: recibo.id,
    documentoId: recibo.documentoId,
    empresaId: recibo.empresaId,
    colaboradorId: recibo.colaboradorId,
    motivo: motivo.trim(),
    invalidadoPorId: ator.id,
    invalidadoPorNome: ator.nome,
    canalOriginal: recibo.canal ?? null,
    enviadoEmOriginal: recibo.enviadoEm ?? null,
    cienciaTelegramEm: recibo.cienciaTelegramEm ?? null,
    vistoEmOriginal: recibo.vistoEm ?? null,
    codigoValidadoEm: recibo.codigoValidadoEm ?? null,
    canalCodigo: recibo.canalCodigo ?? null,
    confirmadoEmOriginal: recibo.confirmadoEm,
    confirmadoIp: recibo.confirmadoIp ?? null,
    confirmadoDispositivo: recibo.confirmadoDispositivo ?? null,
    confirmadoLocalizacao: recibo.confirmadoLocalizacao ?? null,
    hashDocumento: recibo.hashDocumento ?? null,
    textoAceite: recibo.textoAceite ?? null,
    fotoArquivoId: recibo.fotoArquivoId ?? null,
    comprovanteArquivoId: recibo.comprovanteArquivoId ?? null,
  };
}

export function camposResetAposInvalidacao(novoToken: string) {
  return {
    tokenAssinatura: novoToken,
    confirmadoEm: null,
    confirmadoIp: null,
    confirmadoDispositivo: null,
    confirmadoLocalizacao: null,
    hashDocumento: null,
    textoAceite: null,
    fotoArquivoId: null,
    comprovanteArquivoId: null,
    vistoEm: null,
    cienciaTelegramEm: null,
    codigoValidadoEm: null,
    codigo2faHash: null,
    codigoExpiraEm: null,
    tentativasCodigo: 0,
    bloqueadoEm: null,
  };
}

export function rotuloAcaoReenvio(enviadoAntes: boolean): string {
  return enviadoAntes ? "Reenviar" : "Enviar";
}

export function acoesDisponiveisParaRecibo(dados: {
  situacao: Situacao;
  temEmail: boolean;
}): {
  podeInvalidar: boolean;
  podeReenviar: boolean;
} {
  return {
    podeInvalidar: dados.situacao === "CONFIRMADO",
    podeReenviar: dados.situacao !== "CONFIRMADO" && dados.temEmail,
  };
}
