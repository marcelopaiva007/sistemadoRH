"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { adminNav, diretoriaNav } from "@/components/nav-config";

export function AppSidebar({
  role,
  nome,
}: {
  role: string;
  nome: string;
}) {
  const pathname = usePathname();
  const items = role === "ADMIN" ? adminNav : diretoriaNav;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-background">
      <div className="border-b px-4 py-4">
        <p className="text-sm font-semibold leading-tight">LM Telecom</p>
        <p className="text-xs text-muted-foreground">Bonificação de Vendas</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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

      <div className="border-t p-3">
        <Link
          href="/conta"
          className={cn(
            "mb-2 flex items-center justify-between rounded-md px-1 py-1 transition-colors hover:bg-muted",
            pathname === "/conta" && "bg-muted"
          )}
        >
          <div>
            <p className="text-sm font-medium leading-tight">{nome}</p>
            <p className="text-xs text-muted-foreground">
              {role === "ADMIN" ? "Administrativo/Financeiro" : "Diretoria/Gestão"}
            </p>
          </div>
          <KeyRound className="size-4 text-muted-foreground" />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="size-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
