// Anexo de evidência no tratamento de ponto (PTRP) — OS de 23/11/2026.
//
// O pedido de ajuste chegava só com texto ("GPS inválido", "internet
// instável") e o RH decidia no escuro. Agora o colaborador (portal/app de
// ponto) e o RH (Novo Ajuste / Abono) podem juntar UM arquivo — print, foto,
// comprovante, declaração — ao tratamento.
//
// REGRAS QUE ESTE MÓDULO GARANTE:
// - O anexo é só evidência. Não toca em RegistroPonto nem em MarcacaoTratada:
//   as marcações originais seguem preservadas (Portaria MTP 671/2021).
// - Um arquivo por pedido, até 4 MB (TAMANHO_MAXIMO_ANEXO — limite de corpo da
//   Vercel), JPG/PNG/WEBP/HEIC/PDF, com a assinatura dos bytes conferida
//   (lib/anexos.ts). Campo opcional: sem arquivo, segue o fluxo de antes.
// - Armazenamento PRIVADO (Vercel Blob `access: "private"`): não há link
//   público. Quem serve é a rota do RH (só quem opera o RH da empresa) ou a do
//   portal (só o próprio colaborador), e cada download entra na auditoria.
//   Documento de saúde (exame, atestado) é dado sensível na LGPD — por isso.
// - Imutável: o arquivo é gravado junto com a CRIAÇÃO do tratamento e nenhuma
//   action troca ou apaga `TratamentoPonto.arquivoId` depois. Não há "editar
//   anexo" nem para pedido pendente — mandar outra prova é abrir outro pedido.
//
// Fora de "use server" de propósito: helper interno das actions, não endpoint.

import { prisma } from "@/lib/prisma";
import { lerAnexo } from "@/lib/anexos";
import { enviarParaBlob, removerDoBlob } from "@/lib/blob";

/** Nome do campo no FormData que as telas mandam. */
export const CAMPO_ANEXO_PONTO = "anexo";

export type AnexoPontoSalvo = { id: string; nome: string; tamanhoBytes: number };

/**
 * Lê, valida e guarda o anexo. Devolve `arquivo: null` quando não veio
 * arquivo (o campo é opcional). Chamar ANTES de criar o tratamento e passar o
 * id no `create` — assim o vínculo nasce junto e não existe janela em que o
 * pedido aparece sem a prova. Se a criação falhar depois, chame
 * `descartarAnexoPonto` para não deixar arquivo órfão.
 */
export async function guardarAnexoPonto(params: {
  formData: FormData | null | undefined;
  empresaId: string;
  colaboradorId: string;
  criadoPorId?: string | null;
  criadoPorNome: string;
}): Promise<{ ok: true; arquivo: AnexoPontoSalvo | null } | { ok: false; error: string }> {
  if (!params.formData) return { ok: true, arquivo: null };
  const leitura = await lerAnexo(params.formData, CAMPO_ANEXO_PONTO);
  if (!leitura.ok) return { ok: false, error: leitura.error };
  if (!leitura.anexo) return { ok: true, arquivo: null };

  const envio = await enviarParaBlob({
    empresaId: params.empresaId,
    colaboradorId: params.colaboradorId,
    nome: leitura.anexo.nome,
    mimeType: leitura.anexo.mimeType,
    bytes: leitura.anexo.bytes,
  });
  if (!envio.ok) return { ok: false, error: envio.error };

  const arquivo = await prisma.arquivo.create({
    data: {
      empresaId: params.empresaId,
      nome: leitura.anexo.nome,
      mimeType: leitura.anexo.mimeType,
      tamanhoBytes: leitura.anexo.bytes.byteLength,
      blobUrl: envio.url,
      criadoPorId: params.criadoPorId ?? null,
      criadoPorNome: params.criadoPorNome,
    },
    select: { id: true, nome: true, tamanhoBytes: true, blobUrl: true },
  });
  return { ok: true, arquivo: { id: arquivo.id, nome: arquivo.nome, tamanhoBytes: arquivo.tamanhoBytes } };
}

/** Desfaz `guardarAnexoPonto` quando o tratamento não chegou a ser criado. */
export async function descartarAnexoPonto(arquivoId: string): Promise<void> {
  try {
    const a = await prisma.arquivo.delete({ where: { id: arquivoId }, select: { blobUrl: true } });
    if (a.blobUrl) await removerDoBlob(a.blobUrl);
  } catch (e) {
    console.error("[ponto-anexo] falha ao descartar anexo órfão", arquivoId, e);
  }
}
