import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import { hojeUTC, somarDiasUTC } from "@/lib/datas";
import { PendenciasView } from "./pendencias-view";

// Tela inicial da empresa: o que exige ação hoje, não um retrato do passado.
// Cada bloco leva para a tela onde a coisa se resolve.
export default async function PendenciasPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const hoje = hojeUTC();
  const limite = somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO);

  const [
    feriasPendentes,
    ausenciasPendentes,
    asoVencendo,
    certificadosVencendo,
    catPendente,
    integracoesAtrasadas,
    epiVencido,
  ] = await Promise.all([
    prisma.solicitacaoFerias.count({ where: { empresaId, status: "PENDENTE" } }),
    prisma.ausencia.count({ where: { empresaId, status: "PENDENTE" } }),
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

  return (
    <PendenciasView
      empresaId={empresaId}
      pendencias={{
        aprovacoes: feriasPendentes + ausenciasPendentes,
        asoVencendo,
        certificadosVencendo,
        catPendente,
        integracoesAtrasadas,
        epiVencido,
      }}
      diasAlerta={DIAS_ALERTA_VENCIMENTO}
    />
  );
}
