"use client";

import { ChevronDown, ChevronRight, Building2, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useControleFiltro } from "./filtro-empresas";

type Marca = { id: string; nome: string };
type Empresa = { id: string; nome: string; marcaId: string };

/**
 * Árvore de marcas e CNPJs — e o filtro da tela.
 *
 * Clicar na marca mostra todos os CNPJs dela; clicar num CNPJ mostra só ele;
 * "Todas as marcas" volta à visão consolidada, que é o padrão.
 *
 * Antes a árvore navegava (trocava a empresa da URL) e havia um painel de
 * checkboxes ao lado fazendo o filtro. Dois controles parecidos, um ao lado do
 * outro, com comportamentos diferentes: clicar na árvore parecia filtrar por
 * CNPJ, e o filtro por marca ficava escondido no painel. Virou um controle só,
 * no lugar onde as pessoas já clicavam.
 */
export function ListaEmpresas({
  marcas,
  empresas,
  empresaIdAtiva,
}: {
  marcas: Marca[];
  empresas: Empresa[];
  empresaIdAtiva: string;
}) {
  const { selecionadas, aplicar } = useControleFiltro(empresaIdAtiva);
  const [marcasExpandidas, setMarcasExpandidas] = useState<Set<string>>(
    new Set(marcas.map((m) => m.id)),
  );

  const toggleExpandir = (marcaId: string) => {
    const novo = new Set(marcasExpandidas);
    if (novo.has(marcaId)) novo.delete(marcaId);
    else novo.add(marcaId);
    setMarcasExpandidas(novo);
  };

  const empresasPorMarca = new Map<string, Empresa[]>();
  for (const empresa of empresas) {
    if (!empresasPorMarca.has(empresa.marcaId)) empresasPorMarca.set(empresa.marcaId, []);
    empresasPorMarca.get(empresa.marcaId)!.push(empresa);
  }

  const semFiltro = selecionadas.length === 0;

  // Marca "ativa" é aquela cuja seleção é exatamente o conjunto de CNPJs dela —
  // assim clicar na marca e clicar num a um dos seus CNPJs se distinguem.
  const marcaAtiva = (marcaId: string) => {
    const ids = (empresasPorMarca.get(marcaId) ?? []).map((e) => e.id);
    return (
      ids.length > 0 &&
      ids.length === selecionadas.length &&
      ids.every((id) => selecionadas.includes(id))
    );
  };

  return (
    <nav className="space-y-1 py-3">
      <button
        onClick={() => aplicar([])}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
          semFiltro
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <Check className={cn("size-4 shrink-0", !semFiltro && "opacity-0")} />
        <span>Todas as marcas</span>
      </button>

      {marcas.map((marca) => {
        const empresasDaMarca = empresasPorMarca.get(marca.id) ?? [];
        const expandida = marcasExpandidas.has(marca.id);
        const ativa = marcaAtiva(marca.id);

        return (
          <div key={marca.id}>
            <div className="flex items-center">
              {/* Expandir é separado de filtrar: quem quer ver os CNPJs da marca
                  nem sempre quer filtrar por ela. */}
              <button
                onClick={() => toggleExpandir(marca.id)}
                aria-label={expandida ? `Recolher ${marca.nome}` : `Expandir ${marca.nome}`}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                {expandida ? (
                  <ChevronDown className="size-4 shrink-0" />
                ) : (
                  <ChevronRight className="size-4 shrink-0" />
                )}
              </button>
              <button
                onClick={() => aplicar(empresasDaMarca.map((e) => e.id))}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1.5 text-left text-sm font-medium transition-colors",
                  ativa
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent/50",
                )}
              >
                <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{marca.nome}</span>
                {empresasDaMarca.length > 1 && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {empresasDaMarca.length}
                  </span>
                )}
              </button>
            </div>

            {expandida && (
              <div className="ml-3 space-y-0.5 border-l border-border pl-3">
                {empresasDaMarca.map((empresa) => {
                  const soEsta = selecionadas.length === 1 && selecionadas[0] === empresa.id;
                  return (
                    <button
                      key={empresa.id}
                      onClick={() => aplicar([empresa.id])}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors",
                        soEsta
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{empresa.nome}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
