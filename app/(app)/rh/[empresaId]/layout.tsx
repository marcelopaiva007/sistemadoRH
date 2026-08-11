import { notFound } from "next/navigation";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { RHEmpresaNav } from "./rh-empresa-nav";
import { ListaEmpresas } from "./lista-empresas";

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
