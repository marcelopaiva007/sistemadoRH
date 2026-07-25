import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { calcularFerias } from "@/lib/ferias";
import { conformidadeDoColaborador, situacaoDoExame } from "@/lib/conformidade";
import { ColaboradorDetalhe } from "./colaborador-detalhe";

// Ficha completa do colaborador: dados cadastrais, dependentes, dossiê digital,
// férias e ausências. Sempre escopada à empresa da rota — o id do colaborador
// sozinho nunca abre a ficha de outra empresa.
export default async function ColaboradorPage({
  params,
}: {
  params: Promise<{ empresaId: string; colaboradorId: string }>;
}) {
  const { empresaId, colaboradorId } = await params;
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    include: { setor: true, posicao: true },
  });
  if (!colaborador) notFound();

  const [dependentes, documentos, ferias, ausencias, requisitos, certificados, exames] = await Promise.all([
    prisma.dependente.findMany({ where: { colaboradorId }, orderBy: { nome: "asc" } }),
    prisma.documentoColaborador.findMany({
      where: { colaboradorId },
      orderBy: [{ createdAt: "desc" }],
      // `conteudo` fica fora de propósito: é o blob do anexo e nunca deve
      // trafegar numa listagem.
      select: {
        id: true,
        tipo: true,
        descricao: true,
        emitidoEm: true,
        validoAte: true,
        observacoes: true,
        criadoPorNome: true,
        createdAt: true,
        arquivo: { select: { id: true, nome: true, mimeType: true, tamanhoBytes: true } },
      },
    }),
    prisma.solicitacaoFerias.findMany({
      where: { colaboradorId },
      orderBy: [{ dataInicio: "desc" }],
    }),
    prisma.ausencia.findMany({
      where: { colaboradorId },
      orderBy: [{ dataInicio: "desc" }],
      select: {
        id: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        abonada: true,
        cid: true,
        profissional: true,
        registroProfissional: true,
        observacoes: true,
        status: true,
        motivoDecisao: true,
        decididoPorNome: true,
        registradoPorNome: true,
        arquivo: { select: { id: true, nome: true, mimeType: true, tamanhoBytes: true } },
      },
    }),
    prisma.requisitoNR.findMany({ where: { posicaoId: colaborador.posicaoId }, orderBy: { norma: "asc" } }),
    prisma.certificadoNR.findMany({
      where: { colaboradorId },
      orderBy: [{ realizadoEm: "desc" }],
      select: {
        id: true,
        norma: true,
        realizadoEm: true,
        validoAte: true,
        cargaHoraria: true,
        instrutor: true,
        arquivo: { select: { id: true, nome: true } },
      },
    }),
    prisma.exameOcupacional.findMany({
      where: { colaboradorId },
      orderBy: [{ realizadoEm: "desc" }],
      select: {
        id: true,
        tipo: true,
        realizadoEm: true,
        validoAte: true,
        resultado: true,
        restricoes: true,
        medico: true,
        clinica: true,
        arquivo: { select: { id: true, nome: true } },
      },
    }),
  ]);

  const resumoFerias = colaborador.dataAdmissao
    ? calcularFerias(
        colaborador.dataAdmissao,
        ferias.filter((f) => f.status === "APROVADA" || f.status === "PENDENTE"),
      )
    : null;

  const conformidade = conformidadeDoColaborador(requisitos, certificados);
  const situacaoExame = situacaoDoExame(exames);

  return (
    <div className="space-y-4">
      <Link
        href={`/rh/${empresaId}/colaboradores`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Colaboradores
      </Link>
      <ColaboradorDetalhe
        empresaId={empresaId}
        colaborador={colaborador}
        dependentes={dependentes}
        documentos={documentos}
        ferias={ferias}
        ausencias={ausencias}
        resumoFerias={resumoFerias}
        conformidade={conformidade}
        certificados={certificados}
        exames={exames}
        situacaoExame={situacaoExame}
      />
    </div>
  );
}
