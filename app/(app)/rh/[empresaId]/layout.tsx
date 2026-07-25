import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { RHEmpresaNav } from "./rh-empresa-nav";
import { SeletorEmpresa } from "./seletor-empresa";

export default async function RHEmpresaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) notFound();

  // ADMIN e DIRETORIA transitam entre as empresas do grupo; RH_MANAGER está
  // preso à sua — para ele o seletor vira só o nome (ver SeletorEmpresa).
  const empresas =
    usuario?.role === "ADMIN" || usuario?.role === "DIRETORIA"
      ? await prisma.empresa.findMany({
          where: { ativo: true },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true },
        })
      : [{ id: empresa.id, nome: empresa.nome }];

  return (
    <div className="flex gap-6">
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r pr-3 md:block">
        <div className="py-4">
          <SeletorEmpresa empresaId={empresaId} empresas={empresas} />
        </div>
        <RHEmpresaNav empresaId={empresaId} />
      </aside>

      <div className="min-w-0 flex-1 py-4">
        {/* No celular o menu vira uma barra rolável no topo: o RH trabalha no
            computador, mas a tela pequena não pode ficar sem navegação. */}
        <div className="mb-4 md:hidden">
          <SeletorEmpresa empresaId={empresaId} empresas={empresas} />
          <div className="mt-2 overflow-x-auto">
            <RHEmpresaNav empresaId={empresaId} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
