// O motor do Painel do Setor — os números de gestão de UM setor, prontos para
// a tela, servindo duas portas: a diretoria/RH (que escolhe o setor) e o gestor
// de setor (que chega com o setor fixado pelo vínculo, em /rh/meu-setor).
//
// Decisões de recorte, todas deliberadas:
// - O setor é identificado pelo NOME, não pelo id: Setor é uma linha por CNPJ
//   (@@unique[empresaId, nome]), e "Área Técnica" da LM e da BR Sistemas são o
//   mesmo setor aos olhos de quem gere. Os nomes foram canonizados em 08/2026,
//   então o casamento por nome é confiável.
// - Turnover de setor usa o setor ATUAL do desligado (o cadastro não guarda o
//   setor da época) — é o recorte menos confiável da base, e o aviso diz isso
//   em vez de fingir precisão. Mesma honestidade das ferramentas do assistente.
// - Salário NÃO entra aqui, em nenhum número. A porta do gestor não pode ver
//   folha (dado de Diretoria/RH), e a diretoria já tem folha por setor no
//   Painel executivo. Um motor sem salário serve às duas portas sem vazamento.
// - A série mensal combina duas fontes e diz qual é qual: meses fotografados
//   pelo cron da FotoMensal (medição real, imutável) e meses reconstituídos do
//   cadastro (aproximação que se mexe quando o RH corrige uma data). A foto
//   vence onde existe.
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { calcularTurnover, headcountMensal, movimentoMensal, tempoMedioDeCasaAnos } from "@/lib/bi";
import { montarMeuTime, type ColaboradorParaTime, type MeuTime } from "@/lib/meu-time";

export type MesDoSetor = {
  /** "MM/AAAA", do mais antigo ao mais recente. */
  mes: string;
  total: number;
  admissoes: number;
  desligamentos: number;
  /** true = veio da FotoMensal (medição); false = reconstituído do cadastro. */
  fotografado: boolean;
};

export type ComparativoSetor = {
  turnoverSetorPct: number;
  turnoverEscopoPct: number;
  tempoMedioSetorAnos: number | null;
  tempoMedioEscopoAnos: number | null;
  pctAbaixoDeUmAno: number | null;
};

export type PainelDoSetor = {
  setorNome: string;
  janelaMeses: number;
  /** Quantos CNPJs do escopo têm gente neste setor. */
  cnpjsComSetor: number;
  ativos: number;
  admissoesJanela: number;
  desligamentosJanela: number;
  time: MeuTime;
  comparativo: ComparativoSetor;
  serie: MesDoSetor[];
  /** Competências cobertas por foto real, "AAAA-MM" ordenadas. */
  mesesFotografados: string[];
  avisos: string[];
};

const CHAVE_MES = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** "MM/AAAA" (formato da série do bi.ts) → "AAAA-MM" (formato da FotoMensal). */
function competenciaDoMes(mes: string): string {
  const [mm, aaaa] = mes.split("/");
  return `${aaaa}-${mm}`;
}

/**
 * Sobrepõe as fotos reais à série reconstituída, mês a mês. Função pura e
 * exportada para teste: é a única emenda entre as duas fontes, e uma emenda
 * errada produziria exatamente o "número plausível e errado" que esta tela
 * existe para evitar.
 */
export function mesclarSerieComFotos(
  serie: { mes: string; total: number; admissoes: number; desligamentos: number }[],
  fotos: Map<string, { headcount: number; admissoes: number; desligamentos: number }>,
): MesDoSetor[] {
  return serie.map((m) => {
    const foto = fotos.get(competenciaDoMes(m.mes));
    if (!foto) return { ...m, fotografado: false };
    return {
      mes: m.mes,
      total: foto.headcount,
      admissoes: foto.admissoes,
      desligamentos: foto.desligamentos,
      fotografado: true,
    };
  });
}

