import { prisma } from "@/lib/prisma";
import { hojeCalendarioBrasilia, hojeUTC, somarAnosUTC } from "@/lib/datas";
import { calcularTurnover, diasDeFaltaNaJanela, filtroAusenciasDaJanela } from "@/lib/bi";
import { BALDES_SEM_ESTRUTURA } from "@/lib/estrutura-pendente";
import { marcarTransferencias } from "@/lib/transferencia";
import { saidasPorTransferenciaDoGrupo } from "@/lib/transferencia-grupo";

export type ResumoDashboard = {
  ativos: number;
  admissoes12m: number;
  desligamentos12m: number;
  turnoverPct: number;
  diasFalta30d: number;
  absenteismoPct: number;
  custoFolha: number;
  custoBeneficios: number;
  semSalario: number;
};

/**
 * Números de cabeçalho da empresa para a tela inicial.
 *
 * Quase tudo aqui é `count`/`aggregate`: a tela inicial abre a cada login e
 * precisa só de totais. A exceção é o turnover (v1.214.0): ele passou a vir da
 * MESMA função das outras telas (`calcularTurnover`), que tira a transferência
 * no grupo da conta — e reconhecer a chegada por transferência pede o CPF de
 * cada ficha, coisa que um `count` não entrega. A consulta traz seis colunas
 * escalares por ficha, sem relação nenhuma; antes, a fórmula era copiada aqui
 * à mão e já discordava das outras telas.
 */
// Recebe os CNPJs da marca (ver lib/escopo-marca.ts), não um só: a tela
// inicial é da marca inteira.
export async function resumoDaEmpresa(empresaIds: string[]): Promise<ResumoDashboard> {
  const empresaId = { in: empresaIds };
  const hoje = hojeUTC();
  // Dia de Brasília: "até hoje" não pode incluir o amanhã UTC das 21h.
  const hojeAbsenteismo = hojeCalendarioBrasilia();

  const [ativos, vinculosDoCadastro, saidasPorTransferencia, faltas, folha, beneficios, semSalario] =
    await Promise.all([
      prisma.colaborador.count({ where: { empresaId, ativo: true } }),
      prisma.colaborador.findMany({
        where: { empresaId },
        select: {
          id: true,
          empresaId: true,
          cpf: true,
          dataAdmissao: true,
          dataDesligamento: true,
          motivoDesligamento: true,
        },
      }),
      saidasPorTransferenciaDoGrupo(empresaIds),
      // A exceção ao "só count/aggregate" (26/11/2026): somar `dias` no banco
      // contava o afastamento inteiro que começou na janela — inclusive os dias
      // que ainda não aconteceram — e ignorava o que começou antes e segue
      // dentro. O recorte à janela é por linha, então busca as poucas ausências
      // que tocam os últimos 30 dias (três colunas) e soma aqui.
      prisma.ausencia.findMany({
        where: {
          empresaId,
          abonada: false,
          status: "APROVADA",
          ...filtroAusenciasDaJanela(hojeAbsenteismo),
        },
        select: { dataInicio: true, dataFim: true, dias: true },
      }),
      prisma.colaborador.aggregate({
        where: { empresaId, ativo: true },
        _sum: { salarioBase: true },
      }),
      prisma.beneficioColaborador.aggregate({
        where: { empresaId, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }] },
        _sum: { valorEmpresa: true },
      }),
      // Quantos ativos ainda estão sem salário: sem isso o custo abaixo é
      // uma verdade parcial, e o número precisa aparecer junto para não
      // induzir a erro.
      prisma.colaborador.count({ where: { empresaId, ativo: true, salarioBase: null } }),
    ]);

  // A mesma conta do Painel executivo e do Placar, 12 meses: transferência no
  // grupo não é admissão nem desligamento.
  const turnover = calcularTurnover(
    marcarTransferencias(vinculosDoCadastro, saidasPorTransferencia),
    ativos,
    hoje,
    12,
  );
  const admissoes12m = turnover.admissoes;
  const desligamentos12m = turnover.desligados;
  const turnoverPct = turnover.taxaPct;

  const diasFalta30d = faltas.reduce((t, a) => t + diasDeFaltaNaJanela(a, hojeAbsenteismo), 0);
  // 30 dias úteis aproximados por pessoa no período — mesma simplificação da
  // tela de Indicadores, para os dois números não divergirem.
  const diasPossiveis = ativos * 30;
  const absenteismoPct = diasPossiveis > 0 ? (diasFalta30d / diasPossiveis) * 100 : 0;

  return {
    ativos,
    admissoes12m,
    desligamentos12m,
    turnoverPct,
    diasFalta30d,
    absenteismoPct,
    custoFolha: folha._sum.salarioBase ?? 0,
    custoBeneficios: beneficios._sum.valorEmpresa ?? 0,
    semSalario,
  };
}

