"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { navByRole, diretoriaNav } from "@/components/nav-config";
import { Logo } from "@/components/logo";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrativo/Financeiro",
  DIRETORIA: "Diretoria/Gestão",
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Gestor de Setor",
};

// Menu horizontal no topo (substitui a antiga sidebar) — libera a largura
// inteira da tela para as tabelas do RH.
export function AppTopbar({
  role,
  nome,
}: {
  role: string;
  nome: string;
}) {
  const pathname = usePathname();
  const items = navByRole[role] ?? diretoriaNav;

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-14 items-center gap-4 px-4">
        <div className="flex shrink-0 items-center gap-3">
          <Logo width={140} height={34} className="h-8 w-auto" />
          <p className="hidden text-xs leading-tight text-muted-foreground lg:block">
            RH — Clima
            <br />
            Organizacional
          </p>
        </div>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/conta"
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted",
              pathname === "/conta" && "bg-muted"
            )}
          >
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{nome}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[role] ?? "Diretoria/Gestão"}
              </p>
            </div>
            <KeyRound className="size-4 text-muted-foreground" />
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
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
