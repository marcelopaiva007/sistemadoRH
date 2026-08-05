// Motor da tela "Meu time": a leitura de UMA equipe, pessoa a pessoa.
//
// Mesmo contrato de lib/bi.ts: funções puras, recebem os colaboradores já
// carregados pelo caller e devolvem objeto pronto para a tela. Nada aqui toca o
// Prisma, para dar para testar sem banco.
//
// A mesma função serve as DUAS portas da tela — o módulo RH (lista recortada
// por setor, para gestor de RH e admin) e o portal do colaborador (lista
// recortada pelo supervisorId de quem está logado). O que muda entre as portas
// é o recorte que o caller busca no banco, nunca a conta: se as duas leituras
// divergissem, gestor e RH discutiriam números diferentes da mesma equipe.
//
// DUAS COLUNAS FICARAM DE FORA DE PROPÓSITO (medido na base em 05/08/2026):
//   * "dias desde o último registro de auditoria" — o AuditLog tem 11 dias de
//     vida (só jul-ago/2026); a coluna diria "111 dias parado" para quem está
//     na casa há anos.
//   * conformidade NR — CertificadoNR/ExameOcupacional/EntregaEPI estão
//     VAZIAS; a coluna devolveria "em dia" para todo mundo, que é pior que
//     não mostrar (precedente da regra de honestidade: 0 registros não é
//     conformidade).
import { hojeUTC, somarDiasUTC, tempoDeCasa } from "@/lib/datas";
import { calcularFerias, type SolicitacaoParaCalculo } from "@/lib/ferias";
import { semHistoricoDeFerias } from "@/lib/ferias-passivo";
import { anosDeCasa } from "@/lib/tempo-de-casa";
import { DIAS_DO_MARCO, itemOnboardingLabel } from "@/lib/constants-onboarding";
import { CONTRATOS_POR_PRAZO } from "@/lib/constants-dp";
import { normalizarTexto } from "@/lib/text";

/**
 * Janela do bloco de recém-chegados. 120 e não 90: a conversa de 90 dias ainda
 * precisa aparecer (e cobrar atraso) por um mês depois do marco — cortar em 90
 * tiraria a pessoa da tela no exato dia em que a última conversa vence.
 */
export const DIAS_JANELA_RECEM_CHEGADO = 120;

export type ItemTrilhaParaTime = { item: string; concluido: boolean; prazo: Date | null };

export type ColaboradorParaTime = {
  id: string;
  nome: string;
  /** Id do CNPJ do vínculo — é ele que monta link de ficha e action de trilha. */
  empresaId: string;
  empresa: string;
  setor: string;
  cargo: string;
  dataAdmissao: Date | null;
  tipoContrato: string | null;
  dataFimContrato: Date | null;
  semLider: boolean;
  // Presença de campo, nunca o valor: o caller converte no servidor (mesmo
  // padrão de colaboradores/page.tsx) e nada sensível atravessa este tipo.
  semSalario: boolean;
  semCpf: boolean;
  semTelegram: boolean;
  /** Nenhuma PortalSessao aberta — é a régua dos 93/215 medidos. */
  nuncaAcessouPortal: boolean;
  ferias: SolicitacaoParaCalculo[];
  /** O CNPJ do vínculo tem ciclo de avaliação aberto? */
  temCicloAberto: boolean;
  /** Avaliações RECEBIDAS pela pessoa em ciclos abertos. */
  avaliacoesCicloAberto: { status: string }[];
  trilha: ItemTrilhaParaTime[];
};

// ---------------------------------------------------------------
// Férias
// ---------------------------------------------------------------

/**
 * "SEM_DATA" e "PRIMEIRO_ANO" existem para a tela nunca dizer "em dia" a quem
 * está fora da conta: sem data de admissão não há período nenhum, e no primeiro
 * ano ainda não há período adquirido — nenhum dos dois é "em dia".
 */
export type SituacaoFerias =
  | "SEM_DATA"
  | "PRIMEIRO_ANO"
  | "EM_DIA"
  | "DISPONIVEL"
  | "VENCENDO"
  | "VENCIDO";

export type FeriasDaLinha = {
  situacao: SituacaoFerias;
  saldoTotal: number;
  /** Dias até o limite concessivo do período mais urgente (negativo = vencido). */
  diasAteLimite: number | null;
  /** Período adquirido sem NENHUMA solicitação: quase sempre buraco de cadastro. */
  semHistorico: boolean;
};

