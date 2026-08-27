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
  // Depois da cobrança do RH de propósito: o analista abre a fila às 09:00 e
  // as respostas do time começam a chegar às 11:00, com ele já na tela.
  "cobranca-cadastro": { label: "Cobrança de cadastro do colaborador", padroes: ["11:00"] },
  // A frequência de cada pessoa (duas vezes por semana) NÃO se ajusta aqui: o
  // horário diz a que horas o cron olha a base, e quem decide se hoje é a vez
  // de fulano é DIAS_ENTRE_COBRANCAS, em lib/cobranca-cadastro-colaborador.ts.
  //
  // Às 08:00 de propósito: o gestor lê antes de a operação começar. Avisado no
  // meio da tarde, ele adia para o dia seguinte — e o que este aviso cobre tem
  // data fatal. Desde 12/08/2026 o cron está em vercel.json, mas o lembrete
  // NASCE DESLIGADO (ver LEMBRETES_QUE_NASCEM_DESLIGADOS): ligar é o
  // interruptor na tela de Lembretes, e a prévia mora em Avisos ao gestor.
  "avisos-gestor": { label: "Avisos ao gestor sobre o time", padroes: ["08:00"] },
} as const;

export type ChaveLembrete = keyof typeof LEMBRETES_CONFIGURAVEIS;

/**
 * Lembretes que NASCEM DESLIGADOS: sem uma decisão explícita da gestão, não
 * saem. Para os demais, a ausência de configuração significa "usa o horário
 * padrão" — aqui significa "não roda".
 *
 * A cobrança de cadastro entrou nesta lista em 12/08/2026, por decisão do
 * Marcelo. Ela é diferente das outras: varre a base INTEIRA e fala com
 * colaborador, não com o RH. O disparo automático de algo assim é decisão de
 * gestão, tomada uma vez e por escrito, não um padrão herdado de quem escreveu
 * o código. O envio à mão (botão na ficha e na lista) não depende disto e
 * continua disponível para o RH o tempo todo.
 *
 * Ligar é adicionar/reativar um horário em Configuração → Lembretes, tela que
 * já é restrita a ADMIN e DIRETORIA — a mesma gestão. Desligar é pausar todos.
 */
export const LEMBRETES_QUE_NASCEM_DESLIGADOS = new Set<ChaveLembrete>([
  "cobranca-cadastro",
  // Mensagem para a CHEFIA, decisão explícita do dono do sistema em 12/08/2026:
  // "vou decidir no dia a dia". O cron está registrado no vercel.json, mas sem
  // o interruptor da tela de Lembretes ligado nada sai — sem esta linha, o
  // registro do cron já teria começado a enviar às 08:00 sem ninguém decidir.
  "avisos-gestor",
]);

/**
 * Se o envio automático deste lembrete está ligado AGORA — a pergunta que a
 * tela faz para mostrar o interruptor no estado certo.
 *
 * Mesma leitura que `deveRodarAgora` usa para decidir, só que sem olhar a
 * hora: se as duas divergirem, a tela mente sobre o que o sistema faz.
 */
export function envioAutomaticoLigado(
  chave: ChaveLembrete,
  linhas: { chave: string; ativo: boolean }[],
): boolean {
  const daChave = linhas.filter((l) => l.chave === chave);
  if (daChave.length === 0) return !LEMBRETES_QUE_NASCEM_DESLIGADOS.has(chave);
  return daChave.some((l) => l.ativo);
}

/**
 * Autorização das rotas de cron. SÓ o header que o próprio Vercel Cron manda
 * (`Authorization: Bearer $CRON_SECRET`) autoriza — resultado "cron".
 *
 * O disparo manual por `?secret=` na URL foi REMOVIDO em 27/08/2026 (pentest):
 * segredo em query string vaza em log de acesso, histórico e cabeçalho Referer,
 * e este mesmo secret dispara backup do banco e envio em massa. Sem o caminho
 * manual, "manual" não é mais retornado — toda chamada autorizada é "cron" e
 * respeita o horário configurado. O valor "manual" segue no tipo só para as
 * rotas que ainda o comparam (ex.: foto-mensal), onde agora nunca casa: o cron
 * não escolhe competência, que é a invariante que aquelas rotas já exigiam.
 */
export function origemAutorizacao(req: NextRequest): "cron" | "manual" | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return "cron";
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

  // MESMA função que a tela usa para desenhar o interruptor — de propósito.
  // Duas leituras da mesma regra divergiriam no primeiro ajuste, e a divergência
  // aqui é a pior possível: a tela diz "desligado" e o sistema manda mensagem.
  //
  // Ela cobre os dois jeitos de estar desligado: sem nenhuma linha num lembrete
  // que nasce desligado (a gestão nunca ligou) e todas as linhas pausadas
  // (ligaram e depois desligaram).
  if (!envioAutomaticoLigado(chave, linhas)) return false;

  const horarios = linhas.length > 0
    ? linhas.filter((l) => l.ativo).map((l) => l.horario)
    : [...LEMBRETES_CONFIGURAVEIS[chave].padroes];

  const minutosAgora = paraMinutos(horaAgoraSaoPaulo());
  if (minutosAgora === null) return false;

  return horarios.some((h) => {
    const alvo = paraMinutos(h);
    return alvo !== null && Math.abs(minutosAgora - alvo) <= janelaMin;
  });
}
