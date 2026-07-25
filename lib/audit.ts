// Trilha de auditoria LGPD: quem mexeu (ou olhou) dado pessoal, quando e o quê.
//
// Append-only por convenção — nada no app atualiza ou apaga registros. O nome e
// o papel do usuário são gravados como snapshot porque o User vive em outro
// schema (`shared`) e pode ser excluído: a trilha precisa continuar legível.
//
// Auditar NUNCA pode derrubar a operação: falha aqui vira log no servidor, não
// exceção para o usuário.
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export type AcaoAuditoria =
  | "CRIAR"
  | "ATUALIZAR"
  | "EXCLUIR"
  | "APROVAR"
  | "REPROVAR"
  | "CANCELAR"
  | "BAIXAR_DOCUMENTO";

export async function registrarAuditoria(params: {
  empresaId?: string | null;
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId?: string | null;
  resumo: string;
  detalhes?: Record<string, unknown>;
}) {
  try {
    const session = await auth();
    const user = session?.user;
    await prisma.auditLog.create({
      data: {
        empresaId: params.empresaId ?? null,
        usuarioId: user?.id ?? null,
        usuarioNome: user?.name ?? null,
        usuarioRole: user?.role ?? null,
        acao: params.acao,
        entidade: params.entidade,
        entidadeId: params.entidadeId ?? null,
        resumo: params.resumo,
        detalhes: params.detalhes ? (params.detalhes as object) : undefined,
      },
    });
  } catch (e) {
    console.error("auditoria:", e);
  }
}

/**
 * Campos que mudaram entre dois objetos, para o `detalhes` da auditoria.
 * Valores sensíveis (dados bancários, salário) entram como marcador — a trilha
 * registra QUE mudou, não o conteúdo.
 */
const CAMPOS_SENSIVEIS = new Set([
  "salarioBase",
  "bancoAgencia",
  "bancoConta",
  "chavePix",
  "cpf",
  "rg",
  "pis",
]);

export function diffCampos(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): Record<string, { de: unknown; para: unknown }> {
  const mudancas: Record<string, { de: unknown; para: unknown }> = {};
  for (const campo of Object.keys(depois)) {
    const a = antes[campo] instanceof Date ? (antes[campo] as Date).toISOString() : antes[campo];
    const d = depois[campo] instanceof Date ? (depois[campo] as Date).toISOString() : depois[campo];
    if (a === d) continue;
    if ((a ?? null) === null && (d ?? null) === null) continue;
    mudancas[campo] = CAMPOS_SENSIVEIS.has(campo)
      ? { de: "(oculto)", para: "(alterado)" }
      : { de: a ?? null, para: d ?? null };
  }
  return mudancas;
}
