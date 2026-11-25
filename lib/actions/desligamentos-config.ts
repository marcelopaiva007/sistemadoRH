"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { direcaoRestrita, grupoDaEmpresa } from "@/lib/grupo";
import { registrarAuditoria } from "@/lib/audit";
import { validarConfiguracao } from "@/lib/desligamentos/painel";
import type { ActionResult } from "@/lib/constants";

/**
 * Grava a configuração da área Desligamentos do cliente: custo por
 * desligamento, meta e limite anuais.
 *
 * Quem pode: ADMIN ou DIRETORIA que enxerga o GRUPO INTEIRO. A configuração
 * vale para todas as marcas do cliente — quem foi preso a algumas marcas
 * (`direcaoRestrita`) mudaria o número que as outras usam para cobrar os
 * gestores delas. O RH lê a configuração, não muda.
 */
export async function salvarConfiguracaoDesligamentos(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (typeof empresaId !== "string" || !empresaId) return { ok: false, error: "Empresa inválida." };
  const usuario = await requireEmpresaAccess(empresaId);
  if (usuario.role !== "ADMIN" && usuario.role !== "DIRETORIA") {
    return { ok: false, error: "Só a diretoria muda a meta e o custo dos desligamentos." };
  }
  if (await direcaoRestrita(usuario)) {
    return {
      ok: false,
      error: "A configuração vale para todas as marcas do grupo — só quem enxerga o grupo inteiro pode mudar.",
    };
  }

  const grupoId = await grupoDaEmpresa(empresaId);
  if (!grupoId) return { ok: false, error: "Empresa sem grupo — não há onde gravar a configuração." };

  const validacao = validarConfiguracao({
    custo: String(formData.get("custo") ?? ""),
    meta: String(formData.get("meta") ?? ""),
    limite: String(formData.get("limite") ?? ""),
  });
  if (!validacao.ok) return validacao;
  const { custoCentavos, metaPct, limitePct } = validacao.valores;

  const antes = await prisma.configuracaoDesligamentos.findUnique({
    where: { grupoId },
    select: { custoPorDesligamentoCentavos: true, metaPct: true, limitePct: true },
  });
  const dados = {
    custoPorDesligamentoCentavos: custoCentavos,
    metaPct,
    limitePct,
    atualizadoPorId: usuario.id ?? null,
    atualizadoPorNome: usuario.name ?? null,
  };
  await prisma.configuracaoDesligamentos.upsert({
    where: { grupoId },
    create: { grupoId, ...dados },
    update: dados,
  });

  const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  await registrarAuditoria({
    empresaId,
    acao: antes ? "ATUALIZAR" : "CRIAR",
    entidade: "ConfiguracaoDesligamentos",
    entidadeId: grupoId,
    resumo:
      `Configuração da área Desligamentos: custo ${reais(custoCentavos)} por desligamento, ` +
      `meta ${metaPct}% e limite ${limitePct}% do quadro médio` +
      (antes
        ? ` (antes: ${reais(antes.custoPorDesligamentoCentavos)}, ${antes.metaPct}% e ${antes.limitePct}%).`
        : "."),
  });

  revalidatePath(`/rh/${empresaId}/desligamentos`, "layout");
  return { ok: true };
}
