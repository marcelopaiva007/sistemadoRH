import type { StatusBadgeMap } from "@/components/status-badge";
import {
  CRITICIDADES,
  EVIDENCIAS_EXIGIDAS,
  PERIODICIDADES_RETORNO,
  ROTULO_CRITICIDADE,
  STATUS_DEMANDA,
  type Criticidade,
  type StatusDemanda,
} from "@/lib/delegacoes/estados";

// A camada de APRESENTAÇÃO do módulo Delegações: rótulo em português, variante
// de badge, opções de `<select>`. O domínio (o que é válido, quem pode o quê)
// mora em lib/delegacoes/estados.ts e não sabe que existe tela.
//
// Tudo aqui DERIVA das constantes de lá — nunca redigita os valores. Foi assim
// que este repo evitou o problema clássico de um `<option>` oferecer
// "2x_semana" enquanto o backend só aceita "DUAS_POR_SEMANA": se o domínio
// ganhar um valor novo, o TypeScript exige o rótulo aqui no mesmo commit
// (os Record<...> abaixo são totais, não parciais).

export const ROTULO_STATUS: Record<StatusDemanda, string> = {
  RASCUNHO: "Rascunho",
  ENVIADA: "Aguardando aceite",
  ACEITA: "Aceita",
  EM_EXECUCAO: "Em execução",
  ENTREGUE: "Entregue — aguarda seu aceite",
  ENCERRADA: "Encerrada",
  CANCELADA: "Cancelada",
};

/**
 * O semáforo da spec §9.3 traduzido para as variantes de Badge que o sistema
 * já tem: ⚪ aguardando aceite · 🟢 no prazo · 🔴 atrasada · 🟡 em risco.
 *
 * ATENÇÃO: o badge mostra o ESTADO DO COMBINADO (em que ponto da máquina a
 * demanda está), não a urgência. Atraso e risco são ortogonais ao status — vêm
 * do prazo e da flag `emRisco`, e aparecem no número colorido à esquerda da
 * linha e no `<StatusBadge>` de risco ao lado. Misturar as duas coisas num
 * badge só foi o que fez a Central de Pendências precisar de retrabalho.
 */
export const STATUS_DEMANDA_BADGE: StatusBadgeMap<StatusDemanda> = {
  RASCUNHO: { label: ROTULO_STATUS.RASCUNHO, variant: "outline" },
  ENVIADA: { label: ROTULO_STATUS.ENVIADA, variant: "secondary" },
  ACEITA: { label: ROTULO_STATUS.ACEITA, variant: "default" },
  EM_EXECUCAO: { label: ROTULO_STATUS.EM_EXECUCAO, variant: "default" },
  ENTREGUE: { label: ROTULO_STATUS.ENTREGUE, variant: "secondary" },
  ENCERRADA: { label: ROTULO_STATUS.ENCERRADA, variant: "outline" },
  CANCELADA: { label: ROTULO_STATUS.CANCELADA, variant: "outline" },
};

const ROTULO_EVIDENCIA: Record<(typeof EVIDENCIAS_EXIGIDAS)[number], string> = {
  LINK: "Link",
  ARQUIVO: "Arquivo anexado",
  NUMERO: "Número",
  TEXTO: "Texto",
};

/** A pergunta que o formulário faz de verdade: "como você vai provar?". */
const AJUDA_EVIDENCIA: Record<(typeof EVIDENCIAS_EXIGIDAS)[number], string> = {
  LINK: "o endereço de onde está o que foi feito",
  ARQUIVO: "o documento anexado ao sistema",
  NUMERO: "o valor, a quantidade ou o número do documento",
  TEXTO: "a resposta escrita",
};

const ROTULO_PERIODICIDADE: Record<(typeof PERIODICIDADES_RETORNO)[number], string> = {
  DIARIO: "Todo dia",
  DUAS_POR_SEMANA: "Duas vezes por semana",
  SEMANAL: "Uma vez por semana",
  SO_ENTREGA: "Só quando entregar",
  SO_ATRASO: "Só se atrasar",
};

