"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Abas da área Desligamentos — links de verdade (mesmo padrão das abas da
 * pesquisa): cada aba é uma rota, busca só o que mostra, e o endereço pode ir
 * para a reunião de gerentes.
 *
 * O filtro de CNPJ da lateral (`?empresas=`) atravessa as abas: o painel o
 * ignora (a área não separa por CNPJ), mas a aba Registros — trabalho de DP,
 * por empresa — continua respeitando.
 */
export function AbasDesligamentos({ base }: { base: string }) {
  const pathname = usePathname();
  const busca = useSearchParams();
  const empresas = busca.get("empresas");
  const comFiltro = (href: string) => (empresas ? `${href}?empresas=${encodeURIComponent(empresas)}` : href);

  const abas = [
    { href: base, rotulo: "Painel" },
    { href: `${base}/registros`, rotulo: "Registros" },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Seções da área Desligamentos">
      {abas.map((aba) => {
        const ativa = aba.href === base ? pathname === base : pathname.startsWith(aba.href);
        return (
          <Link
            key={aba.href}
            href={comFiltro(aba.href)}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              ativa
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
