import { prisma } from "@/lib/prisma";
import { conformidadeDoColaborador } from "@/lib/conformidade";
import { pendenciasDaEmpresa, modulosSemRegistro } from "@/lib/pendencias";
import { hojeUTC, somarDiasUTC, formatarData } from "@/lib/datas";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import {
  calcularTurnover,
  custoPessoalPorSetor,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { analisarDesligamentos, PISO_ATIVOS } from "@/lib/anomalias";
import { medirMalhaLideranca } from "@/lib/lideranca";
import {
  calcularPassivoFerias,
  resumirOrigemDoHistorico,
  resumirProgramacaoFerias,
} from "@/lib/ferias-passivo";
import {
  AVISO_MEDIA_TEMPO_DE_CASA,
  ROTULO_SEM_GRUPO,
  resumoTempoDeCasa,
  tempoDeCasaPorCargo,
  tempoDeCasaPorSetor,
} from "@/lib/tempo-de-casa";
import { formatarReais } from "@/lib/constants-beneficios";
import { normalizarTexto } from "@/lib/text";

// Ferramentas de LEITURA que o assistente pode chamar.
//
// O modelo NUNCA escreve SQL nem recebe acesso ao Prisma: ele escolhe entre
// estas funções e passa parâmetros simples. Três razões:
//  1. O escopo de empresas é fixado aqui, no servidor — não vem do modelo. Não
//     existe pergunta capaz de fazer o assistente ler fora dele.
//  2. Consulta sem limite não passa: todo retorno é cortado.
//  3. O que não está aqui, ele não alcança. Ampliar acesso é decisão de
//     código, não de prompt.
//
// AS FERRAMENTAS DE NÚMERO DE NEGÓCIO NÃO DEVOLVEM SÓ O NÚMERO. Toda uma
// devolve `avisos: string[]` com o que aquele número NÃO cobre, seguindo o
// precedente de `pendencias_da_empresa` (`semRegistroNenhum` +
// "não afirme conformidade sobre eles"). Aqui a ressalva importa ainda mais do
// que numa tabela: a resposta sai em prosa afirmativa, e "absenteísmo de 0,0%"
// escrito em frase soa como conclusão, não como coluna vazia.
//
// DUAS COISAS QUE NÃO VIRAM FERRAMENTA, por decisão:
//  • Resultado de pesquisa de clima/eNPS: 6 dos 8 CNPJs não têm nenhuma
//    resposta, então a ferramenta responderia "sem dado" quase sempre e
//    convidaria o modelo a comparar marcas com base em duas amostras.
//  • Qualquer corte de clima POR PESSOA: as 418 respostas têm
//    `colaboradorId` nulo em 418/418, por construção. O anonimato é promessa
//    feita a quem respondeu — o assistente não pode ser a porta dos fundos que
//    a quebra, nem por agregação fina o bastante para identificar alguém.

const LIMITE = 50;

/**
 * Janela do teste de anomalia. 24 meses porque o baseline de `lib/anomalias.ts`
 * come 12 — série de 12 não avaliaria mês nenhum.
 */
const MESES_ANOMALIA = 24;

export type ResultadoFerramenta = Record<string, unknown> | Record<string, unknown>[];

// ---------------------------------------------------------------
// Escopo
// ---------------------------------------------------------------

/**
 * De quais CNPJs o assistente fala. Montado no servidor a partir da marca do
 * CNPJ da rota, cortado pelo que `empresasVisiveis(usuario)` autoriza.
 *
 * Até 04/08/2026 o assistente respondia por UM CNPJ enquanto Painel e
 * Indicadores respondiam pela marca — perguntar "quantas pessoas temos" dentro
 * da RSM devolvia 68 em vez dos 165 da marca, e nada na resposta dizia que
 * havia recorte. Divergir do resto do sistema num assistente é pior do que numa
 * tela: a tela mostra o seletor de empresa ao lado do número, a frase não.
 *
 * O corte pela permissão vem DEPOIS da marca, nunca antes: quem enxerga só um
 * CNPJ da marca continua vendo só ele, e `recorteReduzidoPorPermissao` obriga a
 * resposta a dizer isso em vez de entregar um número menor sem explicação.
 */
export type EscopoAssistente = {
  /** CNPJ da rota — de onde a pergunta foi feita. */
  empresaIdDaRota: string;
  /** Os CNPJs que entram em toda resposta. O modelo não escolhe nem monta esta lista. */
  empresaIds: string[];
  empresas: { id: string; nome: string }[];
  marcaNome: string;
  recorteReduzidoPorPermissao: boolean;
  /** Frase pronta: vai para o prompt do sistema e para o retorno de cada ferramenta de número. */
  descricao: string;
};

export async function montarEscopo(
  empresaIdDaRota: string,
  empresasDoUsuario: string[]
): Promise<EscopoAssistente> {
  const idsDaMarca = await empresasDaMesmaMarca(empresaIdDaRota);
  const permitidos = new Set(empresasDoUsuario);
  const autorizados = idsDaMarca.filter(id => permitidos.has(id));

  // Lista vazia só acontece se a permissão do usuário e a marca discordarem
  // (vínculo recém-revogado, empresa desativada). Cair no CNPJ da rota é o
  // comportamento antigo — pior recorte, nunca acesso indevido: quem chegou até
  // aqui já passou por `requireEmpresaAccess(empresaIdDaRota)`.
  const empresaIds = autorizados.length > 0 ? autorizados : [empresaIdDaRota];

  const empresas = await prisma.empresa.findMany({
    where: { id: { in: empresaIds } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, marca: { select: { nome: true } } },
  });

  const marcaNome = empresas[0]?.marca.nome ?? "";
  const recorteReduzidoPorPermissao =
    autorizados.length > 0 && autorizados.length < idsDaMarca.length;
  const nomes = empresas.map(e => e.nome);

  const descricao =
    `Marca ${marcaNome} — ${nomes.length} ${nomes.length === 1 ? "CNPJ" : "CNPJs"}: ${nomes.join(", ")}.` +
    (recorteReduzidoPorPermissao
      ? ` A marca tem ${idsDaMarca.length} CNPJs no total; os demais estão fora da permissão deste usuário e não entram em nenhum número.`
      : "");

  return {
    empresaIdDaRota,
    empresaIds,
    empresas: empresas.map(e => ({ id: e.id, nome: e.nome })),
    marcaNome,
    recorteReduzidoPorPermissao,
    descricao,
  };
}

export const FERRAMENTAS = [
  {
    name: "contar_colaboradores",
    description:
      "Conta colaboradores do escopo. Use para perguntas de quantidade ('quantas pessoas temos', 'quantos no setor X').",
    input_schema: {
      type: "object" as const,
      properties: {
        apenasAtivos: { type: "boolean", description: "Padrão true. False inclui desligados." },
        setor: { type: "string", description: "Nome do setor, opcional." },
      },
    },
  },
  {
    name: "headcount_por_setor",
    description:
      "Quantidade de colaboradores ativos agrupada por setor, somando os CNPJs do escopo (um 'Comercial' de CNPJs diferentes vira uma linha só).",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "buscar_colaborador",
    description:
      "Busca colaboradores pelo nome (parcial) e devolve a ficha resumida: empresa, setor, cargo, admissão, contato, situação.",
    input_schema: {
      type: "object" as const,
      properties: { nome: { type: "string", description: "Parte do nome." } },
      required: ["nome"],
    },
  },
  {
    name: "ferias_no_periodo",
    description:
      "Quem tem férias aprovadas que cruzam o período informado. Use para 'quem está de férias em agosto'.",
    input_schema: {
      type: "object" as const,
      properties: {
        inicio: { type: "string", description: "Data inicial AAAA-MM-DD." },
        fim: { type: "string", description: "Data final AAAA-MM-DD." },
      },
      required: ["inicio", "fim"],
    },
  },
  {
    name: "aniversariantes_do_mes",
    description: "Colaboradores ativos que fazem aniversário no mês informado.",
    input_schema: {
      type: "object" as const,
      properties: { mes: { type: "number", description: "Mês de 1 a 12." } },
      required: ["mes"],
    },
  },
  {
    name: "conformidade_irregular",
    description:
      "Colaboradores ativos com pendência de segurança do trabalho: NR vencida/faltando ou ASO vencido.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "pendencias_da_empresa",
    description:
      "Resumo do que exige ação agora: aprovações paradas, ASO/NR vencendo, CAT sem emitir, EPI vencido, integração atrasada.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "vagas_e_candidatos",
    description: "Vagas abertas e quantos candidatos estão em processo em cada uma.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "aniversarios_de_empresa",
    description:
      "Quem completa anos de casa no mês informado (tempo de casa), com a quantidade de anos.",
    input_schema: {
      type: "object" as const,
      properties: { mes: { type: "number", description: "Mês de 1 a 12." } },
      required: ["mes"],
    },
  },
  {
    name: "serie_desligamentos",
    description:
      "Desligamentos mês a mês e picos fora do normal. Use para 'quantas pessoas saíram', 'teve mês atípico', 'como está a saída de gente'. Cada pico é comparado com a média da própria unidade, não com um limiar fixo.",
    input_schema: {
      type: "object" as const,
      properties: {
        meses: { type: "number", description: "Tamanho da série, de 3 a 24. Padrão 12." },
      },
    },
  },
  {
    name: "turnover_por_empresa",
    description:
      "Turnover (rotatividade) da janela informada, por CNPJ ou por setor. Traz junto o estado da medição de absenteísmo — use esta ferramenta também quando perguntarem sobre absenteísmo, faltas ou atestados.",
    input_schema: {
      type: "object" as const,
      properties: {
        janelaMeses: { type: "number", description: "Janela em meses, de 3 a 36. Padrão 12." },
        agruparPor: {
          type: "string",
          enum: ["empresa", "setor"],
          description:
            "Padrão 'empresa' (CNPJ). 'setor' é menos confiável — o retorno explica por quê.",
        },
      },
    },
  },
  {
    name: "span_de_controle",
    description:
      "Malha de liderança: quantos diretos cada líder tem, quem está sobrecarregado, quem está sem líder cadastrado e quanto da estrutura depende de poucas pessoas.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "custo_de_pessoal",
    description:
      "Folha mensal estimada (salário base dos ativos), por setor ou por CNPJ, com quantas pessoas estão sem salário cadastrado. Use para 'quanto custa a folha', 'custo por setor'.",
    input_schema: {
      type: "object" as const,
      properties: {
        agruparPor: { type: "string", enum: ["setor", "empresa"], description: "Padrão 'setor'." },
      },
    },
  },
  {
    name: "passivo_de_ferias",
    description:
      "Passivo de férias: saldo em dias, provisão em reais, quem já está com período vencido (art. 137) e a fila dos próximos 6 meses. Use para 'quanto devemos de férias', 'quem está com férias vencidas'.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "tempo_de_casa_distribuicao",
    description:
      "Distribuição do tempo de casa dos ativos: quartis, faixas e % com menos de 1 ano — no total, por setor ou por cargo. Use para 'há quanto tempo as pessoas estão aqui', 'quem está segurando gente'.",
    input_schema: {
      type: "object" as const,
      properties: {
        agruparPor: {
          type: "string",
          enum: ["geral", "setor", "cargo"],
          description: "Padrão 'geral'.",
        },
      },
    },
  },
];

function dataDoTexto(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Parâmetro numérico do modelo nunca chega direto na consulta: fora da faixa vira o padrão. */
function inteiroEntre(valor: unknown, min: number, max: number, padrao: number): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function umDe<T extends string>(valor: unknown, opcoes: readonly T[], padrao: T): T {
  return typeof valor === "string" && (opcoes as readonly string[]).includes(valor)
    ? (valor as T)
    : padrao;
}

/**
 * Rótulo canônico de um nome de cadastro (setor, cargo), pela chave normalizada.
 *
 * `Setor` é por empresa e as grafias divergem: medido no backup, "Recursos
 * Humanos" e "RECURSOS HUMANOS" são registros diferentes, e com a marca inteira
 * no escopo o assistente reportaria dois setores de RH com 3 e 1 pessoa. Mesma
 * regra de `lib/tempo-de-casa.ts`: o balde é a chave normalizada e o rótulo é a
 * grafia com mais gente. Aplicado ANTES de chamar `lib/bi.ts`, que soma por
 * chave de texto — assim a aritmética continua sendo a da tela de Indicadores.
 */
function rotulosCanonicos(nomes: string[]): Map<string, string> {
  const baldes = new Map<string, Map<string, number>>();
  for (const nome of nomes) {
    const chave = normalizarTexto(nome);
    const grafias = baldes.get(chave) ?? new Map<string, number>();
    grafias.set(nome, (grafias.get(nome) ?? 0) + 1);
    baldes.set(chave, grafias);
  }
  const rotulo = new Map<string, string>();
  for (const [chave, grafias] of baldes) {
    rotulo.set(
      chave,
      [...grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    );
  }
  return new Map(nomes.map(nome => [nome, rotulo.get(normalizarTexto(nome))!]));
}

const CHAVE_SEM_GRUPO = normalizarTexto(ROTULO_SEM_GRUPO);

/**
 * Quantos salários cadastrados um grupo precisa ter para o valor em reais sair.
 *
 * Duas razões que apontam para o mesmo corte. Privacidade: a folha de um grupo
 * com um único salário cadastrado É o salário daquela pessoa, e a matriz de
 * permissão trata salário individual como dado restrito — publicá-lo em prosa
 * seria a forma mais fácil de vazá-lo. Honestidade: medido no backup, a
 * Centrysol tem 1 salário em 39 ativos; exibir "folha da Centrysol:
 * R$ 1.621,00" descreve 2,5% da empresa com cara de total.
 */
const MINIMO_SALARIOS_PARA_VALOR = 3;

/**
 * Executa a ferramenta escolhida pelo modelo. `escopo` vem de fora, montado no
 * servidor, e o modelo não tem como influenciá-lo.
 */
export async function executarFerramenta(
  escopo: EscopoAssistente,
  nome: string,
  entrada: Record<string, unknown>
): Promise<ResultadoFerramenta> {
  const empresaIds = escopo.empresaIds;

  switch (nome) {
    case "contar_colaboradores": {
      const apenasAtivos = entrada.apenasAtivos !== false;
      const setor = typeof entrada.setor === "string" ? entrada.setor : undefined;
      const total = await prisma.colaborador.count({
        where: {
          empresaId: { in: empresaIds },
          ...(apenasAtivos ? { ativo: true } : {}),
          ...(setor ? { setor: { nome: { contains: setor, mode: "insensitive" } } } : {}),
        },
      });
      return { total, apenasAtivos, setor: setor ?? "todos", recorte: escopo.descricao };
    }

    case "headcount_por_setor": {
      // Agregado pelo NOME do setor, não por `setorId`: Setor é por empresa, e
      // com a marca inteira no escopo "Comercial" apareceria uma vez por CNPJ.
      // É a mesma função que a tela de Indicadores usa, para os dois números
      // nunca discordarem.
      const ativos = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true },
        select: { setor: { select: { nome: true } } },
      });
      const rotulo = rotulosCanonicos(ativos.map(c => c.setor.nome));
      const linhas = headcountPorSetor(ativos.map(c => ({ setorNome: rotulo.get(c.setor.nome)! })));
      return {
        recorte: escopo.descricao,
        totalAtivos: ativos.length,
        setores: linhas.slice(0, LIMITE),
      };
    }

    case "buscar_colaborador": {
      const nome = typeof entrada.nome === "string" ? entrada.nome.trim() : "";
      if (!nome) return { erro: "Informe parte do nome." };
      const pessoas = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, nome: { contains: nome, mode: "insensitive" } },
        take: LIMITE,
        orderBy: { nome: "asc" },
        select: {
          nome: true,
          ativo: true,
          dataAdmissao: true,
          dataDesligamento: true,
          telefone: true,
          email: true,
          cidade: true,
          matricula: true,
          empresa: { select: { nome: true } },
          setor: { select: { nome: true } },
          posicao: { select: { nome: true } },
          supervisor: { select: { nome: true } },
        },
      });
      return pessoas.map(p => ({
        nome: p.nome,
        situacao: p.ativo ? "ativo" : "desligado",
        empresa: p.empresa.nome,
        setor: p.setor.nome,
        cargo: p.posicao.nome,
        lider: p.supervisor?.nome ?? null,
        matricula: p.matricula,
        admissao: p.dataAdmissao ? formatarData(p.dataAdmissao) : null,
        desligamento: p.dataDesligamento ? formatarData(p.dataDesligamento) : null,
        telefone: p.telefone,
        email: p.email,
        cidade: p.cidade,
      }));
    }

    case "ferias_no_periodo": {
      const inicio = dataDoTexto(entrada.inicio);
      const fim = dataDoTexto(entrada.fim);
      if (!inicio || !fim) return { erro: "Datas devem estar no formato AAAA-MM-DD." };
      const ferias = await prisma.solicitacaoFerias.findMany({
        where: {
          empresaId: { in: empresaIds },
          status: "APROVADA",
          dataInicio: { lte: fim },
          dataFim: { gte: inicio },
        },
        take: LIMITE,
        orderBy: { dataInicio: "asc" },
        select: {
          dataInicio: true,
          dataFim: true,
          dias: true,
          colaborador: {
            select: {
              nome: true,
              setor: { select: { nome: true } },
              empresa: { select: { nome: true } },
            },
          },
        },
      });
      return ferias.map(f => ({
        colaborador: f.colaborador.nome,
        empresa: f.colaborador.empresa.nome,
        setor: f.colaborador.setor.nome,
        de: formatarData(f.dataInicio),
        ate: formatarData(f.dataFim),
        dias: f.dias,
      }));
    }

    case "aniversariantes_do_mes": {
      const mes = Number(entrada.mes);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { erro: "Mês deve ser de 1 a 12." };
      const pessoas = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true, dataNascimento: { not: null } },
        select: {
          nome: true,
          dataNascimento: true,
          setor: { select: { nome: true } },
          empresa: { select: { nome: true } },
        },
      });
      return pessoas
        .filter(p => p.dataNascimento!.getUTCMonth() + 1 === mes)
        .sort((a, b) => a.dataNascimento!.getUTCDate() - b.dataNascimento!.getUTCDate())
        .slice(0, LIMITE)
        .map(p => ({
          colaborador: p.nome,
          empresa: p.empresa.nome,
          setor: p.setor.nome,
          dia: p.dataNascimento!.getUTCDate(),
        }));
    }

    case "aniversarios_de_empresa": {
      const mes = Number(entrada.mes);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { erro: "Mês deve ser de 1 a 12." };
      const hoje = hojeUTC();
      const pessoas = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true, dataAdmissao: { not: null } },
        select: {
          nome: true,
          dataAdmissao: true,
          setor: { select: { nome: true } },
          empresa: { select: { nome: true } },
        },
      });
      return pessoas
        .filter(p => p.dataAdmissao!.getUTCMonth() + 1 === mes)
        .map(p => ({
          colaborador: p.nome,
          empresa: p.empresa.nome,
          setor: p.setor.nome,
          dia: p.dataAdmissao!.getUTCDate(),
          anosDeCasa: hoje.getUTCFullYear() - p.dataAdmissao!.getUTCFullYear(),
        }))
        .filter(p => p.anosDeCasa > 0)
        .sort((a, b) => a.dia - b.dia)
        .slice(0, LIMITE);
    }

    case "conformidade_irregular": {
      const colaboradores = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true },
        select: {
          nome: true,
          posicaoId: true,
          setor: { select: { nome: true } },
          empresa: { select: { nome: true } },
          certificados: { select: { norma: true, validoAte: true, realizadoEm: true } },
          exames: { select: { tipo: true, validoAte: true } },
        },
      });
      const requisitos = await prisma.requisitoNR.findMany({
        where: { posicao: { empresaId: { in: empresaIds } } },
      });
      const hoje = hojeUTC();

      const irregulares = colaboradores
        .map(c => {
          const reqs = requisitos.filter(r => r.posicaoId === c.posicaoId);
          const conf = conformidadeDoColaborador(reqs, c.certificados);
          const asoVencido = c.exames.every(e => !e.validoAte || e.validoAte < hoje);
          return {
            nome: c.nome,
            empresa: c.empresa.nome,
            setor: c.setor.nome,
            conf,
            asoVencido,
            temExame: c.exames.length > 0,
          };
        })
        .filter(x => !x.conf.regular || !x.temExame || x.asoVencido)
        .slice(0, LIMITE)
        .map(x => ({
          colaborador: x.nome,
          empresa: x.empresa,
          setor: x.setor,
          nrsPendentes: x.conf.itens.filter(i => i.situacao !== "EM_DIA").map(i => i.norma),
          aso: !x.temExame ? "nunca feito" : x.asoVencido ? "vencido" : "em dia",
        }));

      return { recorte: escopo.descricao, totalIrregulares: irregulares.length, irregulares };
    }

    case "pendencias_da_empresa": {
      // Vai junto o que NÃO pôde ser avaliado. Sem isso o assistente lê
      // `catPendente: 0` e responde "nenhuma CAT em aberto", quando a verdade é
      // que o módulo de acidentes nunca foi usado — mesma armadilha que a tela
      // de pendências tinha até 04/08/2026, e aqui é pior, porque a resposta
      // sai em prosa afirmativa.
      const [contagens, vazios] = await Promise.all([
        pendenciasDaEmpresa(empresaIds),
        modulosSemRegistro(empresaIds),
      ]);
      return {
        ...contagens,
        recorte: escopo.descricao,
        semRegistroNenhum: [...vazios],
        aviso:
          vazios.size > 0
            ? "Os itens listados em semRegistroNenhum estão zerados por falta de qualquer registro no módulo, não por estarem em dia. Não afirme conformidade sobre eles."
            : undefined,
      };
    }

    case "vagas_e_candidatos": {
      const vagas = await prisma.vaga.findMany({
        where: { empresaId: { in: empresaIds }, status: "ABERTA" },
        take: LIMITE,
        orderBy: { abertaEm: "desc" },
        select: {
          titulo: true,
          quantidade: true,
          abertaEm: true,
          // Vaga guarda só `empresaId` (não há relation nomeada no schema); o
          // nome sai do escopo, que já veio resolvido.
          empresaId: true,
          setor: { select: { nome: true } },
          candidaturas: { select: { etapa: true } },
        },
      });
      const nomeDaEmpresa = new Map(escopo.empresas.map(e => [e.id, e.nome]));
      const ativas = new Set(["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA"]);
      return vagas.map(v => ({
        vaga: v.titulo,
        empresa: nomeDaEmpresa.get(v.empresaId) ?? null,
        setor: v.setor?.nome ?? null,
        posicoes: v.quantidade,
        abertaEm: formatarData(v.abertaEm),
        candidatosEmProcesso: v.candidaturas.filter(c => ativas.has(c.etapa)).length,
        totalCandidatos: v.candidaturas.length,
      }));
    }

    // -----------------------------------------------------------
    // Números de negócio
    // -----------------------------------------------------------

    case "serie_desligamentos": {
      const meses = inteiroEntre(entrada.meses, 3, MESES_ANOMALIA, 12);
      const hoje = hojeUTC();

      const vinculos = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds } },
        select: {
          ativo: true,
          dataAdmissao: true,
          dataDesligamento: true,
          empresaId: true,
          empresa: { select: { nome: true, marcaId: true, marca: { select: { nome: true } } } },
        },
      });

      const serie = movimentoMensal(vinculos, hoje, meses);
      // O teste de anomalia usa a janela cheia mesmo quando a série pedida é
      // curta: com 12 meses o baseline consumiria tudo e nenhum mês seria
      // avaliado. Quem pergunta "e nos últimos 6 meses" continua recebendo o
      // pico de um mês anterior, que é o que ele quer saber.
      const analise = analisarDesligamentos(
        vinculos.map(v => ({
          empresaId: v.empresaId,
          empresaNome: v.empresa.nome,
          marcaId: v.empresa.marcaId,
          marcaNome: v.empresa.marca.nome,
          ativo: v.ativo,
          dataDesligamento: v.dataDesligamento,
        })),
        hoje,
        MESES_ANOMALIA
      );

      const desligados = vinculos.filter(v => !v.ativo);
      const desligadosSemAdmissao = desligados.filter(v => !v.dataAdmissao).length;

      const avisos = [...analise.avisos];
      if (desligadosSemAdmissao > 0) {
        avisos.push(
          `${desligadosSemAdmissao} dos ${desligados.length} desligados não têm data de admissão. A linha de admissões da série conta quase só quem AINDA está na casa — ela subestima a contratação real de cada mês e não pode ser lida como "contratamos X".`
        );
      }
      // `lib/anomalias.ts` chama de "grupo" o topo da hierarquia que recebeu, e
      // aqui esse topo é o recorte da conversa. Sem esta frase o modelo escreve
      // "13 desligamentos no grupo" achando que fala das 8 empresas.
      avisos.push(
        `Nos alertas, "no grupo" significa o recorte desta conversa (${escopo.descricao}), não o conjunto de todas as marcas.`
      );

      return {
        recorte: escopo.descricao,
        mesesNaSerie: meses,
        serie,
        totalDesligadosNaSerie: serie.reduce((t, m) => t + m.desligamentos, 0),
        anomalias: analise.anomalias.slice(0, LIMITE).map(a => ({
          frase: a.frase,
          mes: a.mesRotulo,
          nivel: a.nivel,
          unidade: a.unidadeNome,
          observado: a.observado,
          esperado: Number(a.esperado.toFixed(2)),
          p: a.p,
          mesIncompleto: a.mesIncompleto,
        })),
        // Zero anomalia não é "está tudo tranquilo": pode ser série curta,
        // unidade abaixo do piso de amostra ou ausência de dado. Os campos
        // abaixo são o que separa os casos.
        unidadesAvaliadas: analise.unidadesAvaliadas,
        unidadesForaDoTeste: analise.ignoradas.map(i => ({
          unidade: i.unidadeNome,
          nivel: i.nivel,
          motivo: i.rotulo,
        })),
        foraDoRecorte: analise.foraDoRecorte,
        avisos,
      };
    }

    case "turnover_por_empresa": {
      const janelaMeses = inteiroEntre(entrada.janelaMeses, 3, 36, 12);
      const agruparPor = umDe(entrada.agruparPor, ["empresa", "setor"] as const, "empresa");
      const hoje = hojeUTC();

      const [vinculos, ausencias] = await Promise.all([
        prisma.colaborador.findMany({
          where: { empresaId: { in: empresaIds } },
          select: {
            ativo: true,
            dataAdmissao: true,
            dataDesligamento: true,
            empresa: { select: { nome: true } },
            setor: { select: { nome: true } },
          },
        }),
        // Contagem, não conteúdo: o que interessa é saber SE existe medição.
        prisma.ausencia.count({ where: { empresaId: { in: empresaIds } } }),
      ]);

      const rotulo = rotulosCanonicos(vinculos.map(v => v.setor.nome));
      const chave = (v: (typeof vinculos)[number]) =>
        agruparPor === "empresa" ? v.empresa.nome : rotulo.get(v.setor.nome)!;

      // "Não definido" NÃO é setor: é o balde de quem o cadastro não conseguiu
      // atribuir. Medido no backup da marca LM Telecom, deixá-lo virar linha
      // produzia 23 desligados sobre 0 ativos = 200% de turnover num setor que
      // não existe — o número mais errado que esta ferramenta era capaz de
      // devolver. Ele vira contagem no aviso, que é o que a informação é.
      const semSetorAtribuido =
        agruparPor === "setor"
          ? vinculos.filter(v => normalizarTexto(rotulo.get(v.setor.nome)!) === CHAVE_SEM_GRUPO)
          : [];
      const semSetorIds = new Set(semSetorAtribuido);

      const grupos = new Map<string, typeof vinculos>();
      for (const v of vinculos) {
        if (semSetorIds.has(v)) continue;
        const k = chave(v);
        const atual = grupos.get(k);
        if (atual) atual.push(v);
        else grupos.set(k, [v]);
      }

      const linhas = [...grupos.entries()].map(([grupo, itens]) => {
        const ativos = itens.filter(v => v.ativo).length;
        const t = calcularTurnover(itens, ativos, hoje, janelaMeses);
        return {
          grupo,
          ativos,
          desligados: t.desligados,
          admissoes: t.admissoes,
          headcountMedio: ativos > 0 ? Number(t.headcountMedio.toFixed(1)) : null,
          // Sem ninguém ativo não existe taxa: o denominador vira só os próprios
          // desligados e `calcularTurnover` devolve 200%. null = "não dá para
          // calcular", que é diferente de 0% ("ninguém saiu") — e um grupo
          // extinto aparecendo com 0% seria lido como retenção perfeita.
          taxaPct: ativos > 0 ? Number(t.taxaPct.toFixed(1)) : null,
          // Mesma regra da tela: menos de 15 ativos sai da ordenação. Sem ela,
          // um CNPJ de 4 pessoas lidera o ranking com 0% e outro de 7 com 50%,
          // e os dois números descrevem uma pessoa, não uma política de gente.
          amostraPequena: ativos < PISO_ATIVOS,
        };
      });

      const noRanking = linhas
        .filter(l => !l.amostraPequena)
        .sort(
          (a, b) => (b.taxaPct ?? -1) - (a.taxaPct ?? -1) || a.grupo.localeCompare(b.grupo, "pt-BR")
        );
      const foraDoRanking = linhas
        .filter(l => l.amostraPequena)
        .sort((a, b) => b.ativos - a.ativos || a.grupo.localeCompare(b.grupo, "pt-BR"));

      const totalAtivos = vinculos.filter(v => v.ativo).length;
      const total = calcularTurnover(vinculos, totalAtivos, hoje, janelaMeses);

      const desligados = vinculos.filter(v => !v.ativo);
      const desligadosSemData = desligados.filter(v => !v.dataDesligamento).length;

      const avisos: string[] = [];
      if (desligadosSemData > 0) {
        avisos.push(
          `${desligadosSemData} dos ${desligados.length} desligados não têm data de desligamento e ficaram fora da janela de ${janelaMeses} meses. A taxa calculada é piso, não total.`
        );
      }
      if (foraDoRanking.length > 0) {
        avisos.push(
          `Fora do ranking por amostra pequena (menos de ${PISO_ATIVOS} ativos): ${foraDoRanking.map(l => `${l.grupo} (${l.ativos})`).join(", ")}. Não é bom desempenho — é grupo pequeno demais para a taxa significar algo.`
        );
      }
      if (agruparPor === "setor") {
        // O recorte por setor é assimétrico na base: quem está ativo tem setor
        // resolvido, quem saiu na maioria das vezes não. Numerador incompleto e
        // denominador completo puxam TODA taxa de setor para baixo.
        const desligadosSemSetor = semSetorAtribuido.filter(v => !v.ativo).length;
        const ativosSemSetor = semSetorAtribuido.length - desligadosSemSetor;
        avisos.push(
          `Turnover por setor é o recorte MENOS confiável desta base: ${desligadosSemSetor} dos ${desligados.length} desligados estão com setor "Não definido" e ficaram FORA de todas as linhas de setor, enquanto ${totalAtivos - ativosSemSetor} dos ${totalAtivos} ativos (o denominador) estão atribuídos. Numerador incompleto com denominador completo faz toda taxa por setor sair artificialmente baixa — nenhum setor daqui pode ser chamado de "o que mais retém". Use o recorte por CNPJ quando a pergunta admitir.`
        );
      }
      avisos.push(
        ausencias === 0
          ? "A tabela Ausencia tem 0 registros; não existe absenteísmo medido — não afirme que é baixo, que está zerado, nem que a equipe falta pouco. O módulo de faltas nunca foi alimentado."
          : `Absenteísmo: ${ausencias} registros de ausência no escopo. A taxa em si sai na tela de Indicadores; aqui só existe a contagem bruta.`
      );
      avisos.push(
        "O headcount de início do período é reconstruído (headcount atual − admissões + desligamentos), porque não há foto histórica de quadro. É aproximação, não medição."
      );

      return {
        recorte: escopo.descricao,
        janelaMeses,
        agruparPor,
        total: {
          ativos: totalAtivos,
          desligados: total.desligados,
          admissoes: total.admissoes,
          headcountMedio: Number(total.headcountMedio.toFixed(1)),
          taxaPct: Number(total.taxaPct.toFixed(1)),
        },
        ranking: noRanking.slice(0, LIMITE),
        foraDoRanking: foraDoRanking.slice(0, LIMITE),
        absenteismo: { registrosDeAusencia: ausencias, medido: ausencias > 0 },
        avisos,
      };
    }

    case "span_de_controle": {
      const ativos = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true },
        select: {
          id: true,
          nome: true,
          supervisorId: true,
          // `lib/lideranca.ts` exige este campo: é a segunda fonte de verdade
          // sobre liderança, e sem ele a lista de divergências sai errada em
          // silêncio.
          gerente: true,
          setor: { select: { nome: true } },
          posicao: { select: { nome: true } },
          empresa: { select: { nome: true } },
        },
      });

      const malha = medirMalhaLideranca(ativos);

      return {
        recorte: escopo.descricao,
        totalAtivos: malha.totalAtivos,
        totalLideres: malha.totalLideres,
        faixas: malha.faixas,
        lideres: malha.lideres.slice(0, LIMITE).map(l => ({
          nome: l.nome,
          empresa: l.empresa,
          setor: l.setor,
          cargo: l.cargo,
          diretos: l.diretos,
          cnpjsSob: l.cnpjsSob,
          setoresSob: l.setoresSob,
          diretosForaDoCnpj: l.diretosForaDoCnpj,
          faixa: l.faixa,
          marcadoComoGerente: l.gerente,
        })),
        cobertura: {
          comLider: malha.cobertura.comLider,
          semSupervisor: malha.cobertura.semSupervisor,
          supervisorForaDoRecorte: malha.cobertura.supervisorForaDoRecorte,
          autoSupervisao: malha.cobertura.autoSupervisao,
          pctSemSupervisor: Number(malha.cobertura.pctSemSupervisor.toFixed(1)),
          semSupervisorPorSetor: malha.cobertura.semSupervisorPorSetor.slice(0, LIMITE),
          semSupervisorPorEmpresa: malha.cobertura.semSupervisorPorEmpresa.slice(0, LIMITE),
        },
        concentracao: malha.concentracao.informativa
          ? {
              topN: malha.concentracao.topN,
              lideradosNoTopo: malha.concentracao.lideradosNoTopo,
              liderados: malha.concentracao.liderados,
              pct: Number(malha.concentracao.pct.toFixed(1)),
              lideres: malha.concentracao.lideres,
            }
          : null,
        divergenciaCadastro: {
          lideraMasNaoEstaMarcadoGerente: malha.divergencia.lideraSemFlag
            .slice(0, LIMITE)
            .map(l => ({ nome: l.nome, diretos: l.diretos })),
          marcadoGerenteSemLiderados: malha.divergencia.flagSemLiderados
            .slice(0, LIMITE)
            .map(p => ({ nome: p.nome, empresa: p.empresa, setor: p.setor })),
          totalMarcadosGerente: malha.divergencia.totalMarcadosGerente,
        },
        cnpjsSemNenhumaLiderancaCadastrada: malha.cnpjsSemNenhumaLiderancaCadastrada,
        avisos: malha.avisos,
      };
    }

    case "custo_de_pessoal": {
      const agruparPor = umDe(entrada.agruparPor, ["setor", "empresa"] as const, "setor");
      const hoje = hojeUTC();

      const [ativos, beneficios] = await Promise.all([
        prisma.colaborador.findMany({
          where: { empresaId: { in: empresaIds }, ativo: true },
          select: {
            salarioBase: true,
            setor: { select: { nome: true } },
            empresa: { select: { nome: true } },
          },
        }),
        prisma.beneficioColaborador.findMany({
          where: {
            empresaId: { in: empresaIds },
            OR: [{ dataFim: null }, { dataFim: { gte: hoje } }],
            colaborador: { ativo: true },
          },
          select: {
            valorEmpresa: true,
            colaborador: {
              select: { setor: { select: { nome: true } }, empresa: { select: { nome: true } } },
            },
          },
        }),
      ]);

      const rotulo = rotulosCanonicos([
        ...ativos.map(c => c.setor.nome),
        ...beneficios.map(b => b.colaborador.setor.nome),
      ]);
      const chaveAtivo = (c: (typeof ativos)[number]) =>
        agruparPor === "setor" ? rotulo.get(c.setor.nome)! : c.empresa.nome;
      const chaveBeneficio = (b: (typeof beneficios)[number]) =>
        agruparPor === "setor" ? rotulo.get(b.colaborador.setor.nome)! : b.colaborador.empresa.nome;

      // `custoPessoalPorSetor` soma por uma chave de texto opaca — passar o nome
      // do CNPJ nela dá exatamente a mesma aritmética do agrupamento por setor.
      // Reaproveitar em vez de escrever a soma de novo é o que garante que o
      // assistente e a tela de Indicadores nunca divirjam em um centavo.
      const somas = custoPessoalPorSetor(
        ativos.map(c => ({ setorNome: chaveAtivo(c), salarioBase: c.salarioBase })),
        beneficios.map(b => ({ setorNome: chaveBeneficio(b), valorEmpresa: b.valorEmpresa }))
      );

      const cadastro = new Map<string, { total: number; comSalario: number }>();
      for (const c of ativos) {
        const k = chaveAtivo(c);
        const atual = cadastro.get(k) ?? { total: 0, comSalario: 0 };
        atual.total++;
        if (c.salarioBase != null) atual.comSalario++;
        cadastro.set(k, atual);
      }

      const linhas = somas.map(s => {
        const c = cadastro.get(s.setor) ?? { total: 0, comSalario: 0 };
        const semSalario = c.total - c.comSalario;
        // Nunca R$ 0 onde o certo é "sem dado": um CNPJ em que ninguém tem
        // salário cadastrado apareceria como o mais barato do grupo, a
        // conclusão exatamente oposta à realidade. E nunca um valor que É o
        // salário de uma pessoa — ver MINIMO_SALARIOS_PARA_VALOR.
        const podeMostrarValor = c.comSalario >= MINIMO_SALARIOS_PARA_VALOR;
        return {
          grupo: s.setor,
          ativos: c.total,
          comSalarioCadastrado: c.comSalario,
          semSalarioCadastrado: semSalario,
          folha: podeMostrarValor ? s.folha : null,
          folhaFormatada: podeMostrarValor
            ? formatarReais(s.folha)
            : c.comSalario === 0
              ? "sem dado (nenhum salário cadastrado)"
              : `sem dado (só ${c.comSalario} de ${c.total} salários cadastrados — o valor seria individual)`,
          folhaParcial: podeMostrarValor && semSalario > 0,
        };
      });

      const comSalario = ativos.filter(c => c.salarioBase != null).length;
      const semSalarioPorEmpresa = new Map<string, number>();
      for (const c of ativos) {
        if (c.salarioBase == null) {
          semSalarioPorEmpresa.set(
            c.empresa.nome,
            (semSalarioPorEmpresa.get(c.empresa.nome) ?? 0) + 1
          );
        }
      }
      const folhaTotal = somas.reduce((t, s) => t + s.folha, 0);

      const avisos: string[] = [
        "A folha aqui é a soma do SALÁRIO BASE dos ativos. Não inclui encargos patronais (INSS, FGTS), horas extras, adicionais, 13º nem provisão de férias — o custo real é bem maior que o número exibido.",
      ];
      if (beneficios.length === 0) {
        avisos.push(
          "Benefícios NÃO entram nesta conta: a tabela de benefícios por colaborador está vazia no escopo (0 registros). Isso é ausência de cadastro, não ausência de benefício — não conclua que a empresa não paga benefício nem que o custo com benefício é zero."
        );
      }
      if (comSalario < ativos.length) {
        const detalhe = [...semSalarioPorEmpresa.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([empresa, n]) => `${empresa}: ${n}`)
          .join("; ");
        avisos.push(
          `${ativos.length - comSalario} dos ${ativos.length} ativos estão SEM salário cadastrado (${detalhe}). Todo valor em reais desta resposta é piso, não total. Linha com folha = null significa "sem dado", nunca R$ 0 — não compare essas linhas com as demais como se fossem mais baratas.`
        );
      }

      const totalTemValor = comSalario >= MINIMO_SALARIOS_PARA_VALOR;
      return {
        recorte: escopo.descricao,
        agruparPor,
        totalAtivos: ativos.length,
        comSalarioCadastrado: comSalario,
        semSalarioCadastrado: ativos.length - comSalario,
        folhaMensalEstimada: totalTemValor ? folhaTotal : null,
        folhaMensalFormatada: totalTemValor ? formatarReais(folhaTotal) : "sem dado",
        folhaParcial: totalTemValor && comSalario < ativos.length,
        beneficiosVigentesCadastrados: beneficios.length,
        linhas: linhas.slice(0, LIMITE),
        avisos,
      };
    }

    case "passivo_de_ferias": {
      const hoje = hojeUTC();

      const [ativos, solicitacoes] = await Promise.all([
        prisma.colaborador.findMany({
          where: { empresaId: { in: empresaIds }, ativo: true },
          select: {
            id: true,
            nome: true,
            empresaId: true,
            dataAdmissao: true,
            salarioBase: true,
            empresa: { select: { nome: true } },
            ferias: {
              where: { status: { in: ["APROVADA", "PENDENTE"] } },
              select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
            },
          },
        }),
        prisma.solicitacaoFerias.findMany({
          where: { empresaId: { in: empresaIds } },
          select: { dataInicio: true, status: true, observacoes: true, solicitadoPorId: true },
        }),
      ]);

      const passivo = calcularPassivoFerias(
        ativos.map(c => ({
          colaboradorId: c.id,
          nome: c.nome,
          empresaId: c.empresaId,
          empresaNome: c.empresa.nome,
          dataAdmissao: c.dataAdmissao,
          salarioBase: c.salarioBase,
          solicitacoes: c.ferias,
        })),
        hoje
      );
      const programacao = resumirProgramacaoFerias(solicitacoes, hoje);
      const origem = resumirOrigemDoHistorico(solicitacoes);

      const avisos = [...passivo.avisos];
      if (origem.aviso) avisos.push(origem.aviso);
      if (programacao.aviso) avisos.push(programacao.aviso);
      if (passivo.semHistorico.semRegistroAlgum > 0) {
        avisos.push(
          `${passivo.semHistorico.semRegistroAlgum} dos ${ativos.length} ativos não têm NENHUM registro de férias. Nem todos carregam saldo (quem ainda não fechou 12 meses não tem período adquirido), mas o histórico de gozo desta base é importado e parcialmente estimado — trate o passivo como estimativa a confirmar com o DP, não como dívida apurada.`
        );
      }

      // Mesmo corte do custo de pessoal: um valor em reais construído sobre um
      // ou dois salários É o salário daquelas pessoas, porque a fórmula
      // (dias × salário/30 × 4/3) é reversível e os dias vão na resposta.
      const comSalarioNoEscopo = ativos.filter(c => c.salarioBase != null).length;
      const podeMostrarValor = comSalarioNoEscopo >= MINIMO_SALARIOS_PARA_VALOR;
      const reaisOuNulo = (v: number) => (podeMostrarValor ? v : null);
      if (!podeMostrarValor) {
        avisos.push(
          `Só ${comSalarioNoEscopo} dos ${ativos.length} ativos têm salário cadastrado: nenhum valor em reais é devolvido, porque ele seria o salário de uma ou duas pessoas. Responda em DIAS de saldo, não em dinheiro.`
        );
      }

      return {
        recorte: escopo.descricao,
        ativosConsiderados: passivo.ativosConsiderados,
        ativosSemAdmissao: passivo.ativosSemAdmissao,
        saldoTotalEmDias: passivo.diasTotais,
        provisao: {
          reais: reaisOuNulo(passivo.provisao.total.reais),
          formatado: podeMostrarValor
            ? formatarReais(passivo.provisao.total.reais)
            : "sem dado (salários cadastrados de menos para um valor agregado)",
          diasValorados: passivo.provisao.total.diasValorados,
          diasSemValoracao: passivo.provisao.total.diasSemValoracao,
          parcial: passivo.provisao.total.parcial,
          reaisIndeterminados: reaisOuNulo(passivo.provisao.semHistorico.reais),
        },
        vencido: {
          pessoas: passivo.vencido.pessoas,
          dias: passivo.vencido.dias,
          reais: reaisOuNulo(passivo.vencido.valor.reais),
          reaisEmDobro: reaisOuNulo(passivo.vencido.reaisEmDobro),
          pessoasSemHistorico: passivo.vencido.pessoasSemHistorico,
          diasSemHistorico: passivo.vencido.diasSemHistorico,
          // Sem `reais` por pessoa de propósito: dias × salário/30 × 4/3 é
          // reversível, então a coluna equivale a publicar o salário de cada
          // um. Dinheiro sai agregado; nome sai com dias. A tela de Férias
          // mostra exatamente isso e o assistente não pode mostrar mais.
          lista: passivo.vencido.lista.slice(0, LIMITE).map(p => ({
            nome: p.nome,
            empresa: p.empresa,
            dias: p.dias,
            vencidoHaDias: p.vencidoHaDias,
            semHistoricoDeFerias: p.semHistorico,
          })),
        },
        filaProximosMeses: {
          janelaMeses: passivo.fila.janelaMeses,
          pessoas: passivo.fila.pessoas,
          dias: passivo.fila.dias,
          linhas: passivo.fila.linhas.slice(0, LIMITE).map(l => ({
            nome: l.nome,
            empresa: l.empresa,
            dias: l.dias,
            diasAteLimite: l.diasAteLimite,
            semHistoricoDeFerias: l.semHistorico,
          })),
        },
        porEmpresa: passivo.porEmpresa.slice(0, LIMITE).map(e => {
          const comValor = e.ativos - e.semSalario >= MINIMO_SALARIOS_PARA_VALOR;
          return {
            empresa: e.empresa,
            ativos: e.ativos,
            dias: e.dias,
            reais: comValor && e.valor.diasValorados > 0 ? e.valor.reais : null,
            reaisParciais: comValor && e.valor.parcial,
            semSalarioCadastrado: e.semSalario,
            pessoasVencidas: e.pessoasVencidas,
            diasVencidos: e.diasVencidos,
          };
        }),
        programacaoFutura: {
          agendadas: programacao.agendadas,
          totalRegistros: programacao.totalRegistros,
          ultimoInicioRegistrado: programacao.ultimoInicioRegistrado
            ? formatarData(programacao.ultimoInicioRegistrado)
            : null,
        },
        origemDoHistorico: {
          total: origem.total,
          comDataEstimada: origem.estimadas,
          comDataReal: origem.comDataReal,
          criadasNoSistema: origem.criadasNoSistema,
        },
        avisos,
      };
    }

    case "tempo_de_casa_distribuicao": {
      const agruparPor = umDe(entrada.agruparPor, ["geral", "setor", "cargo"] as const, "geral");
      const hoje = hojeUTC();

      const ativos = await prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true },
        select: { dataAdmissao: true, setorId: true, posicaoId: true },
      });

      const resumo = resumoTempoDeCasa(ativos, hoje);
      const avisos: string[] = [AVISO_MEDIA_TEMPO_DE_CASA];
      if (resumo.semData > 0) {
        avisos.push(
          `${resumo.semData} dos ${ativos.length} ativos não têm data de admissão e ficaram fora de todos os quartis e percentuais.`
        );
      }

      const arredondar = (q: { p25: number; mediana: number; p75: number } | null) =>
        q === null
          ? null
          : {
              p25: Number(q.p25.toFixed(2)),
              mediana: Number(q.mediana.toFixed(2)),
              p75: Number(q.p75.toFixed(2)),
            };

      const geral = {
        comData: resumo.comData,
        semData: resumo.semData,
        // null, nunca 0: sem data de admissão a resposta é "não sei", não "acabou de entrar".
        quartisEmAnos: arredondar(resumo.quartis),
        mediaAnos: resumo.mediaAnos === null ? null : Number(resumo.mediaAnos.toFixed(2)),
        abaixoDeUmAno: resumo.abaixoDeUmAno,
        abaixoDeUmAnoPct:
          resumo.abaixoDeUmAnoPct === null ? null : Number(resumo.abaixoDeUmAnoPct.toFixed(1)),
        abaixoDeSeisMeses: resumo.abaixoDeSeisMeses,
        abaixoDeTresMeses: resumo.abaixoDeTresMeses,
        faixas: resumo.faixas,
      };

      if (agruparPor === "geral") {
        return { recorte: escopo.descricao, agruparPor, geral, avisos };
      }

      const [setores, cargos] = await Promise.all([
        agruparPor === "setor"
          ? prisma.setor.findMany({
              where: { empresaId: { in: empresaIds } },
              select: { id: true, nome: true },
            })
          : Promise.resolve([]),
        agruparPor === "cargo"
          ? prisma.posicao.findMany({
              where: { empresaId: { in: empresaIds } },
              select: { id: true, nome: true },
            })
          : Promise.resolve([]),
      ]);

      const linhas =
        agruparPor === "setor"
          ? tempoDeCasaPorSetor(ativos, setores, hoje)
          : tempoDeCasaPorCargo(ativos, cargos, hoje);

      avisos.push(
        "Linhas marcadas com amostraInsuficiente têm poucas datas para o quartil significar algo e estão no fim da lista — não as trate como ranking. No recorte por cargo, os cargos pequenos aparecem somados numa linha 'Demais cargos'."
      );

      return {
        recorte: escopo.descricao,
        agruparPor,
        geral,
        linhas: linhas.slice(0, LIMITE).map(l => ({
          grupo: l.grupo,
          total: l.total,
          comData: l.comData,
          semData: l.semData,
          quartisEmAnos: arredondar(l.quartis),
          abaixoDeUmAno: l.abaixoDeUmAno,
          abaixoDeUmAnoPct:
            l.abaixoDeUmAnoPct === null ? null : Number(l.abaixoDeUmAnoPct.toFixed(1)),
          amostraInsuficiente: l.amostraInsuficiente,
          cargosSomados: l.gruposSomados > 1 ? l.gruposSomados : undefined,
        })),
        avisos,
      };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

/** Contexto de data — sem isso o modelo erra "mês que vem" e "ano passado". */
export function contextoTemporal(): string {
  const hoje = hojeUTC();
  return `Hoje é ${formatarData(hoje)}. Daqui a 30 dias: ${formatarData(somarDiasUTC(hoje, 30))}.`;
}
