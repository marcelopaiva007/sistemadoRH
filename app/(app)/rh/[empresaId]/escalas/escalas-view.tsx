"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { definirTurno, copiarSemana } from "@/lib/actions/rh-escala";
import type { OpcaoCatalogo } from "@/lib/catalogos";

type Colaborador = { id: string; nome: string; setorNome: string };
type Setor = { id: string; nome: string };
const CINZA_PADRAO = "#cbd5e1";

const NOMES_DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function formatarDiaCurto(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export function EscalasView({
  empresaId,
  inicioSemanaISO,
  semanaAnteriorISO,
  semanaSeguinteISO,
  hojeISO,
  dias,
  setores,
  setorSelecionado,
  colaboradores,
  turnoPorCelula,
  turnosDisponiveis,
}: {
  empresaId: string;
  inicioSemanaISO: string;
  semanaAnteriorISO: string;
  semanaSeguinteISO: string;
  hojeISO: string;
  dias: string[];
  setores: Setor[];
  setorSelecionado: string;
  colaboradores: Colaborador[];
  turnoPorCelula: Record<string, string>;
  turnosDisponiveis: OpcaoCatalogo[];
}) {
  const corDoTurno = (v: string | null) =>
    (v && turnosDisponiveis.find((t) => t.value === v)?.cor) || CINZA_PADRAO;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendente, iniciarTransicao] = useTransition();
  const [copiando, setCopiando] = useState(false);

  function irParaSemana(inicioISO: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("semana", inicioISO);
    router.push(`?${params.toString()}`);
  }

  function mudarSetor(setorId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (setorId) params.set("setor", setorId);
    else params.delete("setor");
    router.push(`?${params.toString()}`);
  }

  async function aoMudarCelula(colaboradorId: string, dataISO: string, turno: string) {
    const resultado = await definirTurno(empresaId, colaboradorId, dataISO, turno);
    if (resultado.ok) {
      iniciarTransicao(() => router.refresh());
    } else {
      toast.error(resultado.error);
    }
  }

  async function copiarSemanaAnterior() {
    setCopiando(true);
    const resultado = await copiarSemana(empresaId, semanaAnteriorISO, inicioSemanaISO);
    setCopiando(false);
    if (resultado.ok) {
      toast.success("Semana anterior copiada.");
      iniciarTransicao(() => router.refresh());
    } else {
      toast.error(resultado.error);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Escalas</h1>
        <p className="text-sm text-muted-foreground">
          Quem está de plantão em cada dia, por setor. Clique numa célula para atribuir o turno.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => irParaSemana(semanaAnteriorISO)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => irParaSemana(hojeISO)}>
            {formatarDiaCurto(dias[0])} — {formatarDiaCurto(dias[6])}
          </Button>
          <Button variant="outline" size="icon" onClick={() => irParaSemana(semanaSeguinteISO)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" disabled={copiando} onClick={copiarSemanaAnterior}>
            <Copy className="size-4" />
            {copiando ? "Copiando..." : "Copiar semana anterior"}
          </Button>
        </div>
        <select
          value={setorSelecionado}
          onChange={(e) => mudarSetor(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grade da semana</CardTitle>
          <CardDescription>
            <div className="flex flex-wrap gap-3">
              {turnosDisponiveis.map((t) => (
                <span key={t.value} className="inline-flex items-center gap-1.5 text-xs">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: t.cor || CINZA_PADRAO }} />
                  {t.label}
                </span>
              ))}
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className={pendente ? "opacity-60 transition-opacity" : ""}>
          {colaboradores.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum colaborador ativo {setorSelecionado ? "neste setor" : "nesta empresa"}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-48 border-b bg-background px-2 py-2 text-left font-medium">
                      Colaborador
                    </th>
                    {dias.map((d, i) => (
                      <th key={d} className="min-w-28 border-b px-2 py-2 text-center font-medium">
                        <div>{NOMES_DIA[i]}</div>
                        <div className="text-xs font-normal text-muted-foreground">{formatarDiaCurto(d)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colaboradores.map((c, idx) => {
                    const mudaSetor = idx === 0 || colaboradores[idx - 1].setorNome !== c.setorNome;
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="sticky left-0 z-10 bg-background px-2 py-1.5">
                          <div className="font-medium">{c.nome}</div>
                          {mudaSetor && <div className="text-xs text-muted-foreground">{c.setorNome}</div>}
                        </td>
                        {dias.map((d) => {
                          const chave = `${c.id}::${d}T00:00:00.000Z`;
                          const turnoAtual = turnoPorCelula[chave] ?? "";
                          return (
                            <td key={d} className="px-1 py-1 text-center">
                              <select
                                value={turnoAtual}
                                onChange={(e) => aoMudarCelula(c.id, d, e.target.value)}
                                className="h-8 w-full rounded-md border-0 px-1 text-center text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                style={{
                                  background: turnoAtual ? `${corDoTurno(turnoAtual)}33` : "transparent",
                                  color: turnoAtual ? corDoTurno(turnoAtual) : "var(--muted-foreground)",
                                }}
                              >
                                <option value="">—</option>
                                {turnosDisponiveis.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
