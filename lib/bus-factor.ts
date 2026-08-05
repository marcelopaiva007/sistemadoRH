// Ponto único de falha por função (bus factor): quais funções param se UMA
// pessoa sair — e quais delas são justamente as de liderança.
//
// Por que existe: antes da canonização de cargos eram 65 combinações
// cargo×CNPJ entre os ativos, 36 com um único ocupante, 15 delas em cargos de
// liderança (Gerente Financeiro/Comercial/Redes/Estoque/RH/Vendas, Supervisão
// de Atendimento...). Nenhuma outra tela mostra isso: headcount agrega por
// setor e o organograma mostra a quem se reporta, não quantas pessoas sabem
// fazer o mesmo trabalho.
//
// Mesmo contrato de lib/bi.ts: funções puras, recebem os dados já carregados
// pelo caller e devolvem objeto pronto para a tela. Nada aqui toca o Prisma.
//
// ESCOPO: marca/grupo, como em lib/lideranca.ts. Num CNPJ pequeno quase todo
// cargo tem um ocupante só e a lista viraria ruído; `ocupantesNoGrupo` existe
// para separar "único aqui, mas com backup em outro CNPJ" de "único no grupo
// inteiro" — só o segundo é ponto único de verdade para o grupo.
import { hojeUTC } from "@/lib/datas";
import { normalizarTexto } from "@/lib/text";
import { anosDeCasa } from "@/lib/tempo-de-casa";
import type { LinhaLider } from "@/lib/lideranca";

// ---------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------

/** Só ATIVOS: ocupante é quem pode assumir o trabalho amanhã. O caller filtra. */
export type ColaboradorParaBusFactor = {
  id: string;
  nome: string;
  empresa: { nome: string };
  posicao: { nome: string };
  /** Null aceito: o ocupante aparece com tempo de casa "sem data", não some. */
  dataAdmissao: Date | null;
};

/**
 * Cargos que são bucket de cadastro, não função: "Não definido" (setor/cargo
 * não resolvido) e "Inativo" (desligado sem cargo conhecido). Ponto único de
 * falha neles seria falta de dado com cara de risco — ficam fora da conta e
 * viram número de exclusão no resumo, para não sumirem calados.
 */
export const CARGOS_BUCKET = ["Não definido", "Inativo"] as const;

const CHAVES_BUCKET = new Set(CARGOS_BUCKET.map(normalizarTexto));

/**
 * Heurística pelo NOME do cargo. A lista canônica de hoje é coberta por
 * gerente/supervisor/supervisão/coordenador/CEO; "diretor" entra por segurança
 * para cargo futuro — errar para mais aqui só sobe uma linha de severidade,
 * errar para menos esconde um gerente. Cargo que lidera sem nome de liderança
 * não é pego por isso — é o cruzamento com `diretos` que o resgata.
 */
const PADRAO_LIDERANCA = /\b(gerente|supervisor|supervisora|supervisao|coordenador|coordenadora|diretor|diretora|ceo)\b/;

export function cargoDeLideranca(nomeCargo: string): boolean {
  return PADRAO_LIDERANCA.test(normalizarTexto(nomeCargo));
}

// ---------------------------------------------------------------
// Severidade
// ---------------------------------------------------------------

export type SeveridadeBusFactor = "critica" | "alta" | "media" | "fragil";

export const ROTULO_SEVERIDADE: Record<SeveridadeBusFactor, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  fragil: "Frágil (2 ocupantes)",
};

/**
 * A partir de quantos diretos o ocupante único "também lidera de verdade".
 * Usa a mesma régua de lib/lideranca.ts: span 1–2 é "fragmentado" (cargo de
 * título); 3+ é equipe real. Ponto único que também carrega equipe é o pior
 * caso — a saída dessa pessoa derruba a função E deixa a equipe sem gestor.
 */
export const MINIMO_DIRETOS_LIDERANCA_REAL = 3;

