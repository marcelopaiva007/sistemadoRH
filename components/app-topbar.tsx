"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navByRole, globalNavByRole } from "@/components/nav-config";
import { FastmaiLogo } from "@/components/logo-fastmai";
import { SeletorModulo } from "@/components/seletor-modulo";
import { SeletorMarcaEmpresa } from "@/components/seletor-marca-empresa";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrativo/Financeiro",
  DIRETORIA: "Diretoria/Gestão",
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Gestor de Setor",
  // Acesso de portal (funcionário sem login do sistema). Não navega por aqui —
  // a porta dele é /portal —, mas o rótulo existe para não cair no fallback.
  COLABORADOR: "Colaborador",
};

/** "Marcelo da Silva Paiva" → "MP": primeira e última palavra. */
function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const sigla = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  return sigla.toUpperCase() || "?";
}

/**
 * A barra de topo: UMA linha de 52px (v1.155.0). Eram duas (94px) desde que o
 * seletor de marca entrou na v1.105.0 — a linha 2 existia para a navegação
 * solta do usuário (Início, Produtividade, Atualizações) e para conta/sair.
 * No visual Modernist isso tudo mora no menu do avatar, à direita, e a linha
 * fica só com o que se opera: os MÓDULOS como abas de texto, o seletor de
 * marca/CNPJ, e a pessoa.
 *
 * SEM `overflow` nesta linha, e isso é deliberado: `overflow-x: auto` faz o
 * navegador tratar o eixo vertical como `auto` também, e todo painel suspenso
 * daqui (marca, CNPJ, menu) passa a ser recortado pela altura da barra — foi
 * o que aconteceu entre a v1.110.1 e a v1.111.1. O celular continua sem
 * rolagem lateral porque os filhos ENCOLHEM: `min-w-0`, rótulos que truncam,
 * nome que some nas larguras estreitas.
 */
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
  /** Ex.: "v1.0.0 · a1b2c3d". Vem do layout: o commit só existe no servidor. */
  versao: string;
  /** Marcas e empresas que este usuário enxerga — vazio para quem não navega
   *  em `/rh/[empresaId]` (GESTOR_SETOR). Alimenta o seletor do topo. */
  marcas: { id: string; nome: string; corPrimaria: string | null; logoUrl: string | null }[];
  empresas: { id: string; nome: string; marcaId: string }[];
  /** Os sistemas que este usuário alcança — decide o que a barra mostra. */
  sistemasPermitidos: string[];
}) {
  const pathname = usePathname();
  // Papel desconhecido não herda menu nenhum (falha fechada): as páginas têm
  // guarda própria, e mostrar caminho que não abre é ensinar a pessoa a bater
  // na porta trancada. `navByRole` + `globalNavByRole` continuam sendo a fonte
  // por papel — só mudaram de lugar (da linha 2 para o menu do avatar).
  const itensDoMenu = [...(navByRole[role] ?? []), ...(globalNavByRole[role] ?? [])];

  function ativo(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/usuarios") return pathname.startsWith("/usuarios") || pathname.startsWith("/cadastros");
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-background">
      <div className="mx-auto flex h-[52px] w-full min-w-0 max-w-7xl items-center gap-3 px-4 sm:gap-5">
        {/* A marca do PRODUTO — FASTMAI em todo o chrome desde 26/08/2026. A
            L&M segue nas páginas em que a marca é a da EMPREGADORA. */}
        <FastmaiLogo className="shrink-0 text-[17px]" />

        <SeletorModulo
          sistemasPermitidos={sistemasPermitidos}
          empresaIds={empresas.map((e) => e.id)}
          role={role}
        />

        <SeletorMarcaEmpresa marcas={marcas} empresas={empresas} />

        <div className="min-w-0 flex-1" />

        {/* A pessoa e tudo o que é dela: navegação solta, conta, sair e a
            versão. Avatar quadrado com iniciais (sem foto no sistema); nome e
            papel somem abaixo de `md` — quem está no próprio aparelho já sabe
            quem é, e o menu continua a um toque. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            title={nome}
            className="flex h-9 min-w-0 shrink-0 items-center gap-2 px-1 text-left outline-none transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-expanded:bg-card"
          >
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center bg-foreground text-[11px] leading-none font-extrabold text-background"
            >
              {iniciaisDoNome(nome)}
            </span>
            <span className="hidden min-w-0 md:block">
              <span className="block max-w-44 truncate text-[13px] leading-tight font-semibold text-foreground">
                {nome}
              </span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                {ROLE_LABELS[role] ?? "Acesso restrito"}
              </span>
            </span>
            <ChevronDown aria-hidden className="hidden size-3.5 shrink-0 text-muted-foreground md:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-60">
            {itensDoMenu.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.href}
                  render={<Link href={item.href} />}
                  className={cn(ativo(item.href) && "font-extrabold text-primary")}
                >
                  <Icon />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
            {itensDoMenu.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              render={<Link href="/conta" />}
              className={cn(pathname === "/conta" && "font-extrabold text-primary")}
            >
              <KeyRound />
              Conta
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut />
              Sair
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* A versão responde "estou vendo a entrega nova?" — pergunta sobre
                a sessão, não sobre o sistema em que se está; por isso mora
                aqui e não ao lado do logo. */}
            <div className="px-1.5 py-1 font-mono text-[11px] text-muted-foreground">{versao}</div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
