import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { IntegracoesView } from "./integracoes-view";

// Visão consolidada das trilhas de integração em aberto. O RH abre daqui
// para saber o que está travando a entrada de quem acabou de chegar — sem
// ter que abrir ficha por ficha.
export default async function IntegracoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const itens = await prisma.checklistIntegracao.findMany({
    where: { empresaId, colaborador: { ativo: true } },
    orderBy: [{ concluido: "asc" }, { prazo: "asc" }],
    select: {
      id: true,
      item: true,
      descricao: true,
      responsavel: true,
      prazo: true,
      concluido: true,
      colaboradorId: true,
      colaborador: { select: { nome: true, dataAdmissao: true, setor: { select: { nome: true } } } },
    },
  });

  // Agrupa por pessoa: o RH pensa em "a integração do Fulano", não em itens
  // soltos espalhados por várias pessoas.
  const porPessoa = new Map<
    string,
    {
      colaboradorId: string;
      nome: string;
      setorNome: string;
      dataAdmissao: Date | null;
      total: number;
      concluidos: number;
      atrasados: number;
      pendentes: { id: string; item: string; descricao: string | null; responsavel: string | null; prazo: Date | null }[];
    }
  >();

  const hoje = new Date();
  for (const i of itens) {
    const atual = porPessoa.get(i.colaboradorId) ?? {
      colaboradorId: i.colaboradorId,
      nome: i.colaborador.nome,
      setorNome: i.colaborador.setor.nome,
      dataAdmissao: i.colaborador.dataAdmissao,
      total: 0,
      concluidos: 0,
      atrasados: 0,
      pendentes: [],
    };
    atual.total += 1;
    if (i.concluido) {
      atual.concluidos += 1;
    } else {
      atual.pendentes.push({
        id: i.id,
        item: i.item,
        descricao: i.descricao,
        responsavel: i.responsavel,
        prazo: i.prazo,
      });
      if (i.prazo && i.prazo < hoje) atual.atrasados += 1;
    }
    porPessoa.set(i.colaboradorId, atual);
  }

  // Quem tem atraso primeiro, depois quem tem mais pendência.
  const lista = [...porPessoa.values()]
    .filter((p) => p.concluidos < p.total)
    .sort((a, b) => b.atrasados - a.atrasados || b.pendentes.length - a.pendentes.length);

  const concluidas = [...porPessoa.values()].filter((p) => p.concluidos === p.total).length;

  return <IntegracoesView empresaId={empresaId} emAberto={lista} concluidas={concluidas} />;
}