const PESO_SEVERIDADE: Record<SeveridadeBusFactor, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  fragil: 3,
};

// ---------------------------------------------------------------
// Saída
// ---------------------------------------------------------------

export type OcupanteChave = {
  id: string;
  nome: string;
  /** CNPJ de cadastro do ocupante — relevante na visão de grupo, onde a linha não tem empresa. */
  empresa: string;
  /** Null = sem data de admissão; a tela mostra "sem data", nunca 0 ano. */
  anosDeCasa: number | null;
  /**
   * Reportes diretos segundo o cadastro de supervisor. 0 significa "nenhum
   * liderado CADASTRADO" — com 52 ativos sem supervisor na base, 0 não prova
   * que a pessoa não lidera. O aviso do resumo repete isso para a tela.
   */
  diretos: number;
  /** Dias de férias já vencidas (CLT art. 137) segundo o motor de férias. 0 = nada vencido. */
  feriasVencidasDias: number;
};

export type LinhaBusFactor = {
  cargo: string;
  /** CNPJ da combinação; null na visão de grupo (cargo somado em todos). */
  empresa: string | null;
  /** Heurística pelo nome do cargo — ver `cargoDeLideranca`. */
  lideranca: boolean;
  /** 1 ou 2 pessoas — combinações com 3+ ocupantes não viram linha. */
  ocupantes: OcupanteChave[];
  /** Ativos no grupo INTEIRO com esse cargo. 1 = não existe backup em nenhum CNPJ. */
  ocupantesNoGrupo: number;
  severidade: SeveridadeBusFactor;
};

export type BusFactor = {
  totalAtivos: number;
  /** Ativos com cargo de verdade — fora dos buckets. */
  avaliados: number;
  /** Ativos com cargo "Não definido"/"Inativo", fora da conta e ditos no aviso. */
  excluidosPorBucket: number;
  combosCargoEmpresa: number;
  cargosNoGrupo: number;
  porCargoEmpresa: {
    pontosUnicos: LinhaBusFactor[];
    duplas: LinhaBusFactor[];
  };
  /** O mesmo corte sem fatiar por CNPJ: cargo com 1–2 ocupantes no grupo inteiro. */
  porCargoNoGrupo: {
    pontosUnicos: LinhaBusFactor[];
    duplas: LinhaBusFactor[];
  };
  /**
   * Cruzamento com férias vencidas, restrito aos ocupantes únicos que a tela
   * trata como liderança (nome de liderança OU equipe real cadastrada — a
   * mesma seleção de severidade crítica/alta). `boaNoticia` separa "cruzamos e
   * ninguém está vencido" de "não havia o que cruzar": lista vazia com
   * boaNoticia=true é resultado que vale exibir, não coluna sem dado.
   */
  feriasVencidas: {
    ocupantesUnicosDeLideranca: number;
    comVencidas: { id: string; nome: string; cargo: string; empresa: string; dias: number }[];
    boaNoticia: boolean;
  };
  /** Frases literais para a tela e para o assistente — mesma regra das outras libs: ignorar é publicar número sem ressalva. */
  avisos: string[];
};

// ---------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------

/**
 * Mede o bus factor do recorte.
 *
 * `lideres` vem de `medirMalhaLideranca(...).lideres` (ou `lideresPorSpan`) do
 * MESMO recorte — recalcular aqui duplicaria a definição de span. Idem
 * `feriasVencidas`: passe `calcularPassivoFerias(...).vencido.lista`; a lista
 * completa traz `reais` (reversível a salário), mas só `colaboradorId` e
 * `dias` são copiados para a saída — nada de dinheiro atravessa esta função.
 */
