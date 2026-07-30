"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Marca = { id: string; nome: string };
type Empresa = { id: string; nome: string; marcaId: string };

export function ListaEmpresas({
  marcas,
  empresas,
  empresaIdAtiva,
}: {
  marcas: Marca[];
  empresas: Empresa[];
  empresaIdAtiva: string;
}) {
  const pathname = usePathname();
  const [marcasExpandidas, setMarcasExpandidas] = useState<Set<string>>(
    new Set(marcas.map((m) => m.id))
  );

  const toggleMarca = (marcaId: string) => {
    const novo = new Set(marcasExpandidas);
    if (novo.has(marcaId)) novo.delete(marcaId);
    else novo.add(marcaId);
    setMarcasExpandidas(novo);
  };

  const empresasPorMarca = new Map<string, Empresa[]>();
  for (const empresa of empresas) {
    if (!empresasPorMarca.has(empresa.marcaId)) {
      empresasPorMarca.set(empresa.marcaId, []);
    }
    empresasPorMarca.get(empresa.marcaId)!.push(empresa);
  }

  return (
    <nav className="space-y-1 py-3">
      {marcas.map((marca) => {
        const empresasDaMarca = empresasPorMarca.get(marca.id) || [];
        const expandida = marcasExpandidas.has(marca.id);

        return (
          <div key={marca.id}>
            {/* Cabeçalho da marca */}
            <button
              onClick={() => toggleMarca(marca.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm font-medium transition-colors",
                "hover:bg-accent/50 text-foreground"
              )}
            >
              {expandida ? (
                <ChevronDown className="size-4 shrink-0" />
              ) : (
                <ChevronRight className="size-4 shrink-0" />
              )}
              <Building2 className="size-3.5 text-muted-foreground" />
              <span>{marca.nome}</span>
            </button>

            {/* CNPJs da marca */}
            {expandida && (
              <div className="ml-3 space-y-0.5 border-l border-border pl-3">
                {empresasDaMarca.map((empresa) => {
                  const ativa = empresa.id === empresaIdAtiva;
                  return (
                    <Link
                      key={empresa.id}
                      href={`/rh/${empresa.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors",
                        ativa
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                    >
                      <span className="truncate">{empresa.nome}</span>
                    </Link>
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
