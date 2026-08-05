// Distribuição de tempo de casa dos ativos: quartis, faixas e recorte por setor
// e por cargo.
//
// Existe para matar a leitura da média sozinha. Nesta base a média de tempo de
// casa é 2,08 anos, mas a mediana é 1,40 e o p25 é 0,50 — 41% dos ativos têm
// menos de um ano de casa. A média fica acima da mediana puxada por uma minoria
// de veteranos e descreve um quadro estável que não existe em parte dos times.
//
// Mesmo contrato de lib/bi.ts: funções puras, recebem os colaboradores já
// carregados pelo caller e devolvem objeto pronto para a tela. Nada aqui toca o
// Prisma, para dar para testar sem banco.
import { hojeUTC } from "@/lib/datas";
import { normalizarTexto } from "@/lib/text";

/**
 * Texto fixo para exibir ao lado de QUALQUER média de tempo de casa (o KPI que
 * o painel já mostra). O aviso vale mais que o gráfico: a média sobe quando quem
 * sai é novato, então a série temporal desse KPI se move na direção contrária da
 * intuição de quem lê. Sem esse texto ao lado, "o tempo médio subiu" é lido como
 * boa notícia justamente no mês em que a empresa perdeu os recém-contratados.
 */
export const AVISO_MEDIA_TEMPO_DE_CASA =
  "A média de tempo de casa SOBE quando quem sai é novato: desligando quem tinha " +
  "pouco tempo, sobra gente mais antiga e a média cresce. Por isso “tempo médio " +
  "subiu” não quer dizer “retenção melhorou” — pode ser exatamente o contrário. " +
  "Quem responde se a casa está segurando gente é a distribuição: a mediana e o " +
  "% do time com menos de 1 ano.";

const MS_POR_ANO = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Quantas pessoas um grupo precisa ter para o quartil dele significar alguma
 * coisa. Medido: 31 dos 40 cargos têm menos de 5 pessoas — mediana de cargo com
 * 2 pessoas é anedota com cara de estatística.
 */
export const MINIMO_PARA_QUARTIL = 8;

/** Rótulo da linha que junta os cargos pequenos demais para ter quartil próprio. */
export const ROTULO_DEMAIS_CARGOS = "Demais cargos";

/** Grupo de quem está com setor/cargo não resolvido no cadastro. */
export const ROTULO_SEM_GRUPO = "Não definido";

/**
 * Tempo de casa em anos decimais (mesma divisão por 365,25 de
 * `bi.ts::tempoMedioDeCasaAnos`, para os dois números baterem na mesma tela).
 *
 * Piso em zero: admissão futura (contrato que ainda vai começar) e o resíduo de
 * fuso das datas legadas — gravadas como 03:00Z em vez de meia-noite — produzem
 * frações negativas, que embaralhariam quartil e ordenação. Quem ainda não
 * começou conta como dia zero.
 */
export function anosDeCasa(dataAdmissao: Date, hoje: Date = hojeUTC()): number {
  return Math.max(0, (hoje.getTime() - dataAdmissao.getTime()) / MS_POR_ANO);
}

// ---------------------------------------------------------------
// Quartis
// ---------------------------------------------------------------

export type Quartis = { p25: number; mediana: number; p75: number };

/**
 * Quartis por interpolação linear entre os dois vizinhos — o mesmo método do
 * `PERCENTIL.INC` do Excel e do `numpy.percentile` padrão, escolhido para o RH
 * conferir o número na planilha dele e bater.
 *
 * Devolve `null` com array vazio em vez de zeros: p25 = 0 seria lido como "um
 * quarto do time acabou de entrar", quando a verdade é que ninguém tem data.
 */
export function quartis(valores: number[]): Quartis | null {
  if (valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b); // cópia: a função não mexe no array do caller
  return {
    p25: quantilDeOrdenado(ordenado, 0.25),
    mediana: quantilDeOrdenado(ordenado, 0.5),
    p75: quantilDeOrdenado(ordenado, 0.75),
  };
}

