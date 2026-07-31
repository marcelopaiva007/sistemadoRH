import { prisma } from "@/lib/prisma";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import { hojeUTC, somarDiasUTC } from "@/lib/datas";

export type Pendencias = {
  aprovacoes: number;
  documentosAConferir: number;
  asoVencendo: number;
  certificadosVencendo: number;
  catPendente: number;
  integracoesAtrasadas: number;
  epiVencido: number;
};

export const totalPendencias = (p: Pendencias) => Object.values(p).reduce((s, n) => s + n, 0);

/**
 * O que exige ação numa empresa. Usado tanto na tela inicial do grupo quanto
 * na da empresa — uma função só para os dois lugares nunca discordarem sobre
 * o que conta como pendência.
 */
// Recebe os CNPJs da marca (ver lib/escopo-marca.ts): o RH cobra a pendência
// de todo mundo no mesmo lugar, não CNPJ a CNPJ.
export async function pendenciasDaEmpresa(empresaIds: string[]): Promise<Pendencias> {
  const empresaId = { in: empresaIds };
  const hoje = hojeUTC();
  const limite = somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO);

  const [feriasPendentes, ausenciasPendentes, documentosAConferir, asoVencendo, certificadosVencendo, catPendente, integracoesAtrasadas, epiVencido] =
    await Promise.all([
      prisma.solicitacaoFerias.count({ where: { empresaId, status: "PENDENTE" } }),
      prisma.ausencia.count({ where: { empresaId, status: "PENDENTE" } }),
      // Enviado pelo colaborador no portal e ainda não conferido pelo RH.
      prisma.documentoColaborador.count({
        where: { empresaId, origem: "COLABORADOR", conferidoEm: null },
      }),
      prisma.exameOcupacional.count({
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      prisma.certificadoNR.count({
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      prisma.acidenteTrabalho.count({ where: { empresaId, catEmitida: false } }),
      prisma.checklistIntegracao.count({
        where: { empresaId, concluido: false, prazo: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      prisma.entregaEPI.count({
        where: { empresaId, validoAte: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
    ]);

  return {
    aprovacoes: feriasPendentes + ausenciasPendentes,
    documentosAConferir,
    asoVencendo,
    certificadosVencendo,
    catPendente,
    integracoesAtrasadas,
    epiVencido,
  };
}
