"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { gerarConteudoAFD, gerarConteudoAEJ } from "@/lib/ponto-afdaej";

export async function exportarArquivoAFDRH(empresaId: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nome: true, cnpj: true },
  });

  if (!empresa) return { erro: "Empresa não localizada." };

  const registros = await prisma.registroPonto.findMany({
    where: { empresaId },
    orderBy: { nsr: "asc" },
    include: {
      colaborador: { select: { cpf: true } },
    },
  });

  const registrosFormatados = registros.map((r: { nsr: bigint; tipo: string; dataHora: Date; colaborador: { cpf: string | null }; hashSHA256: string }) => ({
    nsr: r.nsr,
    tipo: r.tipo,
    dataHora: r.dataHora,
    cpfColaborador: r.colaborador.cpf || "00000000000",
    hashSHA256: r.hashSHA256,
  }));

  const conteudoAFD = gerarConteudoAFD(
    { razaoSocial: empresa.nome, cnpj: empresa.cnpj || "00000000000000" },
    registrosFormatados
  );

  return { sucesso: true, conteudoAFD, nomeArquivo: `AFD_${empresa.cnpj || empresaId}.txt` };
}

export async function exportarArquivoAEJRH(empresaId: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nome: true, cnpj: true },
  });

  if (!empresa) return { erro: "Empresa não localizada." };

  const registros = await prisma.registroPonto.findMany({
    where: { empresaId },
    orderBy: { nsr: "asc" },
    include: {
      colaborador: { select: { cpf: true } },
    },
  });

  const registrosFormatados = registros.map((r: { nsr: bigint; tipo: string; dataHora: Date; colaborador: { cpf: string | null }; hashSHA256: string }) => ({
    nsr: r.nsr,
    tipo: r.tipo,
    dataHora: r.dataHora,
    cpfColaborador: r.colaborador.cpf || "00000000000",
    hashSHA256: r.hashSHA256,
  }));

  const conteudoAEJ = gerarConteudoAEJ(
    { razaoSocial: empresa.nome, cnpj: empresa.cnpj || "00000000000000" },
    registrosFormatados
  );

  return { sucesso: true, conteudoAEJ, nomeArquivo: `AEJ_${empresa.cnpj || empresaId}.txt` };
}

export type CriarJornadaInput = {
  empresaId: string;
  nome: string;
  entrada1: string;
  saida1: string;
  entrada2?: string;
  saida2?: string;
  cargaDiariaMin?: number;
  toleranciaMin?: number;
  sabadoUtil?: boolean;
  domingoUtil?: boolean;
};

