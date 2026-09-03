import { notFound } from "next/navigation";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { RHEmpresaNav } from "./rh-empresa-nav";
import { GuiaTela } from "@/components/guia-tela";

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
    select: { id: true },
  });
  if (!empresas.some((e) => e.id === empresaId)) notFound();

  // Aqui já morou a cor da marca pintando o --primary (até a v1.153.2) e a
  // logo da marca no topo da lateral (26/08 → v1.154.0, pedido do dono). As
  // duas saíram com o visual Modernist: a marca é identificada pelo NOME e
  // pela LOGO no seletor de marca/CNPJ da barra de topo — em toda tela, não
  // só dentro do CNPJ — e a lateral fica só com a navegação, que é o que se
  // varre com o olho. A barra de topo tem 52px desde a v1.155.0 (era 94).
  return (
    <div className="flex gap-6">
      <aside className="sticky top-[52px] hidden h-[calc(100vh-52px)] w-[216px] shrink-0 overflow-y-auto border-r-2 border-border pr-4 pt-3 md:block">
        <RHEmpresaNav empresaId={empresaId} />
      </aside>

      <div className="min-w-0 flex-1 py-4">
        {/* No celular o menu vira uma barra rolável no topo: o RH trabalha no
            computador, mas a tela pequena não pode ficar sem navegação. Trocar
            de marca/CNPJ é o seletor da barra de topo (components/
            seletor-marca-empresa.tsx) — não duplicado aqui. */}
        <div className="mb-4 overflow-x-auto md:hidden">
          <RHEmpresaNav empresaId={empresaId} />
        </div>
        {children}
      </div>

      {/* Uma vez aqui e vale para as ~40 telas do módulo: o guia se resolve pela
          rota (lib/guias.ts::guiaDaRota). Tela sem roteiro não mostra botão
          nenhum, então plugar aqui não obriga a escrever guia para tudo de uma
          vez — e tela nova ganha o guia só escrevendo o roteiro. */}
      <GuiaTela empresaId={empresaId} />
    </div>
  );
}