function quantilDeOrdenado(ordenado: number[], p: number): number {
  const posicao = (ordenado.length - 1) * p;
  const inferior = Math.floor(posicao);
  const fracao = posicao - inferior;
  if (fracao === 0) return ordenado[inferior];
  return ordenado[inferior] + fracao * (ordenado[inferior + 1] - ordenado[inferior]);
}

// ---------------------------------------------------------------
// Distribuição geral
// ---------------------------------------------------------------

export type LinhaFaixaTempoDeCasa = { faixa: string; total: number };

// Faixas curtas no começo porque é onde a rotatividade acontece: agrupar tudo
// em "0–1 ano" esconderia que 55 dos 88 recém-chegados têm menos de 6 meses.
const FAIXAS: [string, (anos: number) => boolean][] = [
  ["< 3 meses", (a) => a < 0.25],
  ["3–6 meses", (a) => a >= 0.25 && a < 0.5],
  ["6 meses–1 ano", (a) => a >= 0.5 && a < 1],
  ["1–2 anos", (a) => a >= 1 && a < 2],
  ["2–5 anos", (a) => a >= 2 && a < 5],
  ["5+ anos", (a) => a >= 5],
];

export const FAIXA_SEM_ADMISSAO = "Sem data de admissão";

/**
 * Distribuição dos ativos em faixas de tempo de casa. Quem não tem data de
 * admissão aparece como faixa própria (mesmo tratamento de
 * `bi.ts::distribuicaoFaixaEtaria`) — diluir esse pessoal na primeira faixa
 * inventaria recém-chegados, e omitir esconderia o buraco da base.
 */
export function distribuicaoTempoDeCasa(
  colaboradoresAtivos: { dataAdmissao: Date | null }[],
  hoje: Date = hojeUTC(),
): LinhaFaixaTempoDeCasa[] {
  const contagem = new Map<string, number>(FAIXAS.map(([f]) => [f, 0]));
  let semData = 0;

  for (const c of colaboradoresAtivos) {
    if (!c.dataAdmissao) {
      semData++;
      continue;
    }
    const anos = anosDeCasa(c.dataAdmissao, hoje);
    const faixa = FAIXAS.find(([, cabe]) => cabe(anos));
    if (faixa) contagem.set(faixa[0], (contagem.get(faixa[0]) ?? 0) + 1);
  }

  const linhas = FAIXAS.map(([faixa]) => ({ faixa, total: contagem.get(faixa) ?? 0 }));
  if (semData > 0) linhas.push({ faixa: FAIXA_SEM_ADMISSAO, total: semData });
  return linhas;
}

export type ResumoTempoDeCasa = {
  /** Ativos considerados (têm data de admissão). */
  comData: number;
  /** Ativos que ficaram fora de toda conta desta lib — precisa aparecer na tela. */
  semData: number;
  quartis: Quartis | null;
  /** A média que o painel já mostra. `null`, nunca 0, quando não há data nenhuma. */
  mediaAnos: number | null;
  abaixoDeUmAno: number;
  /** `null` quando não há base para calcular — 0% aqui seria mentira. */
  abaixoDeUmAnoPct: number | null;
  abaixoDeSeisMeses: number;
  abaixoDeTresMeses: number;
  faixas: LinhaFaixaTempoDeCasa[];
};

/** Números do bloco de tempo de casa: média (com o aviso), quartis e faixas. */
export function resumoTempoDeCasa(
  colaboradoresAtivos: { dataAdmissao: Date | null }[],
  hoje: Date = hojeUTC(),
): ResumoTempoDeCasa {
  const anos = anosDosQueTemData(colaboradoresAtivos, hoje);
  const abaixoDeUmAno = anos.filter((a) => a < 1).length;

  return {
    comData: anos.length,
    semData: colaboradoresAtivos.length - anos.length,
    quartis: quartis(anos),
    mediaAnos: anos.length > 0 ? anos.reduce((t, a) => t + a, 0) / anos.length : null,
    abaixoDeUmAno,
    abaixoDeUmAnoPct: anos.length > 0 ? (abaixoDeUmAno / anos.length) * 100 : null,
    abaixoDeSeisMeses: anos.filter((a) => a < 0.5).length,
    abaixoDeTresMeses: anos.filter((a) => a < 0.25).length,
    faixas: distribuicaoTempoDeCasa(colaboradoresAtivos, hoje),
  };
}

