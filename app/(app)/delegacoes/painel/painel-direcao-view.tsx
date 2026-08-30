"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  CORES_PRAZO,
  EMOJI_SEMAFORO,
  ROTULO_SEMAFORO,
  STATUS_DEMANDA_BADGE,
  rotuloCriticidade,
  type Semaforo,
} from "@/lib/constants-delegacoes";
import type { DemandaPainelDirecao } from "@/lib/delegacoes/consultas";
import { cn } from "@/lib/utils";

// PAINEL DA DIREÇÃO — "como está TUDO", spec §9.2/§9.3.
//
// MUTÁVEL, pedido da Direção em 29/08/2026: o filtro de classificação da IA
// (`FACETA_IA` abaixo) não é uma lista escrita à mão — é `Set` construído a
// partir do que EXISTE nas demandas recebidas como prop. Hoje isso é sempre
// vazio (o classificador do PR 6 não existe ainda, então nenhuma
// `classificacaoIa` chega preenchida) — no dia em que passar a existir, os
// baldes que a IA de fato gerar aparecem aqui sozinhos, sem tocar em código.

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

const ORDEM_SEMAFORO: Record<Semaforo, number> = { VERMELHO: 0, AMARELO: 1, CINZA: 2, VERDE: 3 };
const CLASSES_SEMAFORO: Record<Semaforo, string> = {
  VERMELHO: "border-destructive/40 bg-destructive/5",
  AMARELO: "border-amber-500/40 bg-amber-50 dark:bg-amber-950/20",
  CINZA: "border-border",
  VERDE: "border-border",
};

