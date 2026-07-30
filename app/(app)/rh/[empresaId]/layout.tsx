import { notFound } from "next/navigation";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { RHEmpresaNav } from "./rh-empresa-nav";
import { FiltroEmpresas } from "./filtro-empresas";
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
        <div className="py-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground px-2">Filtrar por marca/CNPJ</p>
          <FiltroEmpresas
            marcas={marcas}
            empresas={empresas}
            usuarioEmpresas={empresasDoUsuario}
          />
        </div>

        {/* Lista de empresas agrupadas por marca */}
        <div className="border-t py-2">
          <p className="text-xs font-medium text-muted-foreground px-2 py-2">Marcas e CNPJs</p>
          <ListaEmpresas marcas={marcas} empresas={empresas} empresaIdAtiva={empresaId} />
        </div>

        <RHEmpresaNav empresaId={empresaId} />
      </aside>

      <div className="min-w-0 flex-1 py-4">
        {/* No celular o menu vira uma barra rolável no topo: o RH trabalha no
            computador, mas a tela pequena não pode ficar sem navegação. */}
        <div className="mb-4 md:hidden space-y-2">
          <p className="text-xs font-medium text-muted-foreground px-4">Filtrar por marca/CNPJ</p>
          <div className="px-4">
            <FiltroEmpresas
              marcas={marcas}
              empresas={empresas}
              usuarioEmpresas={empresasDoUsuario}
            />
          </div>
          <div className="border-t mt-2 px-4">
            <p className="text-xs font-medium text-muted-foreground py-2">Marcas e CNPJs</p>
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
