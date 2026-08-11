import { prisma, type Cliente } from "@/lib/prisma";
import { DIAS_ALERTA_VENCIMENTO, CONTRATOS_POR_PRAZO } from "@/lib/constants-dp";
import { RUBRICAS_HORA_EXTRA, LIMITE_HORAS_EXTRAS_MES } from "@/lib/constants-folha";
import { hojeUTC, somarDiasUTC, diferencaEmDiasUTC } from "@/lib/datas";

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
  // Era `avaliacoesAtrasadas` (cada avaliação PENDENTE de ciclo com janela
  // fechada) até 10/08/2026. Um ciclo esquecido com 235 avaliações pendentes
  // virava 235 itens no total — como se o RH tivesse 235 ações separadas. A
  // ação é UMA por ciclo: cobrar os avaliadores e encerrar (encerrarCiclo em
  // lib/actions/rh-avaliacao.ts). Mesma régua de `pesquisasAbertas`, logo
  // abaixo: conta a unidade que o RH fecha, nunca pessoa a pessoa.
  ciclosAvaliacaoAEncerrar: number;
  // Era `convitesSemResposta` (pessoa com convite de pesquisa ativa e ainda sem
  // responder) até 06/08/2026. Responder pesquisa é OPCIONAL: parte do time
  // nunca responde, por direito, e isso não é falha do RH nem tem ação do RH
  // que resolva — o contador só inflava o total com algo que ninguém podia
  // fechar. O que de fato espera o RH é ENCERRAR a pesquisa: enquanto ela fica
  // ACTIVE o resultado não fecha (nivelGeralCache/indiceGeralCache só são
  // gravados no encerramento) e o ciclo seguinte não começa.
  pesquisasAbertas: number;
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
  // Pedido do CEO em 07/08/2026: era só "preenchimento da base" (lacuna), mas
  // sem o vínculo a pessoa não recebe convite de pesquisa, lembrete nem acesso
  // ao portal — é cobrança do RH, não estatística. Mesma condição da lacuna e
  // da lista (?lacuna=telegram): ativo com telegramChatId nulo OU vazio.
  semTelegram: number;
  // Cadastro de funcionário com dados incompletos — faltam campos obrigatórios
  // como CPF, email/telefone, data de admissão, documentos, endereço ou dados
  // bancários. O RH precisa completar a ficha antes que o colaborador possa
  // usar todos os recursos do sistema.
  cadastrosIncompletos: number;
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
  ciclosAvaliacaoAEncerrar: 0,
  pesquisasAbertas: 0,
  fichasDesatualizadas: 0,
  contratosVencendo: 0,
  horasExtrasExcedidas: 0,
  dependentesSemCpf: 0,
  atestadosSemDocumento: 0,
  semTelegram: 0,
  cadastrosIncompletos: 0,
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
    feriasVencidas, avisoPrevio, desligamentosIncompletos, ciclosAvaliacaoAEncerrar,
    pesquisasAbertas, fichasDesatualizadas,
    contratosVencendo, dependentesSemCpf, atestadosSemDocumento, horasExtras,
    semTelegram, cadastrosIncompletos,
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
      // Ciclo de avaliação com a janela fechada e ainda aberto — falta cobrar
      // quem não avaliou e encerrar. Conta o CICLO, não as avaliações pendentes
      // dentro dele (ver o comentário do tipo).
      cliente.cicloAvaliacao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, encerrado: false, dataFim: { lt: hoje } },
      }),
      // Pesquisa ainda ACTIVE — aberta para os colaboradores responderem e
      // esperando o RH encerrar. Só ACTIVE: DRAFT não chegou a ninguém e
      // FINISHED/ARCHIVED já foi fechada.
      //
      // Agrupa pelo `empresaId` da Pesquisa, que é o CNPJ onde ela nasceu (o
      // vínculo real é com a MARCA, ver o model). Como quem chama passa os
      // CNPJs da marca inteira, a pesquisa entra uma vez só no total — não
      // multiplica por CNPJ irmão.
      cliente.pesquisa.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "ACTIVE" } }),
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
      // Ativo sem Telegram vinculado — null OU "": mesma condição da lacuna
      // (lib/dashboard.ts) e da lista (?lacuna=telegram), para os três números
      // baterem sempre.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, OR: [{ telegramChatId: null }, { telegramChatId: "" }] },
      }),
      // Cadastros com dados incompletos: faltam uma ou mais informações críticas
      // necessárias para um funcionário estar totalmente registrado no sistema.
      cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          ativo: true,
          OR: [
            { cpf: null },
            { AND: [{ OR: [{ email: null }, { email: "" }] }, { OR: [{ telefone: null }, { telefone: "" }] }] },
            { dataAdmissao: null },
            { rg: null },
            { OR: [{ logradouro: null }, { numeroEndereco: null }, { bairro: null }, { uf: null }] },
            { OR: [{ bancoNome: null }, { bancoAgencia: null }, { bancoConta: null }] },
          ],
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
  somar(ciclosAvaliacaoAEncerrar, (p, n) => (p.ciclosAvaliacaoAEncerrar = n));
  somar(pesquisasAbertas, (p, n) => (p.pesquisasAbertas = n));
  somar(fichasDesatualizadas, (p, n) => (p.fichasDesatualizadas = n));
  somar(contratosVencendo, (p, n) => (p.contratosVencendo = n));
  somar(dependentesSemCpf, (p, n) => (p.dependentesSemCpf = n));
  somar(atestadosSemDocumento, (p, n) => (p.atestadosSemDocumento = n));
  somar(semTelegram, (p, n) => (p.semTelegram = n));
  somar(cadastrosIncompletos, (p, n) => (p.cadastrosIncompletos = n));

  // Uma linha por colaborador que lançou hora extra no mês aberto; conta quem
  // passou do teto. `_sum` volta null quando todas as quantidades da pessoa são
  // nulas — lançamento em valor, não em horas —, e null nunca estoura o teto.
  for (const linha of horasExtras) {
    const p = mapa.get(linha.empresaId);
    if (p && (linha._sum.quantidade ?? 0) > LIMITE_HORAS_EXTRAS_MES) p.horasExtrasExcedidas += 1;
  }

  return mapa;
}

