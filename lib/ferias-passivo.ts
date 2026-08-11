// Passivo de férias do grupo — em dias e em reais.
//
// Agrega `calcularFerias` (lib/ferias.ts) sobre uma carteira inteira. O motor
// não é reescrito aqui: os períodos aquisitivos, o saldo e o status
// VENCIDO/VENCENDO continuam saindo de lá, para a tela de Férias e este
// consolidado nunca discordarem sobre quem venceu.
//
// Por que existe: férias vencidas são o único indicador do RH que já é dinheiro
// perdido hoje. Passado o período concessivo, o art. 137 manda pagar em dobro —
// e em 04/08/2026 eram 570 dias em SEIS pessoas, ou seja, seis conversas de
// agendamento, não um projeto. Um consolidado que não separa "570 dias caros"
// de "2.940 dias de saldo normal" esconde exatamente a parte acionável.
//
// Funções puras: recebem os arrays já carregados pelo Server Component e
// devolvem objeto pronto para a tela. Nada aqui toca o Prisma.
//
// ATENÇÃO DE PRIVACIDADE: as listas nominais trazem `reais` por pessoa, e
// dias × salário/30 × 4/3 é reversível — na prática é o salário. Quem montar a
// tela decide se isso desce para o Client Component; a matriz de permissão
// trata salário como dado de Diretoria/RH.
import { calcularFerias, type PeriodoAquisitivo, type SolicitacaoParaCalculo } from "@/lib/ferias";
import { hojeUTC, inicioDoDiaUTC, somarMesesUTC } from "@/lib/datas";
// Formatador único do projeto — os avisos saem prontos para leitura humana, e
// "R$ 80.033,89" numa frase de alerta não pode divergir da tabela ao lado.
import { formatarReais } from "@/lib/constants-beneficios";

/** Divisor da remuneração diária de férias — mês comercial, não dias corridos. */
export const DIAS_MES_COMERCIAL = 30;

/** Férias + 1/3 constitucional (CF art. 7º, XVII). */
export const FATOR_TERCO_CONSTITUCIONAL = 4 / 3;

/** Período concessivo estourado: a remuneração é dobrada (CLT art. 137). */
export const MULTIPLICADOR_DOBRA_ART_137 = 2;

/** Janela padrão da fila de urgência. Seis meses é o horizonte em que ainda dá para agendar sem atropelar escala. */
export const JANELA_FILA_MESES = 6;

/**
 * O que a importação de 27/07/2026 gravou em `observacoes` quando a data de
 * gozo não existia na planilha do DP. Reconhecer o texto é feio, mas é o único
 * marcador que ficou na base — e sem ele o sistema afirmaria que sabe quando a
 * pessoa saiu de férias.
 */
const MARCA_DATA_ESTIMADA = "data real não registrada";

export const NOTA_BASE_DE_CALCULO =
  "Base de cálculo: saldo em dias × salário base ÷ 30 × 4/3 (1/3 constitucional). NÃO inclui encargos patronais (INSS, FGTS) — o desembolso real é maior que o valor exibido.";

// ---------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------

export type ColaboradorParaPassivo = {
  colaboradorId: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  /** Null é aceito de propósito: sem admissão não há período aquisitivo, e quem sai da conta vira `ativosSemAdmissao` em vez de sumir calado. */
  dataAdmissao: Date | null;
  /** Null quando o salário não foi cadastrado. Nunca traduza para 0 — ver `valorDeDias`. */
  salarioBase: number | null;
  /** As mesmas solicitações que a tela de Férias carrega: status APROVADA ou PENDENTE. */
  solicitacoes: SolicitacaoParaCalculo[];
};

// ---------------------------------------------------------------
// Saída
// ---------------------------------------------------------------

/**
 * Dinheiro e dias são colunas SEPARADAS porque nem todo dia vira real.
 *
 * Em 04/08/2026, 49 ativos (Centrysol, VAPT e Mobility Tech) não tinham salário
 * cadastrado e carregavam 780 dos 2.940 dias de saldo. Somar esses dias como
 * R$ 0 faria três CNPJs aparecerem "baratos" por falta de cadastro. Por isso
 * `reais` só cobre `diasValorados`, e `parcial` obriga a tela a dizer isso.
 */
