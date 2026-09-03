"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A lateral de navegação de um módulo — o mesmo desenho para RH, Processos &
 * Ativos e Delegações (v1.155.0, arquétipo do handoff Modernist).
 *
 * Coluna de 216px no computador: item de 30px sem ícone (45 metáforas
 * diferentes não ajudam a varrer uma lista; o texto sozinho é mais rápido de
 * ler), ativo marcado por uma barra de 2px à esquerda e o texto em `--primary`
 * peso 800, hover em `bg-card`. Grupos recolhíveis pelo título, com a contagem
 * de itens à direita quando recolhido; o grupo da rota atual nunca recolhe.
 * Opcionalmente um item de topo (Pendências) com contador.
 *
 * No celular vira UMA FAIXA HORIZONTAL rolável (títulos somem) — o RH trabalha
 * no computador, mas a tela pequena não pode ficar sem navegação. Quem
 * envolve decide qual forma aparece (`md:block` / `md:hidden`), renderizando
 * o componente duas vezes; o estado de recolhido só importa na coluna.
 */
export type ItemNavLateral = {
  href: string;
  label: string;
  /** Só acende com o caminho EXATO — a raiz do módulo, que é prefixo de tudo. */
  exato?: boolean;
  /** Contador ou marca à direita do rótulo (o badge de Mensagens). */
  badge?: ReactNode;
};

export type GrupoNavLateral = {
  /** `null` = itens soltos, sem título nem recolhimento. */
  titulo: string | null;
  itens: ItemNavLateral[];
};

/**
 * O item ativo é o de prefixo MAIS ESPECÍFICO, um só. Com `startsWith` puro,
 * "Veículos" (`frota`) acendia junto com "Multas" (`frota/multas`), e no RH
 * "painel" acendia com "painel-setor" — daí a barra e a comparação com `/`.
 */
export function hrefAtivo(pathname: string, itens: { href: string; exato?: boolean }[]): string | undefined {
  return itens
    .filter((i) => (i.exato ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .map((i) => i.href)
    .sort((a, b) => b.length - a.length)[0];
}

// Grupos recolhidos, no localStorage — uma chave para todos os módulos (os
// títulos não se repetem entre eles). Lido por useSyncExternalStore: o
// servidor renderiza tudo aberto, o cliente re-renderiza com o que a pessoa
// deixou — sem `setState` em efeito (regra do eslint do projeto) e sem erro de
// hidratação (o React aplica o snapshot do cliente depois de hidratar).
const CHAVE = "fastmai.nav.grupos";
const ouvintes = new Set<() => void>();

function lerBruto(): string {
  try {
    return window.localStorage.getItem(CHAVE) ?? "{}";
  } catch {
    return "{}";
  }
}
function assinar(cb: () => void) {
  ouvintes.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    ouvintes.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function alternarGrupo(titulo: string) {
  let atual: Record<string, boolean> = {};
  try {
    atual = JSON.parse(lerBruto()) as Record<string, boolean>;
  } catch {
    atual = {};
  }
  atual[titulo] = !atual[titulo];
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(atual));
  } catch {
    // Sem localStorage (modo privado, cota): o grupo só não lembra o estado.
  }
  ouvintes.forEach((f) => f());
}
function useRecolhidos(): Record<string, boolean> {
  // O snapshot é a STRING crua — estável entre leituras iguais, como o hook
  // exige. O parse acontece fora dele.
  const bruto = useSyncExternalStore(assinar, lerBruto, () => "{}");
  try {
    return JSON.parse(bruto) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function NavLateral({
  topo,
  grupos,
}: {
  topo?: ItemNavLateral & { contador?: number | null };
  grupos: GrupoNavLateral[];
}) {
  const pathname = usePathname();
  const recolhidos = useRecolhidos();
  const todos = [...(topo ? [topo] : []), ...grupos.flatMap((g) => g.itens)];
  const ativo = hrefAtivo(pathname, todos);

  return (
    <nav className="flex gap-1 md:flex-col md:gap-0 md:space-y-3">
      {topo && (
        <Link
          href={topo.href}
          aria-current={ativo === topo.href ? "page" : undefined}
          className={cn(
            "flex h-[34px] shrink-0 items-center gap-2 border-l-2 pr-2 pl-3 text-sm whitespace-nowrap transition-colors",
            ativo === topo.href
              ? "border-primary font-extrabold text-primary"
              : "border-transparent font-semibold text-foreground hover:bg-card",
          )}
        >
          <span className="md:truncate">{topo.label}</span>
          {topo.contador != null && topo.contador > 0 && (
            <span className="ml-auto shrink-0 bg-accent px-2 py-0.5 text-[11px] leading-none font-semibold tabular-nums text-accent-foreground">
              {topo.contador}
            </span>
          )}
        </Link>
      )}

      {grupos.map((grupo) => {
        const chave = grupo.titulo ?? "";
        const temAtivo = grupo.itens.some((i) => i.href === ativo);
        const recolhido = !!grupo.titulo && !!recolhidos[chave] && !temAtivo;
        return (
          <div key={chave || "raiz"} className="flex gap-1 md:block md:gap-0">
            {/* O título só existe na coluna: numa faixa horizontal ele viraria
                mais um item para rolar, sem levar a lugar nenhum. */}
            {grupo.titulo && (
              <button
                type="button"
                onClick={() => alternarGrupo(chave)}
                aria-expanded={!recolhido}
                className="hidden w-full items-center justify-between pt-1 pb-1 pr-2 pl-3 text-left text-[10.5px] font-semibold tracking-[.08em] text-muted-foreground uppercase transition-colors hover:text-foreground md:flex"
              >
                <span>{grupo.titulo}</span>
                {recolhido ? (
                  <span className="text-xs font-normal tracking-normal normal-case tabular-nums">
                    {grupo.itens.length}
                  </span>
                ) : (
                  <ChevronDown aria-hidden className="size-3" />
                )}
              </button>
            )}
            <ul className={cn("flex gap-1 md:block md:gap-0", recolhido && "md:hidden")}>
              {grupo.itens.map((item) => {
                const esteAtivo = item.href === ativo;
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={esteAtivo ? "page" : undefined}
                      className={cn(
                        "flex h-[30px] items-center gap-2 border-l-2 pr-2 pl-3 text-[13.5px] whitespace-nowrap transition-colors",
                        esteAtivo
                          ? "border-primary font-extrabold text-primary"
                          : "border-transparent text-foreground hover:bg-card",
                      )}
                    >
                      <span className="md:truncate">{item.label}</span>
                      {item.badge}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
