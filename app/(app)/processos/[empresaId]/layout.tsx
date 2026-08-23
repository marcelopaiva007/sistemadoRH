import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { corDeContrasteDaMarca } from "@/lib/marca-cor";

/**
 * Casca do módulo Processos & Ativos dentro de um CNPJ.
 *
 * Sem menu lateral por enquanto, e isso é deliberado: o módulo tem UMA tela
 * hoje (a visão geral). Um menu com cinco itens que levam a página inexistente
 * promete o que não existe — e é o primeiro passo do fracasso clássico de
 * implantação de GED, que é entregar a estrutura antes do conteúdo. A lateral
 * entra junto com a primeira área de verdade, no mesmo formato do RH
 * (`app/(app)/rh/[empresaId]/rh-empresa-nav.tsx`).
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
    select: { id: true, ativo: true, marca: { select: { id: true, corPrimaria: true } } },
  });
  if (!empresa || !empresa.ativo) notFound();

  const estiloCor = corDeContrasteDaMarca(empresa.marca.corPrimaria);

  return (
    <div className="py-2" style={estiloCor}>
      {children}
    </div>
  );
}
