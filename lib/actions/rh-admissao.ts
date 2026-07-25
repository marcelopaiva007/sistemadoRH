"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import { violouUnique } from "@/lib/prisma-erros";
import type { ActionResult } from "@/lib/constants";

/**
 * Converte uma candidatura em colaborador: cria a ficha a partir do que o
 * candidato já informou, marca a candidatura como CONTRATADO e guarda o
 * vínculo entre as duas pontas.
 *
 * O que NÃO faz de propósito: bloquear por documento faltando. A conferência
 * do que ainda falta é calculada em lib/admissao.ts e aparece como aviso na
 * ficha — em campo a pessoa às vezes começa antes de todo papel chegar, e
 * travar aqui só faria o RH cadastrar por fora.
 */
export async function admitirCandidato(
  empresaId: string,
  candidaturaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, empresaId },
    include: { candidato: true, vaga: { select: { id: true, titulo: true, posicaoId: true, setorId: true } } },
  });
  if (!candidatura) return { ok: false, error: "Candidatura não encontrada nesta empresa." };
  if (candidatura.colaboradorId) {
    return { ok: false, error: "Este candidato já foi admitido — a ficha dele já existe." };
  }

  const setorId = String(formData.get("setorId") ?? "").trim() || candidatura.vaga.setorId;
  const posicaoId = String(formData.get("posicaoId") ?? "").trim() || candidatura.vaga.posicaoId;
  if (!setorId) return { ok: false, error: "Escolha o setor da admissão." };
  if (!posicaoId) return { ok: false, error: "Escolha o cargo da admissão." };

  const [setor, posicao] = await Promise.all([
    prisma.setor.findFirst({ where: { id: setorId, empresaId }, select: { id: true } }),
    prisma.posicao.findFirst({ where: { id: posicaoId, empresaId }, select: { id: true } }),
  ]);
  if (!setor) return { ok: false, error: "Setor não encontrado nesta empresa." };
  if (!posicao) return { ok: false, error: "Cargo não encontrado nesta empresa." };

  const dataAdmissao = dataDoFormulario(formData.get("dataAdmissao"));
  if (!dataAdmissao) return { ok: false, error: "Informe a data de admissão." };

  const salarioTexto = String(formData.get("salarioBase") ?? "").replace(",", ".").trim();
  const salarioBase = salarioTexto ? Number.parseFloat(salarioTexto) : null;
  if (salarioBase !== null && (!Number.isFinite(salarioBase) || salarioBase < 0)) {
    return { ok: false, error: "Salário base inválido." };
  }

  const cpf = candidatura.candidato.cpf;
  if (cpf) {
    const jaExiste = await prisma.colaborador.findFirst({
      where: { empresaId, cpf },
      select: { id: true, nome: true },
    });
    if (jaExiste) {
      return {
        ok: false,
        error: `Já existe um colaborador com este CPF (${jaExiste.nome}). Se for recontratação, edite a ficha existente em vez de criar outra.`,
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const colaborador = await tx.colaborador.create({
        data: {
          empresaId,
          nome: candidatura.candidato.nome,
          cpf,
          email: candidatura.candidato.email,
          telefone: candidatura.candidato.telefone,
          cidade: candidatura.candidato.cidade,
          setorId,
          posicaoId,
          dataAdmissao,
          salarioBase,
          tipoContrato: String(formData.get("tipoContrato") ?? "").trim() || null,
        },
      });

      await tx.candidatura.update({
        where: { id: candidaturaId },
        data: { etapa: "CONTRATADO", colaboradorId: colaborador.id },
      });

      await tx.eventoCandidatura.create({
        data: {
          candidaturaId,
          etapaAnterior: candidatura.etapa,
          etapaNova: "CONTRATADO",
          motivo: "Admitido — ficha de colaborador criada.",
          registradoPorId: usuario?.id ?? null,
          registradoPorNome: usuario?.name ?? null,
        },
      });
    });
  } catch (e) {
    if (violouUnique(e, "Colaborador_empresaId_cpf_key")) {
      return { ok: false, error: "Já existe um colaborador com este CPF nesta empresa." };
    }
    throw e;
  }

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Colaborador",
    entidadeId: candidaturaId,
    // Salário entra como "definido", nunca o valor — mesma regra do resto da
    // trilha (ver lib/audit.ts).
    resumo: `${candidatura.candidato.nome} admitido(a) a partir da vaga "${candidatura.vaga.titulo}"${
      salarioBase !== null ? " (salário definido)" : ""
    }.`,
  });

  revalidatePath(`/rh/${empresaId}/vagas/${candidatura.vaga.id}`);
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  revalidatePath(`/rh/${empresaId}/candidatos`);
  return { ok: true };
}