export function medirBusFactor(
  ativos: ColaboradorParaBusFactor[],
  lideres: LinhaLider[],
  feriasVencidas: { colaboradorId: string; dias: number }[],
  hoje: Date = hojeUTC(),
): BusFactor {
  const diretosPorId = new Map(lideres.map(l => [l.id, l.diretos]));
  const vencidasPorId = new Map(feriasVencidas.map(v => [v.colaboradorId, v.dias]));

  // Balde por chave normalizada com a grafia mais frequente como rótulo — a
  // mesma defesa de lib/tempo-de-casa.ts: a base acabou de ser canonizada, mas
  // um cargo novo digitado com grafia divergente não pode virar duas funções.
  type Balde = { grafias: Map<string, number>; porEmpresa: Map<string, OcupanteChave[]>; todos: OcupanteChave[] };
  const porCargo = new Map<string, Balde>();
  let excluidosPorBucket = 0;

  for (const c of ativos) {
    const chave = normalizarTexto(c.posicao.nome);
    if (CHAVES_BUCKET.has(chave)) {
      excluidosPorBucket++;
      continue;
    }
    let balde = porCargo.get(chave);
    if (!balde) {
      balde = { grafias: new Map(), porEmpresa: new Map(), todos: [] };
      porCargo.set(chave, balde);
    }
    balde.grafias.set(c.posicao.nome, (balde.grafias.get(c.posicao.nome) ?? 0) + 1);

    const ocupante: OcupanteChave = {
      id: c.id,
      nome: c.nome,
      empresa: c.empresa.nome,
      anosDeCasa: c.dataAdmissao ? anosDeCasa(c.dataAdmissao, hoje) : null,
      diretos: diretosPorId.get(c.id) ?? 0,
      feriasVencidasDias: vencidasPorId.get(c.id) ?? 0,
    };
    balde.todos.push(ocupante);
    const daEmpresa = balde.porEmpresa.get(c.empresa.nome);
    if (daEmpresa) daEmpresa.push(ocupante);
    else balde.porEmpresa.set(c.empresa.nome, [ocupante]);
  }

  let combosCargoEmpresa = 0;
  const linhasEmpresa: LinhaBusFactor[] = [];
  const linhasGrupo: LinhaBusFactor[] = [];

  for (const balde of porCargo.values()) {
    const cargo = rotulo(balde.grafias);
    const lideranca = cargoDeLideranca(cargo);
    const noGrupo = balde.todos.length;

    combosCargoEmpresa += balde.porEmpresa.size;
    for (const [empresa, ocupantes] of balde.porEmpresa) {
      if (ocupantes.length > 2) continue;
      linhasEmpresa.push(linha(cargo, empresa, lideranca, ocupantes, noGrupo));
    }
    if (noGrupo <= 2) {
      linhasGrupo.push(linha(cargo, null, lideranca, balde.todos, noGrupo));
    }
  }

  ordenar(linhasEmpresa);
  ordenar(linhasGrupo);

  const pontosUnicos = linhasEmpresa.filter(l => l.ocupantes.length === 1);
  const duplas = linhasEmpresa.filter(l => l.ocupantes.length === 2);
  const pontosUnicosGrupo = linhasGrupo.filter(l => l.ocupantes.length === 1);
  const duplasGrupo = linhasGrupo.filter(l => l.ocupantes.length === 2);

  // "De liderança" = a mesma seleção que a tela destaca (crítica/alta): nome
  // de liderança ou equipe real cadastrada. Usar a severidade e não a flag
  // mantém no cruzamento o ocupante único de cargo comum que lidera 10 pessoas.
  const unicosDeLideranca = pontosUnicos.filter(l => l.severidade !== "media");
  const comVencidas = unicosDeLideranca
    .filter(l => l.ocupantes[0].feriasVencidasDias > 0)
    .map(l => ({
      id: l.ocupantes[0].id,
      nome: l.ocupantes[0].nome,
      cargo: l.cargo,
      empresa: l.ocupantes[0].empresa,
      dias: l.ocupantes[0].feriasVencidasDias,
    }));

  const avisos: string[] = [];
  if (ativos.length === 0) {
    avisos.push("Nenhum colaborador ativo no recorte — não há funções para avaliar.");
  }
  if (excluidosPorBucket > 0) {
    avisos.push(
      `${excluidosPorBucket} ativos com cargo "Não definido" ou "Inativo" ficaram fora da conta: são buckets de cadastro, não funções — "ponto único" neles seria falta de dado com cara de risco.`
    );
  }
  avisos.push(
    "Cargo de liderança é heurística pelo nome (gerente, supervisor, coordenador, diretor, CEO). A coluna de diretos vem do cadastro de supervisor: 0 significa equipe não cadastrada, não ausência de equipe."
  );
  const semAdmissao = linhasEmpresa.reduce(
    (t, l) => t + l.ocupantes.filter(o => o.anosDeCasa === null).length,
    0
  );
  if (semAdmissao > 0) {
    avisos.push(
      `${semAdmissao} ocupantes de função frágil estão sem data de admissão — o tempo de casa deles sai como "sem data", não como zero.`
    );
  }
  if (comVencidas.length > 0) {
    // O mesmo cuidado de lib/ferias-passivo.ts: vencido sem histórico de gozo
    // pode ser importação incompleta. A frase impede a tela de transformar o
    // cruzamento em dívida certa.
    avisos.push(
      `${comVencidas.length} ocupantes únicos de função de liderança têm férias vencidas — confirme o histórico de gozo com o DP antes de tratar como pendência certa.`
    );
  }

  return {
    totalAtivos: ativos.length,
    avaliados: ativos.length - excluidosPorBucket,
    excluidosPorBucket,
    combosCargoEmpresa,
    cargosNoGrupo: porCargo.size,
    porCargoEmpresa: { pontosUnicos, duplas },
    porCargoNoGrupo: { pontosUnicos: pontosUnicosGrupo, duplas: duplasGrupo },
    feriasVencidas: {
      ocupantesUnicosDeLideranca: unicosDeLideranca.length,
      comVencidas,
      boaNoticia: unicosDeLideranca.length > 0 && comVencidas.length === 0,
    },
    avisos,
  };
}

