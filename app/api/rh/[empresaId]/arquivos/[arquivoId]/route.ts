// Download de anexo do RH (dossiê digital e atestados).
//
// O conteúdo fica no Postgres (rh."Arquivo"), não num blob público: documento
// pessoal só sai daqui por uma requisição autenticada e escopada à empresa — e
// cada download entra na trilha de auditoria.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { baixarDoBlob } from "@/lib/blob";
import { registrarAuditoria } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; arquivoId: string }> },
) {
  const { empresaId, arquivoId } = await params;

  // Numa rota de API devolvemos 401/403 explícitos (redirect() é para páginas).
  // Mesma regra do requireEmpresaAccess: ADMIN acessa qualquer empresa;
  // demais papéis precisam ter UserEmpresa ativo apontando para esta empresa.
  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Uma linha, uma regra: `usuarioAlcancaEmpresa` de lib/rh-auth-guard.ts, a
  // MESMA que decide o acesso às páginas. Aqui havia uma checagem escrita à
  // mão — cinco variantes diferentes conviviam em nove rotas, e duas delas
  // esqueciam DIRETORIA, cujo pivô `UserEmpresa` é vazio por desenho.
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

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
  //
  // O store do Blob é privado: a URL não abre sozinha, então buscamos os bytes
  // aqui e servimos por esta rota. É o comportamento certo para documento
  // pessoal — um redirect entregaria o arquivo sem passar pelo guarda.
  if (arquivo.blobUrl) {
    const doBlob = await baixarDoBlob(arquivo.blobUrl);
    // Registro sem conteúdo: a linha existe no banco, o arquivo não existe
    // mais no armazenamento. Aconteceu de verdade em 11–12/08/2026 — o store
    // foi esvaziado e reconectado, e os anexos enviados antes disso ficaram
    // órfãos. Quem abre precisa saber O QUE FAZER, não só que "deu 404":
    // devolver o documento pela fila avisa o colaborador para reenviar.
    if (!doBlob.ok) {
      return new NextResponse(
        `O anexo "${arquivo.nome}" não está mais no armazenamento de arquivos — a linha ficou, o conteúdo se perdeu ` +
          `(isso atingiu documentos enviados antes de 12/08/2026, quando o armazenamento foi esvaziado e religado). ` +
          `Não há como recuperar este arquivo: use "Devolver" na Central de Aprovações para o colaborador ser avisado e reenviar.`,
        { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    return new NextResponse(doBlob.bytes, {
      headers: {
        "Content-Type": arquivo.mimeType,
        "Content-Disposition": `${visualizar ? "inline" : "attachment"}; filename*=UTF-8''${nomeCodificado}`,
        "Cache-Control": "private, no-store",
      },
    });
  }
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
