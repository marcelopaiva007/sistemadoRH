"use server";

import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { gerarHashPontoSHA256, validarIpPonto, validarGeofencingGps } from "@/lib/ponto-seguranca";
import { enviarParaBlob } from "@/lib/blob";
import { revalidatePath } from "next/cache";

import { headers } from "next/headers";

// Teto do payload da foto (data URL). O cartão reduz a selfie para ~640px
// antes de enviar (~60 KB); 1,5 MB de base64 já é chamada direta à action com
// payload anormal, não foto de batida.
const LIMITE_FOTO_DATA_URL = 1_500_000;

// Guarda a selfie da batida no Blob privado e devolve a URL — ou null.
//
// NUNCA lança e nunca devolve erro: foto é evidência de quem bateu, não
// condição para bater. Se a câmera falhou, o Blob está fora do ar ou o token
// não existe, o ponto registra do mesmo jeito e a linha fica "sem foto" no
// painel do RH — que aí cobra. Bloquear a batida por causa do acessório
// inverteria a importância das duas coisas.
//
// Antes desta função o `fotoBase64` ia INTEIRO para a coluna `fotoUrl` do
// Postgres — o exato caminho que lib/blob.ts existe para evitar (banco de
// 18 MB virando GB). Nenhuma tela enviava foto ainda, então nenhuma linha
// antiga tem base64 salvo — mas a rota que serve a foto trata esse caso
// mesmo assim, porque a coluna aceitava.
async function guardarFotoDaBatida(params: {
  empresaId: string;
  colaboradorId: string;
  nsr: bigint;
  tipo: string;
  fotoBase64: string | null | undefined;
}): Promise<string | null> {
  const dataUrl = params.fotoBase64;
  if (!dataUrl || dataUrl.length > LIMITE_FOTO_DATA_URL) return null;

  // JPEG **ou PNG**, e a lista fechada continua sendo o que protege: nada de
  // aceitar `data:` genérico. O PNG entrou na auditoria de 13/08/2026 por um
  // motivo concreto — quando o navegador não suporta o tipo pedido em
  // `toDataURL`, a especificação manda cair para PNG em silêncio. Aceitando só
  // JPEG, essa batida chegaria "sem foto" ao painel e ninguém saberia por quê:
  // a falha não aparece em lugar nenhum, e a foto é justamente o ponto do
  // recurso.
  const casado = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!casado) return null;

  const ehPng = casado[1] === "png";

  try {
    const bytes = new Uint8Array(Buffer.from(casado[2], "base64"));
    if (bytes.byteLength === 0) return null;
    const envio = await enviarParaBlob({
      empresaId: params.empresaId,
      colaboradorId: params.colaboradorId,
      nome: `ponto-${params.nsr}-${params.tipo}.${ehPng ? "png" : "jpg"}`,
      mimeType: ehPng ? "image/png" : "image/jpeg",
      bytes,
    });
    return envio.ok ? envio.url : null;
  } catch {
    return null;
  }
}

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

  // A foto vai para o Blob privado ANTES do create, para a URL entrar na
  // mesma linha. Falha aqui não impede nada — ver guardarFotoDaBatida.
  const fotoUrl = await guardarFotoDaBatida({
    empresaId: colaborador.empresaId,
    colaboradorId: colaborador.id,
    nsr,
    tipo: input.tipo,
    fotoBase64: input.fotoBase64,
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
      fotoUrl,
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
      // O comprovante diz se a foto entrou: quem bateu precisa saber na hora
      // se vai aparecer "sem foto" para o RH — e não descobrir depois.
      comFoto: fotoUrl !== null,
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