export type LacunaDaBase = {
  /** Também é o valor de ?lacuna= na lista de colaboradores. */
  chave: "salario" | "admissao" | "setor" | "cargo" | "cpf" | "telegram" | "ferias";
  rotulo: string;
  faltando: number;
  /** O que deixa de funcionar enquanto este campo estiver vazio. */
  consequencia: string;
};

/**
 * O que falta preencher na base desta empresa.
 *
 * O sistema está pronto na frente do dado: conformidade, custo de pessoal e
 * férias só passam a valer quando a ficha estiver completa. Este bloco existe
 * para tornar isso visível e acionável, em vez de deixar cada módulo mostrar
 * "—" sem explicar por quê.
 *
 * Cada lacuna diz a CONSEQUÊNCIA, não só a contagem: "142 sem data de
 * admissão" é um número; "as férias não podem ser calculadas" é um motivo
 * para alguém preencher.
 *
 * Só `count`, como o resto desta tela — ela abre a cada login.
 */
export async function lacunasDaBase(empresaIds: string[]): Promise<{
  ativos: number;
  lacunas: LacunaDaBase[];
}> {
  const base = { empresaId: { in: empresaIds }, ativo: true };
  // Mesmo corte de "já teria período fechado" usado nas férias vencidas de
  // lib/pendencias.ts — sem ele, quem admitiu semana passada entraria como
  // lacuna por ainda não ter pedido férias, o que não é falha de ninguém.
  const umAnoAtras = somarAnosUTC(hojeUTC(), -1);
  const [ativos, semSalario, semAdmissao, semCpf, semTelegram, semSetor, semCargo, semFerias] =
    await Promise.all([
      prisma.colaborador.count({ where: base }),
      prisma.colaborador.count({ where: { ...base, salarioBase: null } }),
      prisma.colaborador.count({ where: { ...base, dataAdmissao: null } }),
      prisma.colaborador.count({ where: { ...base, cpf: null } }),
      // null OU "": as telas filtram com `!c.telegramChatId` (string vazia é
      // "sem"), e este count usava só IS NULL — um único registro com "" já
      // fazia o cartão e a lista divergirem em 1.
      prisma.colaborador.count({
        where: { ...base, OR: [{ telegramChatId: null }, { telegramChatId: "" }] },
      }),
      // Mesma lista do filtro ?lacuna=setor|cargo da tela de Colaboradores —
      // ver lib/estrutura-pendente.ts.
      prisma.colaborador.count({
        where: { ...base, setor: { nome: { in: [...BALDES_SEM_ESTRUTURA], mode: "insensitive" } } },
      }),
      prisma.colaborador.count({
        where: { ...base, posicao: { nome: { in: [...BALDES_SEM_ESTRUTURA], mode: "insensitive" } } },
      }),
      // Mesma regra de lib/ferias-passivo.ts::semHistoricoDeFerias, em contagem:
      // 1+ ano de casa (então já existe período aquisitivo fechado) e NENHUMA
      // solicitação de férias registrada, aprovada ou não.
      prisma.colaborador.count({
        where: { ...base, dataAdmissao: { not: null, lt: umAnoAtras }, ferias: { none: {} } },
      }),
    ]);

  const lacunas: LacunaDaBase[] = [
    {
      chave: "salario",
      rotulo: "sem salário na ficha",
      faltando: semSalario,
      consequencia: "custo de pessoal e folha ficam subestimados",
    },
    {
      chave: "admissao",
      rotulo: "sem data de admissão",
      faltando: semAdmissao,
      consequencia: "férias e tempo de casa não podem ser calculados",
    },
    {
      chave: "setor",
      rotulo: "sem setor definido",
      faltando: semSetor,
      consequencia: "não entram no organograma nem nos indicadores por setor",
    },
    {
      chave: "cargo",
      rotulo: "sem cargo definido",
      faltando: semCargo,
      consequencia: "não entram nos indicadores por cargo nem no plano de cargos",
    },
    {
      chave: "cpf",
      rotulo: "sem CPF",
      faltando: semCpf,
      consequencia: "bloqueia admissão digital e conferência de documento",
    },
    {
      chave: "ferias",
      rotulo: "sem nenhuma férias registrada",
      faltando: semFerias,
      consequencia: "1+ ano de casa sem histórico — provável passivo não lançado, não período em dia",
    },
    {
      chave: "telegram",
      rotulo: "sem Telegram vinculado",
      faltando: semTelegram,
      consequencia: "não recebem convite de pesquisa nem acessam o portal",
    },
  ];

  // Só o que realmente falta, do maior para o menor: uma lista de zeros não
  // informa nada e ainda esconde o que importa.
  return { ativos, lacunas: lacunas.filter((l) => l.faltando > 0).sort((a, b) => b.faltando - a.faltando) };
}