export type ValorEmReais = {
  reais: number;
  diasValorados: number;
  diasSemValoracao: number;
  parcial: boolean;
};

export type PessoaVencida = {
  colaboradorId: string;
  nome: string;
  empresaId: string;
  empresa: string;
  /** Saldo somado dos períodos já VENCIDOS dessa pessoa. */
  dias: number;
  /** Há quantos dias venceu o período mais antigo — é ele que define a urgência. */
  vencidoHaDias: number;
  /** Limite concessivo mais antigo estourado. */
  desde: Date;
  /** Null (não zero) quando falta salário: a dívida existe, o valor é desconhecido. */
  reais: number | null;
  reaisEmDobro: number | null;
  semHistorico: boolean;
};

export type LinhaFila = {
  colaboradorId: string;
  nome: string;
  empresaId: string;
  empresa: string;
  dias: number;
  limiteConcessivo: Date;
  /** Dias até o limite legal. Ordenação crescente = quem precisa sair primeiro. */
  diasAteLimite: number;
  reais: number | null;
  semHistorico: boolean;
};

export type LinhaPassivoEmpresa = {
  empresaId: string;
  empresa: string;
  ativos: number;
  dias: number;
  valor: ValorEmReais;
  /** Pessoas sem salário cadastrado — a razão de `valor.parcial`. */
  semSalario: number;
  semHistorico: number;
  diasSemHistorico: number;
  pessoasVencidas: number;
  diasVencidos: number;
  valorVencido: ValorEmReais;
};

export type PassivoFerias = {
  hoje: Date;
  ativosConsiderados: number;
  /** Ficaram fora do cálculo por falta de data de admissão. */
  ativosSemAdmissao: number;
  diasTotais: number;
  /**
   * O consolidado e a fatia indeterminada, lado a lado. `semHistorico` NÃO está
   * fora de `total` — está dentro, e destacada para a tela poder dizer quanto do
   * número depende de um dado que ninguém confirmou.
   */
  provisao: {
    total: ValorEmReais;
    comHistorico: ValorEmReais;
    semHistorico: ValorEmReais;
  };
  vencido: {
    pessoas: number;
    dias: number;
    valor: ValorEmReais;
    /** O que custa se virar pagamento em dobro (art. 137). */
    reaisEmDobro: number;
    /**
     * Quantos dos vencidos não têm NENHUM registro de férias. Em 04/08/2026 eram
     * 5 das 6 pessoas e 540 dos 570 dias: o número mais caro da tela é também o
     * que mais depende de cadastro não confirmado. Sem isso a tela afirmaria
     * "570 dias vencidos" com a mesma confiança dos dois casos.
     */
    pessoasSemHistorico: number;
    diasSemHistorico: number;
    lista: PessoaVencida[];
  };
  fila: {
    janelaMeses: number;
    pessoas: number;
    dias: number;
    linhas: LinhaFila[];
  };
  semHistorico: {
    /** Têm período aquisitivo fechado e NENHUMA solicitação registrada. */
    pessoas: number;
    dias: number;
    /** Ativos sem nenhum registro de férias, incluindo os que ainda não fecharam 12 meses (esses não têm saldo, por isso não entram em `pessoas`). */
    semRegistroAlgum: number;
  };
  semValoracao: {
    /**
     * Pessoas sem salário que TÊM saldo — só elas furam a conta de reais. Quem
     * está sem salário e sem saldo não tira nada do total, então não entra aqui.
     * O total de gente sem salário por CNPJ está em `porEmpresa[].semSalario`.
     */
    pessoas: number;
    dias: number;
    /** Nomes dos CNPJs afetados — a frase "os R$ são de 5 dos 8 CNPJs" precisa deles. */
    empresas: string[];
  };
  porEmpresa: LinhaPassivoEmpresa[];
  /** Frases literais para a tela e para o assistente. Ignorar é publicar número sem ressalva. */
  avisos: string[];
};

// ---------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------

const arredondarReais = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor de N dias de férias, ou null quando não há salário.
 *
 * Devolve null e não 0 por decisão de projeto: R$ 0 numa coluna de dinheiro lê
 * como "não deve nada", e o certo aqui é "não se sabe quanto deve".
 */
