import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { conformidadeDoColaborador, situacaoDoExame } from "@/lib/conformidade";
import { ConformidadeView } from "./conformidade-view";

// Painel de conformidade SST: a matriz de NRs por função (o que se exige) e o
// retrato de quem está regular, vencendo ou irregular (o que se comprovou).
// Tudo calculado na hora a partir de RequisitoNR + CertificadoNR + ExameOcupacional
// — não existe coluna "situação" persistida.
export default async function ConformidadePage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [posicoes, colaboradores] = await Promise.all([
    prisma.posicao.findMany({
      where: { empresaId, ativo: true },
      orderBy: { nome: "asc" },
      include: { requisitosNR: { orderBy: { norma: "asc" } } },
    }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        posicaoId: true,
        posicao: { select: { nome: true } },
        setor: { select: { nome: true } },
        certificados: { select: { norma: true, realizadoEm: true, validoAte: true } },
        exames: {
          select: { tipo: true, realizadoEm: true, validoAte: true, resultado: true, restricoes: true },
        },
      },
    }),
  ]);

  const requisitosPorPosicao = new Map(posicoes.map((p) => [p.id, p.requisitosNR]));

  const linhas = colaboradores.map((c) => {
    const requisitos = requisitosPorPosicao.get(c.posicaoId) ?? [];
    const conformidade = conformidadeDoColaborador(requisitos, c.certificados);
    const exame = situacaoDoExame(c.exames);
    return {
      id: c.id,
      nome: c.nome,
      posicaoNome: c.posicao.nome,
      setorNome: c.setor.nome,
      conformidade,
      situacaoExame: exame,
    };
  });

  const totalComRequisito = linhas.filter((l) => l.conformidade.itens.length > 0);
  const regularesNR = totalComRequisito.filter((l) => l.conformidade.regular).length;
  const totalComExameExigivel = linhas.length;
  const examesEmDia = linhas.filter((l) => l.situacaoExame.situacao === "EM_DIA" || l.situacaoExame.situacao === "VENCENDO").length;

  return (
    <ConformidadeView
      empresaId={empresaId}
      posicoes={posicoes}
      linhas={linhas}
      resumo={{
        totalColaboradores: colaboradores.length,
        totalComRequisito: totalComRequisito.length,
        regularesNR,
        totalComExameExigivel,
        examesEmDia,
      }}
    />
  );
}
