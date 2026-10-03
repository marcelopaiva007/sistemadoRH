// Caixa de documentos — passo 1 do envio: o SERVIDOR cria o registro e diz
// em que caminho o navegador pode subir o arquivo. Sem isto, o navegador
// escolheria o caminho (e poderia registrar o arquivo de outra pessoa).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { blobConfigurado } from "@/lib/blob";
import { TAMANHO_MAXIMO_ANEXO } from "@/lib/constants-dp";
import { escopoParaCongelar, usuarioDaCaixa } from "@/lib/caixa-documentos/acesso";
import { MIMES_CAIXA, TAMANHO_MAXIMO_CAIXA } from "@/lib/caixa-documentos/tipos";
import { prefixoDoEnvio } from "@/lib/caixa-documentos/processar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return limpo || "arquivo";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const acesso = await usuarioDaCaixa(empresaId);
  if (!acesso.ok) return acesso.resposta;

  const corpo = (await req.json().catch(() => ({}))) as { nome?: unknown; tamanho?: unknown; mimeType?: unknown };
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim().slice(0, 200) : "";
  const tamanho = typeof corpo.tamanho === "number" ? corpo.tamanho : 0;
  const mimeType = typeof corpo.mimeType === "string" ? corpo.mimeType : "";
  if (!nome) return NextResponse.json({ error: "Arquivo sem nome." }, { status: 400 });

  if (/\.zip$/i.test(nome) || mimeType.includes("zip")) {
    return NextResponse.json({ error: "Abra o .zip e solte os PDFs de dentro." }, { status: 400 });
  }
  if (!(MIMES_CAIXA as readonly string[]).includes(mimeType)) {
    return NextResponse.json({ error: "Formato não aceito. Envie PDF, JPG, PNG ou WEBP." }, { status: 400 });
  }
  const comBlob = blobConfigurado();
  const teto = comBlob ? TAMANHO_MAXIMO_CAIXA : TAMANHO_MAXIMO_ANEXO;
  if (tamanho <= 0 || tamanho > teto) {
    return NextResponse.json(
      { error: `O arquivo passa de ${Math.round(teto / 1024 / 1024)} MB. Divida o PDF em partes menores.` },
      { status: 400 },
    );
  }

  const recebido = await prisma.documentoRecebido.create({
    data: {
      empresaId,
      empresasEscopo: await escopoParaCongelar(acesso.user),
      nome,
      mimeType,
      tamanhoBytes: tamanho,
      hash: "",
      status: "AGUARDANDO_UPLOAD",
      criadoPorId: acesso.user.id,
      criadoPorNome: acesso.user.name ?? null,
    },
    select: { id: true },
  });

  return NextResponse.json({
    id: recebido.id,
    modo: comBlob ? "blob" : "direto",
    pathname: `${prefixoDoEnvio(empresaId, recebido.id)}${nomeSeguro(nome)}`,
  });
}