export type LacunaDeDesligado = {
  /** Também é o valor de ?lacuna= — combinado com ?status=inativos, senão a lista mostraria todo ativo. */
  chave: "desligamento_data" | "desligamento_motivo";
  rotulo: string;
  faltando: number;
  consequencia: string;
};

/**
 * O que falta na saída, não na entrada — irmã de `lacunasDaBase` e
 * deliberadamente separada dela, não uma linha a mais na mesma lista.
 *
 * `lacunasDaBase` filtra `ativo: true` em toda contagem; um desligado nunca
 * aparece ali. E o denominador é outro: "72% preenchido" de 215 ativos não diz
 * nada sobre os 137 que já saíram. Duas listas, dois denominadores, dois
 * links — nunca uma linha dentro da outra.
 *
 * Ver seção 3.1 do estudo de Gestão: motivo 0/137, data ausente em 31/137 —
 * turnover de qualquer empresa aparece melhor do que é enquanto isto for zero.
 */
export async function lacunasDosDesligados(empresaIds: string[]): Promise<{
  desligados: number;
  lacunas: LacunaDeDesligado[];
}> {
  const base = { empresaId: { in: empresaIds }, ativo: false };
  const [desligados, semData, semMotivo] = await Promise.all([
    prisma.colaborador.count({ where: base }),
    prisma.colaborador.count({ where: { ...base, dataDesligamento: null } }),
    prisma.colaborador.count({ where: { ...base, motivoDesligamento: null } }),
  ]);

  const lacunas: LacunaDeDesligado[] = [
    {
      chave: "desligamento_data",
      rotulo: "sem data de desligamento",
      faltando: semData,
      consequencia: "não entram no turnover nem em nenhuma série por mês",
    },
    {
      chave: "desligamento_motivo",
      rotulo: "sem motivo de desligamento",
      faltando: semMotivo,
      consequencia: "turnover não separa quem pediu demissão de quem foi desligado",
    },
  ];

  return {
    desligados,
    lacunas: lacunas.filter((l) => l.faltando > 0).sort((a, b) => b.faltando - a.faltando),
  };
}
