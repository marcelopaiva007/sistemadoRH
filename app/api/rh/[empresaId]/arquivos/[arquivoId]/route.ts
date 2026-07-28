// Download de anexo do RH (dossiê digital e atestados).
//
// O conteúdo fica no Postgres (rh."Arquivo"), não num blob público: documento
// pessoal só sai daqui por uma requisição autenticada e escopada à empresa — e
// cada download entra na trilha de auditoria.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; arquivoId: string }> },
) {
  const { empresaId, arquivoId } = await params;

  // Numa rota de API devolvemos 401/403 explícitos (redirect() é para páginas).
  // Mesma regra do requireEmpresaAccess: ADMIN acessa qualquer empresa,
  // RH_MANAGER só a própria.
  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" || (user.role === "RH_MANAGER" && user.empresaId === empresaId);
  if (!autorizado) return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });

  const arquivo = await prisma.arquivo.findFirst({
    where: { id: arquivoId, empresaId },
    select: {
      nome: true,
      mimeType: true,
      conteudo: true,
      blobUrl: true,
      documento: { select: { id: true, tipo: true, colaborador: { select: { nome: true } } } },
      ausencia: { select: { id: true, tipo: true, colaborador: { select: { nome: true } } } },
    },
  });
  if (!arquivo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const dono = arquivo.documento?.colaborador.nome ?? arquivo.ausencia?.colaborador.nome ?? "—";
  await registrarAuditoria({
    empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: arquivo.documento ? "DocumentoColaborador" : "Ausencia",
    entidadeId: arquivo.documento?.id ?? arquivo.ausencia?.id ?? null,
    resumo: `Anexo "${arquivo.nome}" de ${dono} baixado.`,
  });

  // `inline` para o PDF/foto abrir na aba; o nome só entra no header via
  // filename* (RFC 5987) porque nome de arquivo aqui vem com acento.
  const nomeCodificado = encodeURIComponent(arquivo.nome);
  const visualizar = req.nextUrl.searchParams.get("download") !== "1";

  // Dois modos de armazenamento convivem: o que veio pelo portal está no Vercel
  // Blob, o que o RH anexou antes continua na coluna Bytes. A auditoria acima
  // roda nos dois casos — é ela que registra quem baixou o quê.
  if (arquivo.blobUrl) return NextResponse.redirect(arquivo.blobUrl);
  if (!arquivo.conteudo) {
    return new NextResponse("Arquivo indisponível.", { status: 404 });
  }

  return new NextResponse(new Uint8Array(arquivo.conteudo), {
    headers: {
      "Content-Type": arquivo.mimeType,
      "Content-Disposition": `${visualizar ? "inline" : "attachment"}; filename*=UTF-8''${nomeCodificado}`,
      "Cache-Control": "private, no-store",
    },
  });
}