export type PesquisaAberta = {
  id: string;
  titulo: string;
  /** Dias desde que abriu para os colaboradores responderem. */
  diasAberta: number;
  respostas: number;
};

/**
 * As pesquisas ainda ACTIVE, com há quantos dias cada uma está aberta.
 *
 * O cartão de pendência mostra só a contagem; quem vai DECIDIR encerrar precisa
 * do resto — uma pesquisa aberta há 5 dias ainda está colhendo resposta, uma há
 * 60 foi esquecida. Como responder é opcional (foi por isso que "convite sem
 * resposta" deixou de ser pendência em 06/08/2026), o que orienta a decisão é
 * tempo aberto + quanta resposta já entrou, nunca quem falta responder.
 */
export async function pesquisasAbertasDaEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<PesquisaAberta[]> {
  if (empresaIds.length === 0) return [];
  const hoje = hojeUTC();

  const abertas = await cliente.pesquisa.findMany({
    where: { empresaId: { in: empresaIds }, status: "ACTIVE" },
    select: {
      id: true,
      titulo: true,
      iniciadaEm: true,
      createdAt: true,
      _count: { select: { respostas: true } },
    },
  });

  return (
    abertas
      .map((p) => ({
        id: p.id,
        titulo: p.titulo,
        // `iniciadaEm` é gravada ao ativar; `createdAt` é a rede de segurança
        // para a pesquisa que já nasce ACTIVE — as campanhas por evento de
        // lib/pesquisa-ciclo.ts fazem exatamente isso.
        diasAberta: Math.max(0, diferencaEmDiasUTC(hoje, p.iniciadaEm ?? p.createdAt)),
        respostas: p._count.respostas,
      }))
      // Mais tempo aberta primeiro: é a que o RH precisa decidir antes.
      .sort((a, b) => b.diasAberta - a.diasAberta)
  );
}

export type CicloAEncerrar = {
  id: string;
  nome: string;
  /** Dias desde que a janela do ciclo fechou. */
  diasVencido: number;
  /** Avaliações ainda PENDENTES dentro dele — contexto da cobrança, não pendência. */
  avaliacoesPendentes: number;
};

/**
 * Os ciclos de avaliação vencidos e não encerrados, com o tamanho do atraso e
 * quantas avaliações ainda faltam. O cartão mostra só a contagem de ciclos;
 * quem vai agir precisa saber QUAL ciclo e o tamanho da cobrança — o número
 * que era o próprio contador até 10/08/2026 vira contexto aqui.
 */
export async function ciclosAEncerrarDaEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<CicloAEncerrar[]> {
  if (empresaIds.length === 0) return [];
  const hoje = hojeUTC();

  const ciclos = await cliente.cicloAvaliacao.findMany({
    where: { empresaId: { in: empresaIds }, encerrado: false, dataFim: { lt: hoje } },
    select: {
      id: true,
      nome: true,
      dataFim: true,
      _count: { select: { avaliacoes: { where: { status: "PENDENTE" } } } },
    },
  });

  return ciclos
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      diasVencido: Math.max(0, diferencaEmDiasUTC(hoje, c.dataFim)),
      avaliacoesPendentes: c._count.avaliacoes,
    }))
    // Mais atrasado primeiro — é o que o RH precisa fechar antes.
    .sort((a, b) => b.diasVencido - a.diasVencido);
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
 * Devolve por EMPRESA porque as duas telas fazem a mesma pergunta em escopos
 * diferentes: a da empresa quer a marca inteira, a do grupo quer marca a marca.
 */
