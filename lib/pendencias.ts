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

export const zeradas = (): Pendencias => ({
  aprovacoes: 0,
  documentosAConferir: 0,
  asoVencendo: 0,
  certificadosVencendo: 0,
  catPendente: 0,
  integracoesAtrasadas: 0,
  epiVencido: 0,
});

type LinhaAgrupada = { empresaId: string; _count?: { _all?: number } };

/**
 * As pendências de várias empresas de uma vez, já separadas por empresa.
 *
 * São 8 queries agregadas, independente de quantas empresas entrarem: o
 * `groupBy` devolve a contagem por `empresaId` numa tacada. A tela inicial do
 * grupo antes chamava `pendenciasDaEmpresa([id])` dentro de um laço, o que dava
 * 8 queries POR empresa — com os 11 CNPJs do grupo, quase 90 idas ao banco só
 * para montar os cartões.
 *
 * Empresa sem nenhuma pendência não volta no `groupBy`; por isso o mapa já
 * nasce com todas as chaves zeradas.
 */
export async function pendenciasPorEmpresa(empresaIds: string[]): Promise<Map<string, Pendencias>> {
  const mapa = new Map<string, Pendencias>(empresaIds.map((id) => [id, zeradas()]));
  if (empresaIds.length === 0) return mapa;

  const empresaId = { in: empresaIds };
  const hoje = hojeUTC();
  const limite = somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO);
  const por = ["empresaId"] as const;
  const contar = { _all: true } as const;

  const [feriasPendentes, ausenciasPendentes, documentosAConferir, asoVencendo, certificadosVencendo, catPendente, integracoesAtrasadas, epiVencido] =
    await Promise.all([
      prisma.solicitacaoFerias.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      prisma.ausencia.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      // Enviado pelo colaborador no portal e ainda não conferido pelo RH.
      prisma.documentoColaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, origem: "COLABORADOR", conferidoEm: null },
      }),
      prisma.exameOcupacional.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      prisma.certificadoNR.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      prisma.acidenteTrabalho.groupBy({ by: [...por], _count: contar, where: { empresaId, catEmitida: false } }),
      prisma.checklistIntegracao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, concluido: false, prazo: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      prisma.entregaEPI.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
    ]);

  const somar = (linhas: LinhaAgrupada[], aplicar: (p: Pendencias, n: number) => void) => {
    for (const linha of linhas) {
      const p = mapa.get(linha.empresaId);
      if (p) aplicar(p, linha._count?._all ?? 0);
    }
  };

  // `aprovacoes` junta férias e ausências — as duas somam no mesmo número.
  somar(feriasPendentes, (p, n) => (p.aprovacoes += n));
  somar(ausenciasPendentes, (p, n) => (p.aprovacoes += n));
  somar(documentosAConferir, (p, n) => (p.documentosAConferir = n));
  somar(asoVencendo, (p, n) => (p.asoVencendo = n));
  somar(certificadosVencendo, (p, n) => (p.certificadosVencendo = n));
  somar(catPendente, (p, n) => (p.catPendente = n));
  somar(integracoesAtrasadas, (p, n) => (p.integracoesAtrasadas = n));
  somar(epiVencido, (p, n) => (p.epiVencido = n));

  return mapa;
}

/**
 * O que exige ação numa empresa. Usado tanto na tela inicial do grupo quanto
 * na da empresa — uma função só para os dois lugares nunca discordarem sobre
 * o que conta como pendência.
 */
// Recebe os CNPJs da marca (ver lib/escopo-marca.ts): o RH cobra a pendência
// de todo mundo no mesmo lugar, não CNPJ a CNPJ.
export async function pendenciasDaEmpresa(empresaIds: string[]): Promise<Pendencias> {
  const porEmpresa = await pendenciasPorEmpresa(empresaIds);

  const total = zeradas();
  for (const p of porEmpresa.values()) {
    total.aprovacoes += p.aprovacoes;
    total.documentosAConferir += p.documentosAConferir;
    total.asoVencendo += p.asoVencendo;
    total.certificadosVencendo += p.certificadosVencendo;
    total.catPendente += p.catPendente;
    total.integracoesAtrasadas += p.integracoesAtrasadas;
    total.epiVencido += p.epiVencido;
  }
  return total;
}
