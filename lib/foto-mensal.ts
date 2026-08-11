// Foto mensal — o snapshot histórico que o sistema não tinha.
//
// O PROBLEMA. Todo "últimos 12 meses" que o Painel desenha hoje é
// reconstruído a partir de campos que o RH edita todo dia. lib/bi.ts
// documenta isso sem rodeio: `calcularTurnover` deduz o headcount do início
// do período de trás para frente porque não existe snapshot, e
// `headcountMensal` desfaz admissões/desligamentos mês a mês pelo mesmo
// motivo. O resultado é um passado que se mexe: se o RH corrigir três datas
// de desligamento na semana que vem, o pico de junho/2026 muda de valor
// retroativamente e o cartão de alerta que a Diretoria viu na segunda não
// bate mais na sexta. Alerta que não se reproduz custa mais confiança do que
// falso positivo.
//
// A SOLUÇÃO. Uma linha por (competência × CNPJ × setor × cargo), gravada uma
// vez e nunca reescrita. A partir daí a série de headcount deixa de ser
// dedução e passa a ser leitura.
//
// ESTILO. O miolo é PURO, no contrato de lib/bi.ts: `montarFotoMensal` recebe
// os colaboradores já carregados e devolve as linhas prontas para gravar, sem
// tocar no Prisma — é o que permite conferir o motor contra o backup sem
// banco. Só `capturarFotoMensal` fala com o banco, e aceita um `cliente`
// (default `prisma`) para rodar dentro de `$transaction` com rollback, mesmo
// padrão de lib/alertas.ts.
//
// PRIVACIDADE. `folhaSalarial` é agregado, mas num balde de uma pessoa ele É o
// salário dela. Quem montar a tela trata esta coluna como salário
// (Diretoria/RH na matriz de papéis), não como número inofensivo de painel.
//
// A CADEIA NÃO FECHA SEMPRE, E ISSO É O DADO. Conferindo o motor contra o
// backup de 04/08/2026, `headcount[M] = headcount[M-1] + admissões[M] −
// desligamentos[M]` fecha exatamente em 22 dos 23 meses. O mês que sobra é
// janeiro/2026, com 2 pessoas a menos: são duas admissões com data real que
// depois viraram desligamento SEM data de desligamento — entram em
// `admissoes`, nunca entram em `headcount` e não podem entrar em
// `desligamentos` de mês nenhum. Não é erro de cálculo, é o buraco do
// cadastro aparecendo. Quem montar a tela precisa dizer isso quando a conta
// não bater, em vez de forçar o número: `desligadosSemDataAcumulado` é onde
// essa gente está contada (31 pessoas no grupo, 137 desligados no total).
import { prisma, type Cliente } from "@/lib/prisma";
import { versaoDoSistema } from "@/lib/versao";

/** "AAAA-MM". É a chave da competência e o rótulo, no mesmo formato ordenável. */
const FORMATO_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export type ColaboradorParaFoto = {
  empresaId: string;
  empresaNome: string;
  marcaId: string;
  marcaNome: string;
  setorId: string;
  setorNome: string;
  posicaoId: string;
  posicaoNome: string;
  ativo: boolean;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
  salarioBase: number | null;
};

export type LinhaFotoMensal = {
  competencia: string;
  empresaId: string;
  empresaNome: string;
  marcaId: string;
  marcaNome: string;
  setorId: string;
  setorNome: string;
  posicaoId: string;
  posicaoNome: string;
  headcount: number;
  admissoes: number;
  desligamentos: number;
  headcountSemDataAdmissao: number;
  desligadosSemDataAcumulado: number;
  folhaSalarial: number | null;
  comSalario: number;
  semSalario: number;
};

