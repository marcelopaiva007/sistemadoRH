"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { escopoDosInformativos } from "@/lib/informativos-escopo";
import { dispararInformativo } from "@/lib/informativos";
import { MAXIMO_MENSAGEM, MAXIMO_TITULO, MODOS_PUBLICO, type ModoPublico } from "@/lib/constants-informativos";

// Teto de destinatários por envio. A maior marca do grupo cabe com folga; o
// teto existe para um envio nunca estourar o maxDuration da tela no meio e
// deixar metade do público sem registro.
const MAXIMO_DESTINATARIOS = 2000;

export type ResultadoEnvioInformativo =
  | { ok: true; enviado?: { total: number; avisados: number; semCanal: number; falhas: number } }
  | { ok: false; error: string };

export async function enviarInformativo(
  _prev: ResultadoEnvioInformativo,
  formData: FormData,
): Promise<ResultadoEnvioInformativo> {
  const empresaId = String(formData.get("empresaId") ?? "");
  const usuario = await requireEmpresaAccess(empresaId);

  const titulo = String(formData.get("titulo") ?? "").trim().slice(0, MAXIMO_TITULO);
  const mensagem = String(formData.get("mensagem") ?? "").trim().slice(0, MAXIMO_MENSAGEM);
  const modo = String(formData.get("modo") ?? "") as ModoPublico;
  const ids = [...new Set(formData.getAll("ids").map(String).filter(Boolean))];
  if (!titulo) return { ok: false, error: "Escreva o título." };
  if (!mensagem) return { ok: false, error: "Escreva a mensagem." };
  if (!MODOS_PUBLICO.includes(modo)) return { ok: false, error: "Escolha para quem enviar." };
  if (modo !== "TODOS" && ids.length === 0) return { ok: false, error: "Escolha pelo menos um destinatário." };

  // O público é recalculado AQUI, dentro do escopo — nunca a lista que veio do
  // navegador. Id de outra marca ou de CNPJ que o usuário não vê é ignorado.
  const escopo = await escopoDosInformativos(usuario, empresaId);
  const filtro =
    modo === "TODOS"
      ? {}
      : modo === "EMPRESAS"
        ? { empresaId: { in: ids } }
        : modo === "SETORES"
          ? { setorId: { in: ids } }
          : { id: { in: ids } };
  const pessoas = await prisma.colaborador.findMany({
    where: { ativo: true, empresaId: { in: escopo }, ...filtro },
    select: { id: true, empresaId: true, nome: true },
  });
  if (pessoas.length === 0) return { ok: false, error: "Ninguém ativo no público escolhido." };
  if (pessoas.length > MAXIMO_DESTINATARIOS) {
    return {
      ok: false,
      error: `São ${pessoas.length} pessoas — o limite por envio é ${MAXIMO_DESTINATARIOS}. Divida por CNPJ ou setor.`,
    };
  }

  const publico = await descreverPublico(modo, ids, escopo, pessoas);
  const informativo = await prisma.informativo.create({
    data: {
      empresaId,
      titulo,
      mensagem,
      publico,
      enviadoPorId: usuario.id ?? null,
      enviadoPorNome: usuario.name ?? usuario.email ?? "RH",
      destinatarios: {
        createMany: { data: pessoas.map((p) => ({ colaboradorId: p.id, empresaId: p.empresaId })) },
      },
    },
    select: { id: true },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Informativo",
    entidadeId: informativo.id,
    resumo: `Informativo "${titulo}" enviado para ${publico} (${pessoas.length} pessoa(s)).`,
  });

  const r = await dispararInformativo(informativo.id);

  revalidatePath(`/rh/${empresaId}/informativos`);
  revalidatePath("/portal");
  return { ok: true, enviado: { total: pessoas.length, ...r } };
}

/** Reenvia para quem não foi alcançado (sem canal ou falha) — útil depois de vincular Telegram. */
export async function reenviarInformativo(
  empresaId: string,
  informativoId: string,
): Promise<ResultadoEnvioInformativo> {
  const usuario = await requireEmpresaAccess(empresaId);
  const escopo = await escopoDosInformativos(usuario, empresaId);
  const informativo = await prisma.informativo.findFirst({
    where: { id: informativoId, empresaId: { in: escopo } },
    select: { id: true, titulo: true },
  });
  if (!informativo) return { ok: false, error: "Informativo não encontrado." };

  // Volta para a fila só quem não tem canal e ainda não deu ciência —
  // quem já recebeu não recebe de novo.
  const { count } = await prisma.informativoDestinatario.updateMany({
    where: { informativoId: informativo.id, canal: null, cienteEm: null, empresaId: { in: escopo } },
    data: { enviadoEm: null, envioErro: null },
  });
  if (count === 0) return { ok: false, error: "Não há ninguém pendente de envio." };

  const r = await dispararInformativo(informativo.id);
  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Informativo",
    entidadeId: informativo.id,
    resumo: `Informativo "${informativo.titulo}" reenviado a ${count} pessoa(s) sem canal.`,
  });
  revalidatePath(`/rh/${empresaId}/informativos`);
  return { ok: true, enviado: { total: count, ...r } };
}

async function descreverPublico(
  modo: ModoPublico,
  ids: string[],
  escopo: string[],
  pessoas: { nome: string }[],
): Promise<string> {
  if (modo === "TODOS") {
    const empresa = await prisma.empresa.findFirst({
      where: { id: { in: escopo } },
      select: { marca: { select: { nome: true } } },
    });
    return `Todos — ${empresa?.marca.nome ?? "marca"}`;
  }
  if (modo === "EMPRESAS") {
    const empresas = await prisma.empresa.findMany({
      where: { id: { in: ids.filter((id) => escopo.includes(id)) } },
      select: { nome: true },
      orderBy: { nome: "asc" },
    });
    return empresas.map((e) => e.nome).join(", ");
  }
  if (modo === "SETORES") {
    const setores = await prisma.setor.findMany({
      where: { id: { in: ids }, empresaId: { in: escopo } },
      select: { nome: true },
      orderBy: { nome: "asc" },
    });
    return `Setor ${[...new Set(setores.map((s) => s.nome))].join(", ")}`;
  }
  return pessoas.length === 1 ? pessoas[0].nome : `${pessoas.length} pessoas escolhidas`;
}
