import Link from "next/link";
import { ArrowRight, CheckCircle2, FileUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LacunaDaBase } from "@/lib/dashboard";

/**
 * "O que falta preencher" — o terceiro bloco da tela inicial da empresa.
 *
 * A tela tinha só números e pendências, e sobrava metade do espaço vertical.
 * Em vez de encher com atividade recente (que hoje mostraria resíduo de teste,
 * já que a trilha tem 9 registros), este bloco ataca o problema real: o
 * sistema está pronto na frente do dado.
 *
 * Cada linha mostra a barra do que JÁ foi preenchido, não do que falta — a
 * mesma informação, mas lida como progresso em vez de dívida.
 */
export function LacunasView({
  empresaId,
  empresasNoEscopo,
  ativos,
  lacunas,
}: {
  empresaId: string;
  /** CNPJs contados aqui — o mesmo escopo do topo da tela (marca, grupo
   *  inteiro ou filtro da URL), para o link bater com o número mostrado. */
  empresasNoEscopo: string[];
  ativos: number;
  lacunas: LacunaDaBase[];
}) {
  if (ativos === 0) return null;

  if (lacunas.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Preenchimento da base
        </h2>
        <Card>
          <CardContent className="flex items-center gap-3 py-5">
            <CheckCircle2 className="size-5 text-success" />
            <div>
              <p className="font-medium">Base completa</p>
              <p className="text-sm text-muted-foreground">
                As {ativos} fichas ativas têm salário, admissão, setor, CPF e Telegram
                preenchidos. Todos os módulos funcionam com dado de verdade.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Preenchimento da base
        </h2>
        <Link
          href={`/rh/${empresaId}/importacoes`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <FileUp className="size-3" />
          Preencher por planilha
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">
            O sistema já faz o trabalho; falta o dado. Enquanto estes campos estiverem em
            branco, os módulos que dependem deles mostram número parcial.
          </p>

          <ul className="space-y-1">
            {lacunas.map((l) => {
              const preenchidas = ativos - l.faltando;
              const pct = Math.round((preenchidas / ativos) * 100);
              return (
                // Cada lacuna leva à lista já filtrada em quem tem o campo
                // vazio. Antes o bloco só informava, e quem quisesse resolver
                // tinha de abrir colaboradores e caçar um a um — o número
                // apontava o problema e escondia quem era.
                <li key={l.chave}>
                  <Link
                    // Leva o escopo junto: a contagem é da marca, mas a lista
                    // de colaboradores mostra todas as empresas que o usuário
                    // enxerga. Sem isto o número não bateria com a tela.
                    href={`/rh/${empresaId}/colaboradores?empresas=${empresasNoEscopo.join(",")}&lacuna=${l.chave}`}
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
                  {/* A barra mostra o PREENCHIDO, não o que falta: a mesma
                      informação lida como progresso, não como dívida. */}
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