export type ResultadoCaptura = {
  competencia: string;
  /** Linhas que a competência tem gravadas ao fim desta chamada — as de agora ou as de antes. */
  linhas: number;
  /** Linhas inseridas AGORA. 0 com `jaCapturada: true` é o caminho feliz da segunda execução. */
  gravadas: number;
  jaCapturada: boolean;
  colaboradoresLidos: number;
  headcount: number;
  admissoes: number;
  desligamentos: number;
  versaoApp: string;
  /** Ressalvas prontas para log e tela — o que ficou fora e por quê. */
  avisos: string[];
};

// ---------------------------------------------------------------
// Competência
// ---------------------------------------------------------------

export function ehCompetencia(valor: string): boolean {
  return FORMATO_COMPETENCIA.test(valor);
}

/** "2026-07" da data. Em UTC, como todo o resto de lib/datas.ts. */
export function competenciaDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * A competência que o cron deve capturar: o mês ANTERIOR ao de `hoje`, ou
 * seja, o único que já fechou. Fotografar o mês em curso produziria um número
 * parcial com cara de definitivo — e como a linha nunca é reescrita, o parcial
 * ficaria para sempre.
 */
export function competenciaFechada(hoje: Date = new Date()): string {
  return competenciaDe(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)));
}

/**
 * Primeiro e ÚLTIMO INSTANTE da competência — não a meia-noite do último dia.
 *
 * A diferença não é preciosismo, é um bug que já estava montado. lib/datas.ts
 * grava data de calendário como meia-noite UTC, e com essa premissa bastaria
 * `Date.UTC(ano, mes, 0)`. Só que as datas IMPORTADAS do elleven estão em
 * 03:00Z (meia-noite de Brasília escrita em UTC) — e no backup de 04/08/2026
 * quatro desligamentos caem em 30/06 às 03:00. Com `fim` na meia-noite do dia
 * 30, esses quatro ficavam maiores que o fim de junho e menores que o começo
 * de julho: sumiam do `desligamentos` de junho, continuavam contados no
 * headcount de junho e evaporavam em julho sem mês nenhum atribuído. Quatro
 * saídas invisíveis num mês de nove.
 *
 * Um dia inteiro de margem no `fim` resolve os dois lados de uma vez: a
 * admissão do dia 1º às 03:00 continua fora do mês anterior, e o desligamento
 * do último dia entra no mês em que aconteceu.
 */
export function limitesDaCompetencia(competencia: string): { inicio: Date; fim: Date } {
  const [ano, mes] = competencia.split("-").map(Number);
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    fim: new Date(Date.UTC(ano, mes, 1) - 1),
  };
}

// ---------------------------------------------------------------
// Motor (puro)
// ---------------------------------------------------------------

/**
 * A pessoa estava no quadro no último dia da competência?
 *
 * A ordem das três checagens é a parte que importa:
 *
 * 1. Admitida depois do fim do mês não entra — a captura roda no início do mês
 *    seguinte, então quem começou no dia 1º já está `ativo` no banco e
 *    inflaria a foto do mês que acabou.
 * 2. Com data de desligamento, ela manda: quem saiu no dia 2 do mês seguinte
 *    já está `ativo = false` no banco, mas ESTAVA no quadro no fechamento.
 * 3. Sem data de desligamento, sobra a flag `ativo` — é o único sinal que
 *    existe para os 31 desligados sem data (de 137). Por isso essas saídas
 *    somem da série sem mês atribuído, e por isso a linha carrega
 *    `desligadosSemDataAcumulado`: o buraco fica gravado ao lado do número.
 */
export function ativoNoFimDaCompetencia(
  c: Pick<ColaboradorParaFoto, "ativo" | "dataAdmissao" | "dataDesligamento">,
  fim: Date,
): boolean {
  if (c.dataAdmissao && c.dataAdmissao > fim) return false;
  if (c.dataDesligamento) return c.dataDesligamento > fim;
  return c.ativo;
}

function dentroDaCompetencia(d: Date | null, inicio: Date, fim: Date): boolean {
  return d !== null && d >= inicio && d <= fim;
}

