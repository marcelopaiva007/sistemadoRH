import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LacunaDeDesligado } from "@/lib/dashboard";

/**
 * "O que falta na saída" — irmã de `LacunasView`, nunca uma linha dentro dela.
 *
 * Denominador próprio (total de DESLIGADOS, não de ativos) e link próprio
 * (`?status=inativos`, senão a lista de colaboradores abriria vazia — o
 * padrão da tela é mostrar só ativos). Ver `lib/dashboard.ts::lacunasDosDesligados`.
 */
export function LacunasDosDesligadosView({
  empresaId,
  empresasDaMarca,
  desligados,
  lacunas,
}: {
  empresaId: string;
  empresasDaMarca: string[];
  desligados: number;
  lacunas: LacunaDeDesligado[];
}) {
  if (desligados === 0 || lacunas.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Preenchimento da saída
      </h2>
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">
            {desligados} desligados no escopo. Sem data e motivo, todo indicador de turnover
            descreve o sintoma sem chegar na causa.
          </p>
          <ul className="space-y-1">
            {lacunas.map((l) => {
              const preenchidos = desligados - l.faltando;
              const pct = Math.round((preenchidos / desligados) * 100);
              return (
                <li key={l.chave}>
                  <Link
                    href={`/rh/${empresaId}/colaboradores?empresas=${empresasDaMarca.join(",")}&status=inativos&lacuna=${l.chave}`}
                    className="group block space-y-1 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span>
                        <span className="font-medium tabular-nums">{l.faltando}</span>{" "}
                        <span className="text-muted-foreground group-hover:text-foreground">
                          {l.rotulo}
                        </span>
                        <ArrowRight className="ml-1 inline size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pct}% preenchido
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${l.rotulo}: ${pct}% preenchido`}
                    >
                      <div
                        className={pct === 0 ? "h-full bg-warning" : "h-full bg-primary"}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{l.consequencia}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