function rotuloClassificacao(chave: string): string {
  // Sem tabela de tradução fixa: a chave que a IA gerar (snake/upper, o que
  // for) vira título por capitalização simples — inventar rótulo bonito para
  // um balde que ainda não existe seria documentar um contrato que não há.
  return chave
    .toLowerCase()
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function PainelDirecaoView({
  demandas,
  marcas,
}: {
  demandas: DemandaPainelDirecao[];
  marcas: { id: string; nome: string }[];
}) {
  const [busca, setBusca] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [criticidade, setCriticidade] = useState("");
  const [semaforos, setSemaforos] = useState<Set<Semaforo>>(new Set());
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const FACETA_IA = useMemo(
    () => [...new Set(demandas.map((d) => d.classificacaoIa).filter((v): v is string => !!v))].sort(),
    [demandas],
  );
  const [classificacao, setClassificacao] = useState("");

  const contagem = useMemo(() => {
    const c: Record<Semaforo, number> = { VERDE: 0, AMARELO: 0, VERMELHO: 0, CINZA: 0 };
    for (const d of demandas) {
      if (!mostrarHistorico && (d.status === "ENCERRADA" || d.status === "CANCELADA")) continue;
      c[d.semaforo]++;
    }
    return c;
  }, [demandas, mostrarHistorico]);

  function alternarSemaforo(s: Semaforo) {
    setSemaforos((atual) => {
      const novo = new Set(atual);
      if (novo.has(s)) novo.delete(s);
      else novo.add(s);
      return novo;
    });
  }

  const buscaLimpa = busca.trim().toLowerCase();
  const filtradas = demandas
    .filter((d) => mostrarHistorico || (d.status !== "ENCERRADA" && d.status !== "CANCELADA"))
    .filter((d) => semaforos.size === 0 || semaforos.has(d.semaforo))
    .filter((d) => !marcaId || marcas.find((m) => m.id === marcaId)?.nome === d.marcaNome)
    .filter((d) => !criticidade || String(d.criticidade) === criticidade)
    .filter((d) => !classificacao || d.classificacaoIa === classificacao)
    .filter(
      (d) =>
        !buscaLimpa ||
        d.responsavelNome.toLowerCase().includes(buscaLimpa) ||
        d.solicitanteNome.toLowerCase().includes(buscaLimpa) ||
        d.titulo.toLowerCase().includes(buscaLimpa),
    )
    // Exceções no topo (spec §9.2): vermelho e amarelo primeiro; dentro de
    // cada semáforo, o prazo mais apertado primeiro.
    .sort((a, b) => ORDEM_SEMAFORO[a.semaforo] - ORDEM_SEMAFORO[b.semaforo] || a.diasParaPrazo - b.diasParaPrazo);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Delegações</p>
        <h2 className="text-xl font-semibold tracking-tight">Painel</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas as demandas do grupo, prazo e responsável — o que está em dia e o que está
          atrasado.
        </p>
      </div>

      {/* O semáforo GERAL — a resposta em 4 números antes de abrir a lista. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(EMOJI_SEMAFORO) as Semaforo[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => alternarSemaforo(s)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              semaforos.has(s) ? "border-primary ring-1 ring-primary" : CLASSES_SEMAFORO[s],
            )}
          >
            <span className="text-lg font-semibold tabular-nums">
              {EMOJI_SEMAFORO[s]} {contagem[s]}
            </span>
            <span className="block text-xs text-muted-foreground">{ROTULO_SEMAFORO[s]}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Filtrar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className={CAMPO}
            placeholder="Pessoa ou título"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select className={CAMPO} value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
            <option value="">Todas as empresas</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <select className={CAMPO} value={criticidade} onChange={(e) => setCriticidade(e.target.value)}>
            <option value="">Toda criticidade</option>
            <option value="1">Crítica</option>
            <option value="2">Alta</option>
            <option value="3">Normal</option>
          </select>
          {/* Só aparece quando existe pelo menos uma classificação — "mutável"
              de verdade: sem dado da IA, sem filtro fantasma na tela. */}
          {FACETA_IA.length > 0 && (
            <select className={CAMPO} value={classificacao} onChange={(e) => setClassificacao(e.target.value)}>
              <option value="">Toda classificação</option>
              {FACETA_IA.map((c) => (
                <option key={c} value={c}>
                  {rotuloClassificacao(c)}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={mostrarHistorico}
              onChange={(e) => setMostrarHistorico(e.target.checked)}
            />
            Mostrar encerradas e canceladas
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtradas.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {demandas.length === 0
                ? "Nenhuma demanda no sistema ainda."
                : "Nenhuma demanda bate com o filtro."}
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {filtradas.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div
                    className={cn(
                      "w-16 shrink-0 text-sm font-semibold tabular-nums",
                      d.status === "ENTREGUE" || d.status === "ENCERRADA"
                        ? "text-muted-foreground"
                        : CORES_PRAZO[d.severidade],
                    )}
                  >
                    {EMOJI_SEMAFORO[d.semaforo]}{" "}
                    {d.diasParaPrazo < 0 ? `${Math.abs(d.diasParaPrazo)}d` : `${d.diasParaPrazo}d`}
                    <span className="block text-[10px] font-normal text-muted-foreground">{d.prazoTexto}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link href={d.href} className="text-sm font-medium text-foreground hover:underline">
                      {d.titulo}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      de <span className="text-foreground">{d.solicitanteNome}</span> para{" "}
                      <span className="text-foreground">{d.responsavelNome}</span>
                      {" · "}
                      {rotuloCriticidade(d.criticidade)}
                      {d.marcaNome && <> · {d.marcaNome}</>}
                      {d.repactuada && <> · prazo repactuado</>}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {d.classificacaoIa && (
                      <span
                        className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                        title={
                          d.confiancaIa !== null ? `Confiança: ${Math.round(d.confiancaIa * 100)}%` : undefined
                        }
                      >
                        {rotuloClassificacao(d.classificacaoIa)}
                      </span>
                    )}
                    {d.nivelEscalonamento > 0 && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {d.nivelEscalonamento}ª cobrança
                      </span>
                    )}
                    <StatusBadge status={d.status} map={STATUS_DEMANDA_BADGE} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
