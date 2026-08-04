import { prisma, type Cliente } from "@/lib/prisma";
import { DIAS_ALERTA_VENCIMENTO, CONTRATOS_POR_PRAZO } from "@/lib/constants-dp";
import { RUBRICAS_HORA_EXTRA, LIMITE_HORAS_EXTRAS_MES } from "@/lib/constants-folha";
import { hojeUTC, somarDiasUTC } from "@/lib/datas";

export type Pendencias = {
  aprovacoes: number;
  documentosAConferir: number;
  asoVencendo: number;
  certificadosVencendo: number;
  catPendente: number;
  integracoesAtrasadas: number;
  epiVencido: number;
  // Situações adicionadas em 03/08/2026 — a primeira versão desta leva
  // referenciava campos que não existiam e derrubou o deploy; estas seis são
  // as que têm base real no schema.
  feriasVencidas: number;
  avisoPrevio: number;
  desligamentosIncompletos: number;
  avaliacoesAtrasadas: number;
  convitesSemResposta: number;
  fichasDesatualizadas: number;
  // Fechadas em 04/08/2026, completando a ideia original. Três saíram do que já
  // existia no schema; a de contrato exigiu a coluna `dataFimContrato`
  // (migration 20260804160000), porque o tipo do contrato estava lá mas a data
  // em que ele acaba, não.
  //
  // A quinta situação da lista original — "movimentação pendente" — não entrou,
  // e não é esquecimento: Movimentacao é histórico, não fila. Ela nasce na
  // mesma transação que altera o Colaborador (ver o comentário do model), então
  // não existe movimentação por aplicar. Cobrar uma seria inventar um estado
  // que o sistema não tem.
  contratosVencendo: number;
  horasExtrasExcedidas: number;
  dependentesSemCpf: number;
  atestadosSemDocumento: number;
};

export const totalPendencias = (p: Pendencias) => Object.values(p).reduce((s, n) => s + n, 0);

export const zeradas = (): Pendencias => ({
  aprovacoes: 0,
  documentosAConferir: 0,
  asoVencendo: 0,
  certificadosVencendo: 0,
  catPendente: 0,
  integracoesAtrasadas: 0,
  epiVencido: 0,
  feriasVencidas: 0,
  avisoPrevio: 0,
  desligamentosIncompletos: 0,
  avaliacoesAtrasadas: 0,
  convitesSemResposta: 0,
  fichasDesatualizadas: 0,
  contratosVencendo: 0,
  horasExtrasExcedidas: 0,
  dependentesSemCpf: 0,
  atestadosSemDocumento: 0,
});

type LinhaAgrupada = { empresaId: string; _count?: { _all?: number } };

/**
 * As pendências de várias empresas de uma vez, já separadas por empresa.
 *
 * São 8 queries agregadas, independente de quantas empresas entrarem: o
 * `groupBy` devolve a contagem por `empresaId` numa tacada. A tela inicial do
 * grupo antes chamava `pendenciasDaEmpresa([id])` dentro de um laço, o que dava
 * 8 queries POR empresa — com os 11 CNPJs do grupo, quase 90 idas ao banco só
 * para montar os cartões.
 *
 * Empresa sem nenhuma pendência não volta no `groupBy`; por isso o mapa já
 * nasce com todas as chaves zeradas.
 */
