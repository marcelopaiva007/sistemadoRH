"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { navByRole, diretoriaNav, globalNavByRole } from "@/components/nav-config";
import { FastmaiLogo } from "@/components/logo-fastmai";
import { SeletorModulo } from "@/components/seletor-modulo";
import { SeletorMarcaEmpresa } from "@/components/seletor-marca-empresa";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrativo/Financeiro",
  DIRETORIA: "Diretoria/Gestão",
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Gestor de Setor",
  // Acesso de portal (funcionário sem login do sistema). Não navega por aqui —
  // a porta dele é /portal —, mas o rótulo existe para não cair no fallback.
  COLABORADOR: "Colaborador",
};

// O SeletorTema (Sol/Lua) morou aqui da v1.58.0 à v1.153.2 e saiu com o tema
// escuro (v1.154.0): o visual Modernist não tem escuro desenhado.
// Menu horizontal no topo (substitui a antiga sidebar) — libera a largura
// inteira da tela para as tabelas do RH.
export function AppTopbar({
  role,
  nome,
  versao,
  marcas,
  empresas,
  sistemasPermitidos,
}: {
  role: string;
  nome: string;
  /** Ex.: "v1.0.0 - a1b2c3d". Vem do layout: o commit so existe no servidor. */
  versao: string;
  /** Marcas e empresas que este usuário enxerga — vazio para quem não navega
   *  em `/rh/[empresaId]` (GESTOR_SETOR). Alimenta o seletor do topo. */
  marcas: { id: string; nome: string; corPrimaria: string | null; logoUrl: string | null }[];
  empresas: { id: string; nome: string; marcaId: string }[];
  /** Os sistemas que este usuário alcança — decide o que a barra mostra. */
  sistemasPermitidos: string[];
}) {
  const pathname = usePathname();
  // Papel desconhecido não pode herdar o menu da DIRETORIA. O fallback antigo
  // (`?? diretoriaNav`) falhava ABERTO: qualquer papel novo — e o acesso de
  // portal é um — passaria a ver a navegação de diretor. As páginas têm guarda
  // própria e barrariam a entrada, mas mostrar caminho que não abre é ensinar
  // a pessoa a bater na porta trancada. Sem menu é o comportamento honesto.
  const items = navByRole[role] ?? [];
  const itensGlobais = globalNavByRole[role] ?? [];

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
      {/* SEM `overflow` aqui, e isso é deliberado: `overflow-x: auto` faz o
          navegador tratar o eixo VERTICAL como `auto` também, e aí todo painel
          suspenso desta linha (marca, CNPJ) passa a ser recortado pela altura
          da barra — quem clicava tinha de ROLAR dentro dela para escolher. Foi
          o que aconteceu entre a v1.110.1 e a v1.111.1.
          O celular continua sem rolagem lateral porque os filhos ENCOLHEM:
          `min-w-0` aqui, rótulos que truncam nos seletores, e nome/cargo e
          logo que somem nas larguras estreitas. */}
      <div className="mx-auto flex h-12 w-full min-w-0 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        <div className="flex shrink-0 items-center gap-2">
          {/* Some abaixo de `sm`: em 375px o espaço é do que se OPERA (sistema,
              marca, CNPJ), e o seletor ao lado já responde "onde estou". */}
          {/* A marca do PRODUTO — FASTMAI substituiu a logo da L&M em todo o
              chrome do sistema em 26/08/2026, por pedido do dono ("vai ficar
              só a logo do FASTMAI"). A L&M segue nas páginas em que a marca é
              a da EMPREGADORA (carreiras, responder por token). */}
          <FastmaiLogo className="hidden text-base sm:inline-flex" />
          {/* Era o texto fixo "Sistema de RH" com a versao embaixo. Virou a
              porta entre os modulos em 23/08/2026, sem sair do lugar: o rotulo
              ja respondia "onde eu estou", e e ali que quem procura a saida
              olha primeiro. A etiqueta de versao continua dentro dele — ela
              responde "estou vendo a versao nova?" sem sair da tela. */}
          <SeletorModulo sistemasPermitidos={sistemasPermitidos} empresaIds={empresas.map((e) => e.id)} />
        </div>

        <SeletorMarcaEmpresa marcas={marcas} empresas={empresas} />

        {/* A administração GLOBAL — o que serve a todos os sistemas (usuários
            e perfis, atualizações) — mora nesta linha, ao lado do nome dos
            sistemas, por pedido do dono (26/08/2026): esta linha é a área do
            que vale para tudo; a linha 2 é navegação. Rótulo some abaixo de
            `lg` (o ícone + title continuam) — os filhos ENCOLHEM, nunca
            overflow nesta linha (ver o aviso acima). */}
        {itensGlobais.length > 0 && (
          <>
            <div aria-hidden className="hidden h-5 w-px shrink-0 bg-border sm:block" />
            {itensGlobais.map((item) => {
              const Icon = item.icon;
              const ativo = pathname.startsWith(item.href) || (item.href === "/usuarios" && pathname.startsWith("/cadastros"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                    ativo
                      ? "bg-primary/10 text-primary dark:text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {/* Rótulo só quando há folga de verdade (`xl`): em `lg` ele
                      disputava a mesma faixa que o seletor de marca e foi o
                      estopim do atropelo da v1.120.1. O ícone + `title`
                      continuam em toda largura. */}
                  <span className="hidden whitespace-nowrap xl:inline">{item.label}</span>
                </Link>
              );
            })}
          </>
        )}

        <div className="flex-1" />
      </div>

      {/* Linha 2 — navegação do usuário à esquerda; tema, conta e sair à
          direita (pedido do dono, 26/08/2026: "pode descer o nome do usuário e
          o sair"). A linha 1 fica inteira para o que é DOS SISTEMAS. Só o
          <nav> rola de lado quando aperta — o bloco da conta é fixo, senão o
          Sair some atrás da rolagem. */}
      <div className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto flex h-11 w-full min-w-0 max-w-7xl items-center gap-1.5 px-4">
          <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
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

          <Link
            href="/conta"
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border border-transparent px-2.5 py-1 transition-all hover:bg-muted/80 hover:border-border/50",
              pathname === "/conta" && "bg-muted border-border/60"
            )}
          >
            {/* Some nas telas estreitas: nome + cargo custam ~130px, e quem está
                no próprio aparelho já sabe quem é. O ícone continua ali, com o
                mesmo destino e área de toque.
                A VERSÃO mora aqui desde 24/08/2026 (pedido do dono do sistema):
                ela responde "estou vendo a entrega nova?", que é uma pergunta
                sobre a conta/sessão, não sobre em que sistema se está.
                Cada linha TRUNCA (title dá o nome inteiro): sem isso, um nome
                longo quebrava em duas linhas e estourava a altura da barra. */}
            <div className="hidden max-w-40 text-right sm:block" title={nome}>
              <p className="truncate text-sm font-medium leading-tight text-foreground">{nome}</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground font-medium">
                {ROLE_LABELS[role] ?? "Acesso restrito"} · <span className="font-mono text-[10px] text-muted-foreground/60">{versao}</span>
              </p>
            </div>
            <KeyRound className="size-4 text-muted-foreground" />
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-2 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