export function valorDeDias(dias: number, salarioBase: number | null): number | null {
  if (salarioBase === null || salarioBase <= 0) return null;
  return arredondarReais((dias * salarioBase * FATOR_TERCO_CONSTITUCIONAL) / DIAS_MES_COMERCIAL);
}

/**
 * A MESMA regra que a tela de Férias usa (app/(app)/rh/[empresaId]/ferias/page.tsx):
 * nenhuma solicitação registrada e pelo menos um período aquisitivo já fechado.
 *
 * Vive aqui como função para os dois lugares não divergirem — se um dia a regra
 * mudar, muda num lugar só. Não crie uma terceira definição de "sem histórico".
 */
export function semHistoricoDeFerias(
  solicitacoes: readonly SolicitacaoParaCalculo[],
  periodos: readonly PeriodoAquisitivo[],
): boolean {
  return solicitacoes.length === 0 && periodos.some((p) => p.status !== "EM_CURSO");
}

/** Acumulador interno: dias e reais crescem juntos, mas por caminhos diferentes. */
type Acumulador = { reais: number; diasValorados: number; diasSemValoracao: number };

const zerado = (): Acumulador => ({ reais: 0, diasValorados: 0, diasSemValoracao: 0 });

function somar(acc: Acumulador, dias: number, salarioBase: number | null): void {
  if (dias <= 0) return;
  const valor = valorDeDias(dias, salarioBase);
  if (valor === null) {
    acc.diasSemValoracao += dias;
    return;
  }
  acc.reais += valor;
  acc.diasValorados += dias;
}

function fechar(acc: Acumulador): ValorEmReais {
  return {
    reais: arredondarReais(acc.reais),
    diasValorados: acc.diasValorados,
    diasSemValoracao: acc.diasSemValoracao,
    parcial: acc.diasSemValoracao > 0,
  };
}

/**
 * Passivo consolidado dos ativos informados.
 *
 * `colaboradores` deve conter TODOS os ativos do recorte, inclusive os sem data
 * de admissão e os sem salário — é filtrando aqui dentro que dá para contar
 * quem ficou de fora. Filtrar antes faz o total nascer certo e mudo.
 */
