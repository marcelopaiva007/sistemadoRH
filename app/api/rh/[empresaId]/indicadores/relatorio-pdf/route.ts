// Gera o Relatório de Indicadores (BI de RH) em PDF. Mesmo padrão de
// avaliacoes/painel/relatorio-pdf: HTML server-side renderizado por Chromium
// headless. Complementa o /csv já existente — CSV pra planilha, PDF pra
// anexar num e-mail ou levar pronto pra reunião de diretoria.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { escopoDeEmpresas, podeOperarEmpresaRH } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeCalendarioBrasilia, hojeUTC } from "@/lib/datas";
import { rotuloDoEscopo } from "@/lib/escopo-marca";
import {
  absenteismoPorSetor,
  calcularTurnover,
  filtroAusenciasDaJanela,
  custoPessoalPorSetor,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { gerarHtmlRelatorioIndicadores } from "@/lib/indicadores-relatorio";
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";
import { marcarTransferencias } from "@/lib/transferencia";
import { saidasPorTransferenciaDoGrupo } from "@/lib/transferencia-grupo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;
  const empresasParam = req.nextUrl.searchParams.get("empresas") ?? undefined;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Uma linha, uma regra: `podeOperarEmpresaRH` de lib/rh-auth-guard.ts, a
  // MESMA pergunta de `requireEmpresaAccess`, que decide o acesso às telas de
  // /rh/<empresa>. (Antes de 11/08/2026 havia aqui uma checagem escrita à mão —
  // cinco variantes em nove rotas, duas esquecendo DIRETORIA.) Até 25/11/2026
  // era `usuarioAlcancaEmpresa`, que deixa passar o GESTOR_SETOR com vínculo no
  // CNPJ e não confere o módulo "rh" do perfil: o gestor abria esta rota por
  // link direto e levava dado da empresa inteira, que a tela dele (Meu Setor)
  // nunca mostra. Achado da auditoria de permissões de 25/11/2026.
  if (!(await podeOperarEmpresaRH(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  // O MESMO escopo que a tela do Painel está mostrando — ver o comentário
  // gêmeo em indicadores/csv/route.ts.
  const empresaIds = await escopoDeEmpresas(user, empresasParam);
  const hoje = hojeUTC();
  // Absenteísmo recortado à janela [hoje − 30, hoje] no dia de Brasília
  // (26/11/2026) — a mesma busca e a mesma conta do Painel, para o arquivo
  // bater com a tela.
  const hojeAbsenteismo = hojeCalendarioBrasilia();

  const [
    rotuloEscopo,
    ativos,
    vinculosDoCadastro,
    ausenciasRecentes,
    beneficiosVigentes,
    totalColaboradoresHistorico,
    saidasPorTransferencia,
  ] =
    await Promise.all([
      rotuloDoEscopo(empresaIds),
      prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true },
        select: { setor: { select: { nome: true } }, salarioBase: true },
      }),
      prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds } },
        // id, CPF e motivo: só para reconhecer transferência no grupo — a mesma
        // conta do Painel, que é o que o relatório precisa repetir.
        select: { id: true, empresaId: true, cpf: true, motivoDesligamento: true, dataAdmissao: true, dataDesligamento: true },
      }),
      prisma.ausencia.findMany({
        where: { empresaId: { in: empresaIds }, ...filtroAusenciasDaJanela(hojeAbsenteismo) },
        select: { dias: true, abonada: true, dataInicio: true, dataFim: true, colaborador: { select: { setor: { select: { nome: true } } } } },
      }),
      prisma.beneficioColaborador.findMany({
        where: { empresaId: { in: empresaIds }, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }], colaborador: { ativo: true } },
        select: { valorEmpresa: true, colaborador: { select: { setor: { select: { nome: true } } } } },
      }),
      prisma.colaborador.count({ where: { empresaId: { in: empresaIds } } }),
      saidasPorTransferenciaDoGrupo(empresaIds),
    ]);
  const todosOsVinculos = marcarTransferencias(vinculosDoCadastro, saidasPorTransferencia);

  const headcount = headcountPorSetor(ativos.map((c) => ({ setorNome: c.setor.nome })));
  const turnover = calcularTurnover(todosOsVinculos, ativos.length, hoje);
  const movimento = movimentoMensal(todosOsVinculos, hoje);
  const absenteismo = absenteismoPorSetor(
    ausenciasRecentes.map((a) => ({
      setorNome: a.colaborador.setor.nome,
      dias: a.dias,
      abonada: a.abonada,
      dataInicio: a.dataInicio,
      dataFim: a.dataFim,
    })),
    headcount,
    hojeAbsenteismo,
  );
  const custo = custoPessoalPorSetor(
    ativos.map((c) => ({ setorNome: c.setor.nome, salarioBase: c.salarioBase })),
    beneficiosVigentes.map((b) => ({ setorNome: b.colaborador.setor.nome, valorEmpresa: b.valorEmpresa })),
  );
  const comSalarioPreenchido = ativos.filter((c) => c.salarioBase != null).length;

  const html = gerarHtmlRelatorioIndicadores({
    rotuloEscopo,
    qtdEmpresas: empresaIds.length,
    geradoEm: new Date(),
    totalAtivos: ativos.length,
    totalHistorico: totalColaboradoresHistorico,
    comSalarioPreenchido,
    turnover,
    movimento,
    headcount,
    absenteismo,
    custo,
  });

  return responderComHtmlRelatorio(html, `Relatório de Indicadores RH - ${rotuloEscopo}`);
}
