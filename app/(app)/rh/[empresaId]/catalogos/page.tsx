import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_CATALOGO } from "@/lib/catalogos";
import { CatalogosView } from "./catalogos-view";

export default async function CatalogosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { empresaId } = await params;
  // ?categoria=TIPO_ENTREGA abre a tela já na aba certa — é o que permite a
  // outras telas ("falta um tipo? cadastre…") apontarem direto para o catálogo
  // em questão em vez de largarem a pessoa na primeira aba de dez.
  const { categoria } = await searchParams;
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

  return (
    <CatalogosView
      empresaId={empresaId}
      categorias={categorias}
      categoriaInicial={categorias.some((c) => c.chave === categoria) ? categoria : undefined}
    />
  );
}
