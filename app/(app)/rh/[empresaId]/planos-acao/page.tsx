import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PlanosAcaoView } from "./planos-acao-view";

// Tela genérica de Plano de Ação (fase 7 do roadmap de pesquisas —
// 02/08/2026): o model já existia (fase 2, PlanoAcao) e o alerta AL09 já lia
// dele, mas não havia UI nenhuma pra criar ou acompanhar um plano — só dava
// pra mexer direto no banco. Fica fora do dashboard do NR-01 de propósito
// (decisão do Marcelo): não depende de pesquisa nenhuma, cobre planos de
// qualquer origem (clima, NR-01, ou nenhuma).
export default async function PlanosAcaoPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [planos, setores] = await Promise.all([
    prisma.planoAcao.findMany({
      where: { empresaId },
      orderBy: [{ status: "asc" }, { prazo: "asc" }],
      select: {
        id: true,
        titulo: true,
        descricao: true,
        responsavelNome: true,
        prazo: true,
        status: true,
        concluidoEm: true,
        dimensaoCodigo: true,
        setor: { select: { nome: true } },
        pesquisa: { select: { titulo: true } },
      },
    }),
    prisma.setor.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return <PlanosAcaoView empresaId={empresaId} planos={planos} setores={setores} />;
}
