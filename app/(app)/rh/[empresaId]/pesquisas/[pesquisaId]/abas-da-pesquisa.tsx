"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Abas da pesquisa — links de verdade, não abas de cliente: cada uma é uma
 * rota, então trocar de aba busca só os dados daquela tela e o endereço pode
 * ser compartilhado ("olha a lista de quem não respondeu").
 */
export function AbasDaPesquisa({
  base,
  perguntas,
  convites,
  respostas,
}: {
  base: string;
  perguntas: number;
  convites: number;
  respostas: number;
}) {
  const pathname = usePathname();

  const abas = [
    { href: base, rotulo: "Visão geral" },
    { href: `${base}/perguntas`, rotulo: "Perguntas", contagem: perguntas },
    { href: `${base}/convites`, rotulo: "Convites", contagem: convites },
    { href: `${base}/resultados`, rotulo: "Resultados", contagem: respostas },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b">
      {abas.map((aba) => {
        const ativa = aba.href === base ? pathname === base : pathname.startsWith(aba.href);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              ativa
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.rotulo}
            {aba.contagem !== undefined && (
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {aba.contagem}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
