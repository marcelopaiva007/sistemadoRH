import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { montarMeuTime } from "@/lib/meu-time";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import { PortalSemSessao } from "./sem-sessao";
import { ConfirmarCpf } from "./confirmar-cpf";
import { PortalInicio } from "./portal-inicio";
import type { MeuTimePortal } from "./meu-time";

// Portal do colaborador. Três estados possíveis, nessa ordem:
//   1. sem sessão válida -> instrui a pedir /portal ao bot;
//   2. sessão válida mas primeira entrada -> pede a confirmação do CPF;
//   3. verificado -> mostra dados, documentos e o canal Fale com o RH.
//
// Planejamento de férias (saldo, períodos, solicitações) não aparece aqui de
// propósito — é informação restrita à área interna do RH (/rh/[empresaId]/
// ferias), não ao autoatendimento. O colaborador que quiser saber seu saldo
// fala com o RH ou o gestor.
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
      bancoNome: true,
      bancoAgencia: true,
      bancoConta: true,
      bancoTipoConta: true,
      chavePix: true,
      empresaId: true,
      gerente: true,
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
    },
  });
  if (!colaborador) return <PortalSemSessao />;

  if (!sessao.verificado) {
    return <ConfirmarCpf primeiroNome={colaborador.nome.split(" ")[0]} />;
  }

  const [documentos, ausencias, mensagens, avaliacoes] = await Promise.all([
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
    prisma.mensagemPortal.findMany({
      where: { colaboradorId: colaborador.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        mensagem: true,
        resposta: true,
        respondidaEm: true,
        respondidaPorNome: true,
        createdAt: true,
      },
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
        empresaId: true,
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

  // Gerente monta a própria lista de avaliados: precisa de um ciclo aberto na
  // empresa e da lista de quem pode entrar. Para quem não é gerente nada disso
  // é consultado — é a maioria das entradas no portal.
  const [cicloAberto, colegas] = colaborador.gerente
    ? await Promise.all([
        prisma.cicloAvaliacao.findFirst({
          where: { empresaId: colaborador.empresaId, encerrado: false },
          orderBy: { dataInicio: "desc" },
          select: { nome: true, dataFim: true },
        }),
        // Todas as empresas do grupo, não só a dele: aqui a chefia cruza CNPJ
        // (gerente da BR SISTEMAS responde por gente da LM SISTEMAS). São nome,
        // setor e empresa — nada de CPF, salário ou documento.
        prisma.colaborador.findMany({
          where: { ativo: true, id: { not: colaborador.id } },
          orderBy: { nome: "asc" },
          select: {
            id: true,
            nome: true,
            setor: { select: { nome: true } },
            empresa: { select: { nome: true } },
          },
        }),
      ])
    : [null, []];

  // Quem é gerente pode avaliar gente de outra empresa do grupo (a chefia
  // cruza CNPJ) — as competências são por empresa DA PESSOA AVALIADA, então
  // buscamos uma lista por empresaId distinto em vez de assumir a do gerente.
  const empresaIdsDasAvaliacoes = [...new Set(avaliacoes.map((a) => a.empresaId))];
  const competenciasPorEmpresa = new Map(
    await Promise.all(
      empresaIdsDasAvaliacoes.map(
        async (id) => [id, await opcoesDoCatalogo(id, "COMPETENCIA")] as const,
      ),
    ),
  );

  // A porta do gestor para "Meu time": o recorte é quem tem supervisorId
  // apontando para a pessoa logada — o organograma real, não papel de sistema
  // (não existe usuário GESTOR_SETOR, e User não tem vínculo com Colaborador;
  // é por isso que a tela do gestor entra pelo portal). A conta é a MESMA da
  // tela /rh/[empresaId]/time — lib/meu-time.ts — para gestor e RH nunca
  // lerem números diferentes da mesma equipe.
  const subordinados = await prisma.colaborador.findMany({
    where: { supervisorId: colaborador.id, ativo: true },
    orderBy: { nome: "asc" },
    // `select` explícito: nada de salário, CPF ou documento da equipe — o
    // gestor vê sinal de gestão (férias, avaliação, trilha), não ficha.
    select: {
      id: true,
      nome: true,
      empresaId: true,
      dataAdmissao: true,
      tipoContrato: true,
      dataFimContrato: true,
      telegramChatId: true,
      empresa: { select: { nome: true } },
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
      ferias: {
        where: { status: { in: ["APROVADA", "PENDENTE"] } },
        select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
      },
      avaliacoesRecebidas: {
        where: { ciclo: { encerrado: false } },
        select: { status: true },
      },
      _count: { select: { sessoesPortal: true } },
      checklistIntegracao: { select: { item: true, concluido: true, prazo: true } },
    },
  });

  let meuTime: MeuTimePortal | null = null;
  if (subordinados.length > 0) {
    const ciclosAbertos = await prisma.cicloAvaliacao.findMany({
      where: {
        empresaId: { in: [...new Set(subordinados.map((s) => s.empresaId))] },
        encerrado: false,
      },
      select: { empresaId: true },
    });
    const empresasComCiclo = new Set(ciclosAbertos.map((c) => c.empresaId));

    const time = montarMeuTime(
      subordinados.map((s) => ({
        id: s.id,
        nome: s.nome,
        empresaId: s.empresaId,
        empresa: s.empresa.nome,
        setor: s.setor.nome,
        cargo: s.posicao.nome,
        dataAdmissao: s.dataAdmissao,
        tipoContrato: s.tipoContrato,
        dataFimContrato: s.dataFimContrato,
        // Por construção do recorte, todo mundo aqui tem líder: a pessoa logada.
        semLider: false,
        // Presença de salário e de CPF é assunto do RH/DP, não do gestor — os
        // campos nem são buscados para o portal. A lacuna que sobra é a que o
        // gestor consegue empurrar: data de admissão, setor/cargo e o Telegram
        // que destrava o acesso da pessoa ao portal.
        semSalario: false,
        semCpf: false,
        semTelegram: !s.telegramChatId,
        nuncaAcessouPortal: s._count.sessoesPortal === 0,
        ferias: s.ferias,
        temCicloAberto: empresasComCiclo.has(s.empresaId),
        avaliacoesCicloAberto: s.avaliacoesRecebidas,
        trilha: s.checklistIntegracao,
      })),
    );

    // Campo a campo, e não o objeto da lib inteiro: o que atravessa a
    // fronteira servidor → portal fica escrito. empresaId (id interno) e o
    // resumo agregado ficam para trás — o gestor não precisa deles.
    meuTime = {
      linhas: time.linhas.map((l) => ({
        id: l.id,
        nome: l.nome,
        setor: l.setor,
        cargo: l.cargo,
        empresa: l.empresa,
        tempoDeCasa: l.tempoDeCasa,
        diasDeCasa: l.diasDeCasa,
        recemChegado: l.recemChegado,
        ferias: l.ferias,
        avaliacao: l.avaliacao,
        lacunas: l.lacunas,
        nuncaAcessouPortal: l.nuncaAcessouPortal,
        trilha: l.trilha,
        janelaContrato: l.janelaContrato,
      })),
      avisos: time.avisos,
    };
  }

  return (
    <PortalInicio
      colaborador={colaborador}
      documentos={documentos}
      ausencias={ausencias}
      mensagens={mensagens}
      meuTime={meuTime}
      equipe={
        colaborador.gerente
          ? {
              cicloAberto: cicloAberto?.nome ?? null,
              // Quem já está na lista dele sai do seletor: incluir de novo só
              // devolveria "já está na sua lista".
              candidatos: colegas
                .filter((c) => !avaliacoes.some((a) => a.colaboradorId === c.id))
                .map((c) => ({
                  id: c.id,
                  nome: c.nome,
                  setor: c.setor.nome,
                  empresa: c.empresa.nome,
                })),
            }
          : null
      }
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
        competenciasDisponiveis: competenciasPorEmpresa.get(a.empresaId) ?? [],
      }))}
    />
  );
}
