// Limite de tentativas de login — 5 falhas por usuário+IP em 15 minutos.
//
// O núcleo da decisão (`avaliarTentativas`) é uma função pura: recebe os
// horários das falhas e o "agora", devolve o veredito. Ela não toca no banco
// de propósito, e é o que `scripts/test-login-tentativas.ts` consegue testar
// em qualquer máquina, sem DATABASE_URL — as regras de janela deslizante são
// onde mora o erro sutil (contar uma falha a mais, liberar cedo demais), não
// no `findMany`.
//
// A contagem é por usuário + IP, nunca só por usuário: só por usuário,
// qualquer um trava a conta de qualquer outro de fora, e um bloqueio que o
// atacante controla é ferramenta dele, não defesa. Só por IP deixaria passar
// quem varre muitos usuários a partir do mesmo lugar.
import { prisma } from "@/lib/prisma";

/** Falhas toleradas dentro da janela antes de barrar. */
export const MAX_TENTATIVAS = 5;
/** Tamanho da janela deslizante. Passou disso, a falha não conta mais. */
export const JANELA_MINUTOS = 15;
/** Idade a partir da qual a linha é lixo e pode ser apagada. */
const HORAS_ATE_A_FAXINA = 24;

const MS_POR_MINUTO = 60_000;

export type EstadoBloqueio = {
  bloqueado: boolean;
  /** Quando volta a aceitar tentativa. `null` enquanto não está bloqueado. */
  liberaEm: Date | null;
  /** Quantas tentativas ainda cabem na janela. */
  restantes: number;
};

/** Falhas dentro da janela que termina em `instante`, da mais nova à mais velha. */
function naJanelaDe(falhas: Date[], instante: Date): Date[] {
  const inicio = instante.getTime() - JANELA_MINUTOS * MS_POR_MINUTO;
  return falhas
    .filter((f) => f.getTime() > inicio && f.getTime() <= instante.getTime())
    .sort((a, b) => b.getTime() - a.getTime());
}

/**
 * Descarta as falhas que aconteceram quando o balde JÁ estava cheio.
 *
 * Sem isso, insistir enquanto bloqueado renova o bloqueio: cada tentativa
 * barrada entra na conta, empurra a janela para frente e o que deveria durar
 * {@link JANELA_MINUTOS} minutos vira prisão perpétua para quem só está
 * teimando com a senha errada. Na prática o `authorize` nem chega a gravar
 * tentativa bloqueada — mas depender disso é deixar a garantia do lado de
 * fora desta função, onde ninguém a testa. Aqui ela vale sozinha.
 */
function falhasQueContam(falhas: Date[]): Date[] {
  const emOrdem = [...falhas].sort((a, b) => a.getTime() - b.getTime());
  const contadas: Date[] = [];
  for (const falha of emOrdem) {
    if (naJanelaDe(contadas, falha).length >= MAX_TENTATIVAS) continue;
    contadas.push(falha);
  }
  return contadas;
}

/**
 * Decisão pura. `falhas` são os horários das tentativas erradas (em qualquer
 * ordem); `agora` é o instante da tentativa atual.
 *
 * `liberaEm` sai do horário da MAX-ésima falha mais recente, não da última:
 * o que destrava é a falha mais antiga do lote sair da janela, e é ela que
 * derruba a contagem para baixo do limite.
 */
export function avaliarTentativas(falhas: Date[], agora: Date): EstadoBloqueio {
  const naJanela = naJanelaDe(falhasQueContam(falhas), agora);

  if (naJanela.length < MAX_TENTATIVAS) {
    return { bloqueado: false, liberaEm: null, restantes: MAX_TENTATIVAS - naJanela.length };
  }

  const maisAntigaQueSegura = naJanela[MAX_TENTATIVAS - 1]!;
  return {
    bloqueado: true,
    liberaEm: new Date(maisAntigaQueSegura.getTime() + JANELA_MINUTOS * MS_POR_MINUTO),
    restantes: 0,
  };
}

/** Minutos que faltam para liberar, arredondados para cima (nunca zero). */
export function minutosAteLiberar(liberaEm: Date, agora: Date): number {
  return Math.max(1, Math.ceil((liberaEm.getTime() - agora.getTime()) / MS_POR_MINUTO));
}

/**
 * "Marcelo " e "marcelo" são a mesma pessoa tentando entrar — e seriam dois
 * baldes de 5 tentativas se a chave fosse o texto cru.
 */
export function normalizarUsuario(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * IP de quem está tentando.
 *
 * Fonte primária é o `x-real-ip`: atrás da Vercel ele é preenchido pela
 * plataforma com o IP real da conexão, e o cliente não consegue sobrescrevê-lo.
 * O `x-forwarded-for` NÃO serve como fonte primária — o cliente controla o
 * COMEÇO da lista, então usar o primeiro valor deixava qualquer um trocar de
 * "IP" a cada requisição só mandando um header diferente, e escapar do limite
 * (o balde é por usuário+IP). Era a falha ALTA do pentest de 27/08/2026: a
 * única defesa de força-bruta do login virava opcional.
 *
 * Sem `x-real-ip`, cai no ÚLTIMO valor do `x-forwarded-for` — o hop mais
 * próximo, anexado pela infra à direita, não o forjável da ponta — e só então
 * no "desconhecido", que é conservador na direção certa (bloqueia demais, não
 * de menos). Uma trava global só por usuário NÃO foi adicionada de propósito:
 * ela deixaria um atacante trancar a conta de qualquer um de fora (ver o
 * cabeçalho deste arquivo).
 */
export function ipDaRequisicao(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const encaminhado = headers.get("x-forwarded-for");
  if (encaminhado) {
    const partes = encaminhado.split(",").map((p) => p.trim()).filter(Boolean);
    const ultimo = partes[partes.length - 1];
    if (ultimo) return ultimo;
  }
  return "desconhecido";
}

type Cliente = Pick<typeof prisma, "tentativaLogin">;

/** Estado atual do par usuário+IP, lido do banco. */
export async function estadoDoLogin(
  username: string,
  ip: string,
  agora = new Date(),
  cliente: Cliente = prisma,
): Promise<EstadoBloqueio> {
  const desde = new Date(agora.getTime() - JANELA_MINUTOS * MS_POR_MINUTO);
  const falhas = await cliente.tentativaLogin.findMany({
    where: { username: normalizarUsuario(username), ip, criadoEm: { gt: desde } },
    select: { criadoEm: true },
  });
  return avaliarTentativas(
    falhas.map((f) => f.criadoEm),
    agora,
  );
}

/**
 * Registra uma falha e aproveita para varrer o lixo antigo. A faxina é
 * oportunista (aqui, e não num cron próprio) porque a tabela só cresce quando
 * alguém erra a senha — criar mais uma rota agendada para um volume desses
 * seria mais peça para manter do que trabalho economizado.
 */
export async function registrarFalha(
  username: string,
  ip: string,
  cliente: Cliente = prisma,
): Promise<void> {
  await cliente.tentativaLogin.create({
    data: { username: normalizarUsuario(username), ip },
  });
  const limite = new Date(Date.now() - HORAS_ATE_A_FAXINA * 60 * MS_POR_MINUTO);
  await cliente.tentativaLogin
    .deleteMany({ where: { criadoEm: { lt: limite } } })
    .catch(() => {});
}

/** Entrou com a senha certa: o balde daquele usuário+IP zera. */
export async function limparTentativas(
  username: string,
  ip: string,
  cliente: Cliente = prisma,
): Promise<void> {
  await cliente.tentativaLogin.deleteMany({
    where: { username: normalizarUsuario(username), ip },
  });
}
