"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, KeyRound, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { navByRole, diretoriaNav } from "@/components/nav-config";
import { Logo } from "@/components/logo";
import { SeletorMarcaEmpresa } from "@/components/seletor-marca-empresa";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrativo/Financeiro",
  DIRETORIA: "Diretoria/Gestão",
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Gestor de Setor",
};

/**
 * "Já hidratou?" sem `setState` dentro de efeito.
 *
 * O padrão antigo era `useState(false)` + `useEffect(() => setMounted(true))`,
 * que dispara uma segunda renderização logo depois da primeira e é o que o
 * eslint acusa (cascading renders). `useSyncExternalStore` responde a mesma
 * pergunta pelo caminho previsto pelo React: o snapshot do SERVIDOR devolve
 * `false`, o do cliente devolve `true`, e a troca acontece na hidratação, sem
 * efeito nenhum. O `subscribe` é vazio de propósito — o valor nunca muda
 * depois de hidratar, então não há a que se inscrever.
 */
function useHidratado() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function SeletorTema() {
  const { theme, setTheme } = useTheme();
  const hidratado = useHidratado();

  // O tema real só é conhecido no cliente (vem do localStorage). Renderizar o
  // ícone antes disso mostraria o do tema errado por um instante — daí o
  // espaço reservado do mesmo tamanho, que evita o pulo do layout.
  if (!hidratado) {
    return <div className="size-8" />;
  }

  const proximoTema = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-foreground"
      title={`Alternar para modo ${proximoTema === "dark" ? "escuro" : "claro"}`}
      onClick={() => setTheme(proximoTema)}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
}

// Menu horizontal no topo (substitui a antiga sidebar) — libera a largura
// inteira da tela para as tabelas do RH.
export function AppTopbar({
  role,
  nome,
  versao,
  marcas,
  empresas,
}: {
  role: string;
  nome: string;
  /** Ex.: "v1.0.0 - a1b2c3d". Vem do layout: o commit so existe no servidor. */
  versao: string;
  /** Marcas e empresas que este usuário enxerga — vazio para quem não navega
   *  em `/rh/[empresaId]` (GESTOR_SETOR). Alimenta o seletor do topo. */
  marcas: { id: string; nome: string; corPrimaria: string | null }[];
  empresas: { id: string; nome: string; marcaId: string }[];
}) {
  const pathname = usePathname();
  const items = navByRole[role] ?? diretoriaNav;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md shadow-xs">
      {/* Linha 1 — identidade: logo, marca/empresa ativa, conta. Linha 2 —
          navegação, largura cheia. Eram uma linha só até o seletor de
          marca/empresa entrar: aí "Produtividade RH" cortava — 4 itens de
          menu + logo + seletor + conta não cabem em 1280px (a própria
          max-w-7xl do layout), então a barra ficava um só amontoado disputando
          espaço. Duas perguntas diferentes ("em que contexto estou" x "para
          onde eu vou") ganham uma linha cada, e a navegação nunca mais fica
          sem espaço, não importa o tamanho do nome da empresa. */}
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-4">
        <div className="flex shrink-0 items-center gap-3">
          <Logo width={140} height={34} className="h-7 w-auto" />
          <div className="hidden leading-tight lg:block border-l border-border/60 pl-3">
            <p className="text-xs font-medium text-foreground/80">Sistema de RH</p>
            {/* Responde "estou vendo a versao nova?" sem sair da tela. */}
            <p className="font-mono text-[10px] text-muted-foreground/70">{versao}</p>
          </div>
        </div>

        <SeletorMarcaEmpresa marcas={marcas} empresas={empresas} />

        <div className="flex-1" />

        <SeletorTema />
        <Link
          href="/conta"
          className={cn(
            "flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1 transition-all hover:bg-muted/80 hover:border-border/50",
            pathname === "/conta" && "bg-muted border-border/60"
          )}
        >
          <div className="text-right">
            <p className="text-sm font-medium leading-tight text-foreground">{nome}</p>
            <p className="text-[11px] text-muted-foreground font-medium">
              {ROLE_LABELS[role] ?? "Diretoria/Gestão"}
            </p>
          </div>
          <KeyRound className="size-4 text-muted-foreground" />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </div>

      <div className="border-t border-border/60 bg-muted/30">
        <nav className="mx-auto flex h-11 w-full max-w-7xl items-center gap-1.5 overflow-x-auto px-4 scrollbar-none">
          {items.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.98]"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
