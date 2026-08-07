import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Crons "de comunicação" com horário configurável pela tela (Configuração →
 * Lembretes). Não inclui backup-db nem gestao-ciclo-pesquisas: são
 * operacionais/internos, não avisam ninguém, então não fazem sentido como
 * "lembrete" ajustável pelo RH.
 *
 * `padroes` é o horário que já rodava fixo no vercel.json antes desta tabela
 * existir — vale enquanto não houver nenhuma linha em ConfiguracaoLembrete
 * para a chave.
 */
export const LEMBRETES_CONFIGURAVEIS = {
  "alertas-rh": { label: "Alertas de RH", padroes: ["10:00"] },
  "enviar-convites": { label: "Envio de convites de pesquisa", padroes: ["12:00"] },
  "lembrete-pesquisa": { label: "Lembrete de pesquisa não respondida", padroes: ["13:00", "19:00"] },
  "lembrete-portal": { label: "Lembrete de vínculo do portal", padroes: ["18:00"] },
  "cobranca-rh-pendencias": { label: "Cobrança de pendências do RH", padroes: ["09:00"] },
} as const;

export type ChaveLembrete = keyof typeof LEMBRETES_CONFIGURAVEIS;

/**
 * Cada rota de cron aceita duas formas de autorização (padrão já usado nas 6
 * rotas): o header que o próprio Vercel Cron manda ("cron", chamada
 * automática e periódica) e `?secret=` na URL ("manual", disparo manual de
 * alguém testando ou diagnosticando).
 *
 * A distinção importa aqui porque só a chamada "cron" deve respeitar o
 * horário configurado — quem dispara manualmente com o secret na mão quer
 * rodar agora mesmo, na hora que for, não esperar a janela configurada.
 */
export function origemAutorizacao(req: NextRequest): "cron" | "manual" | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return "cron";
  if (req.nextUrl.searchParams.get("secret") === secret) return "manual";
  return null;
}

export function ehChaveLembrete(valor: string): valor is ChaveLembrete {
  return valor in LEMBRETES_CONFIGURAVEIS;
}

/** "HH:mm" de agora no horário de Brasília — mesmo fuso usado em lib/email.ts. */
function horaAgoraSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function paraMinutos(hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Decide se a chamada de agora é "a hora certa" de rodar o cron `chave` de
 * verdade. O Vercel Cron liga a rota a cada 15 min (vercel.json); esta
 * função filtra pra que o trabalho de fato só aconteça perto do horário
 * configurado — sem isso o lembrete sairia a cada 15 min o dia inteiro.
 *
 * `janelaMin` maior que a metade do intervalo de disparo (15 min) evita
 * buraco entre duas chamadas por causa de atraso do agendador; menor que o
 * intervalo inteiro evita repetir na chamada seguinte.
 */
export async function deveRodarAgora(chave: ChaveLembrete, janelaMin = 8): Promise<boolean> {
  const linhas = await prisma.configuracaoLembrete.findMany({ where: { chave } });

  const horarios = linhas.length > 0
    ? linhas.filter((l) => l.ativo).map((l) => l.horario)
    : [...LEMBRETES_CONFIGURAVEIS[chave].padroes];

  if (horarios.length === 0) return false; // RH desativou todos os horários deste lembrete

  const minutosAgora = paraMinutos(horaAgoraSaoPaulo());
  if (minutosAgora === null) return false;

  return horarios.some((h) => {
    const alvo = paraMinutos(h);
    return alvo !== null && Math.abs(minutosAgora - alvo) <= janelaMin;
  });
}
