"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/constants";

/**
 * A fila de decisão (arquétipo B do handoff Modernist): Aprovações, Ajustes de
 * ponto, Mensagens, Avisos ao gestor, Delegações.
 *
 * O desenho responde três perguntas por linha, na mesma ordem sempre — QUEM ·
 * O QUÊ · desde quando — e põe os dois botões no fim. Antes cada fila era um
 * Card com cabeçalho e descrição, e as quatro filas da Central de aprovações
 * empilhavam quatro molduras: para achar o item mais antigo era preciso rolar
 * as quatro e comparar de cabeça. Agora é uma lista só, com o tipo como
 * etiqueta e um filtro segmentado com as contagens no cabeçalho.
 *
 * O que NÃO mudou: a recusa continua abrindo o campo de motivo inline
 * (obrigatório em documento e ponto), e cada fila continua nomeando a própria
 * ação ("Conferir"/"Devolver" não é "Aprovar"/"Reprovar").
 */
export type ItemDeDecisao = {
  id: string;
  /** Chave do filtro segmentado. */
  tipo: string;
  /** O que a etiqueta mostra — pode ser mais específico que o tipo. */
  etiqueta: string;
  /** Quando entrou na fila; vira "há N dias". */
  desde: Date;
  quem: string;
  quemHref?: string;
  /** Setor · empresa, em cinza ao lado do nome. */
  contexto?: string;
  /** A linha do meio: o que está sendo pedido. */
  oQue: string;
  /** Linhas de apoio, 12px. Vazias são descartadas. */
  detalhes?: (string | null | undefined)[];
  anexo?: { href: string; nome: string } | null;
  rotuloAprovar?: string;
  rotuloReprovar?: string;
  motivoObrigatorio?: boolean;
  onDecidir: (decisao: "APROVADA" | "REPROVADA", motivo?: string) => Promise<ActionResult>;
};

function diasDesde(data: Date): string {
  const dias = Math.floor((Date.now() - new Date(data).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function FilaDeDecisao({
  itens,
  tipos,
  lateral,
  vazia = "Nada esperando decisão no momento.",
}: {
  itens: ItemDeDecisao[];
  /** Os segmentos do filtro, na ordem. A contagem sai dos próprios itens. */
  tipos: { valor: string; label: string }[];
  /** Coluna da direita: decisões recentes, cartão de regra. */
  lateral?: ReactNode;
  vazia?: string;
}) {
  const [filtro, setFiltro] = useState<string>("todas");
  const visiveis = filtro === "todas" ? itens : itens.filter((i) => i.tipo === filtro);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        {itens.length > 0 && (
          <div
            role="group"
            aria-label="Filtrar por tipo"
            className="flex flex-wrap items-stretch gap-px border-b-2 border-border pb-3"
          >
            {[{ valor: "todas", label: "Todas" }, ...tipos].map((t) => {
              const n = t.valor === "todas" ? itens.length : itens.filter((i) => i.tipo === t.valor).length;
              return (
                <button
                  key={t.valor}
                  type="button"
                  aria-pressed={filtro === t.valor}
                  onClick={() => setFiltro(t.valor)}
                  className={cn(
                    "border px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors",
                    filtro === t.valor
                      ? "border-primary bg-primary font-extrabold text-primary-foreground"
                      : "border-input text-muted-foreground hover:bg-foreground/7 hover:text-foreground",
                  )}
                >
                  {t.label} · <span className="tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {visiveis.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {itens.length === 0 ? vazia : "Nenhum item deste tipo."}
          </p>
        ) : (
          <ul>
            {visiveis.map((item) => (
              <ItemDaFila key={`${item.tipo}:${item.id}`} item={item} />
            ))}
          </ul>
        )}
      </div>

      {lateral && <aside className="min-w-0 lg:border-l-2 lg:border-border lg:pl-6">{lateral}</aside>}
    </div>
  );
}

function ItemDaFila({ item }: { item: ItemDeDecisao }) {
  const [motivo, setMotivo] = useState("");
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const rotuloAprovar = item.rotuloAprovar ?? "Aprovar";
  const rotuloReprovar = item.rotuloReprovar ?? "Reprovar";

  async function decidir(decisao: "APROVADA" | "REPROVADA", comMotivo?: string) {
    setEnviando(true);
    const resultado = await item.onDecidir(decisao, comMotivo);
    setEnviando(false);
    if (resultado.ok) {
      // Simétrico aos dois rótulos: "Devolvido ao colaborador" mentia em
      // Férias, e num ajuste de ponto rejeitado mentiria de novo.
      toast.success(decisao === "APROVADA" ? `${rotuloAprovar} com sucesso.` : `${rotuloReprovar} com sucesso.`);
      setPedindoMotivo(false);
      setMotivo("");
    } else {
      toast.error(resultado.error);
    }
  }

  const detalhes = (item.detalhes ?? []).filter(Boolean) as string[];

  return (
    <li className="border-b border-border">
      <div className="grid grid-cols-1 items-start gap-x-4 gap-y-2 py-3.5 sm:grid-cols-[120px_1fr_auto]">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
            {item.etiqueta}
          </p>
          {/* O "há N dias" é calculado no cliente a partir de `desde`: o
              servidor renderiza o mesmo texto, mas a virada de meia-noite
              entre um e outro produziria contagens diferentes. */}
          <p suppressHydrationWarning className="mt-0.5 text-[12px] text-muted-foreground">
            {diasDesde(item.desde)}
          </p>
        </div>

        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            {item.quemHref ? (
              <Link href={item.quemHref} className="text-sm font-semibold hover:underline">
                {item.quem}
              </Link>
            ) : (
              <span className="text-sm font-semibold">{item.quem}</span>
            )}
            {item.contexto && <span className="text-[12px] text-muted-foreground">{item.contexto}</span>}
          </p>
          <p className="mt-0.5 text-[13px]">{item.oQue}</p>
          {detalhes.map((linha, i) => (
            <p key={i} className="text-[12px] text-muted-foreground">
              {linha}
            </p>
          ))}
          {item.anexo && (
            <a
              href={item.anexo.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline"
            >
              <FileText className="size-3.5" />
              {item.anexo.nome}
            </a>
          )}
        </div>

        <div className="flex shrink-0 gap-2 sm:justify-end">
          <Button disabled={enviando} onClick={() => decidir("APROVADA")}>
            <Check />
            {rotuloAprovar}
          </Button>
          <Button variant="outline" disabled={enviando} onClick={() => setPedindoMotivo((v) => !v)}>
            <X />
            {rotuloReprovar}
          </Button>
        </div>
      </div>

      {pedindoMotivo && (
        <div className="flex flex-wrap items-center gap-2 pb-3.5">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              item.motivoObrigatorio
                ? "O que precisa ser corrigido? (o colaborador vai ler isto)"
                : "Motivo da recusa (fica no histórico)"
            }
            className="max-w-md"
          />
          <Button
            variant="destructive"
            disabled={enviando || (item.motivoObrigatorio && motivo.trim().length < 5)}
            onClick={() => decidir("REPROVADA", motivo)}
          >
            Confirmar {rotuloReprovar.toLowerCase()}
          </Button>
          <Button variant="ghost" onClick={() => setPedindoMotivo(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </li>
  );
}
