// Download de anexo do módulo Processos & Ativos (documento de veículo).
//
// Irmã de /api/rh/[empresaId]/arquivos/[arquivoId]: mesma mecânica de servir
// (blob privado OU bytes no Postgres), mesma auditoria. O que muda é o portão —
// aqui entra quem alcança a empresa E tem o sistema `processos` no perfil.
//
// Rota separada, e não um `if` na rota do RH, de propósito: um perfil "só RH"
// não pode baixar a apólice da frota, e um perfil "só Processos" não pode
// baixar o RG de um colaborador. Cada rota responde por um módulo.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
import { prisma } from "@/lib/prisma";
import { baixarDoBlob } from "@/lib/blob";
import { registrarAuditoria } from "@/lib/audit";
import { formatarPlaca, rotulo, TIPOS_DOCUMENTO_VEICULO } from "@/lib/processos/ctb";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; arquivoId: string }> },
) {
  const { empresaId, arquivoId } = await params;

  // Numa rota de API devolvemos 401/403 explícitos (redirect() é para páginas).
  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // O alcance à empresa NÃO é reimplementado aqui — ver o comentário longo em
  // lib/processos-auth-guard.ts: foi escrever essa regra à mão que deixou nove
  // rotas com cinco variantes, duas esquecendo a DIRETORIA.
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }
  const sistemas = await sistemasPermitidos(user);
  if (!sistemas.includes("processos")) {
    return NextResponse.json({ error: "Sem acesso ao módulo Processos & Ativos." }, { status: 403 });
  }

  // `documentoVeiculo` no select é o que amarra o arquivo a ESTE módulo: um
  // arquivo do dossiê de colaborador não tem essa relação e sai daqui como 404,
  // mesmo para quem alcança a empresa.
  const arquivo = await prisma.arquivo.findFirst({
    where: { id: arquivoId, empresaId },
    select: {
      nome: true,
      mimeType: true,
      conteudo: true,
      blobUrl: true,
      documentoVeiculo: {
        select: { id: true, tipo: true, veiculo: { select: { placa: true } } },
      },
    },
  });
  if (!arquivo || !arquivo.documentoVeiculo) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const doc = arquivo.documentoVeiculo;
  await registrarAuditoria({
    empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: "DocumentoVeiculo",
    entidadeId: doc.id,
    resumo: `Anexo "${arquivo.nome}" (${rotulo(TIPOS_DOCUMENTO_VEICULO, doc.tipo)} do veículo ${formatarPlaca(doc.veiculo.placa)}) baixado.`,
  });

  // `inline` para o PDF/foto abrir na aba; o nome vai por filename* (RFC 5987)
  // porque nome de arquivo aqui vem com acento.
  const nomeCodificado = encodeURIComponent(arquivo.nome);
  const visualizar = req.nextUrl.searchParams.get("download") !== "1";
  const headers = {
    "Content-Type": arquivo.mimeType,
    "Content-Disposition": `${visualizar ? "inline" : "attachment"}; filename*=UTF-8''${nomeCodificado}`,
    "Cache-Control": "private, no-store",
  };

  // Dois modos de armazenamento convivem (o store do Blob é PRIVADO: a URL não
  // abre sozinha, então buscamos os bytes aqui — um redirect entregaria o
  // arquivo sem passar pelo guarda).
  if (arquivo.blobUrl) {
    const doBlob = await baixarDoBlob(arquivo.blobUrl);
    if (!doBlob.ok) {
      return new NextResponse(
        `O anexo "${arquivo.nome}" não está mais no armazenamento de arquivos — a linha ficou, o ` +
          `conteúdo se perdeu. Não há como recuperar: anexe o arquivo de novo pelo botão "Documento" do veículo.`,
        { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    return new NextResponse(doBlob.bytes, { headers });
  }
  if (!arquivo.conteudo) {
    return new NextResponse("Arquivo indisponível.", { status: 404 });
  }
  return new NextResponse(new Uint8Array(arquivo.conteudo), { headers });
}
