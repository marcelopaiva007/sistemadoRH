// Exportação dos eventos variáveis de uma competência, para a contabilidade
// importar na folha (Domínio).
//
// ATENÇÃO — este NÃO é o layout oficial de importação do Domínio. É um CSV
// legível com os campos que a folha precisa (identificação da pessoa, rubrica,
// unidade e quantidade/valor). O layout exato do Domínio depende do
// cadastro de rubricas do escritório contábil; para casar 1:1 é preciso um
// arquivo de exemplo de importação vindo de lá. Enquanto isso, este arquivo
// serve para conferência e digitação.
//
// Como todo download de dado pessoal no sistema, entra na trilha de auditoria.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { formatarCompetencia, rubricaLabel, rubricaNatureza, rubricaUnidade } from "@/lib/constants-folha";

export const runtime = "nodejs";

/** Escapa campo de CSV: aspas dobradas e o todo entre aspas quando precisa. */
function campo(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ empresaId: string; competenciaId: string }> },
) {
  const { empresaId, competenciaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" ||
    user.empresas.some((e) => e.empresaId === empresaId && e.ativo);
  if (!autorizado) return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });

  const competencia = await prisma.competenciaFolha.findFirst({
    where: { id: competenciaId, empresaId },
  });
  if (!competencia) return NextResponse.json({ error: "Competência não encontrada." }, { status: 404 });

  const [empresa, eventos] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } }),
    prisma.eventoFolha.findMany({
      where: { competenciaId },
      orderBy: [{ colaborador: { nome: "asc" } }, { tipo: "asc" }],
      select: {
        tipo: true,
        quantidade: true,
        valor: true,
        observacoes: true,
        origem: true,
        colaborador: {
          select: { nome: true, matricula: true, cpf: true, setor: { select: { nome: true } } },
        },
      },
    }),
  ]);

  const ref = formatarCompetencia(competencia.referencia);

  // Ponto e vírgula como separador e vírgula decimal: é o que o Excel em
  // português abre sem pedir importação passo a passo.
  const cabecalho = [
    "Empresa",
    "Competencia",
    "Matricula",
    "CPF",
    "Colaborador",
    "Setor",
    "Rubrica",
    "CodigoRubrica",
    "Natureza",
    "Unidade",
    "Quantidade",
    "Valor",
    "Origem",
    "Observacoes",
  ].join(";");

  const linhas = eventos.map((e) => {
    const unidade = rubricaUnidade(e.tipo);
    return [
      campo(empresa?.nome),
      campo(ref),
      campo(e.colaborador.matricula),
      campo(e.colaborador.cpf),
      campo(e.colaborador.nome),
      campo(e.colaborador.setor.nome),
      campo(rubricaLabel(e.tipo)),
      campo(e.tipo),
      campo(rubricaNatureza(e.tipo)),
      campo(unidade),
      campo(e.quantidade !== null ? String(e.quantidade).replace(".", ",") : ""),
      campo(e.valor !== null ? e.valor.toFixed(2).replace(".", ",") : ""),
      campo(e.origem),
      campo(e.observacoes),
    ].join(";");
  });

  await registrarAuditoria({
    empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: "CompetenciaFolha",
    entidadeId: competenciaId,
    resumo: `Exportação da folha da competência ${ref} baixada (${eventos.length} lançamento(s)).`,
  });

  // BOM para o Excel reconhecer UTF-8 e não quebrar acento.
  const corpo = "﻿" + [cabecalho, ...linhas].join("\r\n") + "\r\n";
  const nome = `folha-${(empresa?.nome ?? "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ref.replace("/", "-")}.csv`;

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
