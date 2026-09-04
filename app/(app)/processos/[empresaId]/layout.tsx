import { notFound, redirect } from "next/navigation";
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
    select: { id: true, ativo: true },
  });
  if (!empresa) notFound();
  // Inativa: volta para a porta do módulo, que escolhe o primeiro CNPJ ATIVO
  // de novo — e não 404. Existe porque a barra de topo (v1.168.0) entra em
  // `/processos/<primeiro CNPJ>` com a lista que o layout montou na ÚLTIMA
  // renderização: se outra pessoa desativou esse CNPJ nesse meio-tempo, o
  // clique chegaria aqui com um id que era válido e deixou de ser. Id
  // inexistente continua 404: isso é URL errada, não lista velha.
  if (!empresa.ativo) redirect("/processos");

  // Cor por marca e logo na lateral saíram (v1.154.0 / v1.155.0) — ver o
  // layout do RH: a marca vive no seletor da barra de topo.
  return (
    <div className="flex gap-6">
      <aside className="sticky top-[52px] hidden h-[calc(100vh-52px)] w-[216px] shrink-0 overflow-y-auto border-r-2 border-border pr-4 pt-3 md:block">
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
