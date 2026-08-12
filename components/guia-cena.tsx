"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Search,
  Send,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CenaTipo } from "@/lib/guias";

// Desenho esquemático que ilustra cada passo do guia "Como usar esta tela".
//
// POR QUE ESQUEMA E NÃO CAPTURA DE TELA: captura envelhece no primeiro botão
// que muda de lugar, e aí o guia passa a ensinar uma tela que não existe mais —
// pior que não ter guia. O esquema mostra a FORMA da tarefa ("aqui é uma tabela
// que você lê de cima para baixo", "aqui é um formulário de quatro campos"), que
// é o que a pessoa precisa entender e o que não muda a cada ajuste de layout.
//
// As animações são as classes .guia-* de app/globals.css, com atraso em linha
// para escalonar os elementos. O componente é remontado a cada passo (`key` no
// player), e é isso que faz a animação rodar de novo — sem remontagem, o segundo
// passo com a mesma cena apareceria parado.

/** Altura estável por rótulo — mesma barra em todo render, sem Math.random (que quebraria a hidratação). */
function alturaDoRotulo(rotulo: string, indice: number): number {
  let soma = indice * 7;
  for (let i = 0; i < rotulo.length; i++) soma += rotulo.charCodeAt(i);
  return 35 + (soma % 60);
}

function atraso(indice: number, passo = 120): React.CSSProperties {
  return { animationDelay: `${indice * passo}ms` };
}