function feriasDaLinha(
  dataAdmissao: Date | null,
  solicitacoes: SolicitacaoParaCalculo[],
  hoje: Date,
): FeriasDaLinha {
  if (!dataAdmissao) {
    return { situacao: "SEM_DATA", saldoTotal: 0, diasAteLimite: null, semHistorico: false };
  }
  const resumo = calcularFerias(dataAdmissao, solicitacoes, hoje);
  const semHistorico = semHistoricoDeFerias(solicitacoes, resumo.periodos);
  const urgente = resumo.periodoMaisUrgente;
  if (!urgente) {
    const temAdquirido = resumo.periodos.some((p) => p.status !== "EM_CURSO");
    return {
      situacao: temAdquirido ? "EM_DIA" : "PRIMEIRO_ANO",
      saldoTotal: 0,
      diasAteLimite: null,
      semHistorico,
    };
  }
  const situacao =
    urgente.status === "VENCIDO" ? "VENCIDO" : urgente.status === "VENCENDO" ? "VENCENDO" : "DISPONIVEL";
  return {
    situacao,
    saldoTotal: resumo.saldoDisponivel,
    diasAteLimite: urgente.diasAteLimite,
    semHistorico,
  };
}

// ---------------------------------------------------------------
// Avaliação do ciclo aberto
// ---------------------------------------------------------------

export type SituacaoAvaliacao = "SEM_CICLO" | "SEM_AVALIACAO" | "EM_ANDAMENTO" | "CONCLUIDA";

export type AvaliacaoDaLinha = { situacao: SituacaoAvaliacao; concluidas: number; total: number };

function avaliacaoDaLinha(
  temCicloAberto: boolean,
  avaliacoes: { status: string }[],
): AvaliacaoDaLinha {
  // "Sem ciclo aberto" ≠ "sem avaliação": no CNPJ sem ciclo, não avaliar não é
  // pendência de ninguém. Se apesar do flag existirem avaliações em ciclo
  // aberto (ciclo de outro CNPJ do grupo), o dado vence o flag.
  if (!temCicloAberto && avaliacoes.length === 0) {
    return { situacao: "SEM_CICLO", concluidas: 0, total: 0 };
  }
  if (avaliacoes.length === 0) return { situacao: "SEM_AVALIACAO", concluidas: 0, total: 0 };
  const concluidas = avaliacoes.filter((a) => a.status === "CONCLUIDA").length;
  return {
    situacao: concluidas === avaliacoes.length ? "CONCLUIDA" : "EM_ANDAMENTO",
    concluidas,
    total: avaliacoes.length,
  };
}

// ---------------------------------------------------------------
// Trilha dos primeiros 90 dias
// ---------------------------------------------------------------

export type StatusMarco = "FEITA" | "ATRASADA" | "AGENDADA" | "SEM_PRAZO" | "FORA_DA_TRILHA";

export type MarcoConversa = {
  item: string;
  label: string;
  status: StatusMarco;
  /** O prazo do item; para marco fora da trilha, a data em que ele DEVERIA cair. */
  prazo: Date | null;
};

export type TrilhaDaLinha = {
  gerada: boolean;
  total: number;
  concluidos: number;
  /** Sempre os 3 marcos de conversa, na ordem 30 → 60 → 90. */
  marcos: MarcoConversa[];
};

/**
 * "FORA_DA_TRILHA" cobre trilha gerada antes de os marcos entrarem no catálogo:
 * o item não existe no banco, mas fingir "agendada" seria inventar registro. A
 * tela mostra o estado e a data em que o marco deveria cair, para o RH decidir
 * se adiciona à mão.
 */
function trilhaDaLinha(
  itens: ItemTrilhaParaTime[],
  dataAdmissao: Date | null,
  hoje: Date,
): TrilhaDaLinha {
  const marcos: MarcoConversa[] = Object.entries(DIAS_DO_MARCO).map(([valor, dias]) => {
    const label = itemOnboardingLabel(valor);
    const item = itens.find((i) => i.item === valor);
    if (!item) {
      return {
        item: valor,
        label,
        status: "FORA_DA_TRILHA" as const,
        prazo: dataAdmissao ? somarDiasUTC(dataAdmissao, dias) : null,
      };
    }
    if (item.concluido) return { item: valor, label, status: "FEITA" as const, prazo: item.prazo };
    if (!item.prazo) return { item: valor, label, status: "SEM_PRAZO" as const, prazo: null };
    return {
      item: valor,
      label,
      status: item.prazo < hoje ? ("ATRASADA" as const) : ("AGENDADA" as const),
      prazo: item.prazo,
    };
  });

  return {
    gerada: itens.length > 0,
    total: itens.length,
    concluidos: itens.filter((i) => i.concluido).length,
    marcos,
  };
}