export async function montarPainelDoSetor(opts: {
  empresaIds: string[];
  setorNome: string;
  janelaMeses?: number;
}): Promise<PainelDoSetor> {
  const { empresaIds, setorNome } = opts;
  const janelaMeses = opts.janelaMeses ?? 12;
  const hoje = hojeUTC();

  const [ativosDoSetor, vinculosSetor, vinculosEscopo, fotos] = await Promise.all([
    // As pessoas do setor, com o necessário para o motor do Meu time.
    // `select` explícito, nunca `include`: cpf/salarioBase/telegramChatId
    // entram só para virar booleanos de lacuna — os valores não saem daqui.
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresaIds }, ativo: true, setor: { nome: setorNome } },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        empresaId: true,
        supervisorId: true,
        dataAdmissao: true,
        tipoContrato: true,
        dataFimContrato: true,
        cpf: true,
        salarioBase: true,
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
    }),
    // Ativos E desligados do setor — a matéria-prima do turnover e da série.
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresaIds }, setor: { nome: setorNome } },
      select: { ativo: true, dataAdmissao: true, dataDesligamento: true },
    }),
    // O escopo inteiro, para o setor ter contra o que se comparar.
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { ativo: true, dataAdmissao: true, dataDesligamento: true, setor: { select: { nome: true } } },
    }),
    prisma.fotoMensal.findMany({
      where: { empresaId: { in: empresaIds }, setorNome },
      select: { competencia: true, headcount: true, admissoes: true, desligamentos: true },
    }),
  ]);

  const ciclosAbertos = await prisma.cicloAvaliacao.findMany({
    where: { empresaId: { in: [...new Set(ativosDoSetor.map((c) => c.empresaId))] }, encerrado: false },
    select: { empresaId: true },
  });
  const empresasComCiclo = new Set(ciclosAbertos.map((c) => c.empresaId));

  const paraTime: ColaboradorParaTime[] = ativosDoSetor.map((c) => ({
    id: c.id,
    nome: c.nome,
    empresaId: c.empresaId,
    empresa: c.empresa.nome,
    setor: c.setor.nome,
    cargo: c.posicao.nome,
    dataAdmissao: c.dataAdmissao,
    tipoContrato: c.tipoContrato,
    dataFimContrato: c.dataFimContrato,
    semLider: c.supervisorId === null,
    semSalario: c.salarioBase === null || c.salarioBase === undefined,
    semCpf: !c.cpf,
    semTelegram: !c.telegramChatId,
    nuncaAcessouPortal: c._count.sessoesPortal === 0,
    ferias: c.ferias,
    temCicloAberto: empresasComCiclo.has(c.empresaId),
    avaliacoesCicloAberto: c.avaliacoesRecebidas,
    trilha: c.checklistIntegracao,
  }));
  const time = montarMeuTime(paraTime, hoje);

  // Turnover — o do setor e o do escopo, pela MESMA fórmula (lib/bi.ts), para
  // a comparação comparar recortes e não métodos.
  const ativosEscopo = vinculosEscopo.filter((v) => v.ativo);
  const turnoverSetor = calcularTurnover(vinculosSetor, ativosDoSetor.length, hoje, janelaMeses);
  const turnoverEscopo = calcularTurnover(vinculosEscopo, ativosEscopo.length, hoje, janelaMeses);

  // Série mensal: reconstituição do cadastro + sobreposição das fotos reais.
  const fotosPorCompetencia = new Map<string, { headcount: number; admissoes: number; desligamentos: number }>();
  for (const f of fotos) {
    const atual = fotosPorCompetencia.get(f.competencia) ?? { headcount: 0, admissoes: 0, desligamentos: 0 };
    atual.headcount += f.headcount;
    atual.admissoes += f.admissoes;
    atual.desligamentos += f.desligamentos;
    fotosPorCompetencia.set(f.competencia, atual);
  }
  const reconstituida = headcountMensal(vinculosSetor, ativosDoSetor.length, hoje, janelaMeses);
  const movimento = movimentoMensal(vinculosSetor, hoje, janelaMeses);
  const serieBase = reconstituida.map((m, i) => ({
    mes: m.mes,
    total: m.total,
    admissoes: movimento[i]?.admissoes ?? 0,
    desligamentos: movimento[i]?.desligamentos ?? 0,
  }));
  // O mês CORRENTE nunca usa foto: a competência só é fotografada depois de
  // fechada, e uma foto do mês em curso seria de outro sistema. (Hoje o cron
  // também só grava mês fechado — a guarda aqui é contra recuperação manual.)
  const mesCorrente = CHAVE_MES(hoje);
  const fotosSemMesCorrente = new Map(
    [...fotosPorCompetencia].filter(([competencia]) => competencia !== competenciaDoMes(mesCorrente)),
  );
  const serie = mesclarSerieComFotos(serieBase, fotosSemMesCorrente);
  const mesesFotografados = serie.filter((m) => m.fotografado).map((m) => competenciaDoMes(m.mes)).sort();

  // Tempo de casa — média do setor contra a do escopo, e % com menos de 1 ano.
  const mediaSetor = tempoMedioDeCasaAnos(ativosDoSetor, hoje);
  const mediaEscopo = tempoMedioDeCasaAnos(ativosEscopo, hoje);
  const comAnos = time.linhas.filter((l) => l.anosDeCasa !== null);
  const pctAbaixoDeUmAno =
    comAnos.length > 0 ? (comAnos.filter((l) => l.anosDeCasa! < 1).length / comAnos.length) * 100 : null;

  // Avisos de qualidade — os do motor do time mais os deste recorte.
  const avisos = [...time.avisos];
  const naoDefinido = (nome: string) => nome.trim().toLowerCase() === "não definido";
  const inicioJanela = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - janelaMeses, hoje.getUTCDate()));
  const desligadosSemSetor = vinculosEscopo.filter(
    (v) => !v.ativo && v.dataDesligamento && v.dataDesligamento >= inicioJanela && naoDefinido(v.setor.nome),
  ).length;
  if (desligadosSemSetor > 0) {
    avisos.push(
      `${desligadosSemSetor} desligamento(s) da janela estão com setor "Não definido" e não aparecem em nenhum setor — o turnover por setor é o recorte menos confiável da base.`,
    );
  }
  avisos.push(
    "O desligado conta no setor ATUAL da ficha (o cadastro não guarda o setor da época do desligamento).",
  );
  if (mesesFotografados.length === 0) {
    avisos.push(
      "Nenhum mês desta janela tem foto mensal ainda — toda a série é reconstituída do cadastro e muda se o RH corrigir datas. As fotos começam a valer de jul/2026 em diante.",
    );
  }

  return {
    setorNome,
    janelaMeses,
    cnpjsComSetor: new Set(ativosDoSetor.map((c) => c.empresaId)).size,
    ativos: ativosDoSetor.length,
    admissoesJanela: turnoverSetor.admissoes,
    desligamentosJanela: turnoverSetor.desligados,
    time,
    comparativo: {
      turnoverSetorPct: turnoverSetor.taxaPct,
      turnoverEscopoPct: turnoverEscopo.taxaPct,
      tempoMedioSetorAnos: mediaSetor.comData > 0 ? mediaSetor.anos : null,
      tempoMedioEscopoAnos: mediaEscopo.comData > 0 ? mediaEscopo.anos : null,
      pctAbaixoDeUmAno,
    },
    serie,
    mesesFotografados,
    avisos,
  };
}

/**
 * Os setores do escopo que têm gente ativa, do maior para o menor — a lista do
 * seletor da porta de diretoria/RH. Agrupado por NOME (ver o cabeçalho).
 */
export async function setoresComGente(empresaIds: string[]): Promise<{ nome: string; ativos: number }[]> {
  const ativos = await prisma.colaborador.findMany({
    where: { empresaId: { in: empresaIds }, ativo: true },
    select: { setor: { select: { nome: true } } },
  });
  const contagem = new Map<string, number>();
  for (const c of ativos) contagem.set(c.setor.nome, (contagem.get(c.setor.nome) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([nome, qtd]) => ({ nome, ativos: qtd }))
    .sort((a, b) => b.ativos - a.ativos || a.nome.localeCompare(b.nome, "pt-BR"));
}