export function calcularPassivoFerias(
  colaboradores: ColaboradorParaPassivo[],
  hoje: Date = hojeUTC(),
  janelaFilaMeses: number = JANELA_FILA_MESES,
): PassivoFerias {
  const referencia = inicioDoDiaUTC(hoje);
  const limiteDaFila = somarMesesUTC(referencia, janelaFilaMeses);

  const total = zerado();
  const comHistoricoAcc = zerado();
  const semHistoricoAcc = zerado();
  const vencidoAcc = zerado();

  let ativosSemAdmissao = 0;
  let diasTotais = 0;
  let semHistoricoPessoas = 0;
  let semHistoricoDias = 0;
  let semRegistroAlgum = 0;
  let semValoracaoPessoas = 0;
  let semValoracaoDias = 0;

  const vencidos: PessoaVencida[] = [];
  const fila: LinhaFila[] = [];
  const empresas = new Map<string, LinhaPassivoEmpresa & { _valor: Acumulador; _valorVencido: Acumulador }>();
  const empresasSemValoracao = new Map<string, number>();

  for (const c of colaboradores) {
    const linha =
      empresas.get(c.empresaId) ??
      {
        empresaId: c.empresaId,
        empresa: c.empresaNome,
        ativos: 0,
        dias: 0,
        valor: fechar(zerado()),
        semSalario: 0,
        semHistorico: 0,
        diasSemHistorico: 0,
        pessoasVencidas: 0,
        diasVencidos: 0,
        valorVencido: fechar(zerado()),
        _valor: zerado(),
        _valorVencido: zerado(),
      };
    empresas.set(c.empresaId, linha);
    linha.ativos++;
    if (c.salarioBase === null) linha.semSalario++;
    if (c.solicitacoes.length === 0) semRegistroAlgum++;

    if (!c.dataAdmissao) {
      ativosSemAdmissao++;
      continue;
    }

    const resumo = calcularFerias(c.dataAdmissao, c.solicitacoes, referencia);
    const saldo = resumo.saldoDisponivel;
    const indeterminado = semHistoricoDeFerias(c.solicitacoes, resumo.periodos);

    diasTotais += saldo;
    linha.dias += saldo;
    somar(total, saldo, c.salarioBase);
    somar(linha._valor, saldo, c.salarioBase);
    somar(indeterminado ? semHistoricoAcc : comHistoricoAcc, saldo, c.salarioBase);

    if (indeterminado) {
      semHistoricoPessoas++;
      semHistoricoDias += saldo;
      linha.semHistorico++;
      linha.diasSemHistorico += saldo;
    }
    if (c.salarioBase === null && saldo > 0) {
      semValoracaoPessoas++;
      semValoracaoDias += saldo;
      empresasSemValoracao.set(c.empresaNome, (empresasSemValoracao.get(c.empresaNome) ?? 0) + saldo);
    }

    // Vencido: o passivo que já é caro. Uma pessoa pode ter mais de um período
    // estourado — somam-se os dias, mas a urgência é a do mais antigo.
    const periodosVencidos = resumo.periodos.filter((p) => p.status === "VENCIDO" && p.saldo > 0);
    if (periodosVencidos.length > 0) {
      const dias = periodosVencidos.reduce((t, p) => t + p.saldo, 0);
      const maisAntigo = periodosVencidos.reduce((a, b) => (a.diasAteLimite <= b.diasAteLimite ? a : b));
      const reais = valorDeDias(dias, c.salarioBase);

      vencidos.push({
        colaboradorId: c.colaboradorId,
        nome: c.nome,
        empresaId: c.empresaId,
        empresa: c.empresaNome,
        dias,
        vencidoHaDias: -maisAntigo.diasAteLimite,
        desde: maisAntigo.limiteConcessivo,
        reais,
        reaisEmDobro: reais === null ? null : arredondarReais(reais * MULTIPLICADOR_DOBRA_ART_137),
        semHistorico: indeterminado,
      });

      somar(vencidoAcc, dias, c.salarioBase);
      somar(linha._valorVencido, dias, c.salarioBase);
      linha.pessoasVencidas++;
      linha.diasVencidos += dias;
    }

    // Fila: o que ainda dá para agendar. Vencido não entra — já passou do prazo
    // e tem bloco próprio; misturar os dois faria a fila parecer administrável.
    for (const p of resumo.periodos) {
      if (p.status === "EM_CURSO" || p.saldo === 0) continue;
      if (p.diasAteLimite < 0 || p.limiteConcessivo > limiteDaFila) continue;
      fila.push({
        colaboradorId: c.colaboradorId,
        nome: c.nome,
        empresaId: c.empresaId,
        empresa: c.empresaNome,
        dias: p.saldo,
        limiteConcessivo: p.limiteConcessivo,
        diasAteLimite: p.diasAteLimite,
        reais: valorDeDias(p.saldo, c.salarioBase),
        semHistorico: indeterminado,
      });
    }
  }

  vencidos.sort((a, b) => b.dias - a.dias || a.nome.localeCompare(b.nome));
  fila.sort((a, b) => a.diasAteLimite - b.diasAteLimite || a.nome.localeCompare(b.nome));

  const porEmpresa = [...empresas.values()]
    .map(({ _valor, _valorVencido, ...linha }) => ({
      ...linha,
      valor: fechar(_valor),
      valorVencido: fechar(_valorVencido),
    }))
    // Ordenado por DIAS, não por reais: reais tem buraco de cadastro e faria
    // Centrysol (720 dias, R$ 0 valorados) cair para o fim da lista.
    //
    // Sem corte de amostra pequena aqui de propósito — a regra de "grupo com
    // menos de 15 ativos sai do ranking" vale para TAXA, onde o denominador
    // pequeno distorce. Passivo é valor absoluto: um CNPJ de 4 pessoas com 0
    // dias está no fim da lista porque deve pouco, não por ruído estatístico.
    .sort((a, b) => b.dias - a.dias || a.empresa.localeCompare(b.empresa));

  const provisao = {
    total: fechar(total),
    comHistorico: fechar(comHistoricoAcc),
    semHistorico: fechar(semHistoricoAcc),
  };
  const valorVencido = fechar(vencidoAcc);

  const avisos: string[] = [NOTA_BASE_DE_CALCULO];
  if (semValoracaoDias > 0) {
    const nomes = [...empresasSemValoracao.keys()].sort();
    avisos.push(
      `${semValoracaoDias} dias de saldo (${semValoracaoPessoas} pessoas, em ${nomes.join(", ")}) estão SEM salário cadastrado e não entraram na conta em reais. Todo valor em R$ desta tela é parcial — é piso, não total.`,
    );
  }
  if (semHistoricoPessoas > 0) {
    avisos.push(
      `${semHistoricoPessoas} ativos com período aquisitivo fechado não têm NENHUM registro de férias (${semHistoricoDias} dias de saldo, ${provisao.semHistorico.reais > 0 ? `${formatarReais(provisao.semHistorico.reais)} valorados` : "sem valoração"}). Não dá para saber se nunca gozaram ou se o histórico não foi importado: se nunca gozaram, o passivo é maior; se falta importação, está inflado. Esses dias entram no consolidado e são indeterminados.`,
    );
  }
  if (ativosSemAdmissao > 0) {
    avisos.push(
      `${ativosSemAdmissao} ativos sem data de admissão ficaram fora do cálculo — sem admissão não existe período aquisitivo para derivar.`,
    );
  }

  const diasVencidos = vencidos.reduce((t, v) => t + v.dias, 0);
  const vencidosSemHistorico = vencidos.filter((v) => v.semHistorico);
  const diasVencidosSemHistorico = vencidosSemHistorico.reduce((t, v) => t + v.dias, 0);
  if (vencidos.length > 0) {
    avisos.push(
      `${vencidos.length} pessoas com ${diasVencidos} dias já vencidos (CLT art. 137): a exposição dobra se o pagamento sair em dobro.`,
    );
  }
  if (vencidosSemHistorico.length > 0) {
    avisos.push(
      `${vencidosSemHistorico.length} das ${vencidos.length} pessoas com férias vencidas (${diasVencidosSemHistorico} dos ${diasVencidos} dias) não têm nenhum registro de férias. Confirme o histórico dessas pessoas com o DP ANTES de tratar o valor como dívida — pode ser gozo não importado.`,
    );
  }

  return {
    hoje: referencia,
    ativosConsiderados: colaboradores.length - ativosSemAdmissao,
    ativosSemAdmissao,
    diasTotais,
    provisao,
    vencido: {
      pessoas: vencidos.length,
      dias: diasVencidos,
      valor: valorVencido,
      reaisEmDobro: arredondarReais(valorVencido.reais * MULTIPLICADOR_DOBRA_ART_137),
      pessoasSemHistorico: vencidosSemHistorico.length,
      diasSemHistorico: diasVencidosSemHistorico,
      lista: vencidos,
    },
    fila: {
      janelaMeses: janelaFilaMeses,
      pessoas: new Set(fila.map((f) => f.colaboradorId)).size,
      dias: fila.reduce((t, f) => t + f.dias, 0),
      linhas: fila,
    },
    semHistorico: { pessoas: semHistoricoPessoas, dias: semHistoricoDias, semRegistroAlgum },
    semValoracao: {
      pessoas: semValoracaoPessoas,
      dias: semValoracaoDias,
      empresas: [...empresasSemValoracao.keys()].sort(),
    },
    porEmpresa,
    avisos,
  };
}