export async function empresasComRegistro(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Map<keyof Pendencias, Set<string>>> {
  const mapa = new Map<keyof Pendencias, Set<string>>();
  if (empresaIds.length === 0) return mapa;

  const empresaId = { in: empresaIds };
  const por = ["empresaId"] as const;
  const contar = { _all: true } as const;

  // As situações e onde ver se o módulo de cada uma já foi usado. As que
  // dependem só de Colaborador (férias vencidas, aviso prévio, ficha
  // desatualizada) ficam de fora — sempre há base para calcular.
  //
  // `groupBy` e não `findFirst`: a tela do grupo precisa saber isso por MARCA,
  // e uma consulta por marca multiplicaria as idas ao banco na primeira tela
  // depois do login. Assim são 12, quantas marcas forem.
  //
  // Chaves e consultas em duas listas paralelas, não numa lista de pares: o
  // `groupBy` do Prisma infere o retorno a partir do argumento, e anotar o par
  // como `[chave, Promise<LinhaAgrupada[]>]` faz o TypeScript exigir que o
  // ARGUMENTO seja um LinhaAgrupada[] também. Compila assim, não com o par.
  const chaves = [
    "asoVencendo", "certificadosVencendo", "epiVencido", "catPendente",
    "integracoesAtrasadas", "desligamentosIncompletos", "documentosAConferir",
    "ciclosAvaliacaoAEncerrar", "atestadosSemDocumento", "horasExtrasExcedidas",
    "dependentesSemCpf", "contratosVencendo", "pesquisasAbertas", "cadastrosIncompletos",
  ] as const satisfies readonly (keyof Pendencias)[];

  const achados = await Promise.all([
    cliente.exameOcupacional.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.certificadoNR.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.entregaEPI.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.acidenteTrabalho.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.checklistIntegracao.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.checklistDesligamento.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.documentoColaborador.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    // Ciclo, não avaliação: é o que a pendência conta desde 10/08/2026, e uma
    // empresa que criou ciclo mas ainda não gerou avaliação já usa o módulo.
    cliente.cicloAvaliacao.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.ausencia.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    cliente.eventoFolha.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    // Dependente não tem empresaId — só colaboradorId. A pergunta vira "quais
    // empresas têm alguém com dependente".
    cliente.colaborador.groupBy({
      by: [...por],
      _count: contar,
      where: { empresaId, dependentes: { some: {} } },
    }),
    // Contrato é diferente dos outros: a tabela é Colaborador, que nunca está
    // vazia. O que falta é a classificação — ninguém com contrato por prazo
    // marcado significa que o RH ainda não preencheu `tipoContrato`, e a
    // pendência não tem como existir.
    cliente.colaborador.groupBy({
      by: [...por],
      _count: contar,
      where: { empresaId, ativo: true, tipoContrato: { in: [...CONTRATOS_POR_PRAZO] } },
    }),
    // Qualquer pesquisa, em qualquer status: quem nunca criou uma não está com
    // as pesquisas "em dia", está sem o módulo. Sem isto, marca que nunca abriu
    // pesquisa apareceria no verde junto de quem encerra tudo em prazo.
    cliente.pesquisa.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
    // Qualquer colaborador ativo: se não tem ninguém, o módulo de cadastros
    // nunca foi aberto. Com isto a verificação de "tem registro" e "precisa de
    // ação" ficam alinhadas para cadastrosIncompletos.
    cliente.colaborador.groupBy({
      by: [...por],
      _count: contar,
      where: { empresaId, ativo: true },
    }),
  ]);

  achados.forEach((linhas: LinhaAgrupada[], i) => {
    mapa.set(chaves[i], new Set(linhas.map((l) => l.empresaId)));
  });
  return mapa;
}

/**
 * As situações que, num escopo, não têm NENHUM registro — a leitura de
 * `empresasComRegistro` para um conjunto de CNPJs.
 */
export function semRegistroNoEscopo(
  comRegistro: Map<keyof Pendencias, Set<string>>,
  empresaIds: string[],
): Set<keyof Pendencias> {
  const vazios = new Set<keyof Pendencias>();
  for (const [chave, empresas] of comRegistro) {
    if (!empresaIds.some((id) => empresas.has(id))) vazios.add(chave);
  }
  return vazios;
}

export async function modulosSemRegistro(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Set<keyof Pendencias>> {
  if (empresaIds.length === 0) return new Set();
  return semRegistroNoEscopo(await empresasComRegistro(empresaIds, cliente), empresaIds);
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
