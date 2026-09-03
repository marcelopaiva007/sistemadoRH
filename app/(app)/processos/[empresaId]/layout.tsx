import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { ProcessosNav } from "./processos-nav";

/**
 * Casca do módulo Processos & Ativos dentro de um CNPJ.
 *
 * A lateral só lista o que EXISTE — hoje, Pendências e as três telas de Frota.
 * Contratos, patrimônio, documentos e processos estão no roadmap e ficam fora
 * do menu até terem tela: item que leva a página vazia é o começo clássico do
 * fracasso de implantação de GED, que promete estrutura antes de conteúdo.
 *
 * Mesmo formato do RH (`app/(app)/rh/[empresaId]/rh-empresa-nav.tsx`), inclusive
 * a barra rolável no lugar da lateral no celular.
 *
 * A cor da marca sobrescreve `--primary` neste subtree pela MESMA regra do
 * módulo de RH: quem está na LM Telecom vê o sistema na cor da LM Telecom,
 * independentemente do módulo em que estiver.
 */
export default async function ProcessosEmpresaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireProcessosEmpresa(empresaId);

  // Uma consulta só. Havia um `empresasVisiveis()` aqui que não decidia nada:
  // para ADMIN/DIRETORIA ele é um `SELECT` da tabela inteira de empresas, e o
  // único caso que ele poderia barrar — empresa inativa — já é barrado pelo
  // `ativo` logo abaixo. Duas idas ao banco por carregamento de tela, para
  // responder a mesma pergunta uma vez.
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      ativo: true,
      marca: { select: { id: true, nome: true, logoUrl: true } },
    },
  });
  if (!empresa || !empresa.ativo) notFound();

  // Cor por marca saiu na v1.154.0 (Modernist, uma cor só) — ver o layout do RH.
  return (
    <div className="flex gap-6">
      <aside className="sticky top-[94px] hidden h-[calc(100vh-94px)] w-52 shrink-0 overflow-y-auto border-r pr-3 pt-2 md:block">
        {/* Mesma regra da lateral do RH: a logo da marca em tamanho visível
            no topo da navegação (pedido do dono, 26/08/2026). */}
        {empresa.marca.logoUrl && (
          <div className="mb-2 border-b pb-3">
            <img
              src={empresa.marca.logoUrl}
              alt={empresa.marca.nome}
              className="max-h-12 w-auto max-w-40 object-contain"
            />
          </div>
        )}
        <ProcessosNav empresaId={empresaId} />
      </aside>

      <div className="min-w-0 flex-1 py-2">
        <div className="mb-4 overflow-x-auto md:hidden">
          <ProcessosNav empresaId={empresaId} />
        </div>
        {children}
      </div>
    </div>
  );
}