// ---------------------------------------------------------------
// Janela de decisão do contrato de experiência
// ---------------------------------------------------------------

/**
 * "O vencimento mais caro do RH" (CLT art. 445/451, ver lib/constants-dp.ts):
 * passado o prazo sem rescindir ou renovar, o contrato vira indeterminado —
 * aviso prévio e 40% do FGTS que a empresa não esperava. O prazo não avisa,
 * simplesmente passa; este bloco é o aviso que faltava.
 *
 * Só se aplica a CONTRATOS_POR_PRAZO com `dataFimContrato` preenchida —
 * CLT indeterminado não tem data de fim, e um contrato por prazo SEM data
 * preenchida é lacuna de cadastro (ver `lacunasDaLinha`), não janela.
 */
export type UrgenciaContrato = "critica" | "atencao" | null;

export type JanelaContrato = {
  aplicavel: boolean;
  /** Negativo = prazo já vencido. */
  diasAteFim: number | null;
  /** "critica" a 45 dias ou menos, "atencao" até 90, null fora da janela. */
  urgencia: UrgenciaContrato;
};

function janelaContratoDaLinha(
  tipoContrato: string | null,
  dataFimContrato: Date | null,
  hoje: Date,
): JanelaContrato {
  const porPrazo =
    tipoContrato !== null &&
    CONTRATOS_POR_PRAZO.includes(tipoContrato as (typeof CONTRATOS_POR_PRAZO)[number]);
  if (!porPrazo || !dataFimContrato) {
    return { aplicavel: false, diasAteFim: null, urgencia: null };
  }
  const diasAteFim = Math.round((dataFimContrato.getTime() - hoje.getTime()) / 86_400_000);
  const urgencia: UrgenciaContrato = diasAteFim <= 45 ? "critica" : diasAteFim <= 90 ? "atencao" : null;
  return { aplicavel: true, diasAteFim, urgencia };
}

// ---------------------------------------------------------------
// Linha e montagem
// ---------------------------------------------------------------

export type LinhaTime = {
  id: string;
  nome: string;
  empresaId: string;
  empresa: string;
  setor: string;
  cargo: string;
  /** "2 anos e 3 meses" — null quando não há data de admissão. */
  tempoDeCasa: string | null;
  /** Anos decimais, para ordenar; null sem data. */
  anosDeCasa: number | null;
  /** Dias corridos desde a admissão (piso 0); null sem data. */
  diasDeCasa: number | null;
  recemChegado: boolean;
  ferias: FeriasDaLinha;
  avaliacao: AvaliacaoDaLinha;
  /** Rótulos curtos do que falta na ficha (espelho de lib/dashboard.ts). */
  lacunas: string[];
  nuncaAcessouPortal: boolean;
  semLider: boolean;
  /** Só preenchida para recém-chegado — é onde a trilha é acionável. */
  trilha: TrilhaDaLinha | null;
  janelaContrato: JanelaContrato;
};

export type ResumoTime = {
  total: number;
  recemChegados: number;
  feriasVencidas: number;
  semLider: number;
  nuncaAcessouPortal: number;
  fichasIncompletas: number;
  /** Só conta quem TEM ciclo aberto no CNPJ — ver aviso correspondente. */
  semAvaliacaoNoCiclo: number;
  comCicloAberto: number;
  semDataAdmissao: number;
  /** "critica" ou "atencao" — soma as duas, o card interno separa por chip. */
  contratosNaJanela: number;
};

export type MeuTime = {
  /** Todas as linhas do recorte, em ordem alfabética. */
  linhas: LinhaTime[];
  /** Menos de DIAS_JANELA_RECEM_CHEGADO dias de casa, do mais novo para o mais antigo. */
  recemChegados: LinhaTime[];
  resumo: ResumoTime;
  /** O que ficou fora de cada conta — a tela exibe junto do resultado. */
  avisos: string[];
};

const CHAVE_NAO_DEFINIDO = normalizarTexto("Não definido");

