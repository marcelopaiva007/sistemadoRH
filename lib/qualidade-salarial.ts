// Qualidade do dado salarial: diagnóstico de PREENCHIMENTO, não análise de
// remuneração.
//
// Por que o produto é este e não "análise de salário" (medido no banco vivo em
// 05/08/2026): dos 166 ativos com salário, 135 (81%) têm exatamente R$ 1.621 —
// o piso nacional. São 19 valores distintos na base inteira, e fora o CEO
// (R$ 20.000, corrigido hoje) o teto é R$ 2.498: gerência e diretoria não estão
// na base. Em 4 dos 10 cargos com 3+ salários, mínimo = máximo. Conclusão: o
// campo `salarioBase` está preenchido com o piso; a remuneração REAL (comissão,
// periculosidade, hora extra) não existe em lugar nenhum do sistema. Qualquer
// análise de custo construída sobre este campo herda isso — esta lib existe
// para a tela dizer isso com número, antes que alguém leia a folha-base como
// folha de verdade.
//
// Mesmo contrato de lib/bi.ts: funções puras, recebem os dados já carregados
// pelo caller e devolvem objeto pronto para a tela. Nada aqui toca o Prisma.
import { normalizarTexto } from "@/lib/text";
import { CARGOS_BUCKET } from "@/lib/bus-factor";

// ---------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------

/**
 * Só ATIVOS — o caller filtra. Sem `id` e sem `nome` de propósito: tudo que
 * sai daqui é agregado por cargo ou por valor, e a lista de abaixo do piso
 * desce ao cliente sem identificar ninguém — o diagnóstico precisa do valor e
 * do cargo, não da pessoa.
 */
export type ColaboradorParaQualidadeSalarial = {
  posicao: { nome: string };
  /** Texto livre importado do elleven ("Masculino" | "Feminino" | outro). */
  sexo: string | null;
  salarioBase: number | null;
  tipoContrato: string | null;
  jornadaSemanal: number | null;
};

// ---------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------

/**
 * Salário mínimo nacional vigente (2026). Hardcoded e não derivado do modal da
 * base de propósito: a leitura "abaixo do piso" é jurídica — ganhar menos que o
 * mínimo MENSAL só é regular com jornada parcial ou estágio — e essa régua não
 * pode se mover junto com o dado que ela avalia. O modal é medido à parte, e um
 * aviso dispara se os dois divergirem (sinal de reajuste não refletido aqui ou
 * de base que finalmente ganhou salários reais).
 */
export const PISO_NACIONAL = 1621;

/**
 * Piso de amostra da tabela por cargo — o mesmo espírito do piso de anonimato
 * das pesquisas, aplicado a dinheiro: "amplitude R$ 0" num cargo de 1 pessoa
 * não é diagnóstico de achatamento, é o salário daquela pessoa com outro nome.
 */
export const MINIMO_SALARIOS_POR_CARGO = 3;

/**
 * Mínimo de gente com sexo REGISTRADO para afirmar composição de um cargo.
 * "Técnico de Campo: 0 homens, 0 mulheres" existe na base — são 6 pessoas, as
 * 6 sem sexo preenchido. Sem este piso, buraco de cadastro viraria manchete de
 * segregação.
 */
export const MINIMO_SEXO_REGISTRADO = 3;

/**
 * Fração da base num único valor a partir da qual a lib declara que o campo
 * descreve o piso, não a remuneração. Hoje está em 81% — o limiar existe para o
 * aviso DESLIGAR sozinho no dia em que alguém importar salários de verdade,
 * não para calibrar o caso atual.
 */
export const LIMIAR_BASE_ACHATADA = 0.5;

const CHAVES_BUCKET = new Set(CARGOS_BUCKET.map(normalizarTexto));

// ---------------------------------------------------------------
// Saída
// ---------------------------------------------------------------

export type LinhaQualidadeCargo = {
  cargo: string;
  /** Ativos no cargo, com ou sem salário — o "26 de 33" da tela. */
  ativos: number;
  comSalario: number;
  valoresDistintos: number;
  /** Valor mais frequente DO CARGO (pode diferir do modal da base). */
  valorModal: number;
  /** % dos salários do cargo exatamente no valor modal. */
  noModalPct: number;
  /** Maior − menor salário do cargo, em R$ (centavos arredondados). */
  amplitudeReais: number;
  /** Amplitude zero: todo mundo no cargo ganha o mesmo valor no papel. */
  achatado: boolean;
};

