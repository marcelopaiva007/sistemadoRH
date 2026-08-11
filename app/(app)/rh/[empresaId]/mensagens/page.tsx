import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { MensagensView } from "./mensagens-view";

// Mensagens que os colaboradores mandam pelo portal (Fale com o RH). A
// resposta escrita aqui aparece de volta no portal da pessoa.
//
// ESCOPO: `empresasVisiveis` + filtro `?empresas=` da barra lateral — mesmo
// padrão do resto do módulo RH (ver aprovacoes/page.tsx).
export default async function MensagensPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopoIds = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const mensagens = await prisma.mensagemPortal.findMany({
    where: { empresaId: { in: escopoIds } },
    // Abertas primeiro (respondidaEm nulo), depois as mais recentes.
    orderBy: [{ respondidaEm: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      mensagem: true,
      resposta: true,
      respondidaEm: true,
      respondidaPorNome: true,
      createdAt: true,
      colaborador: {
        select: {
          nome: true,
          setor: { select: { nome: true } },
          empresa: { select: { nome: true } },
        },
      },
    },
  });

  return (
    <MensagensView
      empresaId={empresaId}
      mensagens={mensagens.map((m) => ({
        id: m.id,
        mensagem: m.mensagem,
        resposta: m.resposta,
        respondidaEm: m.respondidaEm,
        respondidaPorNome: m.respondidaPorNome,
        createdAt: m.createdAt,
        colaboradorNome: m.colaborador.nome,
        setor: m.colaborador.setor.nome,
        empresa: m.colaborador.empresa.nome,
      }))}
    />
  );
}
