"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { direcaoRestrita, grupoDaEmpresa } from "@/lib/grupo";
import { registrarAuditoria } from "@/lib/audit";
import { validarConfiguracao } from "@/lib/desligamentos/painel";
import { validarIndicadoresNegocio } from "@/lib/desligamentos/analises";
import { hojeUTC } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

/** A mesma porta das duas gravações da área: diretoria que enxerga o grupo inteiro. */
async function exigirDiretoriaDoGrupo(
  empresaId: string,
): Promise<{ ok: true; grupoId: string; usuario: { id?: string; name?: string | null } } | { ok: false; error: string }> {
  if (typeof empresaId !== "string" || !empresaId) return { ok: false, error: "Empresa inválida." };
  const usuario = await requireEmpresaAccess(empresaId);
  if (usuario.role !== "ADMIN" && usuario.role !== "DIRETORIA") {
    return { ok: false, error: "Só a diretoria muda os números da área Desligamentos." };
  }
  if (await direcaoRestrita(usuario)) {
    return {
      ok: false,
      error: "Estes números valem para todas as marcas do grupo — só quem enxerga o grupo inteiro pode mudar.",
    };
  }
  const grupoId = await grupoDaEmpresa(empresaId);
  if (!grupoId) return { ok: false, error: "Empresa sem grupo — não há onde gravar." };
  return { ok: true, grupoId, usuario };
}

/**
 * Crescimento da base de clientes e do faturamento dos últimos três anos —
 * digitado pela diretoria, porque o sistema não tem essa informação. É a
 * régua contra a qual a aba Comparações mede o crescimento da equipe.
 */
export async function salvarIndicadoresNegocio(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const porta = await exigirDiretoriaDoGrupo(empresaId);
  if (!porta.ok) return porta;
  const { grupoId, usuario } = porta;

  const anoAtual = hojeUTC().getUTCFullYear();
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual];
  const campos: Record<string, string> = {};
  for (const ano of anos) {
    for (const nome of ["clientes", "faturamento", "observacao"]) {
      campos[`${nome}_${ano}`] = String(formData.get(`${nome}_${ano}`) ?? "");
    }
  }
  const validacao = validarIndicadoresNegocio(campos, anos);
  if (!validacao.ok) return validacao;

  for (const v of validacao.valores) {
    const dados = {
      crescimentoClientesPct: v.crescimentoClientesPct,
      crescimentoFaturamentoPct: v.crescimentoFaturamentoPct,
      observacao: v.observacao,
      atualizadoPorId: usuario.id ?? null,
      atualizadoPorNome: usuario.name ?? null,
    };
    await prisma.indicadorNegocioAno.upsert({
      where: { grupoId_ano: { grupoId, ano: v.ano } },
      create: { grupoId, ano: v.ano, ...dados },
      update: dados,
    });
  }

  const fmt = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR")}%`);
  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "IndicadorNegocioAno",
    entidadeId: grupoId,
    resumo:
      "Crescimento do negócio (área Desligamentos): " +
      validacao.valores
        .map((v) => `${v.ano} clientes ${fmt(v.crescimentoClientesPct)}, faturamento ${fmt(v.crescimentoFaturamentoPct)}`)
        .join("; ") +
      ".",
  });

  revalidatePath(`/rh/${empresaId}/desligamentos`, "layout");
  return { ok: true };
}

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
  const porta = await exigirDiretoriaDoGrupo(empresaId);
  if (!porta.ok) return porta;
  const { grupoId, usuario } = porta;

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
