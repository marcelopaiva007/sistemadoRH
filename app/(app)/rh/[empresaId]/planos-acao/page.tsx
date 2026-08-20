import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PlanosAcaoView } from "./planos-acao-view";

// Tela genérica de Plano de Ação (fase 7 do roadmap de pesquisas —
// 02/08/2026): o model já existia (fase 2, PlanoAcao) e o alerta AL09 já lia
// dele, mas não havia UI nenhuma pra criar ou acompanhar um plano — só dava
// pra mexer direto no banco. Fica fora do dashboard do NR-01 de propósito
// (decisão do Marcelo): não depende de pesquisa nenhuma, cobre planos de
// qualquer origem (clima, NR-01, ou nenhuma).
//
// ESCOPO: `empresasVisiveis` + filtro `?empresas=` — mesmo padrão de
// Aprovações/Desligamentos. Até 20/08/2026 a lista era só do CNPJ da rota, e
// o cartão "Plano de ação vencido" da tela de Pendências (que conta a marca e
// carrega `?empresas=` no clique) dizia "5" para uma lista que abria com 1 —
// os planos dos CNPJs irmãos ficavam inalcançáveis a partir do cartão.
export default async function PlanosAcaoPage({
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
  // Mesma regra de filtro-empresas.tsx::useFiltroEmpresas: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — id digitado à mão
  // não vira acesso.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const [planos, setores] = await Promise.all([
    prisma.planoAcao.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: [{ status: "asc" }, { prazo: "asc" }],
      select: {
        id: true,
        titulo: true,
        descricao: true,
        responsavelNome: true,
        prazo: true,
        status: true,
        concluidoEm: true,
        dimensaoCodigo: true,
        setor: { select: { nome: true } },
        pesquisa: { select: { titulo: true } },
      },
    }),
    prisma.setor.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return <PlanosAcaoView empresaId={empresaId} planos={planos} setores={setores} />;
}
