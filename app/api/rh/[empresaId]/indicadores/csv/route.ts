// Exportação dos Indicadores (BI) em CSV — headcount, turnover, absenteísmo
// e custo de pessoal por setor. A tela nunca teve nenhuma forma de exportar
// esses números; isto cobre a dor imediata (Diretoria levar os dados para
// uma reunião) sem depender do PDF via Playwright que a pesquisa NR-01 usa.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { gerarCsv } from "@/lib/csv";
import { hojeUTC } from "@/lib/datas";
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  headcountPorSetor,
} from "@/lib/bi";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" || user.empresas.some((e) => e.empresaId === empresaId && e.ativo);
  if (!autorizado) return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });

  const hoje = hojeUTC();

  const [empresa, ativos, todosOsVinculos, ausenciasRecentes, beneficiosVigentes] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      select: { setor: { select: { nome: true } }, salarioBase: true },
    }),
    prisma.colaborador.findMany({
      where: { empresaId },
      select: { dataAdmissao: true, dataDesligamento: true },
    }),
    prisma.ausencia.findMany({
      where: { empresaId, dataInicio: { gte: new Date(hoje.getTime() - 40 * 86_400_000) } },
      select: { dias: true, abonada: true, dataInicio: true, colaborador: { select: { setor: { select: { nome: true } } } } },
    }),
    prisma.beneficioColaborador.findMany({
      where: { empresaId, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }], colaborador: { ativo: true } },
      select: { valorEmpresa: true, colaborador: { select: { setor: { select: { nome: true } } } } },
    }),
  ]);

  const headcount = headcountPorSetor(ativos.map((c) => ({ setorNome: c.setor.nome })));
  const turnover = calcularTurnover(todosOsVinculos, ativos.length, hoje);
  const absenteismo = absenteismoPorSetor(
    ausenciasRecentes.map((a) => ({ setorNome: a.colaborador.setor.nome, dias: a.dias, abonada: a.abonada, dataInicio: a.dataInicio })),
    headcount,
    hoje,
  );
  const custo = custoPessoalPorSetor(
    ativos.map((c) => ({ setorNome: c.setor.nome, salarioBase: c.salarioBase })),
    beneficiosVigentes.map((b) => ({ setorNome: b.colaborador.setor.nome, valorEmpresa: b.valorEmpresa })),
  );

  const custoTotal = custo.reduce((t, c) => t + c.total, 0);
  const absenteismoGeral =
    absenteismo.length > 0 ? absenteismo.reduce((t, a) => t + a.taxaPct, 0) / absenteismo.length : 0;

  const numero = (n: number) => n.toFixed(2).replace(".", ",");

  const resumo = gerarCsv(
    ["Indicador", "Valor"],
    [
      ["Headcount ativo", String(ativos.length)],
      ["Turnover (12 meses)", `${numero(turnover.taxaPct)}%`],
      ["Absenteísmo médio (30 dias)", `${numero(absenteismoGeral)}%`],
      ["Custo de pessoal/mês", numero(custoTotal)],
    ],
  );

  const absenteismoPorNome = new Map(absenteismo.map((a) => [a.setor, a.taxaPct]));
  const custoPorNome = new Map(custo.map((c) => [c.setor, c.total]));

  const porSetor = gerarCsv(
    ["Setor", "Headcount", "Absenteismo (%)", "Custo total"],
    headcount.map((h) => [
      h.setor,
      String(h.total),
      numero(absenteismoPorNome.get(h.setor) ?? 0),
      numero(custoPorNome.get(h.setor) ?? 0),
    ]),
  );

  // Um CSV só, com as duas tabelas separadas por linha em branco — mais
  // simples de abrir no Excel do que dois arquivos.
  const corpo = resumo.replace(/\r\n$/, "") + "\r\n\r\n" + porSetor.replace(/^﻿/, "");
  const nomeArquivo = `indicadores-${(empresa?.nome ?? "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