// ---------------------------------------------------------------
// Internos
// ---------------------------------------------------------------

function linha(
  cargo: string,
  empresa: string | null,
  lideranca: boolean,
  ocupantes: OcupanteChave[],
  ocupantesNoGrupo: number,
): LinhaBusFactor {
  return {
    cargo,
    empresa,
    lideranca,
    ocupantes: [...ocupantes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    ocupantesNoGrupo,
    severidade: severidade(ocupantes, lideranca),
  };
}

/**
 * Escada de severidade — só o ocupante único sobe nela; dupla é sempre
 * "frágil", porque com duas pessoas existe par para transição e a conversa é
 * outra (sucessão, não emergência):
 * - crítica: único que também lidera equipe real (3+ diretos) — a saída
 *   derruba a função e deixa a equipe sem gestor no mesmo dia;
 * - alta: único em cargo com nome de liderança, mesmo sem equipe cadastrada —
 *   com 52 ativos sem supervisor, diretos=0 não absolve ninguém;
 * - média: único em cargo comum.
 */
function severidade(ocupantes: OcupanteChave[], lideranca: boolean): SeveridadeBusFactor {
  if (ocupantes.length >= 2) return "fragil";
  if (ocupantes[0].diretos >= MINIMO_DIRETOS_LIDERANCA_REAL) return "critica";
  if (lideranca) return "alta";
  return "media";
}

function ordenar(linhas: LinhaBusFactor[]): void {
  linhas.sort(
    (a, b) =>
      PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade] ||
      // Menos gente no grupo primeiro: único no grupo inteiro vem antes de
      // único com backup em outro CNPJ.
      a.ocupantesNoGrupo - b.ocupantesNoGrupo ||
      a.cargo.localeCompare(b.cargo, "pt-BR") ||
      (a.empresa ?? "").localeCompare(b.empresa ?? "", "pt-BR")
  );
}

function rotulo(grafias: Map<string, number>): string {
  return [...grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0][0];
}