/** Um valor abaixo do piso e quem está nele — por contagem e cargo, nunca por nome. */
export type FaixaAbaixoDoPiso = {
  valor: number;
  pessoas: number;
  /** Cargos distintos na faixa, ordem alfabética — "Estagiário" à mostra é o dado explicando a si mesmo. */
  cargos: string[];
  /** Quantos na faixa têm jornadaSemanal preenchida. 0 = o sistema não sabe se é meia jornada ou erro. */
  comJornada: number;
};

export type ComposicaoCargo = {
  cargo: string;
  ativos: number;
  homens: number;
  mulheres: number;
  semRegistro: number;
};

export type QualidadeSalarial = {
  ativos: number;
  comSalario: number;
  /** Ativos em cargo-bucket ("Não definido"/"Inativo") — fora dos recortes por cargo. */
  excluidosPorBucket: number;
  valoresDistintosNaBase: number;
  /** Valor mais frequente da base e quantos estão exatamente nele. null/0 sem salário nenhum. */
  valorModal: number | null;
  noModal: number;
  comTipoContrato: number;
  comJornada: number;
  /** Só cargos com >= MINIMO_SALARIOS_POR_CARGO salários; mais gente primeiro. */
  porCargo: LinhaQualidadeCargo[];
  /** Cargos com algum salário mas abaixo do piso de amostra — ditos, não somidos. */
  foraDaTabela: { cargos: number; salarios: number };
  /** Do menor valor para o maior. */
  abaixoDoPiso: FaixaAbaixoDoPiso[];
  genero: {
    /** Cargos com 3+ de sexo registrado e TODOS do mesmo lado — segregação ocupacional visível. */
    umLadoSo: ComposicaoCargo[];
    /**
     * Cargos com MINIMO_SEXO_REGISTRADO+ de CADA sexo — os únicos onde um gap
     * salarial seria tecnicamente comparável. `noModalPct` mede quanto dos
     * salários desses cargos está num único valor: perto de 100%, não existe
     * variância para um gap se esconder — nem para ser medido.
     */
    comparaveis: { cargos: number; comSalario: number; noModalPct: number | null };
    semRegistro: number;
  };
  /** Frases literais para a tela — mesma regra das outras libs: publicar número sem a ressalva é como ele mente. */
  avisos: string[];
};

// ---------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------

