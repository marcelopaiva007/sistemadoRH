import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { baixarDoBlob } from "@/lib/blob";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ token: string }> }
) {
  const { token } = await props.params;
  const recibo = await prisma.reciboContracheque.findUnique({
    where: { tokenAssinatura: token },
    select: {
      id: true,
      confirmadoEm: true,
      comprovanteArquivo: { select: { blobUrl: true, conteudo: true, mimeType: true, nome: true } },
    },
  });

  const arquivo = recibo?.comprovanteArquivo;
  if (!recibo || !recibo.confirmadoEm || !arquivo) {
    return NextResponse.json({ error: "Comprovante não disponível ou documento ainda não assinado." }, { status: 404 });
  }

  let bytes: Uint8Array | null = null;
  if (arquivo.blobUrl) {
    const lido = await baixarDoBlob(arquivo.blobUrl);
    if (lido.ok) bytes = new Uint8Array(lido.bytes);
  } else if (arquivo.conteudo) {
    bytes = new Uint8Array(arquivo.conteudo);
  }

  if (!bytes) {
    return NextResponse.json({ error: "Falha ao ler bytes do comprovante." }, { status: 500 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": arquivo.mimeType || "application/pdf",
      "Content-Disposition": `attachment; filename="${arquivo.nome || "contracheque-assinado.pdf"}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
