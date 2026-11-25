"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { CLASSE_RECORTE, Segmentado } from "@/components/padroes/barra-de-filtros";
import { cn } from "@/lib/utils";
import type { FiltrosDaArea } from "@/lib/desligamentos/area";

/**
 * A barra de filtros da área Desligamentos — a mesma em todas as abas, e a
 * URL é o estado: trocar de aba leva os filtros junto (ver AbasDesligamentos)
 * e o link colado no grupo abre a mesma vista. Sem filtro de CNPJ, de
 * propósito (a área não separa por empresa).
 */
export function FiltrosDaAreaBarra({
  filtros,
  mostrarAno = false,
  mostrarPeriodo = true,
}: {
  filtros: FiltrosDaArea;
  /** O ano da meta só importa no Painel. */
  mostrarAno?: boolean;
  /** Comparações tem o próprio recorte de tempo. */
  mostrarPeriodo?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const busca = useSearchParams();
  const { periodo, ano, anoAtual } = filtros;
  const [de, setDe] = useState(periodo.de);
  const [ate, setAte] = useState(periodo.ate);
  // "Personalizado" só abre os campos de data; a URL muda no "Aplicar". Sem
  // isso, o clique navegava sem datas, o servidor voltava para o ano atual (é
  // o que ele faz com período inválido) e os campos nunca chegavam a aparecer.
  const [personalizando, setPersonalizando] = useState(periodo.chave === "personalizado");

  const navegar = (mudancas: Record<string, string | null>) => {
    const proximos = new URLSearchParams(busca.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") proximos.delete(chave);
      else proximos.set(chave, valor);
    }
    const qs = proximos.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const temFiltro = filtros.setor || filtros.gestor || periodo.chave !== "ano" || ano !== anoAtual;
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];

  return (
    <div className="flex flex-wrap items-end gap-3">
      {mostrarPeriodo && (
        <Segmentado
          rotulo="Período"
          valor={personalizando ? "personalizado" : periodo.chave}
          aoMudar={(v) => {
            if (v === "personalizado") {
              setPersonalizando(true);
              return;
            }
            setPersonalizando(false);
            navegar({ periodo: v === "ano" ? null : v, de: null, ate: null });
          }}
          opcoes={[
            { valor: "ano", label: "Ano atual" },
            { valor: "12m", label: "12 meses" },
            { valor: "24m", label: "24 meses" },
            { valor: "personalizado", label: "Personalizado" },
          ]}
        />
      )}
      {mostrarPeriodo && personalizando && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!de || !ate || de > ate) return;
            navegar({ periodo: "personalizado", de, ate });
          }}
        >
          <label className="text-xs text-muted-foreground">
            De
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={cn(CLASSE_RECORTE, "block")} />
          </label>
          <label className="text-xs text-muted-foreground">
            Até
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={cn(CLASSE_RECORTE, "block")} />
          </label>
          <button
            type="submit"
            disabled={!de || !ate || de > ate}
            title={de && ate && de > ate ? "A data inicial é depois da final." : undefined}
            className="h-9 border border-input px-3 text-[13px] hover:bg-muted disabled:opacity-50"
          >
            Aplicar
          </button>
        </form>
      )}
      <label className="text-xs text-muted-foreground">
        Setor
        <select
          value={filtros.setor ?? ""}
          onChange={(e) => navegar({ setor: e.target.value || null })}
          className={cn(CLASSE_RECORTE, "block")}
        >
          <option value="">Todos os setores</option>
          {filtros.setores.map((s) => (
            <option key={s.chave} value={s.chave}>
              {s.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Gestor
        <select
          value={filtros.gestor ?? ""}
          onChange={(e) => navegar({ gestor: e.target.value || null })}
          className={cn(CLASSE_RECORTE, "block")}
        >
          <option value="">Todos os gestores</option>
          {filtros.gestores.map((g) => (
            <option key={g.chave} value={g.chave}>
              {g.nome}
            </option>
          ))}
        </select>
      </label>
      {mostrarAno && (
        <label className="text-xs text-muted-foreground">
          Ano da meta
          <select
            value={String(ano)}
            onChange={(e) => navegar({ ano: e.target.value === String(anoAtual) ? null : e.target.value })}
            className={cn(CLASSE_RECORTE, "block")}
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
      {temFiltro && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="h-9 px-2 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

/**
 * "Exportar PDF" — o relatório da área com os MESMOS filtros da tela, para a
 * reunião de gerentes. Abre em outra aba (o relatório chama a impressão).
 */
export function BotaoExportarPdf({ empresaId }: { empresaId: string }) {
  const busca = useSearchParams();
  const qs = new URLSearchParams();
  for (const chave of ["periodo", "de", "ate", "setor", "gestor", "ano"]) {
    const v = busca.get(chave);
    if (v) qs.set(chave, v);
  }
  const consulta = qs.toString();
  return (
    <a
      href={`/api/rh/${empresaId}/desligamentos/relatorio-pdf${consulta ? `?${consulta}` : ""}`}
      target="_blank"
      rel="noopener"
      className="inline-flex h-8 items-center gap-1.5 border border-input px-3 text-[13px] font-medium hover:bg-muted"
    >
      <FileDown className="size-4" />
      Exportar PDF
    </a>
  );
}