/** As mesmas lacunas de lib/dashboard.ts::lacunasDaBase, lidas pessoa a pessoa. */
function lacunasDaLinha(c: ColaboradorParaTime): string[] {
  const lacunas: string[] = [];
  if (c.semSalario) lacunas.push("sem salário");
  if (!c.dataAdmissao) lacunas.push("sem data de admissão");
  if (normalizarTexto(c.setor) === CHAVE_NAO_DEFINIDO) lacunas.push("sem setor");
  if (normalizarTexto(c.cargo) === CHAVE_NAO_DEFINIDO) lacunas.push("sem cargo");
  if (c.semCpf) lacunas.push("sem CPF");
  if (c.semTelegram) lacunas.push("sem Telegram");
  return lacunas;
}

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export function montarMeuTime(
  colaboradores: ColaboradorParaTime[],
  hoje: Date = hojeUTC(),
): MeuTime {
  const linhas: LinhaTime[] = colaboradores.map((c) => {
    const anos = c.dataAdmissao ? anosDeCasa(c.dataAdmissao, hoje) : null;
    // Dias pelo mesmo relógio de anosDeCasa (piso 0 para admissão futura), e
    // não por diferencaEmDiasUTC: os dois números aparecem lado a lado.
    const dias = anos === null ? null : Math.floor(anos * 365.25);
    const recemChegado = dias !== null && dias < DIAS_JANELA_RECEM_CHEGADO;

    return {
      id: c.id,
      nome: c.nome,
      empresaId: c.empresaId,
      empresa: c.empresa,
      setor: c.setor,
      cargo: c.cargo,
      tempoDeCasa: c.dataAdmissao ? tempoDeCasa(c.dataAdmissao, hoje) : null,
      anosDeCasa: anos,
      diasDeCasa: dias,
      recemChegado,
      ferias: feriasDaLinha(c.dataAdmissao, c.ferias, hoje),
      avaliacao: avaliacaoDaLinha(c.temCicloAberto, c.avaliacoesCicloAberto),
      lacunas: lacunasDaLinha(c),
      nuncaAcessouPortal: c.nuncaAcessouPortal,
      semLider: c.semLider,
      trilha: recemChegado ? trilhaDaLinha(c.trilha, c.dataAdmissao, hoje) : null,
      janelaContrato: janelaContratoDaLinha(c.tipoContrato, c.dataFimContrato, hoje),
    };
  });

  linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const recemChegados = linhas
    .filter((l) => l.recemChegado)
    .sort((a, b) => (a.diasDeCasa ?? 0) - (b.diasDeCasa ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));

  const comCicloAberto = colaboradores.filter((c) => c.temCicloAberto).length;
  const semDataAdmissao = linhas.filter((l) => l.anosDeCasa === null).length;

  const resumo: ResumoTime = {
    total: linhas.length,
    recemChegados: recemChegados.length,
    feriasVencidas: linhas.filter((l) => l.ferias.situacao === "VENCIDO").length,
    semLider: linhas.filter((l) => l.semLider).length,
    nuncaAcessouPortal: linhas.filter((l) => l.nuncaAcessouPortal).length,
    fichasIncompletas: linhas.filter((l) => l.lacunas.length > 0).length,
    semAvaliacaoNoCiclo: linhas.filter((l) => l.avaliacao.situacao === "SEM_AVALIACAO").length,
    comCicloAberto,
    semDataAdmissao,
    contratosNaJanela: linhas.filter((l) => l.janelaContrato.urgencia !== null).length,
  };

  const avisos: string[] = [];
  if (semDataAdmissao > 0) {
    avisos.push(
      `${plural(semDataAdmissao, "pessoa está", "pessoas estão")} sem data de admissão: ` +
        "ficam fora do tempo de casa, do cálculo de férias e do bloco de recém-chegados.",
    );
  }
  const semCiclo = linhas.length - comCicloAberto;
  if (semCiclo > 0 && comCicloAberto > 0) {
    avisos.push(
      `${plural(semCiclo, "pessoa está", "pessoas estão")} em CNPJ sem ciclo de avaliação aberto: ` +
        `"sem avaliação no ciclo" só conta as ${comCicloAberto} com ciclo aberto.`,
    );
  }
  if (comCicloAberto === 0 && linhas.length > 0) {
    avisos.push("Nenhum CNPJ deste recorte tem ciclo de avaliação aberto agora.");
  }

  return { linhas, recemChegados, resumo, avisos };
}
