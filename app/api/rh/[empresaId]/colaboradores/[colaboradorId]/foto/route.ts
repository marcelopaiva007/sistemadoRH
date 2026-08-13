// Foto de referência do colaborador — o rosto contra o qual o RH compara a
// selfie de cada batida de ponto.
//
// Mesmo caminho da foto da batida e dos documentos: Blob privado (a URL não
// abre sozinha), sessão validada, escopo de empresa conferido e visualização
// registrada na auditoria. Rosto é dado pessoal; não sai por URL solta.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { baixarDoBlob } from "@/lib/blob";
import { registrarAuditoria } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; colaboradorId: string }> },
) {
  const { empresaId, colaboradorId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { fotoUrl: true, nome: true },
  });
  if (!colaborador) {
    return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  }
  if (!colaborador.fotoUrl) {
    return NextResponse.json({ error: "Sem foto de referência." }, { status: 404 });
  }

  await registrarAuditoria({
    empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: "Colaborador",
    entidadeId: colaboradorId,
    resumo: `Foto de referência de ${colaborador.nome} visualizada.`,
  });

  const resultado = await baixarDoBlob(colaborador.fotoUrl);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  // O tipo vem da extensão gravada — a selfie promovida a referência pode ser
  // png (fallback do navegador), e rotular png como jpeg faz o navegador
  // adivinhar. Mesma regra da rota da foto de batida.
  const ehPng = /\.png(\?|$)/i.test(colaborador.fotoUrl);

  return new NextResponse(resultado.bytes, {
    headers: {
      "Content-Type": ehPng ? "image/png" : "image/jpeg",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
