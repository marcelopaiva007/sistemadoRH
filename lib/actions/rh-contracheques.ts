"use server";

// Envio de contracheques — o que o RH faz: mandar o aviso dos contracheques
// de uma competência (ou reenviar a uma pessoa). O aviso e o registro vivem
// em lib/contracheques/envio.ts.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, podeOperarEmpresaRH, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { enviarContracheques } from "@/lib/contracheques/envio";
import { competenciaDoTexto, rotuloDoContracheque } from "@/lib/contracheques/situacao";

/** Teto por clique: cada aviso é uma chamada ao Telegram ou ao SMTP. */
const MAXIMO_POR_ENVIO = 400;

export type ResultadoEnvio =
  | { ok: true; avisados: number; semCanal: number; jaConfirmados: number }
  | { ok: false; error: string };

/**
 * Manda o aviso dos contracheques escolhidos. A tela passa os ids que ela
 * mostra; aqui cada um é conferido de novo: contracheque, da competência, de
 * CNPJ que a pessoa enxerga E opera (o escopo multi-empresa não confia na
 * tela). O recibo nasce com o CNPJ da ficha, nunca o do caminho.
 */
export async function enviarContrachequesAction(
  empresaId: string,
  competenciaTexto: string,
  documentoIds: string[],
): Promise<ResultadoEnvio> {
  const user = await requireEmpresaAccess(empresaId);
  const competencia = competenciaDoTexto(competenciaTexto);
  if (!competencia) return { ok: false, error: "Competência inválida." };
  const ids = [...new Set(documentoIds)].slice(0, MAXIMO_POR_ENVIO);
  if (ids.length === 0) return { ok: false, error: "Nenhum contracheque para enviar." };

  const visiveis = await empresasVisiveis(user);
  const docs = await prisma.documentoColaborador.findMany({
    where: {
      id: { in: ids },
      tipo: "CONTRACHEQUE",
      competencia,
      arquivoId: { not: null },
      empresaId: { in: visiveis },
      colaborador: { empresa: { ativo: true } },
    },
    select: { id: true, empresaId: true },
  });
  const empresas = [...new Set(docs.map((d) => d.empresaId))];
  for (const e of empresas) {
    if (!(await podeOperarEmpresaRH(user, e))) return { ok: false, error: "Sem permissão para enviar contracheques desta empresa." };
  }
  if (docs.length === 0) return { ok: false, error: "Nenhum contracheque desta competência encontrado." };

  const r = await enviarContracheques(
    docs.map((d) => d.id),
    { nome: user.name ?? null },
  );
  for (const e of empresas) {
    const daEmpresa = docs.filter((d) => d.empresaId === e).length;
    await registrarAuditoria({
      empresaId: e,
      acao: "ENVIAR_CONVITE",
      entidade: "ReciboContracheque",
      entidadeId: null,
      resumo: `Aviso de contracheque de ${rotuloDoContracheque(competencia, "MENSAL")} enviado a ${daEmpresa} pessoa(s).`,
    });
  }
  revalidatePath(`/rh/${empresaId}/contracheques`);
  return { ok: true, ...r };
}
