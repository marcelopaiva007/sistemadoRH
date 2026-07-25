// Helpers da grade de escala — só a conta de "que dias essa semana cobre",
// pura e testável sem banco.
import { somarDiasUTC } from "@/lib/datas";

/** Segunda-feira da semana que contém `d` (UTC). Domingo conta como fim da semana anterior. */
export function inicioDaSemanaUTC(d: Date): Date {
  // getUTCDay(): 0=domingo..6=sábado. Deslocamento até a segunda-feira.
  const diaDaSemana = d.getUTCDay();
  const deslocamento = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
  return somarDiasUTC(d, deslocamento);
}

/** Os 7 dias da semana, de segunda a domingo, a partir do início já calculado. */
export function diasDaSemana(inicioSegunda: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => somarDiasUTC(inicioSegunda, i));
}
