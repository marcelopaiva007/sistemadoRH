import { notFound } from "next/navigation";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { RHEmpresaNav } from "./rh-empresa-nav";
import { GuiaTela } from "@/components/guia-tela";

/**
 * Branco em cima da cor da marca, ou quase-preto se a cor for clara demais
 * pro branco ler bem (luminância relativa > 0.6, limiar comum de contraste).
 * Sem isto, uma marca escolhendo amarelo ou branco deixaria o texto dos
 * botões ilegível — validado só na hora de aplicar, não impede o cadastro.
 */
function corDeContraste(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.6 ? "#0a0a0a" : "#ffffff";
}

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
    select: { id: true, nome: true, corPrimaria: true },
  });

  const empresa = empresas.find((e) => e.id === empresaId);
  if (!empresa) notFound();

  // Cor da marca sobrescreve --primary só neste subtree (o resto do app —
  // topbar, telas fora de /rh/<empresa> — fica no azul padrão do tema).
  // Sem Marca.corPrimaria, `estiloCor` fica undefined e nada muda.
  const marcaAtiva = marcas.find((m) => m.id === empresa.marcaId);
  const estiloCor = marcaAtiva?.corPrimaria
    ? ({
        "--primary": marcaAtiva.corPrimaria,
        "--primary-foreground": corDeContraste(marcaAtiva.corPrimaria),
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="flex gap-6" style={estiloCor}>
      <aside className="sticky top-[94px] hidden h-[calc(100vh-94px)] w-56 shrink-0 overflow-y-auto border-r pr-3 pt-2 md:block">
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
