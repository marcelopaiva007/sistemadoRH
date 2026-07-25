// Download de documento pelo portal do colaborador.
//
// Rota separada da do RH (/api/rh/...) de propósito: aqui quem autoriza é a
// sessão do portal, e o arquivo precisa pertencer ao próprio colaborador —
// nunca a um colega. Como no lado do RH, cada download entra na auditoria.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { registrarAuditoria } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ arquivoId: string }> },
) {
  const { arquivoId } = await params;

  const sessao = await lerSessaoPortal();
  if (!sessao) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  // Sessão aberta mas CPF ainda não confirmado não baixa nada.
  if (!sessao.verificado) {
    return NextResponse.json({ error: "Confirme seu CPF no portal." }, { status: 403 });
  }

  // O `where` amarra o arquivo ao dono da sessão: um id de arquivo de outro
  // colaborador simplesmente não é encontrado.
  const arquivo = await prisma.arquivo.findFirst({
    where: {
      id: arquivoId,
      OR: [
        { documento: { colaboradorId: sessao.colaboradorId } },
        { ausencia: { colaboradorId: sessao.colaboradorId } },
      ],
    },
    select: {
      nome: true,
      mimeType: true,
      conteudo: true,
      empresaId: true,
      documento: { select: { id: true } },
      ausencia: { select: { id: true } },
    },
  });
  if (!arquivo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { nome: true },
  });
  await registrarAuditoria({
    empresaId: arquivo.empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: arquivo.documento ? "DocumentoColaborador" : "Ausencia",
    entidadeId: arquivo.documento?.id ?? arquivo.ausencia?.id ?? null,
    resumo: `Baixou o próprio anexo "${arquivo.nome}" pelo portal.`,
    ator: {
      id: sessao.colaboradorId,
      nome: colaborador?.nome ?? "Colaborador",
      papel: "COLABORADOR",
    },
  });

  const nomeCodificado = encodeURIComponent(arquivo.nome);
  const visualizar = req.nextUrl.searchParams.get("download") !== "1";
  return new NextResponse(new Uint8Array(arquivo.conteudo), {
    headers: {
      "Content-Type": arquivo.mimeType,
      "Content-Disposition": `${visualizar ? "inline" : "attachment"}; filename*=UTF-8''${nomeCodificado}`,
      "Cache-Control": "private, no-store",
    },
  });
}
