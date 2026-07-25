import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AprovacoesView } from "./aprovacoes-view";

// Central de aprovações: tudo que espera uma decisão do RH/gestor num lugar só
// — férias programadas e ausências registradas. Sempre escopada à empresa.
export default async function AprovacoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [ferias, ausencias, decididasRecentes] = await Promise.all([
    prisma.solicitacaoFerias.findMany({
      where: { empresaId, status: "PENDENTE" },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
        colaboradorId: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        diasAbono: true,
        observacoes: true,
        solicitadoPorNome: true,
        createdAt: true,
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    prisma.ausencia.findMany({
      where: { empresaId, status: "PENDENTE" },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
        colaboradorId: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        abonada: true,
        observacoes: true,
        registradoPorNome: true,
        createdAt: true,
        arquivo: { select: { id: true, nome: true } },
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    prisma.auditLog.findMany({
      where: { empresaId, acao: { in: ["APROVAR", "REPROVAR", "CANCELAR"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, acao: true, resumo: true, usuarioNome: true, createdAt: true },
    }),
  ]);

  return (
    <AprovacoesView
      empresaId={empresaId}
      ferias={ferias}
      ausencias={ausencias}
      decididasRecentes={decididasRecentes}
    />
  );
}
