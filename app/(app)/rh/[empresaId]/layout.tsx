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
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, marcaId: true },
  });

  // Buscar marcas daquelas empresas
  const marcasIds = [...new Set(empresas.map((e) => e.marcaId))];
  const marcas = await prisma.marca.findMany({
    where: { id: { in: marcasIds } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, logoUrl: true },
  });

  const empresa = empresas.find((e) => e.id === empresaId);
  if (!empresa) notFound();

  // A cor da marca (Marca.corPrimaria) pintava o --primary deste subtree da
  // v1.4x à v1.153.2. Saiu na v1.154.0 (visual Modernist, uma cor só): a
  // marca segue identificada pelo nome no seletor do topo e pela logo abaixo.
  const marcaAtiva = marcas.find((m) => m.id === empresa.marcaId);

  return (
    <div className="flex gap-6">
      <aside className="sticky top-[94px] hidden h-[calc(100vh-94px)] w-56 shrink-0 overflow-y-auto border-r pr-3 pt-2 md:block">
        {/* A logo da marca em lugar visível — pedido do dono (26/08/2026):
            o selo do topo diz "onde estou" de relance, mas é pequeno; aqui a
            marca aparece em tamanho de verdade, em toda tela da empresa.
            Marca sem logo não reserva espaço nenhum. */}
        {marcaAtiva?.logoUrl && (
          <div className="mb-2 border-b pb-3">
            <img
              src={marcaAtiva.logoUrl}
              alt={marcaAtiva.nome}
              className="max-h-12 w-auto max-w-44 object-contain"
            />
          </div>
        )}
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
