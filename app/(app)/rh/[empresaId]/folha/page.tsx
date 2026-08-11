import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { FolhaView } from "./folha-view";

// Competências mensais de eventos variáveis. Cada uma abre numa página
// própria, onde se lança e se confere antes de mandar para a contabilidade.
export default async function FolhaPage({
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
  // Mesma regra de `filtro-empresas.tsx::useFiltroEmpresas`: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — id digitado à mão não
  // vira acesso.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  // CompetenciaFolha só tem `empresaId` (sem relação `empresa` no schema —
  // diferente de Colaborador). O nome do CNPJ vem de uma segunda consulta e é
  // costurado abaixo por empresaId.
  const [competencias, empresas] = await Promise.all([
    prisma.competenciaFolha.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: { referencia: "desc" },
      select: {
        id: true,
        referencia: true,
        status: true,
        fechadaEm: true,
        fechadaPorNome: true,
        empresaId: true,
        _count: { select: { eventos: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: escopo } },
      select: { id: true, nome: true },
    }),
  ]);

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const competenciasComEmpresa = competencias.map((c) => ({
    ...c,
    empresa: { nome: nomeDaEmpresa.get(c.empresaId) ?? "—" },
  }));

  // `empresaId` aqui é sempre o da URL, não o do escopo — o formulário "Abrir
  // competência" cria no CNPJ em que a pessoa está, nunca em outro.
  return <FolhaView empresaId={empresaId} competencias={competenciasComEmpresa} />;
}