export function medirQualidadeSalarial(
  ativos: ColaboradorParaQualidadeSalarial[],
): QualidadeSalarial {
  // Balde por chave normalizada com a grafia mais frequente como rótulo — a
  // mesma defesa de lib/bus-factor.ts contra grafia divergente pós-canonização.
  type Balde = {
    grafias: Map<string, number>;
    salarios: number[];
    homens: number;
    mulheres: number;
    semRegistro: number;
    total: number;
  };
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
      balde = { grafias: new Map(), salarios: [], homens: 0, mulheres: 0, semRegistro: 0, total: 0 };
      porCargo.set(chave, balde);
    }
    balde.grafias.set(c.posicao.nome, (balde.grafias.get(c.posicao.nome) ?? 0) + 1);
    balde.total++;
    if (c.salarioBase != null) balde.salarios.push(c.salarioBase);
    const sexo = lerSexo(c.sexo);
    if (sexo === "M") balde.homens++;
    else if (sexo === "F") balde.mulheres++;
    else balde.semRegistro++;
  }

  const comSalario = ativos.filter(c => c.salarioBase != null);
  const [valorModal, noModal] = modalDe(comSalario.map(c => c.salarioBase!));

  // --- Tabela por cargo -------------------------------------------------
  const linhas: LinhaQualidadeCargo[] = [];
  let cargosFora = 0;
  let salariosFora = 0;
  for (const balde of porCargo.values()) {
    if (balde.salarios.length === 0) continue;
    if (balde.salarios.length < MINIMO_SALARIOS_POR_CARGO) {
      cargosFora++;
      salariosFora += balde.salarios.length;
      continue;
    }
    const [modal, freq] = modalDe(balde.salarios);
    const min = Math.min(...balde.salarios);
    const max = Math.max(...balde.salarios);
    const amplitudeReais = Math.round((max - min) * 100) / 100;
    linhas.push({
      cargo: rotulo(balde.grafias),
      ativos: balde.total,
      comSalario: balde.salarios.length,
      valoresDistintos: new Set(balde.salarios).size,
      valorModal: modal!,
      noModalPct: (freq / balde.salarios.length) * 100,
      amplitudeReais,
      achatado: amplitudeReais === 0,
    });
  }
  linhas.sort((a, b) => b.comSalario - a.comSalario || a.cargo.localeCompare(b.cargo, "pt-BR"));

  // --- Abaixo do piso ---------------------------------------------------
  const abaixoDoPiso = montarAbaixoDoPiso(ativos);

  // --- Gênero: composição, não remuneração ------------------------------
  const umLadoSo: ComposicaoCargo[] = [];
  let cargosComparaveis = 0;
  const salariosComparaveis: number[][] = [];
  for (const balde of porCargo.values()) {
    const registrados = balde.homens + balde.mulheres;
    if (
      registrados >= MINIMO_SEXO_REGISTRADO &&
      (balde.homens === 0 || balde.mulheres === 0)
    ) {
      umLadoSo.push({
        cargo: rotulo(balde.grafias),
        ativos: balde.total,
        homens: balde.homens,
        mulheres: balde.mulheres,
        semRegistro: balde.semRegistro,
      });
    }
    if (balde.homens >= MINIMO_SEXO_REGISTRADO && balde.mulheres >= MINIMO_SEXO_REGISTRADO) {
      cargosComparaveis++;
      salariosComparaveis.push(balde.salarios);
    }
  }
  umLadoSo.sort(
    (a, b) => b.homens + b.mulheres - (a.homens + a.mulheres) || a.cargo.localeCompare(b.cargo, "pt-BR"),
  );

  // Nos cargos comparáveis, quanto da folha está num valor só — modal POR CARGO
  // e não da base: é dentro do cargo que um gap se mediria.
  const totalComparaveis = salariosComparaveis.reduce((t, s) => t + s.length, 0);
  const noModalComparaveis = salariosComparaveis.reduce((t, s) => t + modalDe(s)[1], 0);
  const comparaveis = {
    cargos: cargosComparaveis,
    comSalario: totalComparaveis,
    noModalPct: totalComparaveis > 0 ? (noModalComparaveis / totalComparaveis) * 100 : null,
  };

  const semRegistroSexo = ativos.filter(c => lerSexo(c.sexo) === null).length;
  const comTipoContrato = ativos.filter(c => c.tipoContrato != null).length;
  const comJornada = ativos.filter(c => c.jornadaSemanal != null).length;

  return {
    ativos: ativos.length,
    comSalario: comSalario.length,
    excluidosPorBucket,
    valoresDistintosNaBase: new Set(comSalario.map(c => c.salarioBase!)).size,
    valorModal,
    noModal,
    comTipoContrato,
    comJornada,
    porCargo: linhas,
    foraDaTabela: { cargos: cargosFora, salarios: salariosFora },
    abaixoDoPiso,
    genero: { umLadoSo, comparaveis, semRegistro: semRegistroSexo },
    avisos: montarAvisos({
      ativos: ativos.length,
      comSalario: comSalario.length,
      valorModal,
      noModal,
      comTipoContrato,
      comJornada,
      abaixoDoPiso,
      comparaveis,
    }),
  };
}

// ---------------------------------------------------------------
// Internos
// ---------------------------------------------------------------

/** Valor mais frequente e a contagem dele. Empate vai pro MENOR valor — num diagnóstico de achatamento no piso, o piso ganha o desempate. */
function modalDe(valores: number[]): [number | null, number] {
  if (valores.length === 0) return [null, 0];
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  const [valor, freq] = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return [valor, freq];
}

/** "Masculino"/"Feminino" (com variação de caixa/acento) — o resto é sem registro, nunca um terceiro grupo inferido. */
function lerSexo(sexo: string | null): "M" | "F" | null {
  if (!sexo) return null;
  const chave = normalizarTexto(sexo);
  if (chave === "masculino" || chave === "m") return "M";
  if (chave === "feminino" || chave === "f") return "F";
  return null;
}

