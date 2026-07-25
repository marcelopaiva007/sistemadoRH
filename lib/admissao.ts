import { tipoDocumentoLabel } from "@/lib/constants-dp";

// Documentos que o DP espera ter no dossiê de quem acabou de ser admitido.
// Não é uma lista legal fechada — é o que a operação pede na prática. Manter
// curto de propósito: uma lista longa demais vira ruído e o RH ignora.
export const DOCUMENTOS_ADMISSIONAIS = [
  "RG",
  "CPF",
  "CTPS",
  "COMPROVANTE_RESIDENCIA",
  "CONTRATO",
] as const;

export type PendenciaAdmissao = { chave: string; descricao: string };

/**
 * O que ainda falta para a admissão estar completa.
 *
 * Calculado a partir do que já existe (dossiê + exames), nunca gravado —
 * mesmo princípio de conformidade e benefícios. Guardar um "status de
 * admissão" só criaria um campo para ficar desatualizado assim que alguém
 * anexasse o documento que faltava.
 *
 * Isto **avisa, não bloqueia**: em campo a pessoa às vezes começa antes de
 * todo papel chegar, e travar a criação da ficha só faria o RH cadastrar por
 * fora do sistema.
 */
export function pendenciasDaAdmissao(dados: {
  dataAdmissao: Date | null;
  salarioBase: number | null;
  tipoContrato: string | null;
  tiposDeDocumentoNoDossie: string[];
  temExameAdmissional: boolean;
}): PendenciaAdmissao[] {
  const pendencias: PendenciaAdmissao[] = [];

  if (!dados.dataAdmissao) {
    pendencias.push({
      chave: "DATA_ADMISSAO",
      descricao: "Data de admissão — sem ela a pessoa fica fora do controle de férias.",
    });
  }
  if (!dados.tipoContrato) {
    pendencias.push({ chave: "TIPO_CONTRATO", descricao: "Tipo de contrato." });
  }
  if (dados.salarioBase === null) {
    pendencias.push({
      chave: "SALARIO",
      descricao: "Salário base — sem ele o custo de pessoal nos indicadores fica subestimado.",
    });
  }

  const noDossie = new Set(dados.tiposDeDocumentoNoDossie);
  for (const tipo of DOCUMENTOS_ADMISSIONAIS) {
    if (!noDossie.has(tipo)) {
      pendencias.push({ chave: tipo, descricao: tipoDocumentoLabel(tipo) });
    }
  }

  if (!dados.temExameAdmissional) {
    pendencias.push({ chave: "ASO_ADMISSIONAL", descricao: "Exame admissional (ASO)." });
  }

  return pendencias;
}
