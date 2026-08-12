import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";

export async function GET() {
  const sessao = await lerSessaoPortal();
  if (!sessao?.verificado) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pontos = await prisma.ponto.findMany({
    where: { colaboradorId: sessao.colaboradorId },
    orderBy: { dataHora: "desc" },
    take: 30,
  });

  return NextResponse.json(pontos);
}
