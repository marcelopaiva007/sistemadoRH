// Caixa de documentos — envio SEM Blob (armazenamento não configurado): o
// arquivo vem no corpo, até 4 MB (teto de corpo da Vercel), e fica no banco.
// Com Blob ligado, esta rota recusa: o caminho é upload direto + "concluir".
import { NextResponse, type NextRequest } from "next/server";
import { blobConfigurado } from "@/lib/blob";
import { TAMANHO_MAXIMO_ANEXO } from "@/lib/constants-dp";
import { recebidoDaRota } from "@/lib/caixa-documentos/acesso";
import { registrarConteudo } from "@/lib/caixa-documentos/registrar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; recebidoId: string }> },
) {
  const { empresaId, recebidoId } = await params;
  const acesso = await recebidoDaRota(empresaId, recebidoId);
  if (!acesso.ok) return acesso.resposta;
  const { user, recebido } = acesso;
  if (blobConfigurado()) return NextResponse.json({ error: "Use o envio direto ao armazenamento." }, { status: 400 });
  if (recebido.status !== "AGUARDANDO_UPLOAD" || recebido.criadoPorId !== user.id) {
    return NextResponse.json({ error: "Este envio já foi registrado." }, { status: 409 });
  }

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: "Arquivo não recebido." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO_ANEXO) {
    return NextResponse.json({ error: "Sem o armazenamento de arquivos ligado, o limite é 4 MB por arquivo." }, { status: 400 });
  }

  const registro = await registrarConteudo({
    recebidoId,
    empresaId,
    bytes: new Uint8Array(await arquivo.arrayBuffer()),
    mimeType: arquivo.type,
    blobUrl: null,
    usuario: { id: user.id, nome: user.name ?? null },
  });
  return NextResponse.json(registro, { status: registro.ok ? 200 : 400 });
}
