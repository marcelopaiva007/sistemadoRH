import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { calcularFerias } from "@/lib/ferias";
import { PortalSemSessao } from "./sem-sessao";
import { ConfirmarCpf } from "./confirmar-cpf";
import { PortalInicio } from "./portal-inicio";

// Portal do colaborador. Três estados possíveis, nessa ordem:
//   1. sem sessão válida -> instrui a pedir /portal ao bot;
//   2. sessão válida mas primeira entrada -> pede a confirmação do CPF;
//   3. verificado -> mostra dados, férias e documentos.
export default async function PortalPage() {
  const sessao = await lerSessaoPortal();
  if (!sessao) return <PortalSemSessao />;

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: {
      id: true,
      nome: true,
      cpf: true,
      email: true,
      telefone: true,
      dataAdmissao: true,
      tipoContrato: true,
      matricula: true,
      cidade: true,
      uf: true,
      emergenciaNome: true,
      emergenciaTelefone: true,
      emergenciaParentesco: true,
      estadoCivil: true,
      escolaridade: true,
      nomeMae: true,
      nomePai: true,
      nacionalidade: true,
      naturalidade: true,
      cep: true,
      logradouro: true,
      numeroEndereco: true,
      complemento: true,
      bairro: true,
      rg: true,
      rgOrgaoEmissor: true,
      rgUf: true,
      pis: true,
      ctpsNumero: true,
      ctpsSerie: true,
      ctpsUf: true,
      tituloEleitor: true,
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
    },
  });
  if (!colaborador) return <PortalSemSessao />;

  if (!sessao.verificado) {
    return <ConfirmarCpf primeiroNome={colaborador.nome.split(" ")[0]} />;
  }

  const [ferias, documentos, ausencias, avaliacoes] = await Promise.all([
    prisma.solicitacaoFerias.findMany({
      where: { colaboradorId: colaborador.id },
      orderBy: { dataInicio: "desc" },
      select: {
        id: true,
        periodoAquisitivoInicio: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        diasAbono: true,
        status: true,
      },
    }),
    prisma.documentoColaborador.findMany({
      where: { colaboradorId: colaborador.id, arquivoId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tipo: true,
        descricao: true,
        validoAte: true,
        origem: true,
        conferidoEm: true,
        arquivo: { select: { id: true, nome: true, tamanhoBytes: true } },
      },
    }),
    prisma.ausencia.findMany({
      where: { colaboradorId: colaborador.id },
      orderBy: { dataInicio: "desc" },
      take: 10,
      select: { id: true, tipo: true, dataInicio: true, dataFim: true, dias: true, status: true },
    }),
    // O que ESTA pessoa tem para responder: a própria autoavaliação e, se for
    // gestor (ou tiver sido escolhida como par/subordinado), as dos outros.
    // Filtra por `avaliadorId` — nunca por colaboradorId, que traria de volta o
    // que o chefe escreveu sobre ela.
    prisma.avaliacaoDesempenho.findMany({
      where: { avaliadorId: colaborador.id, ciclo: { encerrado: false } },
      // Ordem de exibição é decidida na tela (pendente, depois a própria, depois
      // por nome); aqui só um critério estável para a lista não dançar.
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        colaboradorId: true,
        tipoAvaliador: true,
        status: true,
        potencial: true,
        pontosFortes: true,
        pontosDesenvolvimento: true,
        comentarios: true,
        colaborador: { select: { nome: true } },
        ciclo: { select: { nome: true, dataFim: true } },
        notas: { select: { competencia: true, nota: true } },
      },
    }),
  ]);

  const resumoFerias = colaborador.dataAdmissao
    ? calcularFerias(
        colaborador.dataAdmissao,
        ferias.filter((f) => f.status === "APROVADA" || f.status === "PENDENTE"),
      )
    : null;

  return (
    <PortalInicio
      colaborador={colaborador}
      ferias={ferias}
      documentos={documentos}
      ausencias={ausencias}
      resumoFerias={resumoFerias}
      avaliacoes={avaliacoes.map((a) => ({
        id: a.id,
        tipoAvaliador: a.tipoAvaliador,
        status: a.status,
        potencial: a.potencial,
        pontosFortes: a.pontosFortes,
        pontosDesenvolvimento: a.pontosDesenvolvimento,
        comentarios: a.comentarios,
        avaliado: a.colaborador.nome,
        souEu: a.colaboradorId === colaborador.id,
        ciclo: a.ciclo,
        notas: a.notas,
      }))}
    />
  );
}
