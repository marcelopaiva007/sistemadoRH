import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ehMaster } from "@/lib/grupo";
import { prisma } from "@/lib/prisma";
import {
  intervaloBrasiliaParaDate,
  montarCsvLogsEmail,
  formatarDataHoraBrasilia,
} from "@/lib/email";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

function hojeBrasiliaYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function subtrairDiasYmd(ymd: string, dias: number): string {
  const [ano, mes, dia] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia - dias, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !ehMaster(session.user)) {
    return NextResponse.json({ error: "Acesso restrito ao Administrador Geral (MASTER)." }, { status: 403 });
  }

  const url = new URL(req.url);
  const hoje = hojeBrasiliaYmd();
  const inicioParam = url.searchParams.get("inicio") || subtrairDiasYmd(hoje, 1);
  const fimParam = url.searchParams.get("fim") || hoje;
  const statusParam = url.searchParams.get("status") || undefined;
  const origemParam = url.searchParams.get("origem") || undefined;
  const marcaParam = url.searchParams.get("marca") || undefined;
  const qParam = url.searchParams.get("q")?.trim() || undefined;

  const [dataInicio, dataFimExclusivo] = intervaloBrasiliaParaDate(inicioParam, fimParam);

  const where: Prisma.EmailEnviadoWhereInput = {
    enviadoEm: {
      gte: dataInicio,
      lt: dataFimExclusivo,
    },
    ...(statusParam ? { status: statusParam } : {}),
    ...(origemParam ? { origem: origemParam } : {}),
    ...(marcaParam ? { marcaNome: { contains: marcaParam, mode: "insensitive" } } : {}),
    ...(qParam
      ? {
          OR: [
            { para: { contains: qParam, mode: "insensitive" } },
            { assunto: { contains: qParam, mode: "insensitive" } },
            { erro: { contains: qParam, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const logs = await prisma.emailEnviado.findMany({
    where,
    orderBy: { enviadoEm: "desc" },
    take: 5000,
  });

  const linhas = logs.map((log) => ({
    dataHoraBrasilia: formatarDataHoraBrasilia(log.enviadoEm),
    destinatario: log.para,
    origem: log.origem ?? "OUTRO",
    assunto: log.assunto,
    marca: log.marcaNome ?? "",
    empresa: log.empresaId ?? "",
    status: log.status ?? (log.ok ? "ENVIADO" : "FALHOU"),
    erro: log.erro ?? "",
  }));

  const csv = montarCsvLogsEmail(linhas);
  const nomeArquivo = `logs-smtp-${inicioParam}-a-${fimParam}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