// ---------------------------------------------------------------
// Recorte por setor e por cargo
// ---------------------------------------------------------------

export type LinhaTempoDeCasaPorGrupo = {
  grupo: string;
  /** Pessoas no grupo, com ou sem data de admissão. */
  total: number;
  comData: number;
  semData: number;
  quartis: Quartis | null;
  abaixoDeUmAno: number;
  /** O selo mais acionável da linha. `null` quando ninguém do grupo tem data. */
  abaixoDeUmAnoPct: number | null;
  /** Menos de `MINIMO_PARA_QUARTIL` datas: o quartil sai, mas não vale ranking. */
  amostraInsuficiente: boolean;
  /** 1 num grupo de verdade; >1 só na linha "Demais cargos", quantos cargos ela soma. */
  gruposSomados: number;
};

/**
 * Tempo de casa por setor. Agrupa por `setorId` e resolve o nome pela tabela
 * Setor — nunca por um nome que veio junto do colaborador.
 *
 * Duas armadilhas resolvidas aqui, as duas medidas na base: (1) cada CNPJ tem a
 * própria linha de Setor, então "Comercial" existe 6 vezes e sem juntar o grupo
 * apareceria fatiado por empresa; (2) as grafias divergem — "Recursos Humanos" e
 * "RECURSOS HUMANOS" são registros diferentes e virariam duas linhas. Por isso o
 * balde é a chave normalizada do nome (`normalizarTexto`) e o rótulo exibido é a
 * grafia com mais gente. A base acabou de ser canonizada para 9 setores + "Não
 * definido"; a regra fica para não regredir quando entrar setor novo.
 */
export function tempoDeCasaPorSetor(
  colaboradoresAtivos: { dataAdmissao: Date | null; setorId: string | null }[],
  setores: { id: string; nome: string }[],
  hoje: Date = hojeUTC(),
  minimoParaQuartil: number = MINIMO_PARA_QUARTIL,
): LinhaTempoDeCasaPorGrupo[] {
  const grupos = agruparPorNomeDeCadastro(colaboradoresAtivos, (c) => c.setorId, setores);
  return ordenarPorRisco(grupos.map((g) => linhaDoGrupo(g.nome, g.itens, hoje, minimoParaQuartil)));
}

/**
 * Tempo de casa por cargo (linhas de `Posicao`), com o mesmo tratamento de
 * grafia/CNPJ do recorte por setor.
 *
 * Cargo com menos de `minimoParaQuartil` pessoas não ganha linha própria: cai
 * numa única linha "Demais cargos", sempre a última. Sem isso a tela viraria uma
 * lista de 30 cargos com 1 ou 2 pessoas cada, onde o quartil é só o tempo de
 * casa de uma pessoa com nome de estatística. A linha agregada mantém essa gente
 * visível — some do detalhe, não da conta.
 */
export function tempoDeCasaPorCargo(
  colaboradoresAtivos: { dataAdmissao: Date | null; posicaoId: string | null }[],
  cargos: { id: string; nome: string }[],
  hoje: Date = hojeUTC(),
  minimoParaQuartil: number = MINIMO_PARA_QUARTIL,
): LinhaTempoDeCasaPorGrupo[] {
  const grupos = agruparPorNomeDeCadastro(colaboradoresAtivos, (c) => c.posicaoId, cargos);
  const comQuartilProprio = grupos.filter((g) => g.itens.length >= minimoParaQuartil);
  const pequenos = grupos.filter((g) => g.itens.length < minimoParaQuartil);

  const linhas = ordenarPorRisco(
    comQuartilProprio.map((g) => linhaDoGrupo(g.nome, g.itens, hoje, minimoParaQuartil)),
  );
  if (pequenos.length > 0) {
    linhas.push(
      linhaDoGrupo(
        ROTULO_DEMAIS_CARGOS,
        pequenos.flatMap((g) => g.itens),
        hoje,
        minimoParaQuartil,
        pequenos.length,
      ),
    );
  }
  return linhas;
}

