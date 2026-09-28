// Caixa de documentos — registrar um arquivo que acabou de subir.
//
// Só servidor. Nada aqui confia no navegador: tamanho e tipo vêm do próprio
// arquivo (bytes e assinatura), o hash é calculado aqui, e o PDF protegido por
// senha é recusado antes de gastar uma chamada à IA.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { assinaturaConfere } from "@/lib/anexos";
import { removerDoBlob } from "@/lib/blob";
import { formatarData } from "@/lib/datas";
import { contarPaginas } from "./pdf";
import { MIMES_CAIXA } from "./tipos";

export type Registro =
  | { ok: true; paginas: number }
  | { ok: false; error: string; duplicadoDe?: { id: string; nome: string; enviadoEm: string } };

export async function registrarConteudo(params: {
  recebidoId: string;
  empresaId: string;
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
  blobUrl: string | null;
  usuario: { id: string; nome: string | null };
}): Promise<Registro> {
  const { recebidoId, empresaId, bytes, mimeType, blobUrl } = params;
  // Recusado, o envio some: o registro vazio é apagado (o aviso fica na tela
  // de quem enviou, em "Envios desta sessão") e o blob também — MENOS quando
  // este mesmo envio já foi registrado com ele. É "concluir" chamado duas vezes
  // para o mesmo envio: a segunda chamada é recusada, e apagar o blob ali
  // levaria embora o arquivo que a primeira acabou de registrar.
  const recusar = async (error: string, extra?: { duplicadoDe?: { id: string; nome: string; enviadoEm: string } }): Promise<Registro> => {
    const jaRegistrado = await prisma.documentoRecebido.findUnique({
      where: { id: recebidoId },
      select: { arquivo: { select: { blobUrl: true } } },
    });
    if (blobUrl && jaRegistrado?.arquivo?.blobUrl !== blobUrl) await removerDoBlob(blobUrl);
    await prisma.documentoRecebido.deleteMany({ where: { id: recebidoId, status: "AGUARDANDO_UPLOAD" } });
    return { ok: false as const, error, ...extra };
  };

  if (!(MIMES_CAIXA as readonly string[]).includes(mimeType) || !assinaturaConfere(bytes, mimeType)) {
    return recusar("O arquivo não é um PDF, JPG, PNG ou WEBP de verdade.");
  }

  let paginas = 1;
  if (mimeType === "application/pdf") {
    const leitura = await contarPaginas(bytes);
    if (!leitura.ok) return recusar(leitura.error);
    paginas = leitura.paginas;
  }

  const hash = createHash("sha256").update(bytes).digest("hex");
  // Mesmo arquivo já enviado neste CNPJ e ainda valendo: não lê (nem paga) de
  // novo. Descartado ou com erro não conta — aí reenviar é o jeito de repetir.
  // Só conta o arquivo que quem envia agora também enxerga (escopo dele
  // dentro do escopo deste envio): o de um escopo maior não pode nem ser
  // citado aqui — nome e data dele já diriam algo que esta pessoa não vê.
  const escopo = (await prisma.documentoRecebido.findUnique({ where: { id: recebidoId }, select: { empresasEscopo: true } }))?.empresasEscopo ?? [];
  const [anterior] = await prisma.$queryRaw<{ id: string; nome: string; createdAt: Date }[]>`
    SELECT id, nome, "createdAt" FROM rh."DocumentoRecebido"
    WHERE "empresaId" = ${empresaId} AND hash = ${hash} AND id <> ${recebidoId}
      AND status NOT IN ('DESCARTADO', 'ERRO', 'AGUARDANDO_UPLOAD')
      AND "empresasEscopo" <@ ${escopo}::text[]
    ORDER BY "createdAt" DESC LIMIT 1`;
  if (anterior) {
    return recusar(`Este arquivo já foi enviado em ${formatarData(anterior.createdAt)} ("${anterior.nome}").`, {
      duplicadoDe: { id: anterior.id, nome: anterior.nome, enviadoEm: formatarData(anterior.createdAt) },
    });
  }

  const recebido = await prisma.$transaction(async (tx) => {
    const arquivo = await tx.arquivo.create({
      data: {
        empresaId,
        nome: (await tx.documentoRecebido.findUniqueOrThrow({ where: { id: recebidoId }, select: { nome: true } })).nome,
        mimeType,
        tamanhoBytes: bytes.byteLength,
        ...(blobUrl ? { blobUrl } : { conteudo: bytes }),
        criadoPorId: params.usuario.id,
        criadoPorNome: params.usuario.nome,
      },
      select: { id: true },
    });
    const atualizado = await tx.documentoRecebido.updateMany({
      where: { id: recebidoId, status: "AGUARDANDO_UPLOAD" },
      data: { arquivoId: arquivo.id, hash, paginas, mimeType, tamanhoBytes: bytes.byteLength, status: "PENDENTE", erro: null },
    });
    if (atualizado.count !== 1) throw new Error("registro-duplicado");
    return tx.documentoRecebido.findUniqueOrThrow({ where: { id: recebidoId }, select: { nome: true } });
  }).catch(() => null);

  if (!recebido) return recusar("Este envio já tinha sido registrado.");

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "DocumentoRecebido",
    entidadeId: recebidoId,
    resumo: `Arquivo enviado à Caixa de documentos: "${recebido.nome}" (${paginas} página(s)).`,
    detalhes: { paginas, tamanhoBytes: bytes.byteLength, armazenamento: blobUrl ? "blob" : "banco" },
  });
  return { ok: true, paginas };
}
