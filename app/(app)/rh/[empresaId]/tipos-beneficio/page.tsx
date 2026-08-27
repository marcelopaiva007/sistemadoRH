import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { TiposBeneficioTable } from "./tipos-beneficio-table";

export default async function TiposBeneficioPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [tipos, empresas, concessoes] = await Promise.all([
    prisma.tipoBeneficio.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
      include: { empresa: { select: { id: true, nome: true } } },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    // "Em uso" é por NOME dentro da mesma empresa (BeneficioColaborador.tipo é
    // string livre — ver deleteTipoBeneficio). A contagem alimenta a tela
    // (quantas concessões usam cada tipo) e a elegibilidade de "remover sem uso".
    prisma.beneficioColaborador.groupBy({
      by: ["empresaId", "tipo"],
      where: { empresaId: { in: empresasDoUsuario } },
      _count: { _all: true },
    }),
  ]);

  const concessoesPorTipo = new Map(concessoes.map((c) => [`${c.empresaId}:${c.tipo}`, c._count._all]));
  const tiposComContagem = tipos.map((t) => ({
    ...t,
    concessoes: concessoesPorTipo.get(`${t.empresaId}:${t.nome}`) ?? 0,
  }));

  return (
    <TiposBeneficioTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      tipos={tiposComContagem}
      empresas={empresas}
    />
  );
}