// ---------------------------------------------------------------
// Programação futura
// ---------------------------------------------------------------

export type ProgramacaoFerias = {
  janelaMeses: number;
  /** Solicitações que começam de hoje até o fim da janela. */
  agendadas: number;
  totalRegistros: number;
  /** Data de início mais recente já registrada — mostra até onde o arquivo vai. */
  ultimoInicioRegistrado: Date | null;
  /** true = nada programado. É informação, não bug de tela. */
  vazia: boolean;
  aviso: string | null;
};

/**
 * Status que contam como agenda: pedido vivo (aguardando decisão) ou já
 * confirmado. REPROVADA/CANCELADA ficam de fora — mesmo recorte que o cálculo
 * de saldo usa (`ferias/page.tsx` busca `status in [APROVADA, PENDENTE]`).
 */
export const STATUS_DE_AGENDA: readonly string[] = ["PENDENTE", "APROVADA"];

/**
 * A regra única de "férias programada": pedido vivo que começa de hoje até o
 * fim da janela.
 *
 * Exportada porque o cartão "Férias programadas" (tela de Férias) e a lista
 * de /ferias/programadas contam por ela — contador e lista têm que dar o
 * mesmo número, e a única forma garantida é a regra morar num lugar só.
 */
export function contaComoProgramada(
  s: { dataInicio: Date; status: string },
  hoje: Date,
  janelaMeses: number = JANELA_FILA_MESES,
): boolean {
  const referencia = inicioDoDiaUTC(hoje);
  const inicio = inicioDoDiaUTC(s.dataInicio);
  return (
    STATUS_DE_AGENDA.includes(s.status) &&
    inicio >= referencia &&
    inicio <= somarMesesUTC(referencia, janelaMeses)
  );
}

