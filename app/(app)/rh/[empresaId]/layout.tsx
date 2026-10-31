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
  //
  // `top-[78px]` = barra de topo (52px + 2px de borda) + o `p-6` do <main>.
  // É onde a lateral já nasce, então ela não se mexe ao rolar e a altura
  // `100vh-78px` termina rente ao fim da janela — o rodapé dela (o guia da
  // tela) fica sempre à vista. Com `top-[52px]` o fim ficava 26px abaixo da
  // dobra até a página rolar, e em tela curta não rolava nunca.
  return (
    <div className="flex gap-6">
      <aside className="sticky top-[78px] hidden h-[calc(100vh-78px)] w-[216px] shrink-0 flex-col overflow-y-auto border-r-2 border-border pr-4 pt-3 md:flex">
        <RHEmpresaNav empresaId={empresaId} />
        {/* O guia da tela no rodapé da lateral (era uma pílula fixa no canto
            direito, que cobria a coluna de ações das tabelas — ver
            components/guia-tela.tsx). Uma vez aqui e vale para as ~40 telas
            do módulo: o guia se resolve pela rota (lib/guias.ts::guiaDaRota),
            e tela sem roteiro não mostra nada, nem a moldura. */}
        <GuiaTela empresaId={empresaId} lugar="lateral" />
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

      {/* No celular a lateral some, e o guia volta a ser a pílula do canto.
          `md:hidden` no pai esconde o botão fixo junto (display: none vale
          para descendente com position: fixed). */}
      <div className="md:hidden">
        <GuiaTela empresaId={empresaId} />
      </div>
    </div>
  );
}
