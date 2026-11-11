import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ehMaster } from "@/lib/grupo";
import { prisma } from "@/lib/prisma";
import {
  montarCsvLogsEmail,
  formatarDataHoraBrasilia,
  montarFiltroLogsEmail,
} from "@/lib/email";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !ehMaster(session.user)) {
    return NextResponse.json({ error: "Acesso restrito ao Administrador Geral (MASTER)." }, { status: 403 });
  }

  const url = new URL(req.url);
  const inicioParam = url.searchParams.get("inicio");
  const fimParam = url.searchParams.get("fim");
  const statusParam = url.searchParams.get("status");
  const origemParam = url.searchParams.get("origem");
  const marcaParam = url.searchParams.get("marca");
  const qParam = url.searchParams.get("q");

  const { where, inicioYmd, fimYmd } = montarFiltroLogsEmail({
    inicio: inicioParam,
    fim: fimParam,
    status: statusParam,
    origem: origemParam,
    marca: marcaParam,
    q: qParam,
  });

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
  const nomeArquivo = `logs-smtp-${inicioYmd}-a-${fimYmd}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
