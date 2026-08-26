"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// O seletor da porta de diretoria/RH: setor e janela viram parâmetros de URL,
// como em todas as telas de BI — a URL é o estado, e um link colado no grupo
// abre exatamente a mesma vista.
export function SeletorSetor({
  setores,
  setorAtual,
  janelaAtual,
}: {
  setores: { nome: string; ativos: number }[];
  setorAtual: string;
  janelaAtual: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const navegar = (chave: string, valor: string) => {
    const proximos = new URLSearchParams(params.toString());
    proximos.set(chave, valor);
    router.push(`${pathname}?${proximos.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Setor</span>
        <select
          value={setorAtual}
          onChange={(e) => navegar("setor", e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          {setores.map((s) => (
            <option key={s.nome} value={s.nome}>
              {s.nome} ({s.ativos})
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1 text-sm">
        <span className="mr-1 text-muted-foreground">Janela</span>
        {[3, 6, 12, 24].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => navegar("janela", String(m))}
            className={
              m === janelaAtual
                ? "h-8 rounded-md bg-primary/10 px-2.5 font-semibold text-primary"
                : "h-8 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            {m}m
          </button>
        ))}
      </div>
    </div>
  );
}
