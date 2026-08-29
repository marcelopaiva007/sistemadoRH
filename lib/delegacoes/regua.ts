import type { Criticidade } from "@/lib/delegacoes/estados";

// A RÉGUA DE COBRANÇA (spec §6.2) — motor puro, sem banco: dado o retrato de
// UMA demanda (quando foi enviada, o prazo VIGENTE, a criticidade), devolve a
// lista COMPLETA de degraus — cada um com SEU momento — do primeiro toque
// antes do prazo até o D+3 depois dele. `nivelEscalonamento` (coluna da
// Demanda) é só um ÍNDICE nesta lista: "já disparei os N primeiros degraus".
//
// POR QUE ISTO "SE ADAPTA AO PRAZO" (pedido da Direção em 29/08/2026): os
// degraus de antes do prazo são PERCENTUAIS do tempo decorrido desde o envio
// até o prazo — não horários fixos. Uma demanda de 2 dias e uma de 20 dias
// para a mesma criticidade cobram em proporções iguais, momentos diferentes.
// E como a lista é recalculada TODA VEZ a partir do `prazo` atual, uma
// repactuação (que move `prazo`) desloca sozinha todos os degraus futuros —
// sem precisar apagar nem recriar nada, só reler a régua com o prazo novo.
//
// D+0..D+3 são deslocamentos de HORAS a partir do prazo (prazo é sempre
// 23:59:59 de Brasília do dia escolhido — ver `prazoDoFormulario`), não dias
// de calendário: o Brasil não observa horário de verão desde 2019, então
// "prazo + 25h" cai perto da mesma hora do dia seguinte, sem o risco de pular
// ou repetir uma hora que a conta em dias-de-calendário teria.

export type Degrau = {
  /** Identifica o degrau nos logs e testes — nunca muda de posição na lista. */
  chave: string;
  /** true = ainda dentro do prazo (lembrete); false = já atrasada (cobrança). */
  antesDoPrazo: boolean;
  canais: ReadonlyArray<"TELEGRAM" | "EMAIL">;
  /** Manda cópia à Direção no e-mail deste degrau (não é o mesmo que notificar). */
  ccDirecao: boolean;
  /** Notifica a Direção diretamente (Telegram + e-mail próprio), não só cópia. */
  notificaDirecao: boolean;
  /** Liga o semáforo vermelho no painel — spec: "Painel vermelho + notificação". */
  painelVermelho: boolean;
  /** Tom mais formal na mensagem — D+1 em diante, sempre. */
  formal: boolean;
};

const HORA = 3_600_000;

/**
 * A tabela da spec §6.2, traduzida em degraus. Os `pct` de antes do prazo são
 * do tempo DECORRIDO (envio→prazo); os `horasApos` de depois são a partir do
 * prazo. Um `pct` maior que 1 nunca acontece — é o prazo em si.
 */
type ConfigCriticidade = { antes: number[]; apos: Omit<Degrau, "chave" | "antesDoPrazo">[] };

const TABELA: Record<Criticidade, ConfigCriticidade> = {
  1: {
    // 40%, 70%, 90%, véspera (ver montarRegua — véspera é calculada à parte
    // e só entra se render um degrau distinto dos 90%).
    antes: [0.4, 0.7, 0.9],
    apos: [
      { canais: ["TELEGRAM", "EMAIL"], ccDirecao: false, notificaDirecao: false, painelVermelho: false, formal: false }, // D+0
      { canais: ["TELEGRAM", "EMAIL"], ccDirecao: true, notificaDirecao: false, painelVermelho: false, formal: true }, // D+1
      { canais: ["TELEGRAM", "EMAIL"], ccDirecao: true, notificaDirecao: true, painelVermelho: true, formal: true }, // D+2
      { canais: ["TELEGRAM", "EMAIL"], ccDirecao: true, notificaDirecao: true, painelVermelho: true, formal: true }, // D+3 (pauta de reunião — a Direção já foi notificada em D+2; aqui reforça)
    ],
  },
  2: {
    antes: [0.6, 0.9],
    apos: [
      { canais: ["TELEGRAM"], ccDirecao: false, notificaDirecao: false, painelVermelho: false, formal: false }, // D+0
      { canais: ["TELEGRAM", "EMAIL"], ccDirecao: false, notificaDirecao: false, painelVermelho: false, formal: true }, // D+1
      { canais: ["EMAIL"], ccDirecao: false, notificaDirecao: false, painelVermelho: false, formal: true }, // D+2 (e-mail formal)
      { canais: ["TELEGRAM", "EMAIL"], ccDirecao: false, notificaDirecao: false, painelVermelho: true, formal: true }, // D+3 (painel vermelho)
    ],
  },
  3: {
    antes: [0.75],
    apos: [
      { canais: ["TELEGRAM"], ccDirecao: false, notificaDirecao: false, painelVermelho: false, formal: false }, // D+0
      { canais: ["TELEGRAM"], ccDirecao: false, notificaDirecao: false, painelVermelho: false, formal: true }, // D+1
      { canais: ["TELEGRAM", "EMAIL"], ccDirecao: false, notificaDirecao: false, painelVermelho: false, formal: true }, // D+2
      { canais: ["EMAIL"], ccDirecao: false, notificaDirecao: false, painelVermelho: true, formal: true }, // D+3 (e-mail formal)
    ],
  },
};

