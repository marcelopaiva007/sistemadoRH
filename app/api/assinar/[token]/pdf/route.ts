import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verificarAssinaturaSessao } from "@/lib/contracheques/token-auth";
import { baixarDoBlob } from "@/lib/blob";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(`cc_auth_${token}`)?.value;

  if (!verificarAssinaturaSessao(token, cookieVal)) {
    return NextResponse.json({ error: "Não autorizado. Valide seu código 2FA primeiro." }, { status: 401 });
  }

  const recibo = await prisma.reciboContracheque.findUnique({
    where: { tokenAssinatura: token },
    select: {
      id: true,
      vistoEm: true,
      documento: {
        select: {
          arquivo: { select: { blobUrl: true, conteudo: true, mimeType: true, nome: true } },
        },
      },
    },
  });

  const arquivo = recibo?.documento.arquivo;
  if (!recibo || !arquivo) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  // Marca visualização na primeira abertura
  if (!recibo.vistoEm) {
    await prisma.reciboContracheque.update({
      where: { id: recibo.id },
      data: { vistoEm: new Date() },
    });
  }

  let bytes: Uint8Array | null = null;
  if (arquivo.blobUrl) {
    const lido = await baixarDoBlob(arquivo.blobUrl);
    if (lido.ok) bytes = new Uint8Array(lido.bytes);
  } else if (arquivo.conteudo) {
    bytes = new Uint8Array(arquivo.conteudo);
  }

  if (!bytes) {
    return NextResponse.json({ error: "Falha ao ler bytes do documento." }, { status: 500 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": arquivo.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename="${arquivo.nome || "contracheque.pdf"}"`,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