export async function criarJornadaTrabalho(input: CriarJornadaInput) {
  if (!input.nome || !input.entrada1 || !input.saida1) {
    return { erro: "Preencha todos os campos obrigatórios da jornada." };
  }

  const jornada = await prisma.jornadaTrabalho.create({
    data: {
      empresaId: input.empresaId,
      nome: input.nome,
      entrada1: input.entrada1,
      saida1: input.saida1,
      entrada2: input.entrada2 || null,
      saida2: input.saida2 || null,
      cargaDiariaMin: input.cargaDiariaMin || 480,
      toleranciaMin: input.toleranciaMin || 10,
      sabadoUtil: input.sabadoUtil || false,
      domingoUtil: input.domingoUtil || false,
    },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { sucesso: true, jornada };
}

export async function listarJornadasEmpresa(empresaId: string) {
  return prisma.jornadaTrabalho.findMany({
    where: { empresaId, ativo: true },
    orderBy: { nome: "asc" },
  });
}

export type CriarTratamentoInput = {
  empresaId: string;
  colaboradorId: string;
  registroPontoId?: string;
  dataFato: Date;
  tipo: "INCLUSAO_MANUAL" | "ABONO_ATESTADO" | "JUSTIFICATIVA" | "CORRECAO";
  motivo: string;
};

/**
 * Abre um tratamento de ponto (PTRP) — sempre PENDENTE, nunca já aprovado.
 *
 * Até 11/08/2026 esta função gravava `status: "APROVADO"` junto com
 * `aprovadoPorId: "rh-admin"` e `aprovadoPorNome: "Gestor de RH"` — strings
 * fixas vindas da tela, não da sessão. Ou seja: a trilha de auditoria de um
 * módulo que existe POR EXIGÊNCIA LEGAL (Portaria MTP 671/2021) registrava um
 * aprovador que não era ninguém, e a própria tela dizia "assinado digitalmente
 * pelo RH". Assinatura de quem?
 *
 * Agora o registro nasce pendente e sem aprovador, e quem decide é
 * `decidirTratamentoPonto` — que lê a identidade da SESSÃO. Isso também separa
 * as duas mãos: quem pede o ajuste não é, pelo mero ato de pedir, quem o
 * aprova.
 */
export async function registrarTratamentoPonto(input: CriarTratamentoInput) {
  await requireEmpresaAccess(input.empresaId);

  if (!input.motivo || input.motivo.trim().length < 5) {
    return { erro: "O motivo do tratamento é obrigatório e deve ter no mínimo 5 caracteres." };
  }

  // O colaborador tem que ser DESTA empresa: o id vem do cliente, e sem esta
  // conferência um id de outra empresa abriria tratamento no ponto alheio.
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: input.colaboradorId, empresaId: input.empresaId },
    select: { id: true },
  });
  if (!colaborador) return { erro: "Colaborador não encontrado nesta empresa." };

  const tratamento = await prisma.tratamentoPonto.create({
    data: {
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      registroPontoId: input.registroPontoId || null,
      dataFato: input.dataFato,
      tipo: input.tipo,
      motivo: input.motivo.trim(),
      status: "PENDENTE",
    },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { sucesso: true, tratamento };
}

/**
 * Aprova ou rejeita um tratamento pendente, registrando QUEM decidiu.
 *
 * A identidade vem da sessão (`requireEmpresaAccess`), nunca do cliente — é o
 * que faz `aprovadoPorNome` valer alguma coisa numa auditoria. Rejeitar exige
 * motivo pelo mesmo motivo que abrir exige: "rejeitado" sem porquê não se
 * defende numa fiscalização nem se explica ao colaborador.
 */
export async function decidirTratamentoPonto(input: {
  empresaId: string;
  tratamentoId: string;
  decisao: "APROVADO" | "REJEITADO";
  motivoDecisao?: string;
}) {
  const usuario = await requireEmpresaAccess(input.empresaId);

  const atual = await prisma.tratamentoPonto.findFirst({
    where: { id: input.tratamentoId, empresaId: input.empresaId },
    select: { id: true, status: true, motivo: true },
  });
  if (!atual) return { erro: "Tratamento não encontrado nesta empresa." };
  if (atual.status !== "PENDENTE") {
    return { erro: `Este tratamento já foi ${atual.status.toLowerCase()}.` };
  }
  if (input.decisao === "REJEITADO" && (input.motivoDecisao ?? "").trim().length < 5) {
    return { erro: "Escreva o motivo da rejeição (mínimo 5 caracteres)." };
  }

  // O motivo da rejeição entra no MESMO campo `motivo`, marcado — o model não
  // tem coluna própria para a decisão, e perder o porquê da recusa seria pior
  // que a costura ficar visível no texto.
  const motivo =
    input.decisao === "REJEITADO"
      ? `${atual.motivo}\n\n[Rejeitado por ${usuario?.name ?? "RH"}] ${input.motivoDecisao!.trim()}`
      : atual.motivo;

  const tratamento = await prisma.tratamentoPonto.update({
    where: { id: atual.id },
    data: {
      status: input.decisao,
      motivo,
      aprovadoPorId: usuario?.id ?? null,
      aprovadoPorNome: usuario?.name ?? null,
      aprovadoEm: new Date(),
    },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { sucesso: true, tratamento };
}

/**
 * Só os PENDENTES — o nome desta função dizia "Pendentes" e devolvia tudo,
 * inclusive aprovados e rejeitados, desde que foi escrita.
 */
export async function listarTratamentosPendentesRH(empresaId: string) {
  return prisma.tratamentoPonto.findMany({
    where: { empresaId, status: "PENDENTE" },
    orderBy: { createdAt: "desc" },
    include: {
      colaborador: {
        select: {
          nome: true,
          setor: { select: { nome: true } },
          posicao: { select: { nome: true } },
        },
      },
    },
  });
}
