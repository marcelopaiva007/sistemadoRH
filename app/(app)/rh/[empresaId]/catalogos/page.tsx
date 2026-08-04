import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_CATALOGO } from "@/lib/catalogos";
import { CatalogosView } from "./catalogos-view";

export default async function CatalogosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const itens = await prisma.catalogoItem.findMany({
    where: { empresaId },
    orderBy: [{ categoria: "asc" }, { ativo: "desc" }, { nome: "asc" }],
  });

  const categorias = Object.entries(CATEGORIAS_CATALOGO).map(([chave, meta]) => ({
    chave,
    label: meta.label,
    padroes: meta.padroes as readonly { value: string; label: string }[],
    temCor: "temCor" in meta ? meta.temCor : false,
    temValidade: "temValidade" in meta ? meta.temValidade : false,
    itens: itens
      .filter((i) => i.categoria === chave)
      .map((i) => ({ id: i.id, nome: i.nome, cor: i.cor, validadeMeses: i.validadeMeses, ativo: i.ativo })),
  }));

  return <CatalogosView empresaId={empresaId} categorias={categorias} />;
}