function montarAbaixoDoPiso(ativos: ColaboradorParaQualidadeSalarial[]): FaixaAbaixoDoPiso[] {
  type Faixa = { pessoas: number; cargos: Set<string>; comJornada: number };
  const porValor = new Map<number, Faixa>();
  for (const c of ativos) {
    if (c.salarioBase == null || c.salarioBase >= PISO_NACIONAL) continue;
    let faixa = porValor.get(c.salarioBase);
    if (!faixa) {
      faixa = { pessoas: 0, cargos: new Set(), comJornada: 0 };
      porValor.set(c.salarioBase, faixa);
    }
    faixa.pessoas++;
    faixa.cargos.add(c.posicao.nome);
    if (c.jornadaSemanal != null) faixa.comJornada++;
  }
  return [...porValor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([valor, f]) => ({
      valor,
      pessoas: f.pessoas,
      cargos: [...f.cargos].sort((a, b) => a.localeCompare(b, "pt-BR")),
      comJornada: f.comJornada,
    }));
}

function rotulo(grafias: Map<string, number>): string {
  return [...grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0][0];
}

function montarAvisos(d: {
  ativos: number;
  comSalario: number;
  valorModal: number | null;
  noModal: number;
  comTipoContrato: number;
  comJornada: number;
  abaixoDoPiso: FaixaAbaixoDoPiso[];
  comparaveis: { cargos: number; comSalario: number; noModalPct: number | null };
}): string[] {
  const avisos: string[] = [];

  if (d.comSalario < d.ativos) {
    avisos.push(
      `${d.ativos - d.comSalario} dos ${d.ativos} ativos não têm salário cadastrado — estão fora de toda esta seção, não "ganhando R$ 0".`,
    );
  }

  if (d.valorModal !== null && d.noModal / d.comSalario >= LIMIAR_BASE_ACHATADA) {
    const pct = Math.round((d.noModal / d.comSalario) * 100);
    avisos.push(
      `${d.noModal} dos ${d.comSalario} salários (${pct}%) são exatamente o mesmo valor. O campo descreve o piso de contratação, não a remuneração: comissão, periculosidade e hora extra não existem em campo nenhum do sistema — qualquer custo calculado daqui é subestimado.`,
    );
  }

  // Modal fora do piso: ou o mínimo foi reajustado e a constante ficou para
  // trás, ou a base finalmente ganhou salários reais — nos dois casos a leitura
  // "abaixo do piso" precisa de revisão humana antes de continuar valendo.
  if (d.valorModal !== null && d.valorModal !== PISO_NACIONAL) {
    avisos.push(
      `O valor mais comum da base (R$ ${d.valorModal.toLocaleString("pt-BR")}) difere do piso nacional configurado (R$ ${PISO_NACIONAL.toLocaleString("pt-BR")}) — confira se o piso em lib/qualidade-salarial.ts está atualizado antes de ler a lista de abaixo do piso.`,
    );
  }

  if (d.abaixoDoPiso.length > 0) {
    const pessoas = d.abaixoDoPiso.reduce((t, f) => t + f.pessoas, 0);
    avisos.push(
      `${pessoas} ativos ganham abaixo do piso nacional. Com jornada semanal preenchida em ${d.comJornada} de ${d.ativos} e tipo de contrato em ${d.comTipoContrato} de ${d.ativos}, o sistema NÃO SABE distinguir estagiário e meia jornada de erro de digitação — por isso o rótulo é "jornada não cadastrada", não "irregular".`,
    );
  }

  avisos.push(
    d.comparaveis.cargos === 0
      ? "Gap salarial por sexo não é calculável: nenhum cargo tem gente suficiente dos dois sexos para comparar."
      : `Gap salarial por sexo não é calculável com honestidade: só ${d.comparaveis.cargos} ${d.comparaveis.cargos === 1 ? "cargo tem" : "cargos têm"} ${MINIMO_SEXO_REGISTRADO}+ pessoas de cada sexo${
          d.comparaveis.noModalPct !== null
            ? `, e neles ${Math.round(d.comparaveis.noModalPct)}% dos salários estão num único valor — não há variância onde um gap poderia aparecer`
            : ""
        }. O que este dado sustenta é composição, não remuneração.`,
  );

  return avisos;
}
