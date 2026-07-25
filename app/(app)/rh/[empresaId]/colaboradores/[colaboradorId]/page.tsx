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
    include: {
      setor: true,
      posicao: true,
      supervisor: { select: { id: true, nome: true } },
      _count: { select: { dependentes: { where: { planoSaude: true } } } },
    },
  });
  if (!colaborador) notFound();

  const [dependentes, documentos, ferias, ausencias, requisitos, certificados, exames, setores, posicoes, candidatosSupervisor, movimentacoes, beneficios, entregasEpi, acidentes, ausenciasElegiveis, checklistDesligamento, entrevistaDesligamento, avaliacoes, metas, pdi] =
    await Promise.all([
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
    prisma.setor.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.posicao.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true, id: { not: colaboradorId } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.movimentacao.findMany({
      where: { colaboradorId },
      orderBy: { dataEfetiva: "desc" },
      select: {
        id: true,
        tipo: true,
        dataEfetiva: true,
        setorAnteriorNome: true,
        setorNovoNome: true,
        posicaoAnteriorNome: true,
        posicaoNovaNome: true,
        supervisorAnteriorNome: true,
        supervisorNovoNome: true,
        motivo: true,
        registradoPorNome: true,
      },
    }),
    prisma.beneficioColaborador.findMany({
      where: { colaboradorId },
      orderBy: [{ dataFim: "asc" }, { dataInicio: "desc" }],
    }),
    prisma.entregaEPI.findMany({
      where: { colaboradorId },
      orderBy: [{ dataEntrega: "desc" }],
      select: {
        id: true,
        tipo: true,
        ca: true,
        fabricante: true,
        quantidade: true,
        dataEntrega: true,
        validoAte: true,
        motivo: true,
        assinado: true,
        arquivo: { select: { id: true, nome: true } },
      },
    }),
    prisma.acidenteTrabalho.findMany({
      where: { colaboradorId },
      orderBy: [{ dataHora: "desc" }],
      select: {
        id: true,
        dataHora: true,
        tipo: true,
        local: true,
        descricao: true,
        parteCorpoAtingida: true,
        houveAfastamento: true,
        catEmitida: true,
        catNumero: true,
        situacao: true,
        arquivo: { select: { id: true, nome: true } },
      },
    }),
    prisma.ausencia.findMany({
      where: { colaboradorId, tipo: "ACIDENTE_TRABALHO", acidente: null },
      orderBy: [{ dataInicio: "desc" }],
      select: { id: true, dataInicio: true, dataFim: true },
    }),
    prisma.checklistDesligamento.findMany({
      where: { colaboradorId },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, item: true, descricao: true, concluido: true, concluidoPorNome: true },
    }),
    prisma.entrevistaDesligamento.findUnique({
      where: { colaboradorId },
      select: {
        dataEntrevista: true,
        motivoReal: true,
        recomendariaEmpresa: true,
        satisfacaoGeral: true,
        pontosPositivos: true,
        pontosMelhoria: true,
        observacoes: true,
      },
    }),
    prisma.avaliacaoDesempenho.findMany({
      where: { colaboradorId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        tipoAvaliador: true,
        avaliadorNome: true,
        notaFinal: true,
        potencial: true,
        pontosFortes: true,
        pontosDesenvolvimento: true,
        comentarios: true,
        status: true,
        concluidaEm: true,
        ciclo: { select: { id: true, nome: true, tipo: true, encerrado: true } },
        notas: { select: { competencia: true, nota: true } },
      },
    }),
    prisma.meta.findMany({
      where: { colaboradorId },
      orderBy: [{ dataFim: "asc" }],
      select: {
        id: true,
        titulo: true,
        descricao: true,
        dataInicio: true,
        dataFim: true,
        progresso: true,
        status: true,
      },
    }),
    prisma.planoDesenvolvimento.findMany({
      where: { colaboradorId },
      orderBy: [{ concluido: "asc" }, { prazo: "asc" }],
      select: {
        id: true,
        titulo: true,
        descricao: true,
        prazo: true,
        concluido: true,
        concluidoPorNome: true,
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
        setores={setores}
        posicoes={posicoes}
        candidatosSupervisor={candidatosSupervisor}
        movimentacoes={movimentacoes}
        beneficios={beneficios}
        dependentesNoPlanoSaude={colaborador._count.dependentes}
        entregasEpi={entregasEpi}
        acidentes={acidentes}
        ausenciasElegiveisAcidente={ausenciasElegiveis}
        checklistDesligamento={checklistDesligamento}
        entrevistaDesligamento={entrevistaDesligamento}
        avaliacoes={avaliacoes}
        metas={metas}
        pdi={pdi}
      />
    </div>
  );
}
