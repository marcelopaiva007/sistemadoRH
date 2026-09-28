// Caixa de documentos — passo 3 do envio (com Blob): o navegador avisa que
// subiu. O servidor NÃO usa nada do que o navegador diz sobre o arquivo além
// do caminho: confere que o caminho é o reservado para este registro, pergunta
// ao Blob o tamanho e o tipo, baixa, confere a assinatura e calcula o hash.
import { NextResponse, type NextRequest } from "next/server";
import { head } from "@vercel/blob";
import { baixarDoBlob, removerDoBlob } from "@/lib/blob";
import { recebidoDaRota } from "@/lib/caixa-documentos/acesso";
import { registrarConteudo } from "@/lib/caixa-documentos/registrar";
import { MIMES_CAIXA, TAMANHO_MAXIMO_CAIXA } from "@/lib/caixa-documentos/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; recebidoId: string }> },
) {
  const { empresaId, recebidoId } = await params;
  const acesso = await recebidoDaRota(empresaId, recebidoId);
  if (!acesso.ok) return acesso.resposta;
  const { user, recebido } = acesso;
  if (recebido.status !== "AGUARDANDO_UPLOAD" || recebido.criadoPorId !== user.id) {
    return NextResponse.json({ error: "Este envio já foi registrado." }, { status: 409 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { pathname?: unknown };
  const pathname = typeof corpo.pathname === "string" ? corpo.pathname : "";
  if (!pathname.startsWith(`caixa/${empresaId}/${recebidoId}/`)) {
    return NextResponse.json({ error: "Caminho de envio inválido." }, { status: 400 });
  }

  let info;
  try {
    info = await head(pathname);
  } catch {
    return NextResponse.json({ error: "O arquivo não chegou ao armazenamento — envie de novo." }, { status: 400 });
  }
  const tipo = info.contentType.split(";")[0].trim();
  if (info.size > TAMANHO_MAXIMO_CAIXA || !(MIMES_CAIXA as readonly string[]).includes(tipo)) {
    await removerDoBlob(info.url);
    return NextResponse.json({ error: "Arquivo grande demais ou de formato não aceito." }, { status: 400 });
  }
  const lido = await baixarDoBlob(info.url);
  if (!lido.ok) return NextResponse.json({ error: lido.error }, { status: 502 });

  const registro = await registrarConteudo({
    recebidoId,
    empresaId,
    bytes: new Uint8Array(lido.bytes),
    mimeType: tipo,
    blobUrl: info.url,
    usuario: { id: user.id, nome: user.name ?? null },
  });
  return NextResponse.json(registro, { status: registro.ok ? 200 : 400 });
}