// `cliente` existe para o smoke poder rodar dentro de uma transação com
// rollback, como em lib/regua-cobranca.ts. Produção nunca passa nada e usa o
// prisma global; sem isto, um teste que cria o dado e chama a função leria
// fora da transação e não veria o que acabou de criar.
export async function pendenciasPorEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Map<string, Pendencias>> {
  const mapa = new Map<string, Pendencias>(empresaIds.map((id) => [id, zeradas()]));
  if (empresaIds.length === 0) return mapa;

  const empresaId = { in: empresaIds };
  const hoje = hojeUTC();
  const limite = somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO);
  const por = ["empresaId"] as const;
  const contar = { _all: true } as const;

  const umAnoAtras = somarDiasUTC(hoje, -365);
  const seisMesesAtras = somarDiasUTC(hoje, -180);

  const [
    feriasPendentes, ausenciasPendentes, documentosAConferir, asoVencendo,
    certificadosVencendo, catPendente, integracoesAtrasadas, epiVencido,
    feriasVencidas, avisoPrevio, desligamentosIncompletos, avaliacoesAtrasadas,
    convitesSemResposta, fichasDesatualizadas,
    contratosVencendo, dependentesSemCpf, atestadosSemDocumento, horasExtras,
  ] =
    await Promise.all([
      cliente.solicitacaoFerias.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      cliente.ausencia.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      // Enviado pelo colaborador no portal e ainda não conferido pelo RH.
      cliente.documentoColaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, origem: "COLABORADOR", conferidoEm: null },
      }),
      cliente.exameOcupacional.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      cliente.certificadoNR.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      cliente.acidenteTrabalho.groupBy({ by: [...por], _count: contar, where: { empresaId, catEmitida: false } }),
      cliente.checklistIntegracao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, concluido: false, prazo: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      cliente.entregaEPI.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      // Férias vencidas: 12+ meses de casa sem NENHUMA férias aprovada que
      // tenha começado no último ano. Sem dataAdmissao a pessoa fica de fora —
      // preenchê-la é lacuna da tela inicial, não pendência daqui.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          ativo: true,
          dataAdmissao: { not: null, lt: umAnoAtras },
          ferias: { none: { status: "APROVADA", dataInicio: { gte: umAnoAtras } } },
        },
      }),
      // Aviso prévio: desligamento registrado para os próximos 7 dias e a
      // pessoa ainda ativa — a saída está marcada, o processo tem que andar.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, dataDesligamento: { gte: hoje, lte: somarDiasUTC(hoje, 7) } },
      }),
      // Desligado com item de offboarding em aberto (crachá, notebook, acesso…).
      cliente.checklistDesligamento.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, concluido: false, colaborador: { ativo: false } },
      }),
      // Avaliação pendente de ciclo cuja janela já fechou e ninguém encerrou.
      cliente.avaliacaoDesempenho.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, status: "PENDENTE", ciclo: { dataFim: { lt: hoje }, encerrado: false } },
      }),
      // Pessoas (não tokens) com convite de pesquisa ATIVA ainda sem resposta.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          ativo: true,
          tokens: {
            some: { status: { in: ["PENDING", "SENT", "DELIVERED"] }, pesquisa: { status: "ACTIVE" } },
          },
        },
      }),
      // Ficha sem NENHUMA gravação há 6+ meses. updatedAt é proxy — qualquer
      // edição conta — mas é o campo que existe.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, updatedAt: { lt: seisMesesAtras } },
      }),
      // Contrato por prazo determinado chegando ao fim. Inclui o que JÁ venceu
      // (sem piso na data): passar do termo é justamente o que transforma o
      // contrato em indeterminado, então um vencimento esquecido tem que
      // continuar cobrando, não sumir da tela por ter passado.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          ativo: true,
          tipoContrato: { in: [...CONTRATOS_POR_PRAZO] },
          dataFimContrato: { not: null, lte: limite },
        },
      }),
      // Dependente declarado para IRRF sem CPF. A Receita exige CPF de todo
      // dependente, de qualquer idade (IN RFB 1.760/2017): sem ele a dedução
      // cai na malha e o desconto vira diferença a pagar pelo colaborador.
      // Conta PESSOAS, não dependentes — é o colaborador que o RH vai chamar.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, dependentes: { some: { irrf: true, cpf: null } } },
      }),
      // Atestado JÁ APROVADO e abonado sem o papel anexado: a falta foi
      // perdoada e não há documento que sustente o abono numa fiscalização.
      //
      // O filtro por APROVADA não é detalhe — é o que impede contar duas vezes.
      // Atestado ainda PENDENTE já entra em `aprovacoes`; sem este recorte, o
      // mesmo item somaria nos dois contadores e inflaria o total da tela.
      cliente.ausencia.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, tipo: "ATESTADO", status: "APROVADA", abonada: true, arquivoId: null },
      }),
      // Horas extras da competência ABERTA, somadas por pessoa. Aqui o groupBy
      // é por colaborador (não por empresa): o teto do art. 59 é individual, e
      // agregar por empresa antes de comparar diluiria quem estourou sozinho no
      // meio de um time que não fez hora nenhuma. A contagem por empresa sai no
      // pós-processamento, logo abaixo.
      cliente.eventoFolha.groupBy({
        by: ["empresaId", "colaboradorId"],
        _sum: { quantidade: true },
        where: {
          empresaId,
          tipo: { in: [...RUBRICAS_HORA_EXTRA] },
          competencia: { status: "ABERTA" },
        },
      }),
    ]);

  const somar = (linhas: LinhaAgrupada[], aplicar: (p: Pendencias, n: number) => void) => {
    for (const linha of linhas) {
      const p = mapa.get(linha.empresaId);
      if (p) aplicar(p, linha._count?._all ?? 0);
    }
  };

  // `aprovacoes` junta férias e ausências — as duas somam no mesmo número.
  somar(feriasPendentes, (p, n) => (p.aprovacoes += n));
  somar(ausenciasPendentes, (p, n) => (p.aprovacoes += n));
  somar(documentosAConferir, (p, n) => (p.documentosAConferir = n));
  somar(asoVencendo, (p, n) => (p.asoVencendo = n));
  somar(certificadosVencendo, (p, n) => (p.certificadosVencendo = n));
  somar(catPendente, (p, n) => (p.catPendente = n));
  somar(integracoesAtrasadas, (p, n) => (p.integracoesAtrasadas = n));
  somar(epiVencido, (p, n) => (p.epiVencido = n));
  somar(feriasVencidas, (p, n) => (p.feriasVencidas = n));
  somar(avisoPrevio, (p, n) => (p.avisoPrevio = n));
  somar(desligamentosIncompletos, (p, n) => (p.desligamentosIncompletos = n));
  somar(avaliacoesAtrasadas, (p, n) => (p.avaliacoesAtrasadas = n));
  somar(convitesSemResposta, (p, n) => (p.convitesSemResposta = n));
  somar(fichasDesatualizadas, (p, n) => (p.fichasDesatualizadas = n));
  somar(contratosVencendo, (p, n) => (p.contratosVencendo = n));
  somar(dependentesSemCpf, (p, n) => (p.dependentesSemCpf = n));
  somar(atestadosSemDocumento, (p, n) => (p.atestadosSemDocumento = n));

  // Uma linha por colaborador que lançou hora extra no mês aberto; conta quem
  // passou do teto. `_sum` volta null quando todas as quantidades da pessoa são
  // nulas — lançamento em valor, não em horas —, e null nunca estoura o teto.
  for (const linha of horasExtras) {
    const p = mapa.get(linha.empresaId);
    if (p && (linha._sum.quantidade ?? 0) > LIMITE_HORAS_EXTRAS_MES) p.horasExtrasExcedidas += 1;
  }

  return mapa;
}