/**
 * Monta as linhas da competência a partir de TODOS os colaboradores — ativos e
 * desligados. Desligado não some do recorte: é ele que carrega o
 * `desligamentos` do mês, e o balde dele pode legitimamente sair com
 * `headcount: 0`.
 *
 * O balde é (empresaId, setorId, posicaoId) — id, não nome. Setor e Posicao
 * existem por CNPJ neste schema (`@@unique([empresaId, nome])`), então "Área
 * Técnica" são 7 linhas diferentes, uma por empresa; agrupar por nome
 * misturaria CNPJs, que é exatamente o que a chave única da tabela separa. Os
 * nomes vão gravados junto para o relatório de daqui a dois anos não mudar de
 * rótulo quando o RH renomear um setor.
 *
 * Admissão e desligamento são atribuídos ao setor/cargo/CNPJ que a pessoa
 * tinha NA HORA DA CAPTURA — o cadastro não guarda o setor de origem de uma
 * movimentação. Como a captura acontece dias depois do fim do mês, o desvio é
 * pequeno; e sendo gravado uma vez, ele para de crescer.
 */
export function montarFotoMensal(
  colaboradores: ColaboradorParaFoto[],
  competencia: string,
): LinhaFotoMensal[] {
  if (!ehCompetencia(competencia)) {
    throw new Error(`Competência inválida: "${competencia}" (esperado "AAAA-MM")`);
  }
  const { inicio, fim } = limitesDaCompetencia(competencia);

  const baldes = new Map<string, LinhaFotoMensal>();

  for (const c of colaboradores) {
    const chave = `${c.empresaId} ${c.setorId} ${c.posicaoId}`;
    let linha = baldes.get(chave);
    if (!linha) {
      linha = {
        competencia,
        empresaId: c.empresaId,
        empresaNome: c.empresaNome,
        marcaId: c.marcaId,
        marcaNome: c.marcaNome,
        setorId: c.setorId,
        setorNome: c.setorNome,
        posicaoId: c.posicaoId,
        posicaoNome: c.posicaoNome,
        headcount: 0,
        admissoes: 0,
        desligamentos: 0,
        headcountSemDataAdmissao: 0,
        desligadosSemDataAcumulado: 0,
        folhaSalarial: null,
        comSalario: 0,
        semSalario: 0,
      };
      baldes.set(chave, linha);
    }

    if (dentroDaCompetencia(c.dataAdmissao, inicio, fim)) linha.admissoes++;
    if (dentroDaCompetencia(c.dataDesligamento, inicio, fim)) linha.desligamentos++;
    if (!c.ativo && !c.dataDesligamento) linha.desligadosSemDataAcumulado++;

    if (!ativoNoFimDaCompetencia(c, fim)) continue;

    linha.headcount++;
    if (!c.dataAdmissao) linha.headcountSemDataAdmissao++;

    // Dinheiro só existe se houver salário. `folhaSalarial` nasce null e só
    // vira número na primeira pessoa com salário: sem isso, um balde inteiro
    // sem cadastro de salário sairia com "R$ 0", que é a mentira mais cara
    // deste módulo — 49 dos 215 ativos não têm salário (Centrysol, VAPT,
    // Mobility) e para esses CNPJs a resposta certa é "sem dado", não zero.
    if (c.salarioBase === null) {
      linha.semSalario++;
    } else {
      linha.comSalario++;
      linha.folhaSalarial = (linha.folhaSalarial ?? 0) + c.salarioBase;
    }
  }

  // Balde vazio em tudo não vira linha: é um par setor×cargo que existe no
  // cadastro e não tinha ninguém nem movimento nenhum naquele mês. Gravá-lo
  // encheria a tabela de zeros que não respondem pergunta nenhuma.
  return [...baldes.values()]
    .filter(
      (l) =>
        l.headcount > 0 ||
        l.admissoes > 0 ||
        l.desligamentos > 0 ||
        l.desligadosSemDataAcumulado > 0,
    )
    .sort(
      (a, b) =>
        a.empresaNome.localeCompare(b.empresaNome) ||
        a.setorNome.localeCompare(b.setorNome) ||
        a.posicaoNome.localeCompare(b.posicaoNome),
    );
}

