"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GuiaCena } from "@/components/guia-cena";
import {
  duracaoDoGuia,
  duracaoDoPasso,
  guiaDaRota,
  rotuloDeDuracao,
  type Guia,
} from "@/lib/guias";

// "Como usar esta tela": o guia explicativo que toca como vídeo, passo a passo,
// em cima de um desenho animado da tela.
//
// POR QUE NÃO É VÍDEO DE VERDADE: vídeo gravado desatualiza no primeiro botão
// que muda de lugar, pesa em hospedagem, não é pesquisável e não sobe junto com
// o PR que mudou a tela. Aqui o roteiro é texto versionado (lib/guias.ts) e a
// ilustração é esquemática (components/guia-cena.tsx) — o resultado, para quem
// assiste, é o mesmo: passa sozinho, tem play, pause, voltar e capítulo.
//
// Entra uma vez no layout de /rh/<empresa> e se resolve pela rota, então tela
// nova ganha o guia sem ninguém precisar lembrar de plugar o componente.

// ─── "Já assisti este?" — leitura do localStorage exposta como store externa ───
//
// O selo de "novo" só existe no navegador, e ler localStorage no primeiro render
// daria divergência de hidratação. `useSyncExternalStore` resolve os dois casos
// de uma vez: o servidor devolve "já visto" (sem selo), o cliente devolve o valor
// real, e marcar como visto avisa os inscritos sem precisar de estado em efeito.

const CHAVE_VISTO = "softrh:guia-visto:";
const inscritos = new Set<() => void>();

function assinarVistos(aoMudar: () => void) {
  inscritos.add(aoMudar);
  return () => {
    inscritos.delete(aoMudar);
  };
}

function marcarComoVisto(slug: string) {
  try {
    window.localStorage.setItem(CHAVE_VISTO + slug, "1");
  } catch {
    // Navegador com armazenamento bloqueado: o guia continua funcionando, só o
    // selo de "novo" volta a aparecer. Não é motivo para quebrar a tela.
  }
  inscritos.forEach((aoMudar) => aoMudar());
}

function jaFoiVisto(slug: string): boolean {
  try {
    return window.localStorage.getItem(CHAVE_VISTO + slug) === "1";
  } catch {
    return true;
  }
}

/**
 * Resolve o guia pela rota aberta. É o que entra no layout de /rh/<empresa>:
 * tela sem roteiro em lib/guias.ts não renderiza nada.
 */
export function GuiaTela({ empresaId }: { empresaId: string }) {
  const pathname = usePathname();
  const guia = useMemo(() => guiaDaRota(pathname ?? "", empresaId), [pathname, empresaId]);
  if (!guia) return null;
  return <GuiaTelaPara guia={guia} />;
}

