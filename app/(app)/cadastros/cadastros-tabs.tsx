"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

// As duas abas do cadastro único de acesso: quem entra (Usuários) e o que cada
// um pode (Perfis). Uma dupla fixa, não um menu: se nascer uma terceira área
// de administração, ela ganha rota própria e entra aqui explicitamente.
const ABAS = [
  { href: "/cadastros/usuarios", rotulo: "Usuários", icon: UserCog },
  { href: "/cadastros/perfis", rotulo: "Perfis de acesso", icon: ShieldCheck },
] as const;

export function CadastrosTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border/70 pb-px">
      {ABAS.map((aba) => {
        const ativa = pathname === aba.href || pathname.startsWith(`${aba.href}/`);
        const Icon = aba.icon;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              ativa
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
