import { prisma } from "@/lib/prisma";
import { hojeUTC, somarDiasUTC, somarMesesUTC } from "@/lib/datas";

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
 * Tudo aqui é `count`/`aggregate` — nada de `findMany`. A tela de Indicadores
 * carrega as linhas todas porque precisa quebrar por setor e desenhar
 * gráfico; a inicial precisa só do total, e é a tela que abre a cada login.
 * Trocar isso por findMany traria de volta a lentidão que acabamos de tirar.
 */
// Recebe os CNPJs da marca (ver lib/escopo-marca.ts), não um só: a tela
// inicial é da marca inteira.
export async function resumoDaEmpresa(empresaIds: string[]): Promise<ResumoDashboard> {
  const empresaId = { in: empresaIds };
  const hoje = hojeUTC();
  const inicio12m = somarMesesUTC(hoje, -12);
  const inicio30d = somarDiasUTC(hoje, -30);

  const [ativos, admissoes12m, desligamentos12m, faltas, folha, beneficios, semSalario] =
    await Promise.all([
      prisma.colaborador.count({ where: { empresaId, ativo: true } }),
      prisma.colaborador.count({
        where: { empresaId, dataAdmissao: { gte: inicio12m, lte: hoje } },
      }),
      prisma.colaborador.count({
        where: { empresaId, dataDesligamento: { gte: inicio12m, lte: hoje } },
      }),
      prisma.ausencia.aggregate({
        where: {
          empresaId,
          abonada: false,
          status: "APROVADA",
          dataInicio: { gte: inicio30d, lte: hoje },
        },
        _sum: { dias: true },
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

  // Mesma fórmula de lib/bi.ts: sem foto histórica de headcount, o início do
  // período é reconstruído a partir de hoje.
  const headcountInicio = Math.max(0, ativos - admissoes12m + desligamentos12m);
  const headcountMedio = (headcountInicio + ativos) / 2;
  const turnoverPct = headcountMedio > 0 ? (desligamentos12m / headcountMedio) * 100 : 0;

  const diasFalta30d = faltas._sum.dias ?? 0;
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
  chave: "salario" | "admissao" | "setor" | "cpf" | "telegram";
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
  const [ativos, semSalario, semAdmissao, semCpf, semTelegram, semSetor] = await Promise.all([
    prisma.colaborador.count({ where: base }),
    prisma.colaborador.count({ where: { ...base, salarioBase: null } }),
    prisma.colaborador.count({ where: { ...base, dataAdmissao: null } }),
    prisma.colaborador.count({ where: { ...base, cpf: null } }),
    prisma.colaborador.count({ where: { ...base, telegramChatId: null } }),
    prisma.colaborador.count({
      where: { ...base, setor: { nome: { equals: "Não definido", mode: "insensitive" } } },
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
      chave: "cpf",
      rotulo: "sem CPF",
      faltando: semCpf,
      consequencia: "bloqueia admissão digital e conferência de documento",
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
