// Caixa de documentos — token para o navegador subir o arquivo DIRETO ao
// Blob (a Vercel não aceita corpo de função acima de 4,5 MB; uma folha passa
// fácil disso). O token só sai para o caminho que o servidor reservou no passo
// "iniciar", para um registro do próprio usuário que ainda espera o arquivo.
//
// Sem onUploadCompleted: o aviso da Vercel não chega em localhost nem nos
// endereços de teste protegidos. Quem registra é o navegador, chamando
// "concluir" — que confere tudo de novo no servidor.
import { NextResponse, type NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { usuarioDaCaixa } from "@/lib/caixa-documentos/acesso";
import { MIMES_CAIXA, TAMANHO_MAXIMO_CAIXA } from "@/lib/caixa-documentos/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const acesso = await usuarioDaCaixa(empresaId);
  if (!acesso.ok) return acesso.resposta;

  const body = (await req.json()) as HandleUploadBody;
  try {
    const resposta = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const m = /^caixa\/([^/]+)\/([^/]+)\/([A-Za-z0-9._-]{1,120})$/.exec(pathname);
        if (!m || m[1] !== empresaId) throw new Error("Caminho de envio inválido.");
        const recebido = await prisma.documentoRecebido.findFirst({
          where: { id: m[2], empresaId, status: "AGUARDANDO_UPLOAD", criadoPorId: acesso.user.id },
          select: { id: true },
        });
        if (!recebido) throw new Error("Envio não encontrado.");
        return {
          allowedContentTypes: [...MIMES_CAIXA],
          maximumSizeInBytes: TAMANHO_MAXIMO_CAIXA,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao autorizar o envio." }, { status: 400 });
  }
}
