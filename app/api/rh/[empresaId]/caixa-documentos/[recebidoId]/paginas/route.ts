// Caixa de documentos — as páginas de UM documento, para o RH conferir. Nunca
// o arquivo inteiro: numa folha de 200 contracheques, quem confere a Ana vê só
// a página da Ana. Serve do intervalo lido pela IA, ou de outro intervalo
// escolhido na conferência (?de=&ate=) — até JANELA_PAGINAS antes ou depois,
// o bastante para acertar onde o documento começa ou termina. Só de item
// ainda na conferência: descartado (ou de empresa que quem enviou não acessa)
// não se abre.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { recebidoDaRota } from "@/lib/caixa-documentos/acesso";
import { bytesDoArquivo } from "@/lib/caixa-documentos/processar";
import { recortarPdf } from "@/lib/caixa-documentos/pdf";
import { JANELA_PAGINAS } from "@/lib/caixa-documentos/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; recebidoId: string }> },
) {
  const { empresaId, recebidoId } = await params;
  const acesso = await recebidoDaRota(empresaId, recebidoId);
  if (!acesso.ok) return acesso.resposta;
  const { recebido } = acesso;

  const itemId = req.nextUrl.searchParams.get("item") ?? "";
  const item = await prisma.itemDocumentoRecebido.findFirst({
    where: { id: itemId, recebidoId, status: "CONFERIR" },
    select: { id: true, paginaInicio: true, paginaFim: true, nomeLido: true },
  });
  if (!item) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const arquivo = recebido.arquivoId
    ? await prisma.arquivo.findUnique({ where: { id: recebido.arquivoId }, select: { blobUrl: true, conteudo: true } })
    : null;
  const bytes = arquivo ? await bytesDoArquivo(arquivo) : null;
  if (!bytes) {
    return new NextResponse("O arquivo original não está mais guardado.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const total = recebido.paginas ?? 1;
  const menor = Math.max(1, item.paginaInicio - JANELA_PAGINAS);
  const maior = Math.min(total, item.paginaFim + JANELA_PAGINAS);
  const num = (v: string | null, padrao: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= menor && n <= maior ? n : padrao;
  };
  const de = num(req.nextUrl.searchParams.get("de"), item.paginaInicio);
  const ate = Math.max(de, num(req.nextUrl.searchParams.get("ate"), item.paginaFim));

  const ehPdf = recebido.mimeType === "application/pdf";
  const corpo = ehPdf ? await recortarPdf(bytes, de, ate) : bytes;

  await registrarAuditoria({
    empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: "ItemDocumentoRecebido",
    entidadeId: item.id,
    resumo: `Páginas ${de}${ate !== de ? `–${ate}` : ""} de "${recebido.nome}" abertas na conferência da Caixa de documentos.`,
  });

  return new NextResponse(Buffer.from(corpo), {
    headers: {
      "Content-Type": ehPdf ? "application/pdf" : recebido.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`paginas-${de}-${ate}.${ehPdf ? "pdf" : "img"}`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
