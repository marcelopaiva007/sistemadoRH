// Malha de liderança (span of control): quem lidera quem, quantos, e onde a
// estrutura está torta.
//
// Funções puras — recebem os ativos já buscados do banco e devolvem números
// prontos para a tela. Nada aqui toca o Prisma, igual a lib/bi.ts.
//
// ESCOPO DE USO: marca/grupo, nunca um CNPJ isolado. No dado real, 88% dos
// liderados reportam a líder cadastrado em OUTRO CNPJ — o maior líder do grupo
// tem 57 diretos vistos pela marca e apenas 7 se o recorte for o CNPJ dele. A
// tela app/(app)/rh/[empresaId]/organograma/ já busca por marca por esse
// motivo; use o mesmo recorte aqui. `medirMalhaLideranca` devolve um aviso
// quando percebe recorte de um CNPJ só, mas não tem como se defender sozinha.
//
// O QUE NÃO DÁ PARA MEDIR (já verificado no dado, não tente):
// - Turnover da equipe de cada líder: 1 dos 137 desligados tem supervisorId.
//   Nenhuma saída é atribuível a um gestor.
// - Absenteísmo por líder: a tabela Ausencia está vazia.
// - "Líder sem nenhum liderado": zero linhas hoje; `divergenciaCadastroGerente`
//   devolve o campo mesmo assim, mas não vale tela dedicada.

// O que a tela precisa mandar. Espelha o `select` do organograma (nomes já
// resolvidos, nada de salário/dado bancário indo para o cliente) e acrescenta
// `gerente`, que é a segunda fonte de verdade sobre liderança.
export type ColaboradorParaLideranca = {
  id: string;
  nome: string;
  supervisorId: string | null;
  // Flag do RH ("quem avalia a equipe no ciclo"), independente de supervisorId.
  // As duas fontes discordam no dado real justo nos dois maiores líderes — é o
  // achado que `divergenciaCadastroGerente` existe para expor, então este campo
  // é obrigatório: com ele opcional, um caller que esquecesse de selecioná-lo
  // receberia a lista de divergências silenciosamente errada.
  gerente: boolean;
  setor: { nome: string };
  posicao: { nome: string };
  empresa: { nome: string };
};

// ---------------------------------------------------------------
// Faixas de span
// ---------------------------------------------------------------

export type FaixaSpan = "fragmentado" | "saudavel" | "atencao" | "sobrecarga";

export const ROTULO_FAIXA_SPAN: Record<FaixaSpan, string> = {
  fragmentado: "Fragmentado (1–2)",
  saudavel: "Saudável (3–10)",
  atencao: "Atenção (11–15)",
  sobrecarga: "Sobrecarga (16+)",
};

/**
 * Span de 1–2 é "fragmentado", não "confortável": líder com um subordinado
 * costuma ser cargo de título, camada a mais no caminho da decisão. O teto de
 * 10 e a zona de atenção até 15 são a régua clássica de RH — acima disso o
 * líder não consegue dar acompanhamento individual, e é onde estão os dois
 * casos reais do grupo (52 e 57 diretos).
 */
export function faixaDeSpan(diretos: number): FaixaSpan {
  if (diretos <= 2) return "fragmentado";
  if (diretos <= 10) return "saudavel";
  if (diretos <= 15) return "atencao";
  return "sobrecarga";
}

// ---------------------------------------------------------------
// Líderes
// ---------------------------------------------------------------

export type LinhaLider = {
  id: string;
  nome: string;
  /** CNPJ onde o líder está cadastrado — não onde a equipe dele está. */
  empresa: string;
  setor: string;
  cargo: string;
  gerente: boolean;
  diretos: number;
  /** CNPJs distintos entre os liderados (conta o do próprio líder se houver liderado nele). */
  cnpjsSob: number;
  setoresSob: number;
  /** Liderados cadastrados em CNPJ diferente do líder — a medida da malha atravessada. */
  diretosForaDoCnpj: number;
  faixa: FaixaSpan;
};

/**
 * Um nível só: conta APENAS reporte direto, sem descer a árvore. Além de ser a
 * definição de span of control, isso torna a função imune a ciclo de supervisor
 * já gravado no banco — lib/organograma.ts barra ciclo novo na escrita, mas
 * nada garante que o histórico esteja limpo, e uma travessia recursiva aqui
 * entraria em loop.
 *
 * `setoresSob` conta NOME de setor, não `setorId`: Setor é por empresa (48
 * linhas para 15 nomes no dado real), então contar id inflaria — o segundo
 * maior líder apareceria com 13 setores quando são 5 setores distintos
 * espalhados por 5 CNPJs.
 */
