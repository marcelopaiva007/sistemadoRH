import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { SetoresTable } from "./setores-table";

export default async function SetoresPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [setores, empresas] = await Promise.all([
    prisma.setor.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
      include: {
        // Só ATIVOS contam na tela (ordem do dono, 27/08/2026): desligado é
        // história, não lotação. A elegibilidade de "remover sem funcionários"
        // continua olhando o vínculo TOTAL (vinculadosTotais abaixo) — setor
        // com desligados históricos não pode ser oferecido para exclusão.
        _count: { select: { colaboradores: { where: { ativo: true } }, vagas: true, metas: true } },
        empresa: { select: { id: true, nome: true, marcaId: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true, marcaId: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const vinculosPorSetor = await prisma.colaborador.groupBy({
    by: ["setorId"],
    where: { empresaId: { in: empresasDoUsuario } },
    _count: { _all: true },
  });
  const totalPorSetor = new Map(vinculosPorSetor.map((v) => [v.setorId, v._count._all]));

  return (
    <SetoresTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      setores={setores.map((s) => ({ ...s, vinculadosTotais: totalPorSetor.get(s.id) ?? 0 }))}
      empresas={empresas}
    />
  );
}