/**
 * Os módulos que não têm NENHUM registro nestas empresas.
 *
 * Existe porque zero é ambíguo na tela de pendências e os dois significados são
 * opostos: "nenhuma CAT em aberto" pode ser a empresa em dia ou o módulo de
 * acidentes nunca ter sido aberto. Em 04/08/2026 era o segundo caso em SST,
 * onboarding, offboarding, folha, ausências e dependentes — seis áreas zeradas
 * por falta de uso, exibidas sob um "Tudo em dia" verde. Para um prazo como o
 * da CAT (1 dia útil), dizer "em dia" sem base é pior do que não dizer nada.
 *
 * São existências (`findFirst` com um campo só), não contagens: a pergunta é
 * "existe alguma linha?", e o Postgres para na primeira que achar.
 */
export async function modulosSemRegistro(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Set<keyof Pendencias>> {
  const vazios = new Set<keyof Pendencias>();
  if (empresaIds.length === 0) return vazios;

  const empresaId = { in: empresaIds };
  const so = { select: { id: true } } as const;

  // Cada entrada: a chave da pendência e como saber se o módulo dela já foi
  // usado alguma vez. As que dependem só de Colaborador (férias vencidas, aviso
  // prévio, ficha desatualizada) ficam de fora — sempre há base para calcular.
  const checagens: [keyof Pendencias, Promise<{ id: string } | null>][] = [
    ["asoVencendo", cliente.exameOcupacional.findFirst({ where: { empresaId }, ...so })],
    ["certificadosVencendo", cliente.certificadoNR.findFirst({ where: { empresaId }, ...so })],
    ["epiVencido", cliente.entregaEPI.findFirst({ where: { empresaId }, ...so })],
    ["catPendente", cliente.acidenteTrabalho.findFirst({ where: { empresaId }, ...so })],
    ["integracoesAtrasadas", cliente.checklistIntegracao.findFirst({ where: { empresaId }, ...so })],
    [
      "desligamentosIncompletos",
      cliente.checklistDesligamento.findFirst({ where: { empresaId }, ...so }),
    ],
    ["documentosAConferir", cliente.documentoColaborador.findFirst({ where: { empresaId }, ...so })],
    ["avaliacoesAtrasadas", cliente.avaliacaoDesempenho.findFirst({ where: { empresaId }, ...so })],
    ["atestadosSemDocumento", cliente.ausencia.findFirst({ where: { empresaId }, ...so })],
    ["horasExtrasExcedidas", cliente.eventoFolha.findFirst({ where: { empresaId }, ...so })],
    [
      "dependentesSemCpf",
      cliente.dependente.findFirst({ where: { colaborador: { empresaId } }, ...so }),
    ],
    // Contrato é diferente dos outros: a tabela é Colaborador, que nunca está
    // vazia. O que falta é a classificação — ninguém com contrato por prazo
    // marcado significa que o RH ainda não preencheu `tipoContrato`, e a
    // pendência não tem como existir.
    [
      "contratosVencendo",
      cliente.colaborador.findFirst({
        where: { empresaId, ativo: true, tipoContrato: { in: [...CONTRATOS_POR_PRAZO] } },
        ...so,
      }),
    ],
  ];

  const achados = await Promise.all(checagens.map(([, p]) => p));
  achados.forEach((linha, i) => {
    if (linha === null) vazios.add(checagens[i][0]);
  });
  return vazios;
}

/**
 * O que exige ação numa empresa. Usado tanto na tela inicial do grupo quanto
 * na da empresa — uma função só para os dois lugares nunca discordarem sobre
 * o que conta como pendência.
 */
// Recebe os CNPJs da marca (ver lib/escopo-marca.ts): o RH cobra a pendência
// de todo mundo no mesmo lugar, não CNPJ a CNPJ.
export async function pendenciasDaEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Pendencias> {
  const porEmpresa = await pendenciasPorEmpresa(empresaIds, cliente);

  const total = zeradas();
  // Soma genérica: com 17 contadores, esquecer um campo aqui viraria um número
  // silenciosamente menor na tela — foi assim com os 7 originais escritos à mão.
  for (const p of porEmpresa.values()) {
    for (const chave of Object.keys(total) as (keyof Pendencias)[]) {
      total[chave] += p[chave];
    }
  }
  return total;
}