/**
 * O que está efetivamente AGENDADO para os próximos meses.
 *
 * Existe porque em 04/08/2026 a resposta era zero: nenhuma das 264 solicitações
 * tem data de início futura (a mais recente começa em 19/05/2026). O módulo é
 * arquivo histórico do DP, não ferramenta de programação. Um calendário vazio
 * sem essa frase parece tela quebrada, e "0 férias marcadas" parece equipe
 * trabalhando sem parar — as duas leituras erradas pela mesma omissão.
 */
export function resumirProgramacaoFerias(
  solicitacoes: { dataInicio: Date; status: string }[],
  hoje: Date = hojeUTC(),
  janelaMeses: number = JANELA_FILA_MESES,
): ProgramacaoFerias {
  const agendadas = solicitacoes.filter((s) => contaComoProgramada(s, hoje, janelaMeses)).length;

  const ultimoInicioRegistrado = solicitacoes.reduce<Date | null>(
    (maior, s) => (maior === null || s.dataInicio > maior ? s.dataInicio : maior),
    null,
  );

  return {
    janelaMeses,
    agendadas,
    totalRegistros: solicitacoes.length,
    ultimoInicioRegistrado,
    vazia: agendadas === 0,
    aviso:
      agendadas === 0
        ? `Nenhuma férias programada para os próximos ${janelaMeses} meses. Os ${solicitacoes.length} registros existentes são histórico já gozado, não agenda — as férias programadas aparecerão aqui quando forem lançadas.`
        : null,
  };
}

// ---------------------------------------------------------------
// Origem do histórico
// ---------------------------------------------------------------

export type OrigemHistorico = {
  total: number;
  /** Vieram da planilha do DP com a data de gozo ESTIMADA. */
  estimadas: number;
  comDataReal: number;
  /** Nasceram de um pedido feito dentro do sistema (têm autor). */
  criadasNoSistema: number;
  aviso: string | null;
};

/**
 * De onde veio o histórico de gozo que zera o saldo das pessoas.
 *
 * Importa porque a quantidade de dias baixados é confiável, a DATA não: 169 dos
 * 264 registros dizem "período considerado quitado, data real não registrada".
 * Quem ler o passivo precisa saber que o saldo é bom e a linha do tempo é
 * aproximada — e que nenhuma solicitação nasceu dentro do sistema, o que
 * explica a fila de programação vazia.
 */
export function resumirOrigemDoHistorico(
  solicitacoes: { observacoes: string | null; solicitadoPorId: string | null }[],
): OrigemHistorico {
  const estimadas = solicitacoes.filter((s) => s.observacoes?.includes(MARCA_DATA_ESTIMADA)).length;
  const criadasNoSistema = solicitacoes.filter((s) => s.solicitadoPorId !== null).length;

  return {
    total: solicitacoes.length,
    estimadas,
    comDataReal: solicitacoes.length - estimadas,
    criadasNoSistema,
    aviso:
      estimadas > 0
        ? `${estimadas} dos ${solicitacoes.length} registros de férias foram importados com data de gozo ESTIMADA ("período considerado quitado, data real não registrada"). A quantidade de dias já baixados é confiável; as datas de início e fim, não.`
        : null,
  };
}
