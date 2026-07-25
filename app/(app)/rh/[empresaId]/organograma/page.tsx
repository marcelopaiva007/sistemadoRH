import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { OrganogramaView } from "./organograma-view";

// Organograma vivo: montado na hora a partir de Colaborador.supervisorId, não
// de um desenho que alguém mantém à parte — muda sozinho quando uma
// movimentação troca o líder de alguém.
export default async function OrganogramaPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId, ativo: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      supervisorId: true,
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
    },
  });

  return <OrganogramaView empresaId={empresaId} colaboradores={colaboradores} />;
}
