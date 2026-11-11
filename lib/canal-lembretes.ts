// Por qual canal sai cada lembrete automático — OS 11/11/2026, item 3.
//
// A tela Configuração › Lembretes mostrava só o horário. O RH não tinha como
// saber se um aviso saía por Telegram, por e-mail ou pelos dois — e, portanto,
// quais lembretes estavam disputando o teto diário de e-mails com o
// contracheque. A descrição abaixo é a do CÓDIGO de cada lembrete (conferida
// em 11/11/2026); se um envio mudar de canal, esta tabela muda junto.
//
// O que dá para ESCOLHER: só a reserva por e-mail dos lembretes que falam com
// o colaborador pelo Telegram. Os que só existem por e-mail (alertas ao RH,
// cobrança de pendências do RH, convite para o portal) não têm alternativa —
// para eles, desligar o e-mail é desligar o lembrete, e isso já é o
// interruptor de horários da mesma tela.

import { prisma } from "@/lib/prisma";
import type { ChaveLembrete } from "@/lib/cron-horario";

export type CanalDoLembrete = {
  /** O que a tela mostra, em linguagem de quem usa. */
  descricao: string;
  /** Para quem o lembrete vai. */
  destinatario: string;
  /** Se o RH pode desligar a parte do e-mail sem desligar o lembrete. */
  emailOpcional: boolean;
  /** Se o lembrete gasta o teto diário de e-mails (com a configuração padrão). */
  usaEmail: boolean;
};

export const CANAL_DOS_LEMBRETES: Record<ChaveLembrete, CanalDoLembrete> = {
  "alertas-rh": {
    descricao: "Só e-mail",
    destinatario: "Equipe do RH",
    emailOpcional: false,
    usaEmail: true,
  },
  "enviar-convites": {
    descricao: "Telegram; quem não tem Telegram recebe por e-mail",
    destinatario: "Colaboradores",
    emailOpcional: true,
    usaEmail: true,
  },
  "lembrete-pesquisa": {
    descricao: "Telegram; quem não tem Telegram recebe por e-mail",
    destinatario: "Colaboradores",
    emailOpcional: true,
    usaEmail: true,
  },
  "lembrete-portal": {
    descricao: "Só e-mail (é o convite para vincular o Telegram)",
    destinatario: "Colaboradores sem Telegram",
    emailOpcional: false,
    usaEmail: true,
  },
  "cobranca-rh-pendencias": {
    descricao: "Só e-mail (gestor em cópia)",
    destinatario: "Equipe do RH",
    emailOpcional: false,
    usaEmail: true,
  },
  "cobranca-cadastro": {
    descricao: "Telegram e e-mail (os dois)",
    destinatario: "Colaboradores com cadastro incompleto",
    emailOpcional: true,
    usaEmail: true,
  },
  "avisos-gestor": {
    descricao: "Só Telegram",
    destinatario: "Gestores",
    emailOpcional: false,
    usaEmail: false,
  },
  "lembrete-contracheque": {
    descricao: "Só Telegram",
    destinatario: "Colaboradores com contracheque pendente",
    emailOpcional: false,
    usaEmail: false,
  },
};

/**
 * Se o e-mail está liberado para este lembrete no envio AUTOMÁTICO. Sem linha
 * na tabela = liberado (o comportamento de antes desta tela). Falha de banco
 * também libera: errar para o lado de avisar a pessoa é o erro menor.
 */
export async function emailLiberadoNoLembrete(chave: ChaveLembrete): Promise<boolean> {
  if (!CANAL_DOS_LEMBRETES[chave].emailOpcional) return true;
  try {
    const cfg = await prisma.configuracaoCanalLembrete.findUnique({ where: { chave }, select: { usarEmail: true } });
    return cfg?.usarEmail ?? true;
  } catch (e) {
    console.error("[canal-lembretes] falha ao ler configuração:", e);
    return true;
  }
}

/** Estado de todos os lembretes de uma vez — para a tela. */
export async function emailLiberadoPorLembrete(): Promise<Record<string, boolean>> {
  const linhas = await prisma.configuracaoCanalLembrete.findMany({ select: { chave: true, usarEmail: true } });
  return Object.fromEntries(linhas.map((l) => [l.chave, l.usarEmail]));
}