export type DegrauComMomento = Degrau & { momento: Date };

/**
 * A lista completa de degraus desta demanda, ordenada por `momento`. Pura:
 * mesmo (enviadaEm, prazo, criticidade) sempre devolve a mesma lista — é o
 * que torna o motor auditável (`por que cobrou às 14h de terça?` responde
 * sozinho) em vez de uma IA decidindo cadência a cada rodada.
 *
 * `enviadaEm` nulo (RASCUNHO) devolve lista vazia — nada a cobrar antes de a
 * demanda existir de verdade para o responsável.
 */
export function montarRegua(demanda: {
  criticidade: number;
  enviadaEm: Date | null;
  prazo: Date;
}): DegrauComMomento[] {
  const { criticidade, enviadaEm, prazo } = demanda;
  if (!enviadaEm) return [];
  const cfg = TABELA[criticidade as Criticidade];
  if (!cfg) return [];

  const duracaoTotal = prazo.getTime() - enviadaEm.getTime();
  // Prazo já vencido no envio (repactuação para trás, ou o formulário deixou
  // passar) — sem janela para lembretes graduais; a régua começa direto no
  // D+0 quando o cron rodar.
  const antesValidos = duracaoTotal > 0 ? cfg.antes : [];

  const degraus: DegrauComMomento[] = antesValidos.map((pct) => ({
    chave: `antes-${Math.round(pct * 100)}`,
    antesDoPrazo: true,
    canais: ["TELEGRAM"] as const,
    ccDirecao: false,
    notificaDirecao: false,
    painelVermelho: false,
    formal: false,
    momento: new Date(enviadaEm.getTime() + duracaoTotal * pct),
  }));

  // Véspera (só criticidade 1): 24h antes do prazo. Some com o degrau dos 90%
  // quando os dois caem a menos de 6h um do outro — dois toques quase juntos
  // não são "adaptar ao prazo", são spam do mesmo aviso.
  if (criticidade === 1) {
    const vespera = new Date(prazo.getTime() - 24 * HORA);
    const ultimoAntes = degraus[degraus.length - 1];
    const colide = ultimoAntes && Math.abs(vespera.getTime() - ultimoAntes.momento.getTime()) < 6 * HORA;
    if (vespera.getTime() > enviadaEm.getTime() && !colide) {
      degraus.push({
        chave: "vespera",
        antesDoPrazo: true,
        canais: ["TELEGRAM"] as const,
        ccDirecao: false,
        notificaDirecao: false,
        painelVermelho: false,
        formal: false,
        momento: vespera,
      });
    }
  }

  cfg.apos.forEach((degrau, i) => {
    degraus.push({
      ...degrau,
      chave: `d${i}`,
      antesDoPrazo: false,
      momento: new Date(prazo.getTime() + i * 24 * HORA + HORA), // +1h de folga do instante exato do prazo
    });
  });

  return degraus;
}

/**
 * O degrau que o cron deve disparar AGORA, ou null se não há nenhum pendente.
 * `nivel` é `Demanda.nivelEscalonamento` — o índice do PRÓXIMO degrau a
 * cumprir. Nunca pula degrau: se o cron ficou fora do ar e passaram três
 * degraus, o próximo tick dispara o de nivel N (não o mais recente) — a
 * pessoa recebe o histórico completo da régua, não só o toque mais forte.
 */
export function proximoDegrau(
  demanda: { criticidade: number; enviadaEm: Date | null; prazo: Date; nivelEscalonamento: number },
  agora: Date,
): DegrauComMomento | null {
  const regua = montarRegua(demanda);
  const proximo = regua[demanda.nivelEscalonamento];
  if (!proximo) return null;
  return proximo.momento.getTime() <= agora.getTime() ? proximo : null;
}

/**
 * Quando o PRÓXIMO degrau vence — para gravar em `Demanda.proximaCobranca`,
 * o campo que o cron consulta (`proximaCobranca <= agora`) sem precisar
 * recalcular a régua inteira a cada varredura. Null quando a régua acabou
 * (D+3 já disparado): a demanda para de aparecer na consulta do cron.
 */
export function proximaCobranca(
  demanda: { criticidade: number; enviadaEm: Date | null; prazo: Date; nivelEscalonamento: number },
): Date | null {
  const regua = montarRegua(demanda);
  return regua[demanda.nivelEscalonamento]?.momento ?? null;
}