/** Ressalvas do que ficou fora ou não pôde ser medido, no formato que a tela e o log usam. */
export function avisosDaFoto(linhas: LinhaFotoMensal[], competencia: string): string[] {
  const avisos: string[] = [];
  const soma = (f: (l: LinhaFotoMensal) => number) => linhas.reduce((t, l) => t + f(l), 0);

  const semSalario = soma((l) => l.semSalario);
  if (semSalario > 0) {
    const empresas = [...new Set(linhas.filter((l) => l.semSalario > 0).map((l) => l.empresaNome))];
    avisos.push(
      `${semSalario} ativo(s) sem salário cadastrado ficaram fora da folha desta competência ` +
        `(${empresas.join(", ")}) — a folha gravada é parcial, e onde ninguém tem salário a coluna é "sem dado", não zero.`,
    );
  }

  // O "sem dado" honesto do balde vazio tem um irmão mais perigoso: o CNPJ em
  // que UMA pessoa tem salário e 38 não. Ali `folhaSalarial` sai preenchida e
  // parece folha de empresa — no backup de 04/08/2026 a Centrysol soma
  // R$ 1.621 com 1 de 39 ativos valorados. Um número desses num cartão de
  // painel mente mais do que um traço. Quem for exibir folha por CNPJ compara
  // `comSalario` com o headcount ANTES de escrever "R$".
  const porEmpresa = new Map<string, { com: number; sem: number }>();
  for (const l of linhas) {
    const v = porEmpresa.get(l.empresaNome) ?? { com: 0, sem: 0 };
    v.com += l.comSalario;
    v.sem += l.semSalario;
    porEmpresa.set(l.empresaNome, v);
  }
  const minoria = [...porEmpresa.entries()].filter(([, v]) => v.com > 0 && v.com < v.sem);
  if (minoria.length > 0) {
    avisos.push(
      `Folha de cobertura minoritária em ${minoria
        .map(([nome, v]) => `${nome} (${v.com} de ${v.com + v.sem})`)
        .join(", ")} — o valor existe mas descreve a minoria do quadro; não apresente como folha do CNPJ.`,
    );
  }

  const semAdmissao = soma((l) => l.headcountSemDataAdmissao);
  if (semAdmissao > 0) {
    avisos.push(
      `${semAdmissao} ativo(s) sem data de admissão contam no headcount mas nunca aparecem em "admissões" — ` +
        `a soma das admissões não reconstrói o quadro.`,
    );
  }

  const desligadosSemData = soma((l) => l.desligadosSemDataAcumulado);
  if (desligadosSemData > 0) {
    avisos.push(
      `${desligadosSemData} desligado(s) sem data de desligamento não pertencem a competência nenhuma e ` +
        `estão fora da série de ${competencia}. É saldo acumulado: a mesma pessoa reaparece na próxima foto — não some entre meses.`,
    );
  }

  return avisos;
}

// ---------------------------------------------------------------
// Captura (fala com o banco)
// ---------------------------------------------------------------

/**
 * Grava a foto de uma competência. Idempotente por construção: a unicidade
 * (competencia, empresaId, setorId, posicaoId) mais `skipDuplicates` fazem a
 * segunda execução do mês inserir zero linha, sem erro e sem sobrescrever a
 * primeira — que é o ponto inteiro da tabela. A gravação é um `INSERT` único
 * (`ON CONFLICT DO NOTHING`), então não existe competência gravada pela
 * metade: ou o mês inteiro entrou, ou nada entrou e a próxima execução tenta
 * de novo do zero.
 *
 * `competencia` só deve ser passada para recuperar um mês que o cron perdeu.
 * Ela é validada como mês JÁ FECHADO, e a distância entre `capturadoEm` e o
 * fim da competência denuncia a captura atrasada para quem auditar depois.
 */