export function lideresPorSpan(ativos: ColaboradorParaLideranca[]): LinhaLider[] {
  const porId = new Map(ativos.map(c => [c.id, c]));
  const equipes = new Map<string, ColaboradorParaLideranca[]>();

  for (const c of ativos) {
    // Auto-supervisão é erro de cadastro, não liderança: ninguém é o próprio
    // líder, e deixar passar criaria um líder fantasma com 1 direto.
    if (!c.supervisorId || c.supervisorId === c.id) continue;
    // Supervisor fora do recorte (inativo ou de outra marca) não vira líder
    // aqui — `coberturaDeLideranca` contabiliza esse caso à parte, para não
    // somar com quem realmente não tem líder nenhum.
    if (!porId.has(c.supervisorId)) continue;
    const equipe = equipes.get(c.supervisorId);
    if (equipe) equipe.push(c);
    else equipes.set(c.supervisorId, [c]);
  }

  const linhas: LinhaLider[] = [];
  for (const [id, equipe] of equipes) {
    const lider = porId.get(id)!;
    linhas.push({
      id,
      nome: lider.nome,
      empresa: lider.empresa.nome,
      setor: lider.setor.nome,
      cargo: lider.posicao.nome,
      gerente: lider.gerente,
      diretos: equipe.length,
      cnpjsSob: new Set(equipe.map(s => s.empresa.nome)).size,
      setoresSob: new Set(equipe.map(s => s.setor.nome)).size,
      diretosForaDoCnpj: equipe.filter(s => s.empresa.nome !== lider.empresa.nome).length,
      faixa: faixaDeSpan(equipe.length),
    });
  }

  return linhas.sort((a, b) => b.diretos - a.diretos || a.nome.localeCompare(b.nome, "pt-BR"));
}

export type LinhaFaixaSpan = {
  faixa: FaixaSpan;
  rotulo: string;
  lideres: number;
  liderados: number;
};

/**
 * Quantos líderes e quantas PESSOAS em cada faixa. As duas contagens juntas
 * porque separadas mentem em direções opostas: por líder, a sobrecarga são 2
 * de 17 (parece marginal); pelas pessoas embaixo, são 109 de 163.
 */
export function distribuicaoPorFaixa(lideres: LinhaLider[]): LinhaFaixaSpan[] {
  const ordem: FaixaSpan[] = ["fragmentado", "saudavel", "atencao", "sobrecarga"];
  return ordem.map(faixa => {
    const naFaixa = lideres.filter(l => l.faixa === faixa);
    return {
      faixa,
      rotulo: ROTULO_FAIXA_SPAN[faixa],
      lideres: naFaixa.length,
      liderados: naFaixa.reduce((t, l) => t + l.diretos, 0),
    };
  });
}

// ---------------------------------------------------------------
// Divergência entre as duas fontes de verdade
// ---------------------------------------------------------------

export type PessoaSimples = {
  id: string;
  nome: string;
  empresa: string;
  setor: string;
  cargo: string;
};

export type DivergenciaGerente = {
  /** Tem equipe por supervisorId mas o RH não marcou `gerente`. */
  lideraSemFlag: LinhaLider[];
  /** Marcado `gerente` mas ninguém aponta para ele por supervisorId. */
  flagSemLiderados: PessoaSimples[];
  totalMarcadosGerente: number;
};

/**
 * `supervisorId` e `gerente` respondem perguntas diferentes (a quem reporta ×
 * quem avalia no ciclo), então divergir não é necessariamente erro. Vira
 * problema quando a divergência cai justo em quem carrega a estrutura: no dado
 * real os dois ÚNICOS líderes não marcados `gerente` são os dois maiores, com
 * 109 dos 163 liderados. Por isso `lideraSemFlag` sai como `LinhaLider`
 * completo e já ordenado por span — quem lê precisa ver o tamanho junto, não só
 * o nome.
 */
