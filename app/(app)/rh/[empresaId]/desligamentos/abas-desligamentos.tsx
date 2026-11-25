"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Os filtros da área que viajam entre as abas de análise. */
const PARAMETROS_DA_AREA = ["periodo", "de", "ate", "setor", "gestor", "ano"];

/**
 * Abas da área Desligamentos — links de verdade (mesmo padrão das abas da
 * pesquisa): cada aba é uma rota, busca só o que mostra, e o endereço pode ir
 * para a reunião de gerentes.
 *
 * Os filtros da área (período, setor, gestor, ano) acompanham a troca entre as
 * abas de análise — quem filtrou o Comercial no Painel abre Motivos já no
 * Comercial. A aba Registros é trabalho de DP, por empresa: leva só o filtro
 * de CNPJ da lateral (`?empresas=`), que as análises ignoram de propósito.
 */
export function AbasDesligamentos({ base }: { base: string }) {
  const pathname = usePathname();
  const busca = useSearchParams();

  const daArea = new URLSearchParams();
  for (const chave of PARAMETROS_DA_AREA) {
    const v = busca.get(chave);
    if (v) daArea.set(chave, v);
  }
  const qsArea = daArea.toString();
  const empresas = busca.get("empresas");

  const abas = [
    { href: base, rotulo: "Painel", consulta: qsArea },
    { href: `${base}/motivos`, rotulo: "Motivos", consulta: qsArea },
    { href: `${base}/contratacao`, rotulo: "Contratação errada", consulta: qsArea },
    { href: `${base}/comparacoes`, rotulo: "Comparações", consulta: qsArea },
    { href: `${base}/pendencias`, rotulo: "Pendências", consulta: qsArea },
    { href: `${base}/registros`, rotulo: "Registros", consulta: empresas ? `empresas=${encodeURIComponent(empresas)}` : "" },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Seções da área Desligamentos">
      {abas.map((aba) => {
        const ativa = aba.href === base ? pathname === base : pathname.startsWith(aba.href);
        return (
          <Link
            key={aba.href}
            href={aba.consulta ? `${aba.href}?${aba.consulta}` : aba.href}
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
