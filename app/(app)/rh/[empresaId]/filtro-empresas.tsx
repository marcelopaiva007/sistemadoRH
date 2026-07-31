"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const PARAM = "empresas";

// Lista de CNPJs marcados, lida da URL. Vazia = sem filtro = todas as marcas.
function lerFiltro(searchParams: URLSearchParams | ReadonlyURLSearchParams): string[] {
  const bruto = searchParams.get(PARAM);
  if (!bruto) return [];
  return bruto.split(",").filter(Boolean);
}

type ReadonlyURLSearchParams = ReturnType<typeof useSearchParams>;

type Marca = {
  id: string;
  nome: string;
};

type Empresa = {
  id: string;
  nome: string;
  marcaId: string;
};

export function FiltroEmpresas({
  marcas,
  empresas,
  usuarioEmpresas,
}: {
  marcas: Marca[];
  empresas: Empresa[];
  usuarioEmpresas: string[]; // IDs das empresas que o usuário tem acesso
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // O filtro mora na URL, não em estado local nem em sessionStorage. Três
  // motivos: o seletor fica no layout e as tabelas ficam nas páginas, sem
  // canal entre eles; o seletor é renderizado duas vezes (desktop e celular),
  // que precisam concordar; e sessionStorage não avisa ninguém quando muda.
  // useSearchParams é reativo, então marcar um CNPJ re-renderiza as listas.
  const filtroSelecionado = lerFiltro(searchParams);

  const salvarFiltro = (novoFiltro: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (novoFiltro.length === 0) params.delete(PARAM);
    else params.set(PARAM, novoFiltro.join(","));
    const query = params.toString();
    // replace e não push: filtrar não é navegação, não deve encher o histórico.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Obter empresas disponíveis para o usuário (apenas as que ele tem acesso)
  const empresasDisponiveis = empresas.filter((e) =>
    usuarioEmpresas.includes(e.id)
  );

  // Checkbox de marca: marca/desmarca todos os CNPJs da marca
  const toggleMarca = (marcaId: string) => {
    const cnpjsDaMarca = empresasDisponiveis
      .filter((e) => e.marcaId === marcaId)
      .map((e) => e.id);

    const todosChecked = cnpjsDaMarca.every((id) =>
      filtroSelecionado.includes(id)
    );

    if (todosChecked) {
      // Desmarcar todos
      salvarFiltro(
        filtroSelecionado.filter((id) => !cnpjsDaMarca.includes(id))
      );
    } else {
      // Marcar todos
      const novo = new Set(filtroSelecionado);
      cnpjsDaMarca.forEach((id) => novo.add(id));
      salvarFiltro(Array.from(novo));
    }
  };

  // Checkbox de CNPJ individual
  const toggleEmpresa = (empresaId: string) => {
    if (filtroSelecionado.includes(empresaId)) {
      salvarFiltro(filtroSelecionado.filter((id) => id !== empresaId));
    } else {
      salvarFiltro([...filtroSelecionado, empresaId]);
    }
  };

  // Texto do botão
  const labelBotao =
    filtroSelecionado.length === 0
      ? "Todas as marcas"
      : filtroSelecionado.length === 1
        ? empresasDisponiveis.find((e) => e.id === filtroSelecionado[0])
            ?.nome ?? "Filtrar"
        : `${filtroSelecionado.length} CNPJ${filtroSelecionado.length > 1 ? "s" : ""} selecionado${filtroSelecionado.length > 1 ? "s" : ""}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="w-full justify-between" />}>
        <span className="flex items-center gap-2">
          <Building2 className="size-4" />
          <span className="truncate">{labelBotao}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-4" align="start">
        <div className="space-y-4">
          {/* Opção: Todas as marcas */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Filtrar por marca</h3>
            {marcas.map((marca) => {
              const cnpjsDaMarca = empresasDisponiveis.filter(
                (e) => e.marcaId === marca.id
              );
              if (cnpjsDaMarca.length === 0) return null;

              const todosChecked = cnpjsDaMarca.every((e) =>
                filtroSelecionado.includes(e.id)
              );
              const algumChecked = cnpjsDaMarca.some((e) =>
                filtroSelecionado.includes(e.id)
              );

              return (
                <div key={marca.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`marca-${marca.id}`}
                      checked={todosChecked}
                      indeterminate={algumChecked && !todosChecked}
                      onCheckedChange={() => toggleMarca(marca.id)}
                    />
                    <Label htmlFor={`marca-${marca.id}`} className="font-medium cursor-pointer">
                      {marca.nome}
                    </Label>
                  </div>

                  {/* CNPJs individuais da marca */}
                  <div className="ml-6 space-y-1.5">
                    {cnpjsDaMarca.map((empresa) => (
                      <div key={empresa.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`empresa-${empresa.id}`}
                          checked={filtroSelecionado.includes(empresa.id)}
                          onCheckedChange={() => toggleEmpresa(empresa.id)}
                        />
                        <Label
                          htmlFor={`empresa-${empresa.id}`}
                          className="text-xs cursor-pointer text-muted-foreground"
                        >
                          {empresa.nome}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Botão limpar filtro */}
          {filtroSelecionado.length > 0 && (
            <div className="border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  salvarFiltro([]);
                  setOpen(false);
                }}
              >
                Limpar filtro
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Empresas que a tela atual deve mostrar. Sem filtro na URL, devolve tudo que
 * o usuário enxerga — a visão consolidada é o padrão.
 *
 * Lê da URL, não de sessionStorage: a versão anterior lia uma vez na montagem
 * e nunca mais, então marcar um CNPJ não mexia na lista até dar F5.
 */
export function useFiltroEmpresas(usuarioEmpresas: string[]) {
  const searchParams = useSearchParams();
  const bruto = searchParams.get(PARAM) ?? "";
  // Chaves em texto, não os arrays: quem consome põe o retorno em dependência
  // de useEffect que chama setState. Devolver array novo a cada render fecha o
  // laço render -> efeito -> setState -> render e congela a tela.
  const chaveUsuario = usuarioEmpresas.join(",");

  return useMemo(() => {
    const todas = chaveUsuario ? chaveUsuario.split(",") : [];
    const filtro = bruto.split(",").filter(Boolean);
    if (filtro.length === 0) return todas;
    // Interseção: um CNPJ digitado na URL que o usuário não enxerga não vira
    // acesso.
    return filtro.filter((id) => todas.includes(id));
  }, [bruto, chaveUsuario]);
}
