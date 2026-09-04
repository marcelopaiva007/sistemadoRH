import crypto from "crypto";

/**
 * Utilitários de Segurança e Criptografia do Ponto Eletrônico (REP-P / Portaria MTP 671/2021)
 */

/**
 * Gera Hash SHA-256 da batida de ponto para garantia de imutabilidade e integridade legal.
 * Formato da cadeia: NSR|colaboradorId|empresaId|dataHoraISO|tipo|ipOrigem|lat|lng
 */
export function gerarHashPontoSHA256(dados: {
  nsr: bigint | number | string;
  colaboradorId: string;
  empresaId: string;
  dataHoraISO: string;
  tipo: string;
  ipOrigem?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  const cadeia = [
    String(dados.nsr),
    dados.colaboradorId,
    dados.empresaId,
    dados.dataHoraISO,
    dados.tipo,
    dados.ipOrigem || "SEM_IP",
    dados.latitude !== undefined && dados.latitude !== null ? dados.latitude.toFixed(6) : "SEM_LAT",
    dados.longitude !== undefined && dados.longitude !== null ? dados.longitude.toFixed(6) : "SEM_LNG",
  ].join("|");

  return crypto.createHash("sha256").update(cadeia, "utf8").digest("hex");
}

/**
 * Valida se o IP de origem da batida de ponto pertence à lista de IPs autorizados da empresa.
 */
export function validarIpPonto(ipCliente: string, ipsAutorizadosCsv?: string | null): boolean {
  if (!ipsAutorizadosCsv || ipsAutorizadosCsv.trim() === "") return true;

  const listaIps = ipsAutorizadosCsv.split(",").map((ip) => ip.trim());
  return listaIps.includes(ipCliente.trim());
}

/**
 * Calcula a distância entre duas coordenadas geográficas em metros usando a fórmula de Haversine.
 */
export function calcularDistanciaMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Valida se a geolocalização do ponto está dentro do raio permitido pela empresa em metros.
 */
export function validarGeofencingGps(
  latCliente: number,
  lngCliente: number,
  latEmpresa?: number | null,
  lngEmpresa?: number | null,
  raioPermitidoMtrs: number = 200
): { valido: boolean; distanciaMetros: number } {
  if (latEmpresa === null || latEmpresa === undefined || lngEmpresa === null || lngEmpresa === undefined) {
    return { valido: true, distanciaMetros: 0 };
  }

  const distanciaMetros = calcularDistanciaMetros(latCliente, lngCliente, latEmpresa, lngEmpresa);
  return {
    valido: distanciaMetros <= raioPermitidoMtrs,
    distanciaMetros,
  };
}

/**
 * Hash SHA-256 de uma MARCAÇÃO TRATADA — a marcação que nasce de uma decisão
 * do RH sobre um tratamento de ponto (INCLUSAO_MANUAL aprovada), não de uma
 * batida no REP-P.
 *
 * É uma função PRÓPRIA, e não gerarHashPontoSHA256, por duas razões:
 * 1. A cadeia da batida começa pelo NSR e carrega IP e GPS. A marcação tratada
 *    NÃO consome NSR (não entra no AFD — Portaria MTP 671/2021) e não tem
 *    origem física: os campos que dão identidade a ela são o tratamento que a
 *    gerou e quem aprovou.
 * 2. O prefixo "TRATADA" garante que nenhuma marcação tratada produz o mesmo
 *    hash de uma batida com os mesmos colaborador/empresa/instante/tipo — o
 *    AEJ e a auditoria conseguem distinguir as duas só pela cadeia.
 *
 * Formato da cadeia:
 *   TRATADA|tratamentoId|colaboradorId|empresaId|dataHoraISO|tipo|aprovadoPorId-ou-SEM_APROVADOR
 */
export function gerarHashMarcacaoTratadaSHA256(dados: {
  tratamentoId: string;
  colaboradorId: string;
  empresaId: string;
  dataHoraISO: string;
  tipo: string;
  aprovadoPorId?: string | null;
}): string {
  const cadeia = [
    "TRATADA",
    dados.tratamentoId,
    dados.colaboradorId,
    dados.empresaId,
    dados.dataHoraISO,
    dados.tipo,
    dados.aprovadoPorId || "SEM_APROVADOR",
  ].join("|");

  return crypto.createHash("sha256").update(cadeia, "utf8").digest("hex");
}
