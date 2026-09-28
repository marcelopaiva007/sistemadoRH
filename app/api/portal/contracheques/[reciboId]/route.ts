// O contracheque da própria pessoa, aberto pelo portal para conferir antes de
// confirmar o recebimento. Abrir aqui é o que libera a confirmação com foto
// (lib/contracheques/confirmar.ts) — por isso ele sai por esta rota, e não pela
// de arquivos do portal: é ela que marca "abriu em".
import { NextResponse, type NextRequest } from "next/server";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { abrirContracheque } from "@/lib/contracheques/confirmar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ reciboId: string }> }) {
  const { reciboId } = await params;
  const sessao = await lerSessaoPortal();
  if (!sessao) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!sessao.verificado) return NextResponse.json({ error: "Confirme seu CPF no portal." }, { status: 403 });

  const aberto = await abrirContracheque(reciboId, sessao.colaboradorId);
  if (!aberto) {
    return new NextResponse("Contracheque não encontrado — fale com o RH.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(Buffer.from(aberto.bytes), {
    headers: {
      "Content-Type": aberto.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(aberto.nome)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
