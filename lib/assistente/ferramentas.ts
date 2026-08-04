import { prisma } from "@/lib/prisma";
import { conformidadeDoColaborador } from "@/lib/conformidade";
import { pendenciasDaEmpresa, modulosSemRegistro } from "@/lib/pendencias";
import { hojeUTC, somarDiasUTC, formatarData } from "@/lib/datas";

// Ferramentas de LEITURA que o assistente pode chamar.
//
// O modelo NUNCA escreve SQL nem recebe acesso ao Prisma: ele escolhe entre
// estas funções e passa parâmetros simples. Três razões:
//  1. `empresaId` é fixado aqui, no servidor — não vem do modelo. Não existe
//     pergunta capaz de fazer o assistente ler outra empresa.
//  2. Consulta sem limite não passa: todo retorno é cortado.
//  3. O que não está aqui, ele não alcança. Ampliar acesso é decisão de
//     código, não de prompt.

const LIMITE = 50;

export type ResultadoFerramenta = Record<string, unknown> | Record<string, unknown>[];

export const FERRAMENTAS = [
  {
    name: "contar_colaboradores",
    description:
      "Conta colaboradores da empresa. Use para perguntas de quantidade ('quantas pessoas temos', 'quantos no setor X').",
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
    description: "Quantidade de colaboradores ativos agrupada por setor.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "buscar_colaborador",
    description:
      "Busca colaboradores pelo nome (parcial) e devolve a ficha resumida: setor, cargo, admissão, contato, situação.",
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
];

function dataDoTexto(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/**
 * Executa a ferramenta escolhida pelo modelo. `empresaId` vem de fora e o
 * modelo não tem como influenciá-lo.
 */
export async function executarFerramenta(
  empresaId: string,
  nome: string,
  entrada: Record<string, unknown>,
): Promise<ResultadoFerramenta> {
  switch (nome) {
    case "contar_colaboradores": {
      const apenasAtivos = entrada.apenasAtivos !== false;
      const setor = typeof entrada.setor === "string" ? entrada.setor : undefined;
      const total = await prisma.colaborador.count({
        where: {
          empresaId,
          ...(apenasAtivos ? { ativo: true } : {}),
          ...(setor ? { setor: { nome: { contains: setor, mode: "insensitive" } } } : {}),
        },
      });
      return { total, apenasAtivos, setor: setor ?? "todos" };
    }

    case "headcount_por_setor": {
      const setores = await prisma.setor.findMany({
        where: { empresaId, ativo: true },
        orderBy: { nome: "asc" },
        select: { nome: true, _count: { select: { colaboradores: { where: { ativo: true } } } } },
      });
      return setores.map((s) => ({ setor: s.nome, ativos: s._count.colaboradores }));
    }

    case "buscar_colaborador": {
      const nome = typeof entrada.nome === "string" ? entrada.nome.trim() : "";
      if (!nome) return { erro: "Informe parte do nome." };
      const pessoas = await prisma.colaborador.findMany({
        where: { empresaId, nome: { contains: nome, mode: "insensitive" } },
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
          setor: { select: { nome: true } },
          posicao: { select: { nome: true } },
          supervisor: { select: { nome: true } },
        },
      });
      return pessoas.map((p) => ({
        nome: p.nome,
        situacao: p.ativo ? "ativo" : "desligado",
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
        where: { empresaId, status: "APROVADA", dataInicio: { lte: fim }, dataFim: { gte: inicio } },
        take: LIMITE,
        orderBy: { dataInicio: "asc" },
        select: {
          dataInicio: true,
          dataFim: true,
          dias: true,
          colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
        },
      });
      return ferias.map((f) => ({
        colaborador: f.colaborador.nome,
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
        where: { empresaId, ativo: true, dataNascimento: { not: null } },
        select: { nome: true, dataNascimento: true, setor: { select: { nome: true } } },
      });
      return pessoas
        .filter((p) => p.dataNascimento!.getUTCMonth() + 1 === mes)
        .sort((a, b) => a.dataNascimento!.getUTCDate() - b.dataNascimento!.getUTCDate())
        .slice(0, LIMITE)
        .map((p) => ({
          colaborador: p.nome,
          setor: p.setor.nome,
          dia: p.dataNascimento!.getUTCDate(),
        }));
    }

    case "aniversarios_de_empresa": {
      const mes = Number(entrada.mes);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { erro: "Mês deve ser de 1 a 12." };
      const hoje = hojeUTC();
      const pessoas = await prisma.colaborador.findMany({
        where: { empresaId, ativo: true, dataAdmissao: { not: null } },
        select: { nome: true, dataAdmissao: true, setor: { select: { nome: true } } },
      });
      return pessoas
        .filter((p) => p.dataAdmissao!.getUTCMonth() + 1 === mes)
        .map((p) => ({
          colaborador: p.nome,
          setor: p.setor.nome,
          dia: p.dataAdmissao!.getUTCDate(),
          anosDeCasa: hoje.getUTCFullYear() - p.dataAdmissao!.getUTCFullYear(),
        }))
        .filter((p) => p.anosDeCasa > 0)
        .sort((a, b) => a.dia - b.dia)
        .slice(0, LIMITE);
    }

    case "conformidade_irregular": {
      const colaboradores = await prisma.colaborador.findMany({
        where: { empresaId, ativo: true },
        select: {
          nome: true,
          posicaoId: true,
          setor: { select: { nome: true } },
          certificados: { select: { norma: true, validoAte: true, realizadoEm: true } },
          exames: { select: { tipo: true, validoAte: true } },
        },
      });
      const requisitos = await prisma.requisitoNR.findMany({ where: { posicao: { empresaId } } });
      const hoje = hojeUTC();

      const irregulares = colaboradores
        .map((c) => {
          const reqs = requisitos.filter((r) => r.posicaoId === c.posicaoId);
          const conf = conformidadeDoColaborador(reqs, c.certificados);
          const asoVencido = c.exames.every((e) => !e.validoAte || e.validoAte < hoje);
          return { nome: c.nome, setor: c.setor.nome, conf, asoVencido, temExame: c.exames.length > 0 };
        })
        .filter((x) => !x.conf.regular || !x.temExame || x.asoVencido)
        .slice(0, LIMITE)
        .map((x) => ({
          colaborador: x.nome,
          setor: x.setor,
          nrsPendentes: x.conf.itens.filter((i) => i.situacao !== "EM_DIA").map((i) => i.norma),
          aso: !x.temExame ? "nunca feito" : x.asoVencido ? "vencido" : "em dia",
        }));

      return { totalIrregulares: irregulares.length, irregulares };
    }

    case "pendencias_da_empresa": {
      // Vai junto o que NÃO pôde ser avaliado. Sem isso o assistente lê
      // `catPendente: 0` e responde "nenhuma CAT em aberto", quando a verdade é
      // que o módulo de acidentes nunca foi usado — mesma armadilha que a tela
      // de pendências tinha até 04/08/2026, e aqui é pior, porque a resposta
      // sai em prosa afirmativa.
      const [contagens, vazios] = await Promise.all([
        pendenciasDaEmpresa([empresaId]),
        modulosSemRegistro([empresaId]),
      ]);
      return {
        ...contagens,
        semRegistroNenhum: [...vazios],
        aviso:
          vazios.size > 0
            ? "Os itens listados em semRegistroNenhum estão zerados por falta de qualquer registro no módulo, não por estarem em dia. Não afirme conformidade sobre eles."
            : undefined,
      };
    }

    case "vagas_e_candidatos": {
      const vagas = await prisma.vaga.findMany({
        where: { empresaId, status: "ABERTA" },
        take: LIMITE,
        orderBy: { abertaEm: "desc" },
        select: {
          titulo: true,
          quantidade: true,
          abertaEm: true,
          setor: { select: { nome: true } },
          candidaturas: { select: { etapa: true } },
        },
      });
      const ativas = new Set(["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA"]);
      return vagas.map((v) => ({
        vaga: v.titulo,
        setor: v.setor?.nome ?? null,
        posicoes: v.quantidade,
        abertaEm: formatarData(v.abertaEm),
        candidatosEmProcesso: v.candidaturas.filter((c) => ativas.has(c.etapa)).length,
        totalCandidatos: v.candidaturas.length,
      }));
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