export async function capturarFotoMensal(opcoes?: {
  competencia?: string;
  hoje?: Date;
  cliente?: Cliente;
}): Promise<ResultadoCaptura> {
  const cliente = opcoes?.cliente ?? prisma;
  const hoje = opcoes?.hoje ?? new Date();
  const competencia = opcoes?.competencia ?? competenciaFechada(hoje);

  if (!ehCompetencia(competencia)) {
    throw new Error(`Competência inválida: "${competencia}" (esperado "AAAA-MM")`);
  }
  // Mês em curso (ou futuro) não fecha foto — ver `competenciaFechada`.
  if (competencia >= competenciaDe(hoje)) {
    throw new Error(
      `Competência ${competencia} ainda não fechou — a foto só é tirada de mês encerrado.`,
    );
  }

  const versaoApp = versaoDoSistema().rotulo;

  // O cron chama esta rota em vários dias seguidos de propósito (ver
  // vercel.json), então quase toda execução cai aqui: uma contagem indexada
  // responde "esse mês já foi fotografado?" sem carregar 352 colaboradores à
  // toa. `createMany({ skipDuplicates })` mais abaixo continuaria protegendo
  // — isto é economia, não a trava. Seguro porque `createMany` é um único
  // INSERT: ou a competência inteira entrou, ou nenhuma linha entrou; não
  // existe foto pela metade para esta checagem deixar passar.
  const jaGravadas = await cliente.fotoMensal.count({ where: { competencia } });
  if (jaGravadas > 0) {
    return {
      competencia,
      linhas: jaGravadas,
      gravadas: 0,
      jaCapturada: true,
      colaboradoresLidos: 0,
      headcount: 0,
      admissoes: 0,
      desligamentos: 0,
      versaoApp,
      avisos: [],
    };
  }

  // `select` explícito, nunca `include`: além da regra do projeto, aqui ele
  // limita o que sai do banco a salário e datas de quem interessa — nada de
  // CPF, banco ou PIX passando pela memória de um job que não precisa deles.
  const colaboradores = await cliente.colaborador.findMany({
    select: {
      empresaId: true,
      ativo: true,
      dataAdmissao: true,
      dataDesligamento: true,
      salarioBase: true,
      setorId: true,
      posicaoId: true,
      empresa: { select: { nome: true, marcaId: true, marca: { select: { nome: true } } } },
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
    },
  });

  const linhas = montarFotoMensal(
    colaboradores.map((c) => ({
      empresaId: c.empresaId,
      empresaNome: c.empresa.nome,
      marcaId: c.empresa.marcaId,
      marcaNome: c.empresa.marca.nome,
      setorId: c.setorId,
      setorNome: c.setor.nome,
      posicaoId: c.posicaoId,
      posicaoNome: c.posicao.nome,
      ativo: c.ativo,
      dataAdmissao: c.dataAdmissao,
      dataDesligamento: c.dataDesligamento,
      salarioBase: c.salarioBase,
    })),
    competencia,
  );

  const capturadoEm = new Date();

  const { count } = await cliente.fotoMensal.createMany({
    data: linhas.map((l) => ({ ...l, capturadoEm, versaoApp })),
    skipDuplicates: true,
  });

  return {
    competencia,
    linhas: linhas.length,
    gravadas: count,
    // Havia linhas e nenhuma entrou = duas execuções cruzaram a contagem
    // acima ao mesmo tempo e a trava única resolveu. É sucesso, não falha.
    jaCapturada: linhas.length > 0 && count === 0,
    colaboradoresLidos: colaboradores.length,
    headcount: linhas.reduce((t, l) => t + l.headcount, 0),
    admissoes: linhas.reduce((t, l) => t + l.admissoes, 0),
    desligamentos: linhas.reduce((t, l) => t + l.desligamentos, 0),
    versaoApp,
    avisos: avisosDaFoto(linhas, competencia),
  };
}
