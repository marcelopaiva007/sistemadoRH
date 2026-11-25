import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { baixarDoBlob } from "@/lib/blob";
import { verificarAssinaturaSessao } from "@/lib/contracheques/token-auth";

export const runtime = "nodejs";

// Download do comprovante assinado (contracheque + folha de evidências: CPF,
// selfie, IP, localização).
//
// 25/11/2026: antes bastava o token do link — quem tivesse o e-mail (ou o link
// encaminhado) baixava o dossiê, e com cache de 1h. Agora exige a mesma sessão
// de CPF que a rota do PDF do contracheque (/api/assinar/<token>/pdf). Sem
// sessão, em vez de um erro seco, manda para /assinar/<token>: é por lá que o
// colaborador que chega pelo link do e-mail confirma o CPF e baixa.
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ token: string }> }
) {
  const { token } = await props.params;
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(`cc_auth_${token}`)?.value;

  if (!verificarAssinaturaSessao(token, cookieVal)) {
    return NextResponse.redirect(new URL(`/assinar/${encodeURIComponent(token)}`, req.url), 303);
  }

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
      "Cache-Control": "private, no-store",
    },
  });
}
