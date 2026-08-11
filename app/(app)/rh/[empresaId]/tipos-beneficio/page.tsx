import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { TiposBeneficioTable } from "./tipos-beneficio-table";

export default async function TiposBeneficioPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const empresasDoUsuario = await empresasVisiveis(usuario);

  const tipos = await prisma.tipoBeneficio.findMany({
    where: { empresaId: { in: empresasDoUsuario } },
    orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
    include: { empresa: { select: { id: true, nome: true } } },
  });

  return (
    <TiposBeneficioTable empresaId={empresaId} empresasDoUsuario={empresasDoUsuario} tipos={tipos} />
  );
}