/** Moldura comum: dá o "isto é uma tela" sem imitar nenhuma tela específica. */
function Moldura({ children, titulo }: { children: React.ReactNode; titulo?: string }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        {titulo ? (
          <span className="ml-2 truncate text-[11px] font-medium text-muted-foreground">
            {titulo}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 p-3 sm:p-4">{children}</div>
    </div>
  );
}

function CenaTabela({ rotulos }: { rotulos: string[] }) {
  const colunas = rotulos.length > 0 ? rotulos : ["Coluna", "Coluna", "Coluna"];
  const linhas = [0, 1, 2, 3];
  return (
    <div className="flex h-full flex-col gap-2">
      <div
        className="grid gap-2 border-b pb-2"
        style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}
      >
        {colunas.map((coluna, i) => (
          <span
            key={coluna + i}
            className="guia-surgir truncate text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
            style={atraso(i, 70)}
          >
            {coluna}
          </span>
        ))}
      </div>
      <div className="flex flex-1 flex-col justify-start gap-1.5">
        {linhas.map((linha) => (
          <div
            key={linha}
            className={cn(
              "guia-surgir grid items-center gap-2 rounded-md px-1.5 py-2",
              linha === 1 && "bg-primary/8 ring-1 ring-primary/20",
            )}
            style={{
              gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))`,
              ...atraso(linha + 1, 130),
            }}
          >
            {colunas.map((coluna, i) => (
              <span
                key={coluna + i}
                className={cn(
                  "h-2 rounded-full",
                  linha === 1 ? "bg-primary/45" : "bg-muted-foreground/20",
                )}
                style={{ width: `${55 + ((linha * 17 + i * 23) % 40)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CenaFormulario({ rotulos }: { rotulos: string[] }) {
  const campos = rotulos.length > 0 ? rotulos : ["Campo"];
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {campos.map((campo, i) => (
          <div key={campo + i} className="guia-surgir space-y-1" style={atraso(i, 180)}>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{campo}</p>
            <div className="flex h-7 items-center overflow-hidden rounded-md border bg-background px-2">
              <span
                className="guia-digitar h-2 rounded-full bg-primary/40"
                style={{ ...atraso(i, 180), animationDelay: `${i * 180 + 260}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <span
          className="guia-surgir inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground"
          style={{ animationDelay: `${campos.length * 180 + 320}ms` }}
        >
          <Check className="size-3" />
          Salvar
        </span>
      </div>
    </div>
  );
}

function CenaCartoes({ rotulos }: { rotulos: string[] }) {
  const cartoes = (rotulos.length > 0 ? rotulos : ["Indicador|0"]).map((r) => {
    const [rotulo, valor] = r.split("|");
    return { rotulo: rotulo ?? r, valor: valor ?? "" };
  });
  return (
    <div
      className={cn(
        "grid h-full content-center gap-2",
        cartoes.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3",
      )}
    >
      {cartoes.map((cartao, i) => (
        <div
          key={cartao.rotulo + i}
          className="guia-surgir rounded-lg border bg-background p-2.5"
          style={atraso(i, 150)}
        >
          <p className="truncate text-[10px] leading-tight text-muted-foreground">{cartao.rotulo}</p>
          <p className="mt-1 truncate text-base font-semibold text-primary tabular-nums">
            {cartao.valor}
          </p>
        </div>
      ))}
    </div>
  );
}

function CenaFluxo({ rotulos }: { rotulos: string[] }) {
  const etapas = rotulos.length > 0 ? rotulos : ["Início", "Fim"];
  return (
    <div className="flex h-full items-center">
      <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {etapas.map((etapa, i) => (
          <div key={etapa + i} className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={cn(
                "guia-surgir min-w-0 flex-1 rounded-lg border p-2.5 text-center text-[11px] leading-snug font-medium",
                i === etapas.length - 1
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "bg-background text-foreground",
              )}
              style={atraso(i, 260)}
            >
              {etapa}
            </div>
            {i < etapas.length - 1 ? (
              <div className="relative hidden h-4 w-6 shrink-0 overflow-hidden sm:block">
                <ArrowRight className="absolute inset-0 m-auto size-4 text-muted-foreground/40" />
                <span
                  className="guia-percorrer absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full bg-primary"
                  style={atraso(i, 260)}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CenaChecklist({ rotulos }: { rotulos: string[] }) {
  const itens = rotulos.length > 0 ? rotulos : ["Item"];
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {itens.map((item, i) => (
        <div
          key={item + i}
          className="guia-surgir flex items-center gap-2.5 rounded-md border bg-background px-2.5 py-2"
          style={atraso(i, 200)}
        >
          <span
            className="guia-marcar flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-success text-white"
            style={{ animationDelay: `${i * 200 + 280}ms` }}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="truncate text-[11px] font-medium">{item}</span>
        </div>
      ))}
    </div>
  );
}

function CenaAlerta({ rotulos }: { rotulos: string[] }) {
  const [titulo, detalhe, acao] = rotulos;
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="guia-pulsar w-full rounded-lg border border-destructive/30 bg-destructive/5 p-3.5"
        style={{ animationDelay: "300ms" }}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="guia-surgir text-sm leading-snug font-semibold text-destructive">
              {titulo ?? "Atenção"}
            </p>
            {detalhe ? (
              <p
                className="guia-surgir mt-0.5 text-[11px] leading-snug text-muted-foreground"
                style={atraso(1, 240)}
              >
                {detalhe}
              </p>
            ) : null}
            {acao ? (
              <span
                className="guia-surgir mt-2.5 inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2.5 py-1 text-[11px] font-medium text-destructive"
                style={atraso(2, 240)}
              >
                {acao}
                <ChevronRight className="size-3" />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Índices que ganham cor na grade — fixos, para o desenho não pular a cada render. */
const DIAS_MARCADOS = [3, 4, 5, 11, 17, 18, 24];
const DIAS_ALTERNATIVOS = [8, 22];

function CenaCalendario({ rotulos }: { rotulos: string[] }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      <div className="grid grid-cols-7 gap-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((dia, i) => (
          <span key={i} className="text-center text-[9px] font-medium text-muted-foreground/70">
            {dia}
          </span>
        ))}
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "guia-surgir flex h-5 items-center justify-center rounded-[4px] text-[9px] tabular-nums",
              DIAS_MARCADOS.includes(i)
                ? "bg-primary/20 font-semibold text-primary"
                : DIAS_ALTERNATIVOS.includes(i)
                  ? "bg-warning/25 font-semibold text-foreground"
                  : "bg-muted/60 text-muted-foreground/60",
            )}
            style={{ animationDelay: `${i * 22}ms` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {rotulos.map((rotulo, i) => (
          <span
            key={rotulo + i}
            className="guia-surgir flex items-center gap-1.5 text-[10px] text-muted-foreground"
            style={{ animationDelay: `${700 + i * 160}ms` }}
          >
            <span
              className={cn(
                "size-2 rounded-[3px]",
                i === 0 ? "bg-primary/60" : i === 1 ? "bg-warning/70" : "bg-muted-foreground/25",
              )}
            />
            {rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

function CenaEnvio({ rotulos }: { rotulos: string[] }) {
  const [de, texto, para] = rotulos;
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="guia-surgir flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium"
          style={atraso(0, 200)}
        >
          <Send className="size-3 text-primary" />
          <span className="truncate">{de ?? "Sistema"}</span>
        </span>
        <div className="relative h-4 flex-1 overflow-hidden">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-muted-foreground/30" />
          <span
            className="guia-percorrer absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={atraso(1, 200)}
          />
        </div>
        <span
          className="guia-surgir flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium"
          style={atraso(2, 200)}
        >
          <User className="size-3 text-muted-foreground" />
          <span className="truncate">{para ?? "Colaborador"}</span>
        </span>
      </div>
      {texto ? (
        <p
          className="guia-surgir mx-auto max-w-[85%] rounded-xl rounded-tl-sm bg-primary/10 px-3 py-2 text-center text-[11px] leading-snug text-foreground ring-1 ring-primary/15"
          style={atraso(3, 200)}
        >
          “{texto}”
        </p>
      ) : null}
    </div>
  );
}

function CenaGrafico({ rotulos }: { rotulos: string[] }) {
  const barras = rotulos.length > 0 ? rotulos : ["A", "B", "C"];
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-1.5 border-b pb-0">
        {barras.map((barra, i) => {
          const altura = alturaDoRotulo(barra, i);
          return (
            <div
              key={barra + i}
              className={cn(
                "guia-crescer min-w-0 flex-1 rounded-t-[3px]",
                i === barras.length - 2 ? "bg-primary" : "bg-primary/35",
              )}
              style={{ height: `${altura}%`, ...atraso(i, 110) }}
            />
          );
        })}
      </div>
      <div className="flex gap-1.5 pt-1.5">
        {barras.map((barra, i) => (
          <span
            key={barra + i}
            className="guia-surgir min-w-0 flex-1 truncate text-center text-[9px] text-muted-foreground"
            style={atraso(i, 110)}
          >
            {barra}
          </span>
        ))}
      </div>
    </div>
  );
}

function CenaBusca({ rotulos }: { rotulos: string[] }) {
  const [termo, ...resultados] = rotulos;
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="guia-digitar overflow-hidden text-[11px] whitespace-nowrap">
          {termo ?? "buscar…"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {resultados.map((resultado, i) => (
          <div
            key={resultado + i}
            className="guia-surgir flex items-center gap-2 rounded-md border bg-background px-2.5 py-2"
            style={{ animationDelay: `${900 + i * 200}ms` }}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="truncate text-[11px]">{resultado}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CENAS: Record<CenaTipo, (props: { rotulos: string[] }) => React.ReactElement> = {
  tabela: CenaTabela,
  formulario: CenaFormulario,
  cartoes: CenaCartoes,
  fluxo: CenaFluxo,
  checklist: CenaChecklist,
  alerta: CenaAlerta,
  calendario: CenaCalendario,
  envio: CenaEnvio,
  grafico: CenaGrafico,
  busca: CenaBusca,
};

export function GuiaCena({
  cena,
  rotulos,
  titulo,
}: {
  cena: CenaTipo;
  rotulos: string[];
  /** Vai na barra da moldura — normalmente o nome da tela sendo explicada. */
  titulo?: string;
}) {
  const Componente = CENAS[cena];
  return (
    <Moldura titulo={titulo}>
      <Componente rotulos={rotulos} />
    </Moldura>
  );
}
