// Gera o Relatório de Clima Organizacional (GPTW) em PDF.
// Mesmo padrão do relatorio-pdf de NR-01.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresasVisiveis, podeOperarEmpresaRH } from "@/lib/rh-auth-guard";
import { cnpjsVisiveisDaMarca, marcaDaEmpresa } from "@/lib/escopo-marca";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { gerarHtmlRelatorioClima } from "@/lib/clima-relatorio";
import { calcularClima, compararCiclos, extrairEvolucao, gerarAnaliseExecutiva, type RespostaPrisma } from "@/lib/clima";
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; pesquisaId: string }> },
) {
  const { empresaId, pesquisaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Uma linha, uma regra: `usuarioAlcancaEmpresa` de lib/rh-auth-guard.ts, a
  // MESMA que decide o acesso às páginas. Aqui havia uma checagem escrita à
  // mão — cinco variantes diferentes conviviam em nove rotas, e duas delas
  // esqueciam DIRETORIA, cujo pivô `UserEmpresa` é vazio por desenho.
  //
  // `podeOperarEmpresaRH`, e não `usuarioAlcancaEmpresa`, desde 25/11/2026: a
  // segunda deixa passar o GESTOR_SETOR com vínculo no CNPJ e não confere o
  // módulo RH do perfil — o relatório traz o resultado da empresa inteira.
  // Só as telas de /rh/<empresa> chamam esta rota, e o gestor não entra nelas.
  if (!(await podeOperarEmpresaRH(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  // Pesquisa é da MARCA (26/11/2026) — o mesmo recorte do dashboard de clima
  // (dashboard-clima/page.tsx): marca do CNPJ do caminho, criada em CNPJ que o
  // usuário enxerga. Antes esta busca e as do ciclo anterior/histórico iam
  // pelo CNPJ do caminho: a pesquisa criada no CNPJ irmão abria no dashboard
  // mas o PDF dava 404, e o comparativo perdia os ciclos do irmão.
  const [marcaId, cnpjsDaMarca] = await Promise.all([
    marcaDaEmpresa(empresaId),
    empresasVisiveis(user).then((visiveis) => cnpjsVisiveisDaMarca(empresaId, visiveis)),
  ]);
  const daMarcaVisivel = { marcaId, empresaId: { in: cnpjsDaMarca } };

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, ...daMarcaVisivel, modelo: "CLIMA" },
    include: { empresa: { select: { nome: true } } },
  });
  if (!pesquisa) {
    return NextResponse.json(
      { error: "Pesquisa de clima não encontrada nesta empresa." },
      { status: 404 },
    );
  }

  const [convites, respostas, perguntas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: { itens: { include: { pergunta: true } } },
    }),
    prisma.pergunta.findMany({
      where: { pesquisaId },
      select: { id: true, dimensaoGPTW: true, dimensao: true, enunciado: true, tipo: true },
    }),
  ]);

  const respostasTipadas: RespostaPrisma[] = respostas.map((r) => ({
    setorNomeSnapshot: r.setorNomeSnapshot,
    sexoSnapshot: r.sexoSnapshot,
    faixaEtariaSnapshot: r.faixaEtariaSnapshot,
    itens: r.itens.map((i) => ({
      pergunta: {
        id: i.pergunta.id,
        enunciado: i.pergunta.enunciado,
        dimensaoGPTW: i.pergunta.dimensaoGPTW,
        dimensao: i.pergunta.dimensao,
        tipo: i.pergunta.tipo,
      },
      valorNumerico: i.valorNumerico,
      valorTexto: i.valorTexto,
    })),
  }));

  const { resultado } = calcularClima({ respostas: respostasTipadas, perguntas });

  // Ciclo anterior
  const cicloAnterior = await prisma.pesquisa.findFirst({
    where: { ...daMarcaVisivel, modelo: "CLIMA", encerradaEm: { not: null }, id: { not: pesquisaId } },
    orderBy: { encerradaEm: "desc" },
    include: { respostas: { include: { itens: { include: { pergunta: true } } } } },
  });

  let comparativo = null;
  if (cicloAnterior) {
    const respostasAnterior: RespostaPrisma[] = cicloAnterior.respostas.map((r) => ({
      setorNomeSnapshot: r.setorNomeSnapshot,
      sexoSnapshot: r.sexoSnapshot,
      faixaEtariaSnapshot: r.faixaEtariaSnapshot,
      itens: r.itens.map((i) => ({
        pergunta: {
          id: i.pergunta.id,
          enunciado: i.pergunta.enunciado,
          dimensaoGPTW: i.pergunta.dimensaoGPTW,
          dimensao: i.pergunta.dimensao,
          tipo: i.pergunta.tipo,
        },
        valorNumerico: i.valorNumerico,
        valorTexto: i.valorTexto,
      })),
    }));
    const { resultado: resultadoAnterior } = calcularClima({
      respostas: respostasAnterior,
      perguntas: [],
    });
    comparativo = compararCiclos(resultado, resultadoAnterior);
  }

  // Enriquece análise executiva
  const participacaoPct = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;
  resultado.analiseExecutiva = gerarAnaliseExecutiva(resultado, comparativo, participacaoPct);

  // Evolução histórica
  const ciclosHistorico = await prisma.pesquisa.findMany({
    where: { ...daMarcaVisivel, modelo: "CLIMA", encerradaEm: { not: null } },
    orderBy: { encerradaEm: "desc" },
    take: 5,
    include: { respostas: { include: { itens: { include: { pergunta: true } } } } },
  });

  const evolucao = extrairEvolucao(
    ciclosHistorico.map((c) => ({
      titulo: c.titulo,
      encerradaEm: c.encerradaEm!,
      respostas: c.respostas.map((r) => ({
        setorNomeSnapshot: r.setorNomeSnapshot,
        sexoSnapshot: r.sexoSnapshot,
        faixaEtariaSnapshot: r.faixaEtariaSnapshot,
        itens: r.itens.map((i) => ({
          pergunta: {
            id: i.pergunta.id,
            enunciado: i.pergunta.enunciado,
            dimensaoGPTW: i.pergunta.dimensaoGPTW,
            dimensao: i.pergunta.dimensao,
            tipo: i.pergunta.tipo,
          },
          valorNumerico: i.valorNumerico,
          valorTexto: i.valorTexto,
        })),
      })),
    })),
  );

  const html = gerarHtmlRelatorioClima({
    empresaNome: pesquisa.empresa.nome,
    pesquisaTitulo: pesquisa.titulo,
    pesquisaStatus: pesquisa.status,
    iniciadaEm: pesquisa.iniciadaEm,
    encerradaEm: pesquisa.encerradaEm,
    convites,
    resultado,
    comparativo,
    evolucao,
  });

  return responderComHtmlRelatorio(html, `Relatório Clima Organizacional - ${pesquisa.empresa.nome}`);
}
