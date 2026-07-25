import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ETAPAS_EM_ANDAMENTO } from "@/lib/constants-ats";
import { VagasView } from "./vagas-view";

// Vagas abertas da empresa e o andamento de cada funil. O detalhe de cada
// vaga (quadro de candidatos por etapa) fica em /vagas/<id>.
export default async function VagasPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [vagas, setores, posicoes] = await Promise.all([
    prisma.vaga.findMany({
      where: { empresaId },
      orderBy: [{ status: "asc" }, { abertaEm: "desc" }],
      select: {
        id: true,
        titulo: true,
        status: true,
        publicada: true,
        slug: true,
        quantidade: true,
        abertaEm: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
        candidaturas: { select: { etapa: true } },
      },
    }),
    prisma.setor.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.posicao.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const emAndamento = new Set<string>(ETAPAS_EM_ANDAMENTO);
  const lista = vagas.map((v) => ({
    id: v.id,
    titulo: v.titulo,
    status: v.status,
    publicada: v.publicada,
    slug: v.slug,
    quantidade: v.quantidade,
    abertaEm: v.abertaEm,
    setorNome: v.setor?.nome ?? null,
    posicaoNome: v.posicao?.nome ?? null,
    totalCandidatos: v.candidaturas.length,
    emAndamento: v.candidaturas.filter((c) => emAndamento.has(c.etapa)).length,
    contratados: v.candidaturas.filter((c) => c.etapa === "CONTRATADO").length,
  }));

  return <VagasView empresaId={empresaId} vagas={lista} setores={setores} posicoes={posicoes} />;
}