export type Opcao = { value: string; label: string; ajuda?: string };

/** As opções dos `<select>`, na ordem do domínio. */
export const OPCOES_EVIDENCIA: Opcao[] = EVIDENCIAS_EXIGIDAS.map((v) => ({
  value: v,
  label: ROTULO_EVIDENCIA[v],
  ajuda: AJUDA_EVIDENCIA[v],
}));

export const OPCOES_PERIODICIDADE: Opcao[] = PERIODICIDADES_RETORNO.map((v) => ({
  value: v,
  label: ROTULO_PERIODICIDADE[v],
}));

export const OPCOES_CRITICIDADE: Opcao[] = CRITICIDADES.map((c) => ({
  value: String(c),
  label: ROTULO_CRITICIDADE[c],
}));

export const OPCOES_STATUS: Opcao[] = STATUS_DEMANDA.map((s) => ({
  value: s,
  label: ROTULO_STATUS[s],
}));

export function rotuloEvidencia(v: string): string {
  return ROTULO_EVIDENCIA[v as (typeof EVIDENCIAS_EXIGIDAS)[number]] ?? v;
}
export function rotuloPeriodicidade(v: string): string {
  return ROTULO_PERIODICIDADE[v as (typeof PERIODICIDADES_RETORNO)[number]] ?? v;
}
export function rotuloCriticidade(v: number): string {
  return ROTULO_CRITICIDADE[v as Criticidade] ?? String(v);
}

// ── A linha do tempo ────────────────────────────────────────────────────────

/**
 * O que cada evento do log imutável diz, em português de quem lê — não o nome
 * da constante. Fica ao lado dos demais rótulos de propósito: o dia em que a
 * máquina ganhar um evento novo, o TypeScript cobra a frase aqui.
 *
 * Os eventos do motor de cobrança (COBRANCA_ENVIADA, ESCALONADA,
 * ACEITE_COBRADO) entram no PR 5, junto com quem os grava.
 */
export const ROTULO_EVENTO: Record<string, string> = {
  CRIADA: "Demanda criada",
  ENVIADA: "Enviada ao responsável",
  ACEITA: "Aceita pelo responsável",
  EXECUCAO_INICIADA: "Execução começou",
  REPACTUADA: "Prazo repactuado",
  ENTREGUE: "Entregue, com evidência",
  DEVOLVIDA: "Devolvida pelo solicitante",
  ENCERRADA: "Encerrada por quem pediu",
  CANCELADA: "Cancelada",
  EM_RISCO_LIGADO: "Marcada em risco",
  EM_RISCO_DESLIGADO: "Risco removido",
};

/**
 * Severidade do prazo — o número colorido à esquerda da linha, mesmo idioma da
 * Central de Pendências (`lib/processos/pendencias.ts`). DERIVADA de prazo +
 * criticidade, nunca digitada: severidade que alguém escolhe é severidade que
 * envelhece errado.
 */
export type SeveridadePrazo = "ATRASADA" | "CRITICA" | "ALTA" | "ATENCAO";

export function severidadeDoPrazo(diasRestantes: number, criticidade: number): SeveridadePrazo {
  if (diasRestantes < 0) return "ATRASADA";
  // Uma demanda crítica entra em alerta antes: a régua de cobrança da spec §6.2
  // toca nela em 40% do prazo, contra 75% da normal.
  if (criticidade === 1 && diasRestantes <= 2) return "CRITICA";
  if (diasRestantes === 0) return "CRITICA";
  if (diasRestantes <= 2) return "ALTA";
  return "ATENCAO";
}

/** As cores canônicas do sistema, iguais às da Central de Pendências. */
export const CORES_PRAZO: Record<SeveridadePrazo, string> = {
  ATRASADA: "text-destructive",
  CRITICA: "text-destructive",
  ALTA: "text-amber-600 dark:text-amber-500",
  ATENCAO: "text-muted-foreground",
};
