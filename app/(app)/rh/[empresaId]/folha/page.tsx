import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { FolhaView } from "./folha-view";

// Competências mensais de eventos variáveis. Cada uma abre numa página
// própria, onde se lança e se confere antes de mandar para a contabilidade.
export default async function FolhaPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const competencias = await prisma.competenciaFolha.findMany({
    where: { empresaId },
    orderBy: { referencia: "desc" },
    select: {
      id: true,
      referencia: true,
      status: true,
      fechadaEm: true,
      fechadaPorNome: true,
      _count: { select: { eventos: true } },
    },
  });

  return <FolhaView empresaId={empresaId} competencias={competencias} />;
}
