"use server";

import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { gerarHashPontoSHA256, validarIpPonto, validarGeofencingGps } from "@/lib/ponto-seguranca";
import { revalidatePath } from "next/cache";

import { headers } from "next/headers";

export type RegistrarPontoInput = {
  tipo: "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2";
  latitude?: number | null;
  longitude?: number | null;
  precisaoGps?: number | null;
  fotoBase64?: string | null;
  dispositivoInfo?: string | null;
};

export async function registrarPontoPortal(input: RegistrarPontoInput) {
  const headersList = await headers();
  const ipCliente = headersList.get("x-forwarded-for")?.split(",")[0] || headersList.get("x-real-ip") || "127.0.0.1";

  const sessao = await lerSessaoPortal();
  if (!sessao || !sessao.verificado) {
    return { erro: "Sessão inválida ou CPF não verificado." };
  }

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, empresaId: true, ativo: true },
  });

  if (!colaborador || !colaborador.ativo) {
    return { erro: "Colaborador não localizado ou inativo." };
  }

  // Buscar configurações de ponto da empresa
  const config = await prisma.configuracaoPontoEmpresa.findUnique({
    where: { empresaId: colaborador.empresaId },
  });

  // Validação de IP
  const ipValido = validarIpPonto(ipCliente, config?.ipsAutorizados);
  if (config?.exigirIp && !ipValido) {
    return { erro: "Marcação de ponto não permitida fora da rede de IP autorizada da empresa." };
  }

  // Validação de GPS Geofencing
  let gpsValido = true;
  if (input.latitude && input.longitude) {
    const resGps = validarGeofencingGps(
      input.latitude,
      input.longitude,
      config?.latitudeEmpresa,
      config?.longitudeEmpresa,
      config?.raioPermitidoMtrs || 200
    );
    gpsValido = resGps.valido;
  } else if (config?.exigirGps) {
    return { erro: "Sua geolocalização (GPS) é obrigatória para registrar o ponto." };
  }

  if (config?.exigirGps && !gpsValido) {
    return { erro: `Fora do raio de localização permitido pela empresa.` };
  }

  // Buscar último NSR da empresa para incrementar atomicamente
  const ultimoPonto = await prisma.registroPonto.findFirst({
    where: { empresaId: colaborador.empresaId },
    orderBy: { nsr: "desc" },
    select: { nsr: true },
  });

  const nsr = (ultimoPonto?.nsr || BigInt(0)) + BigInt(1);
  const dataHoraAtual = new Date();

  // Gerar Hash SHA-256 de inviolabilidade
  const hashSHA256 = gerarHashPontoSHA256({
    nsr,
    colaboradorId: colaborador.id,
    empresaId: colaborador.empresaId,
    dataHoraISO: dataHoraAtual.toISOString(),
    tipo: input.tipo,
    ipOrigem: ipCliente,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  // Criar RegistroPonto (Append-Only)
  const novoRegistro = await prisma.registroPonto.create({
    data: {
      empresaId: colaborador.empresaId,
      colaboradorId: colaborador.id,
      dataHora: dataHoraAtual,
      tipo: input.tipo,
      nsr,
      ipOrigem: ipCliente,
      ipValido,
      latitude: input.latitude,
      longitude: input.longitude,
      precisaoGps: input.precisaoGps,
      gpsValido,
      fotoUrl: input.fotoBase64 || null,
      hashSHA256,
      dispositivoInfo: input.dispositivoInfo || null,
    },
  });

  revalidatePath("/portal");

  return {
    sucesso: true,
    comprovante: {
      nsr: Number(novoRegistro.nsr),
      dataHora: novoRegistro.dataHora.toISOString(),
      tipo: novoRegistro.tipo,
      hashSHA256: novoRegistro.hashSHA256,
    },
  };
}

export async function buscarRegistrosPontoHojePortal() {
  const sessao = await lerSessaoPortal();
  if (!sessao) return [];

  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);

  const hojeFim = new Date();
  hojeFim.setHours(23, 59, 59, 999);

  const registros = await prisma.registroPonto.findMany({
    where: {
      colaboradorId: sessao.colaboradorId,
      dataHora: { gte: hojeInicio, lte: hojeFim },
    },
    orderBy: { dataHora: "asc" },
    select: {
      id: true,
      tipo: true,
      dataHora: true,
      nsr: true,
      hashSHA256: true,
    },
  });

  return registros.map((r: { id: string; tipo: string; dataHora: Date; nsr: bigint; hashSHA256: string }) => ({
    ...r,
    nsr: Number(r.nsr),
  }));
}
