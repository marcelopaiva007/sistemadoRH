// Carrega do banco o que lib/pesquisa-analise.ts precisa — o Dashboard e o
// Relatório PDF de cada pesquisa chamam ESTA função, para que a tela e o papel
// mostrem sempre o mesmo número.
//
// Escopo: a pesquisa é da MARCA (ver model Pesquisa), e os ciclos anteriores
// usados no comparativo são do mesmo tipo (`modelo`) e da MESMA marca — nunca
// de outra marca do grupo.
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { analisarPesquisa, type AnaliseGerencial, type CicloParaAnalise } from "@/lib/pesquisa-analise";

/** Quantos ciclos anteriores entram na série histórica. */
const CICLOS_ANTERIORES = 5;

export type PesquisaAnalisada = {
  pesquisa: {
    id: string;
    titulo: string;
    modelo: string;
    status: string;
    anonima: boolean;
    iniciadaEm: Date | null;
    encerradaEm: Date | null;
    empresaNome: string;
  };
  analise: AnaliseGerencial;
};

async function carregarCiclo(p: {
  id: string;
  titulo: string;
  iniciadaEm: Date | null;
  encerradaEm: Date | null;
  createdAt: Date;
}): Promise<CicloParaAnalise> {
  const [convites, perguntas, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId: p.id, ...CONVITES_NA_PESQUISA } }),
    prisma.pergunta.findMany({
      where: { pesquisaId: p.id },
      select: {
        id: true, ordem: true, enunciado: true, tipo: true,
        opcoes: { select: { id: true, texto: true, ordem: true } },
      },
      orderBy: { ordem: "asc" },
    }),
    prisma.resposta.findMany({
      where: { pesquisaId: p.id },
      select: {
        setorNomeSnapshot: true,
        itens: { select: { perguntaId: true, valorNumerico: true, valorTexto: true, opcaoId: true } },
      },
    }),
  ]);
  return {
    titulo: p.titulo,
    data: p.encerradaEm ?? p.iniciadaEm ?? p.createdAt,
    convites,
    perguntas,
    respostas,
  };
}

/**
 * null quando a pesquisa não existe nesta marca. Quem chama já garantiu o
 * acesso do usuário à empresa (requireEmpresaAccess / usuarioAlcancaEmpresa).
 */
export async function carregarAnalisePesquisa(
  pesquisaId: string,
  marcaId: string,
): Promise<PesquisaAnalisada | null> {
  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, marcaId },
    select: {
      id: true, titulo: true, modelo: true, status: true, anonima: true,
      iniciadaEm: true, encerradaEm: true, createdAt: true,
      marca: { select: { nome: true } },
    },
  });
  if (!pesquisa) return null;

  const anterioresMeta = await prisma.pesquisa.findMany({
    where: {
      marcaId,
      modelo: pesquisa.modelo,
      id: { not: pesquisa.id },
      createdAt: { lt: pesquisa.createdAt },
      status: { not: "DRAFT" },
      respostas: { some: {} },
    },
    orderBy: { createdAt: "desc" },
    take: CICLOS_ANTERIORES,
    select: { id: true, titulo: true, iniciadaEm: true, encerradaEm: true, createdAt: true },
  });

  const [atual, ...anteriores] = await Promise.all([
    carregarCiclo(pesquisa),
    ...anterioresMeta.map(carregarCiclo),
  ]);

  const analise = analisarPesquisa({ ...atual, modelo: pesquisa.modelo, anteriores });

  return {
    pesquisa: {
      id: pesquisa.id,
      titulo: pesquisa.titulo,
      modelo: pesquisa.modelo,
      status: pesquisa.status,
      anonima: pesquisa.anonima,
      iniciadaEm: pesquisa.iniciadaEm,
      encerradaEm: pesquisa.encerradaEm,
      empresaNome: pesquisa.marca.nome,
    },
    analise,
  };
}
