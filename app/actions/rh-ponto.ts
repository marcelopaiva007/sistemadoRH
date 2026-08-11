"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
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
  aprovadoPorId: string;
  aprovadoPorNome: string;
};

export async function registrarTratamentoPonto(input: CriarTratamentoInput) {
  if (!input.motivo || input.motivo.trim().length < 5) {
    return { erro: "O motivo do tratamento é obrigatório e deve ter no mínimo 5 caracteres." };
  }

  const tratamento = await prisma.tratamentoPonto.create({
    data: {
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      registroPontoId: input.registroPontoId || null,
      dataFato: input.dataFato,
      tipo: input.tipo,
      motivo: input.motivo,
      status: "APROVADO",
      aprovadoPorId: input.aprovadoPorId,
      aprovadoPorNome: input.aprovadoPorNome,
      aprovadoEm: new Date(),
    },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { sucesso: true, tratamento };
}

export async function listarTratamentosPendentesRH(empresaId: string) {
  return prisma.tratamentoPonto.findMany({
    where: { empresaId },
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