// ---------------------------------------------------------------
// Internos
// ---------------------------------------------------------------

function anosDosQueTemData(
  colaboradores: { dataAdmissao: Date | null }[],
  hoje: Date,
): number[] {
  const anos: number[] = [];
  for (const c of colaboradores) if (c.dataAdmissao) anos.push(anosDeCasa(c.dataAdmissao, hoje));
  return anos;
}

function linhaDoGrupo(
  grupo: string,
  colaboradores: { dataAdmissao: Date | null }[],
  hoje: Date,
  minimoParaQuartil: number,
  gruposSomados = 1,
): LinhaTempoDeCasaPorGrupo {
  const anos = anosDosQueTemData(colaboradores, hoje);
  const abaixoDeUmAno = anos.filter((a) => a < 1).length;
  return {
    grupo,
    total: colaboradores.length,
    comData: anos.length,
    semData: colaboradores.length - anos.length,
    quartis: quartis(anos),
    abaixoDeUmAno,
    abaixoDeUmAnoPct: anos.length > 0 ? (abaixoDeUmAno / anos.length) * 100 : null,
    // Conta DATAS, não pessoas: grupo de 20 com 3 datas tem quartil de 3 pessoas.
    amostraInsuficiente: anos.length < minimoParaQuartil,
    gruposSomados,
  };
}

/**
 * Ordena pelo % com menos de 1 ano (o número acionável), com os grupos de
 * amostra insuficiente jogados para o fim — a mesma regra que tira CNPJ pequeno
 * do ranking de turnover. Sem isso um setor de 1 pessoa recém-contratada lidera
 * a lista com 100%.
 */
function ordenarPorRisco(linhas: LinhaTempoDeCasaPorGrupo[]): LinhaTempoDeCasaPorGrupo[] {
  return [...linhas].sort(
    (a, b) =>
      Number(a.amostraInsuficiente) - Number(b.amostraInsuficiente) ||
      (b.abaixoDeUmAnoPct ?? -1) - (a.abaixoDeUmAnoPct ?? -1) ||
      b.total - a.total ||
      a.grupo.localeCompare(b.grupo),
  );
}

/**
 * Junta os itens por nome do cadastro (Setor/Posicao) resolvido pelo id, usando
 * a chave normalizada como balde e a grafia mais frequente como rótulo. Id que
 * não existe mais no cadastro cai em "Não definido" — mesmo balde de quem está
 * sem id, porque para a tela é a mesma resposta: não dá para atribuir.
 */
function agruparPorNomeDeCadastro<T>(
  itens: T[],
  idDoItem: (item: T) => string | null | undefined,
  cadastro: { id: string; nome: string }[],
): { nome: string; itens: T[] }[] {
  const nomePorId = new Map(cadastro.map((c) => [c.id, c.nome]));
  const baldes = new Map<string, { grafias: Map<string, number>; itens: T[] }>();

  for (const item of itens) {
    const id = idDoItem(item);
    const nome = (id ? nomePorId.get(id) : undefined) ?? ROTULO_SEM_GRUPO;
    const chave = normalizarTexto(nome);
    let balde = baldes.get(chave);
    if (!balde) {
      balde = { grafias: new Map(), itens: [] };
      baldes.set(chave, balde);
    }
    balde.grafias.set(nome, (balde.grafias.get(nome) ?? 0) + 1);
    balde.itens.push(item);
  }

  return [...baldes.values()].map((balde) => ({
    nome: [...balde.grafias.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0],
    itens: balde.itens,
  }));
}
