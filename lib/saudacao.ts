/**
 * Como o sistema chama a pessoa e como cumprimenta.
 *
 * Duas funções miúdas, num arquivo próprio, porque as duas atravessam camadas:
 * o cumprimento é da tela inicial, o primeiro nome é da tela inicial E do bot
 * do Telegram (lib/aviso-gestor.ts). A regra de "como se chama alguém" existia
 * só lá dentro, privada; trazê-la para cá evita a segunda cópia — que é onde
 * as duas divergem no primeiro ajuste.
 */

/**
 * O primeiro nome, com a inicial maiúscula e o resto minúsculo.
 *
 * O cadastro veio do elleven com tudo em caixa alta, e "Olá, MARCELO" soa como
 * grito — foi um ajuste real dos avisos ao gestor em 12/08/2026. Devolve
 * string vazia para nome ausente ou só espaços: quem chama decide se omite o
 * cumprimento ou usa um genérico, e isso NÃO é decisão desta função.
 */
export function primeiroNome(nome?: string | null): string {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primeiro) return "";
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

/**
 * "Bom dia" / "Boa tarde" / "Boa noite" no horário de BRASÍLIA.
 *
 * O fuso é explícito de propósito: no servidor da Vercel o relógio é UTC, e
 * sem isto o RH abriria o sistema às 8h da manhã e leria "Boa tarde". É o
 * mesmo erro de fuso que apareceu no arquivo fiscal AFD e no monitor de
 * presença em 12/08/2026 — aqui é cosmético, lá custava três horas em
 * documento de fiscalização.
 *
 * `agora` é injetável para o teste não depender da hora em que roda.
 */
export function saudacao(agora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(agora),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}
