import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { CORES_PRAZO, STATUS_DEMANDA_BADGE, rotuloCriticidade } from "@/lib/constants-delegacoes";
import type { DemandaNaTela } from "@/lib/delegacoes/consultas";
import { cn } from "@/lib/utils";

/**
 * A linha de uma demanda nas duas listas — o mesmo desenho da Central de
 * Pendências (`app/(app)/processos/[empresaId]/pendencias-view.tsx`).
 *
 * O SEMÁFORO É O NÚMERO COLORIDO à esquerda, não um pontinho: quantos dias
 * faltam (ou de atraso), na cor da severidade. Foi a escolha da Central e
 * funciona porque responde às duas perguntas de uma vez — "corre?" e "quanto?".
 *
 * Server component de propósito: a linha não tem estado nem ação. Toda ação
 * mora no detalhe, que é onde a pessoa vê o critério de aceite antes de
 * decidir — aceitar uma demanda sem ler o combinado é o hábito que o módulo
 * existe para não criar.
 */
export function LinhaDemanda({
  d,
  /** "responsavel" nas Recebidas (quem cobra), "solicitante" nas Delegadas. */
  mostrar,
}: {
  d: DemandaNaTela;
  mostrar: "solicitante" | "responsavel";
}) {
  const atrasada = d.diasParaPrazo < 0;
  const pessoa = mostrar === "solicitante" ? d.solicitanteNome : d.responsavelNome;
  const rotuloPessoa = mostrar === "solicitante" ? "de" : "com";

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <div className={cn("w-16 shrink-0 text-sm font-semibold tabular-nums", CORES_PRAZO[d.severidade])}>
        {atrasada ? `${Math.abs(d.diasParaPrazo)}d` : `${d.diasParaPrazo}d`}
        <span className="block text-[10px] font-normal text-muted-foreground">
          {atrasada ? "atrasada" : d.prazoTexto}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <Link href={d.href} className="text-sm font-medium text-foreground hover:underline">
          {d.titulo}
        </Link>
        {d.descricao && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.descricao}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {rotuloPessoa} <span className="text-foreground">{pessoa}</span>
          {" · "}
          {rotuloCriticidade(d.criticidade)}
          {d.marcaNome && <> · {d.marcaNome}</>}
          {d.area && <> · {d.area}</>}
          {/* Repactuada é fato do histórico, não status: mostra sem colorir —
              pedir mais prazo com motivo é comportamento previsto, não falta. */}
          {d.repactuada && <> · prazo repactuado</>}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {/* Risco é ORTOGONAL ao status (spec §4): os dois badges convivem, e é
            por isso que não há um badge só combinando as duas coisas. */}
        {d.emRisco && (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            em risco
          </span>
        )}
        <StatusBadge status={d.status} map={STATUS_DEMANDA_BADGE} />
      </div>
    </div>
  );
}
