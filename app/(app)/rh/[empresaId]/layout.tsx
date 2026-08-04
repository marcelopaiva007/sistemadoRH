import { notFound } from "next/navigation";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { RHEmpresaNav } from "./rh-empresa-nav";
import { ListaEmpresas } from "./lista-empresas";

export default async function RHEmpresaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  const empresasDoUsuario = await empresasVisiveis(usuario);

  const empresas = await prisma.empresa.findMany({
    where: { id: { in: empresasDoUsuario }, ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, marcaId: true },
  });

  // Buscar marcas daquelas empresas
  const marcasIds = [...new Set(empresas.map((e) => e.marcaId))];
  const marcas = await prisma.marca.findMany({
    where: { id: { in: marcasIds } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  const empresa = empresas.find((e) => e.id === empresaId);
  if (!empresa) notFound();

  return (
    <div className="flex gap-6">
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r pr-3 md:block">
        {/* A árvore É o filtro: marca mostra todos os CNPJs dela, CNPJ mostra
            só ele. Havia um painel de checkboxes aqui em cima fazendo o mesmo
            papel — dois controles parecidos lado a lado.
            Recolhido por padrão dentro do próprio componente (o resumo já diz
            o que está filtrado) — sem isso a árvore sempre aberta empurrava a
            navegação abaixo pra fora da tela. */}
        <div className="py-2">
          <ListaEmpresas marcas={marcas} empresas={empresas} empresaIdAtiva={empresaId} />
        </div>

        <RHEmpresaNav empresaId={empresaId} />
      </aside>

      <div className="min-w-0 flex-1 py-4">
        {/* No celular o menu vira uma barra rolável no topo: o RH trabalha no
            computador, mas a tela pequena não pode ficar sem navegação. */}
        <div className="mb-4 md:hidden space-y-2">
          <div className="px-4">
            <ListaEmpresas marcas={marcas} empresas={empresas} empresaIdAtiva={empresaId} />
          </div>
          <div className="mt-2 overflow-x-auto">
            <RHEmpresaNav empresaId={empresaId} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
