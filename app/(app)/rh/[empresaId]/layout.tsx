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

  // Este layout roda a CADA navegação de menu, então o custo dele entra em
  // toda troca de tela. Por isso é uma query só: ADMIN/DIRETORIA já recebem a
  // lista inteira (que o seletor precisa) e a empresa atual sai de dentro
  // dela, em vez de um findUnique extra.
  const podeTrocar = usuario?.role === "ADMIN" || usuario?.role === "DIRETORIA";
  const empresas = await prisma.empresa.findMany({
    where: podeTrocar ? { ativo: true } : { id: empresaId },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  const empresa = empresas.find((e) => e.id === empresaId);
  if (!empresa) notFound();

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