/** O player em si. Separado de `GuiaTela` para poder ser montado com um guia à mão. */
export function GuiaTelaPara({ guia }: { guia: Guia }) {
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [tocando, setTocando] = useState(false);
  /** Milissegundos já corridos DENTRO do passo atual. */
  const [corridos, setCorridos] = useState(0);

  const novo = !useSyncExternalStore(
    assinarVistos,
    () => jaFoiVisto(guia.slug),
    () => true,
  );

  const passos = guia.passos;
  const passo = passos[indice];
  const duracaoAtual = passo ? duracaoDoPasso(passo) * 1000 : 0;
  const terminou = indice === passos.length - 1 && corridos >= duracaoAtual;

  // O relógio do player. Passo de 100 ms: suave o bastante para a barra de
  // progresso não andar aos saltos, leve o bastante para não custar nada.
  const referenciaDeTempo = useRef<number>(0);
  useEffect(() => {
    if (!tocando || !passo) return;
    referenciaDeTempo.current = Date.now() - corridos;
    const relogio = window.setInterval(() => {
      const decorrido = Date.now() - referenciaDeTempo.current;
      if (decorrido >= duracaoAtual) {
        if (indice < passos.length - 1) {
          setIndice((i) => i + 1);
          setCorridos(0);
        } else {
          // Último passo: para no fim em vez de voltar ao começo, e a tela
          // oferece "assistir de novo". Reiniciar sozinho faria a pessoa
          // perder o final sem entender o que aconteceu.
          setCorridos(duracaoAtual);
          setTocando(false);
        }
        return;
      }
      setCorridos(decorrido);
    }, 100);
    return () => window.clearInterval(relogio);
    // `corridos` fora das dependências de propósito: ele é ESCRITO aqui a cada
    // tique, e listá-lo recriaria o intervalo 10×/s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando, indice, duracaoAtual, passos.length, passo]);

  const abrir = useCallback(() => {
    setIndice(0);
    setCorridos(0);
    setAberto(true);
    setTocando(true);
    marcarComoVisto(guia.slug);
  }, [guia]);

  /** Fechar pelo X, pelo Esc ou clicando fora não pode deixar o relógio correndo. */
  const trocarAbertura = useCallback((abrindo: boolean) => {
    setAberto(abrindo);
    if (!abrindo) setTocando(false);
  }, []);

  const irPara = useCallback((novoIndice: number) => {
    setIndice(novoIndice);
    setCorridos(0);
    setTocando(true);
  }, []);

  const reiniciar = useCallback(() => irPara(0), [irPara]);

  if (!passo) return null;

  const total = duracaoDoGuia(guia);

  return (
    <>
      {/* Fixo no canto: a tela do RH é cheia de tabela larga, e um botão no
          corpo da página some no meio do conteúdo (ou empurra o layout de 40
          telas). z-30 fica sob a topbar (z-40) e sob o próprio diálogo (z-50). */}
      <button
        type="button"
        onClick={abrir}
        className={cn(
          "fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full border bg-background/95 py-2 pr-3.5 pl-3 text-sm font-medium shadow-lg backdrop-blur transition-colors hover:bg-muted",
          novo && "ring-2 ring-primary/40",
        )}
        aria-label={`Como usar a tela ${guia.titulo}`}
      >
        <span className="relative flex items-center">
          <CirclePlay className="size-5 text-primary" />
          {novo ? (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />
          ) : null}
        </span>
        <span className="hidden sm:inline">Como usar esta tela</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {rotuloDeDuracao(total)}
        </span>
      </button>

      <Dialog open={aberto} onOpenChange={trocarAbertura}>
        <DialogContent className="max-h-[92vh] gap-3 overflow-y-auto sm:max-w-2xl">
          <div className="pr-8">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
              <Sparkles className="size-3" />
              Guia da tela
            </p>
            <DialogTitle className="mt-1 text-lg">{guia.titulo}</DialogTitle>
            <DialogDescription className="mt-1">{guia.paraQue}</DialogDescription>
          </div>

          {/* Palco. A altura fixa evita o pulo de layout entre cenas de tamanhos
              diferentes — cena que empurra o texto para baixo faz a pessoa perder
              a linha que estava lendo. */}
          <div className="h-[210px] sm:h-[250px]">
            <GuiaCena
              // A `key` é o que faz a animação rodar de novo em cada passo:
              // sem remontar, dois passos com a mesma cena mostrariam o segundo
              // já montado e parado.
              key={`${guia.slug}-${indice}`}
              cena={passo.cena}
              rotulos={passo.rotulos}
              titulo={guia.titulo}
            />
          </div>

          {/* Barra segmentada: um pedaço por passo, largura proporcional ao
              tempo dele. Diz onde a pessoa está E quanto falta, o que uma barra
              única não diz. */}
          <div className="flex gap-1" aria-hidden>
            {passos.map((p, i) => {
              const preenchimento =
                i < indice ? 1 : i > indice ? 0 : Math.min(1, corridos / duracaoAtual);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => irPara(i)}
                  className="h-1.5 min-w-0 overflow-hidden bg-card"
                  style={{ flexGrow: duracaoDoPasso(p) }}
                  tabIndex={-1}
                >
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-100 ease-linear"
                    style={{ width: `${preenchimento * 100}%` }}
                  />
                </button>
              );
            })}
          </div>

          <div className="min-h-[74px] rounded-lg bg-muted/50 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {indice + 1} de {passos.length} · {passo.titulo}
            </p>
            {/* aria-live: quem usa leitor de tela ouve a narração trocar sozinha,
                em vez de precisar procurar o texto novo a cada passo. */}
            <p aria-live="polite" className="mt-1 text-sm leading-relaxed">
              {passo.fala}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => irPara(Math.max(0, indice - 1))}
              disabled={indice === 0}
              aria-label="Passo anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>

            {terminou ? (
              <Button size="sm" onClick={reiniciar}>
                <RotateCcw className="size-4" />
                Assistir de novo
              </Button>
            ) : (
              <Button size="sm" onClick={() => setTocando((t) => !t)}>
                {tocando ? <Pause className="size-4" /> : <Play className="size-4" />}
                {tocando ? "Pausar" : "Continuar"}
              </Button>
            )}

            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => irPara(Math.min(passos.length - 1, indice + 1))}
              disabled={indice === passos.length - 1}
              aria-label="Próximo passo"
            >
              <ChevronRight className="size-4" />
            </Button>

            <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
              Passa sozinho — pause quando quiser
            </p>
          </div>

          {/* O rodapé responde a pergunta que traz a pessoa até aqui ("o que eu
              alimento nesta tela?") sem depender de ela assistir até o fim. */}
          <div className="-mx-4 -mb-4 rounded-b-xl border-t bg-muted/40 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              O que você alimenta aqui
            </p>
            <p className="mt-1 text-sm leading-relaxed">{guia.alimenta}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