export function divergenciaCadastroGerente(
  ativos: ColaboradorParaLideranca[],
  lideres: LinhaLider[] = lideresPorSpan(ativos)
): DivergenciaGerente {
  const comEquipe = new Set(lideres.map(l => l.id));
  const marcados = ativos.filter(c => c.gerente);
  return {
    lideraSemFlag: lideres.filter(l => !l.gerente),
    flagSemLiderados: marcados
      .filter(c => !comEquipe.has(c.id))
      .map(c => ({
        id: c.id,
        nome: c.nome,
        empresa: c.empresa.nome,
        setor: c.setor.nome,
        cargo: c.posicao.nome,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    totalMarcadosGerente: marcados.length,
  };
}

// ---------------------------------------------------------------
// Cobertura: quem está fora de qualquer equipe
// ---------------------------------------------------------------

export type CoberturaDeLideranca = {
  totalAtivos: number;
  /** Ativos com líder identificado dentro do recorte. */
  comLider: number;
  /** `supervisorId` em branco — o RH nunca preencheu. */
  semSupervisor: number;
  /**
   * `supervisorId` preenchido apontando para alguém que não está no recorte
   * (líder desligado, ou de outra marca). Não é "sem líder": é liderança que o
   * recorte cortou, e somar os dois esconderia justo o efeito do recorte.
   */
  supervisorForaDoRecorte: number;
  /** Cadastro apontando para o próprio id. Erro de dado, separado do resto. */
  autoSupervisao: number;
  pctSemSupervisor: number;
  semSupervisorPorSetor: { setor: string; total: number }[];
  /**
   * A mesma contagem por CNPJ. Não é decoração: no grupo, os 52 sem líder não
   * estão espalhados — são 39 de um CNPJ, 7 de outro, 4 de outro e só 2 do
   * resto. Sem essa quebra, "24% sem supervisor" vira um problema difuso do
   * grupo quando na verdade são três CNPJs que nunca preencheram o campo.
   */
  semSupervisorPorEmpresa: { empresa: string; total: number }[];
};

/** Onde a malha não chega. A quebra por setor é o que transforma "52 sem líder" em ação: no dado real 33 dos 52 estão na Área Técnica. */
export function coberturaDeLideranca(ativos: ColaboradorParaLideranca[]): CoberturaDeLideranca {
  const porId = new Map(ativos.map(c => [c.id, c]));
  let comLider = 0;
  let semSupervisor = 0;
  let supervisorForaDoRecorte = 0;
  let autoSupervisao = 0;
  const porSetor = new Map<string, number>();
  const porEmpresa = new Map<string, number>();

  for (const c of ativos) {
    if (!c.supervisorId) {
      semSupervisor++;
      porSetor.set(c.setor.nome, (porSetor.get(c.setor.nome) ?? 0) + 1);
      porEmpresa.set(c.empresa.nome, (porEmpresa.get(c.empresa.nome) ?? 0) + 1);
    } else if (c.supervisorId === c.id) {
      autoSupervisao++;
    } else if (porId.has(c.supervisorId)) {
      comLider++;
    } else {
      supervisorForaDoRecorte++;
    }
  }

  return {
    totalAtivos: ativos.length,
    comLider,
    semSupervisor,
    supervisorForaDoRecorte,
    autoSupervisao,
    pctSemSupervisor: ativos.length > 0 ? (semSupervisor / ativos.length) * 100 : 0,
    semSupervisorPorSetor: [...porSetor.entries()]
      .map(([setor, total]) => ({ setor, total }))
      .sort((a, b) => b.total - a.total || a.setor.localeCompare(b.setor, "pt-BR")),
    semSupervisorPorEmpresa: [...porEmpresa.entries()]
      .map(([empresa, total]) => ({ empresa, total }))
      .sort((a, b) => b.total - a.total || a.empresa.localeCompare(b.empresa, "pt-BR")),
  };
}

// ---------------------------------------------------------------
// Concentração
// ---------------------------------------------------------------

export type Concentracao = {
  topN: number;
  /** Base: pessoas com líder dentro do recorte, não o headcount total. */
  liderados: number;
  lideradosNoTopo: number;
  pct: number;
  lideres: { nome: string; diretos: number }[];
  /**
   * false quando há `topN` líderes ou menos — aí o percentual é 100% por
   * construção e não diz nada sobre concentração. Mesma lógica de "grupo
   * pequeno não entra em ranking": não mostre o número, mostre o motivo.
   */
  informativa: boolean;
};

/** Quanto da estrutura depende de pouca gente. Dois líderes carregando 67% é risco de continuidade, não eficiência. */
export function concentracaoNoTopo(lideres: LinhaLider[], topN = 2): Concentracao {
  const liderados = lideres.reduce((t, l) => t + l.diretos, 0);
  const topo = lideres.slice(0, topN);
  const lideradosNoTopo = topo.reduce((t, l) => t + l.diretos, 0);
  return {
    topN,
    liderados,
    lideradosNoTopo,
    pct: liderados > 0 ? (lideradosNoTopo / liderados) * 100 : 0,
    lideres: topo.map(l => ({ nome: l.nome, diretos: l.diretos })),
    informativa: lideres.length > topN,
  };
}

// ---------------------------------------------------------------
// Agregado para a tela
// ---------------------------------------------------------------

export type MalhaDeLideranca = {
  totalAtivos: number;
  totalLideres: number;
  cnpjsNoRecorte: number;
  lideres: LinhaLider[];
  faixas: LinhaFaixaSpan[];
  cobertura: CoberturaDeLideranca;
  divergencia: DivergenciaGerente;
  concentracao: Concentracao;
  /**
   * true quando NENHUM ativo do recorte tem supervisorId. Zero líder aqui é
   * ausência de cadastro, não estrutura horizontal — mesma distinção que a tela
   * de Pendências faz entre "tudo em dia" e "módulo nunca usado".
   */
  semNenhumSupervisorCadastrado: boolean;
  /**
   * CNPJs do recorte onde NINGUÉM tem supervisor. A versão por CNPJ de
   * `semNenhumSupervisorCadastrado`: num recorte de grupo, três CNPJs sem
   * nenhuma liderança mapeada somem dentro do total e a média do grupo passa a
   * descrever uma realidade que não existe em nenhum deles.
   */
  cnpjsSemNenhumaLiderancaCadastrada: string[];
  /** Frases prontas sobre o que o número NÃO cobre. Vão para a tela e para o assistente sem reescrita, para os dois não divergirem. */
  avisos: string[];
};

export function medirMalhaLideranca(
  ativos: ColaboradorParaLideranca[],
  topN = 2
): MalhaDeLideranca {
  const lideres = lideresPorSpan(ativos);
  const cobertura = coberturaDeLideranca(ativos);
  const cnpjsNoRecorte = new Set(ativos.map(c => c.empresa.nome)).size;
  const semNenhumSupervisorCadastrado = ativos.length > 0 && ativos.every(c => !c.supervisorId);

  const comAlgumSupervisor = new Set(ativos.filter(c => c.supervisorId).map(c => c.empresa.nome));
  const cnpjsSemNenhumaLiderancaCadastrada = [...new Set(ativos.map(c => c.empresa.nome))]
    .filter(nome => !comAlgumSupervisor.has(nome))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const avisos: string[] = [];
  if (ativos.length === 0) {
    avisos.push("Nenhum colaborador ativo no recorte — não há malha para medir.");
  }
  if (semNenhumSupervisorCadastrado) {
    avisos.push(
      "Nenhum ativo deste recorte tem supervisor cadastrado. Isso é falta de preenchimento, não estrutura horizontal — não leia como organização enxuta."
    );
  }
  if (cnpjsNoRecorte === 1) {
    avisos.push(
      "Recorte de um CNPJ só: neste grupo a liderança atravessa CNPJ, então os spans daqui saem truncados e líderes grandes somem. Meça em escopo de marca/grupo."
    );
  }
  if (cobertura.semSupervisor > 0) {
    avisos.push(
      `${cobertura.semSupervisor} de ${cobertura.totalAtivos} ativos (${cobertura.pctSemSupervisor.toFixed(0)}%) estão sem supervisor cadastrado e não entram em nenhum span.`
    );
  }
  if (cobertura.supervisorForaDoRecorte > 0) {
    avisos.push(
      `${cobertura.supervisorForaDoRecorte} ativos apontam para um supervisor fora deste recorte (desligado ou de outra marca) — eles têm líder, mas o líder não é contado aqui.`
    );
  }
  if (!semNenhumSupervisorCadastrado && cnpjsSemNenhumaLiderancaCadastrada.length > 0) {
    avisos.push(
      `Sem nenhuma liderança cadastrada: ${cnpjsSemNenhumaLiderancaCadastrada.join(", ")}. Nestes CNPJs não há span para medir — é campo em branco, não equipe sem chefe. Qualquer média do recorte que os inclua está diluída por eles.`
    );
  }
  if (cobertura.autoSupervisao > 0) {
    avisos.push(
      `${cobertura.autoSupervisao} ativos estão cadastrados como supervisor de si mesmos — erro de cadastro, ignorados na contagem de span.`
    );
  }
  // Não dá para inferir liderança de quem já saiu: só 1 dos 137 desligados tem
  // supervisorId. Quem ler "malha de liderança" tende a perguntar em seguida
  // "e o turnover por gestor?" — o aviso corta a pergunta antes de alguém
  // construir a resposta em cima de 1 registro.
  avisos.push(
    "Métricas por líder cobrem apenas quem está ativo. Desligado quase nunca tem supervisor gravado, então não há como atribuir saídas nem absenteísmo a nenhum gestor."
  );

  return {
    totalAtivos: ativos.length,
    totalLideres: lideres.length,
    cnpjsNoRecorte,
    lideres,
    faixas: distribuicaoPorFaixa(lideres),
    cobertura,
    divergencia: divergenciaCadastroGerente(ativos, lideres),
    concentracao: concentracaoNoTopo(lideres, topN),
    semNenhumSupervisorCadastrado,
    cnpjsSemNenhumaLiderancaCadastrada,
    avisos,
  };
}
