const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Fuso oficial da operação (Brasília). Todo cálculo de "mês corrente" deve usar
// este fuso, e NÃO o relógio do servidor: em produção (Vercel/serverless) o
// servidor roda em UTC, então nas últimas horas do último dia do mês (a partir
// das ~21h de Brasília) o UTC já virou o mês seguinte — o que faria o sistema
// pular para o mês errado exatamente na virada. Usar America/Sao_Paulo garante
// que o período de referência seja sempre o mês vigente no Brasil, sem depender
// de ajuste manual a cada mês.
export const FUSO_BR = "America/Sao_Paulo";

// Período de referência (formato "AAAA-MM") de uma data, no fuso de Brasília.
export function periodoDeData(data: Date): string {
  // "en-CA" formata como "AAAA-MM-DD"; ficamos com o prefixo "AAAA-MM".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .slice(0, 7);
}

// Mês corrente (no fuso de Brasília) — calculado dinamicamente a cada chamada.
export function periodoAtual(): string {
  return periodoDeData(new Date());
}

export function periodoLabel(periodo: string): string {
  const [ano, mes] = periodo.split("-").map(Number);
  return `${MESES[mes - 1]}/${ano}`;
}

export function periodoAnterior(periodo: string): string {
  const [ano, mes] = periodo.split("-").map(Number);
  const d = new Date(ano, mes - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
