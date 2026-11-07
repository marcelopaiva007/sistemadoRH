"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Building2, ChevronDown, History, KeyRound, LogOut, ShieldCheck, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { FastmaiLogo } from "@/components/logo-fastmai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// As três telas da GESTÃO FASTMAI (v1.192.0, pedido do CEO): a FASTMAI tem
// clientes — a LM Telecom, de marca única, e o cliente multimarcas — e controla
// os usuários de cada um. Clientes primeiro: é de lá que se chega aos usuários
// de cada cliente. (Até a v1.191.0 eram "Usuários", "Regras das marcas" e
// "Perfis"; /admin/grupos leva a /admin/clientes, em next.config.ts.)
const ABAS = [
  { href: "/admin/clientes", rotulo: "Clientes", icon: Building2 },
  { href: "/admin/usuarios", rotulo: "Usuários", icon: UserCog },
  { href: "/admin/perfis", rotulo: "Perfis de acesso", icon: ShieldCheck },
  // v1.200.0: o histórico de versões e o que vem a seguir, também na Gestão.
  { href: "/admin/atualizacoes", rotulo: "Atualizações", icon: History },
];

/** "Admin (Master)" → "AM": primeira e última palavra. */
function iniciais(nome: string): string {
  const partes = nome.replace(/[()]/g, " ").trim().split(/\s+/).filter(Boolean);
  const sigla = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  return sigla.toUpperCase() || "?";
}

function Abas({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Gestão FASTMAI" className={className}>
      {ABAS.map((aba) => {
        const ativa = pathname === aba.href || pathname.startsWith(`${aba.href}/`);
        const Icon = aba.icon;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-background",
              ativa
                ? "border-background text-background"
                : "border-transparent text-background/70 hover:text-background",
              linkClassName,
            )}
          >
            <Icon aria-hidden className="size-4" />
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A barra da Gestão FASTMAI (a área de administração). ESCURA de propósito: o
 * sistema do RH tem a barra clara, e a pessoa precisa saber de relance em qual
 * dos dois está — aqui se concedem e se tiram acessos. A etiqueta "Gestão" ao
 * lado da logo diz o mesmo em texto.
 *
 * Sem seletor de marca, de módulo e sem busca: nada do RH aparece aqui.
 * Abaixo de `sm` as abas descem para uma segunda linha, com rolagem lateral
 * só nela — a linha de cima tem o menu da conta, que não pode ser recortado
 * (ver o comentário de `overflow` em components/app-topbar.tsx).
 */
export function AdminTopbar({
  nome,
  usuario,
  versao,
  versaoCurta,
}: {
  nome: string;
  usuario: string;
  /** Ex.: "v1.188.0 · a1b2c3d". O commit só existe no servidor. */
  versao: string;
  /** Só o número, para a linha sob o nome. */
  versaoCurta: string;
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-foreground text-background">
      <div className="flex h-[52px] w-full min-w-0 items-stretch gap-3 px-4 sm:gap-5 sm:px-6">
        <Link
          href="/admin/clientes"
          aria-label="Gestão FASTMAI — início"
          className="flex shrink-0 items-center gap-2"
        >
          <FastmaiLogo className="text-[17px] text-background" />
          <span className="bg-primary px-1.5 py-1 text-[10px] leading-none font-extrabold tracking-[0.08em] text-primary-foreground uppercase">
            Gestão
          </span>
        </Link>

        <Abas className="hidden items-stretch gap-1 sm:flex" />

        <div className="min-w-0 flex-1" />

        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              title={`${nome} (${usuario})`}
              className="flex h-9 min-w-0 shrink-0 items-center gap-2 px-1 text-left outline-none transition-colors hover:bg-background/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background aria-expanded:bg-background/10"
            >
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center bg-background text-[11px] leading-none font-extrabold text-foreground"
              >
                {iniciais(nome)}
              </span>
              <span className="hidden min-w-0 md:block">
                <span className="block max-w-44 truncate text-[13px] leading-tight font-semibold">{nome}</span>
                <span className="block truncate text-[11px] leading-tight text-background/70">
                  Administrador FASTMAI
                  <span className="font-mono"> · {versaoCurta}</span>
                </span>
              </span>
              <ChevronDown aria-hidden className="hidden size-3.5 shrink-0 text-background/70 md:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-60">
              <DropdownMenuItem
                render={<Link href="/admin/conta" />}
                className={cn(pathname === "/admin/conta" && "font-extrabold text-primary")}
              >
                <KeyRound />
                Minha senha
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: "/admin/login" })}>
                <LogOut />
                Sair
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-1.5 py-1 font-mono text-[11px] text-muted-foreground">{versao}</div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Abas
        className="flex h-10 items-stretch gap-1 overflow-x-auto border-t border-background/15 px-2 sm:hidden"
        linkClassName="text-[13px]"
      />
    </header>
  );
}
