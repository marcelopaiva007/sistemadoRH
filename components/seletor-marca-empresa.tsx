"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Selo, corDaMarca } from "@/components/marca-visual";
import { trocarEmpresaNoCaminho } from "@/app/(app)/rh/[empresaId]/filtro-empresas";

type Marca = { id: string; nome: string; corPrimaria: string | null };
type Empresa = { id: string; nome: string; marcaId: string };

const PARAM = "empresas";

/**
 * Troca de marca/CNPJ na barra de topo — visível em toda a área logada, não só
 * dentro de `/rh/[empresaId]` (onde antes existia como árvore na lateral,
 * `lista-empresas.tsx`, removida por fazer o mesmo papel deste seletor num
 * lugar só alcançável de dentro de uma empresa). Dois segmentos: o da
 * esquerda pula direto para a visão consolidada de uma marca; o da direita
 * lista todos os CNPJs, agrupados por marca, para entrar num específico.
 *
 * Dentro de `/rh/[empresaId]`, reaproveita o MESMO mecanismo de
 * `filtro-empresas.tsx` (querystring `?empresas=`, trocando só o segmento da
 * URL) — não é um controle paralelo. Fora dali (Início, Usuários,
 * Produtividade RH, Atualizações) não há "empresa atual" nenhuma para
 * filtrar, então a escolha navega direto para `/rh/<empresa>`, igual ao que os
 * cartões da home já fazem.
 */
export function SeletorMarcaEmpresa({
  marcas,
  empresas,
}: {
  marcas: Marca[];
  empresas: Empresa[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const raizRef = useRef<HTMLDivElement>(null);

  const [abertoMarca, setAbertoMarca] = useState(false);
  const [abertoLista, setAbertoLista] = useState(false);

  // Fecha os dois popovers ao clicar fora, trocar de rota, ou apertar Esc —
  // sem isto o painel fica flutuando por cima da tela até um novo clique nele
  // mesmo.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAbertoMarca(false);
        setAbertoLista(false);
      }
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbertoMarca(false);
        setAbertoLista(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  if (marcas.length === 0) return null;

  const partes = pathname.split("/");
  const dentroDeEmpresa = partes[1] === "rh" && empresas.some((e) => e.id === partes[2]);
  const empresaIdAtual = dentroDeEmpresa ? partes[2] : null;

  const selecionadas = dentroDeEmpresa
    ? (searchParams.get(PARAM) ?? "").split(",").filter(Boolean)
    : [];
  const semFiltro = !dentroDeEmpresa || selecionadas.length === 0;

  const empresasPorMarca = new Map<string, Empresa[]>();
  for (const e of empresas) {
    if (!empresasPorMarca.has(e.marcaId)) empresasPorMarca.set(e.marcaId, []);
    empresasPorMarca.get(e.marcaId)!.push(e);
  }

  // Marca "ativa" é aquela cuja seleção é exatamente o conjunto de CNPJs dela —
  // mesma regra herdada da antiga árvore lateral, para o rótulo concordar com
  // o que `?empresas=` já significa para o resto das telas do módulo.
  const marcaAtiva =
    dentroDeEmpresa && !semFiltro
      ? marcas.find((m) => {
          const ids = (empresasPorMarca.get(m.id) ?? []).map((e) => e.id);
          return (
            ids.length > 0 &&
            ids.length === selecionadas.length &&
            ids.every((id) => selecionadas.includes(id))
          );
        })
      : undefined;

  const cnpjUnico =
    dentroDeEmpresa && !semFiltro && !marcaAtiva && selecionadas.length === 1
      ? empresas.find((e) => e.id === selecionadas[0])
      : undefined;

  const rotuloMarca = !dentroDeEmpresa
    ? "Selecionar marca"
    : semFiltro
      ? "Todas as marcas"
      : marcaAtiva
        ? marcaAtiva.nome
        : cnpjUnico
          ? (marcas.find((m) => m.id === cnpjUnico.marcaId)?.nome ?? cnpjUnico.nome)
          : `${selecionadas.length} marcas`;

  const rotuloEmpresa = !dentroDeEmpresa
    ? "—"
    : semFiltro
      ? "Todos os CNPJs"
      : marcaAtiva
        ? "Todos desta marca"
        : cnpjUnico
          ? cnpjUnico.nome
          : `${selecionadas.length} selecionados`;

  const corMarcaAtiva = marcaAtiva
    ? corDaMarca(marcas, marcaAtiva.id)
    : cnpjUnico
      ? corDaMarca(marcas, cnpjUnico.marcaId)
      : undefined;

  // Marca em foco: a marca que já está selecionada (inteira ou por um único
  // CNPJ dela). Enquanto uma marca está em foco, o segmento 2 mostra só os
  // CNPJs DELA — antes mostrava sempre a lista inteira das 4 marcas de novo,
  // o que lia como se a escolha do segmento 1 não tivesse feito nada. Sem
  // marca em foco (nada selecionado, seleção mista, ou fora de /rh) o
  // segmento 2 volta a ser o atalho completo para qualquer CNPJ.
  const marcaEmFoco =
    marcaAtiva ?? (cnpjUnico ? marcas.find((m) => m.id === cnpjUnico.marcaId) : undefined);

  // Aplica a seleção: dentro de /rh troca só a querystring (e o segmento da
  // URL quando sobra 1 CNPJ só, para o cadastro novo saber onde entrar — regra
  // de filtro-empresas.tsx::aplicar); fora de /rh não há onde filtrar, então
  // navega para dentro da empresa, igual aos cartões da home.
  function selecionar(ids: string[]) {
    if (ids.length === 0) return;
    if (dentroDeEmpresa && empresaIdAtual) {
      const params = new URLSearchParams(searchParams.toString());
      params.set(PARAM, ids.join(","));
      const base =
        ids.length === 1 ? trocarEmpresaNoCaminho(pathname, empresaIdAtual, ids[0]) : pathname;
      router.replace(`${base}?${params.toString()}`, { scroll: false });
    } else {
      router.push(`/rh/${ids[0]}?empresas=${ids.join(",")}`);
    }
    setAbertoMarca(false);
    setAbertoLista(false);
  }

  return (
    <div ref={raizRef} className="relative flex shrink-0 items-stretch">
      <div className="flex items-stretch rounded-[10px] border border-border bg-card">
        {/* Segmento 1: pula direto para a visão consolidada de uma marca. */}
        <div className="relative">
          <button
            type="button"
            aria-expanded={abertoMarca}
            title={rotuloMarca}
            onClick={() => {
              setAbertoMarca((v) => !v);
              setAbertoLista(false);
            }}
            className="flex h-full items-center gap-1.5 rounded-l-[10px] px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/60"
          >
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-36 truncate font-semibold text-foreground">{rotuloMarca}</span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                abertoMarca && "rotate-180"
              )}
            />
          </button>

          {abertoMarca && (
            <div className="absolute top-[calc(100%+8px)] left-0 z-50 w-56 rounded-[10px] bg-popover p-1.5 shadow-lg ring-1 ring-foreground/10">
              {marcas.map((marca) => {
                const idsDaMarca = (empresasPorMarca.get(marca.id) ?? []).map((e) => e.id);
                const ativa = marcaAtiva?.id === marca.id;
                const cor = corDaMarca(marcas, marca.id);
                return (
                  <button
                    key={marca.id}
                    type="button"
                    onClick={() => selecionar(idsDaMarca)}
                    style={{ "--marca": cor } as React.CSSProperties}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      ativa
                        ? "bg-[color-mix(in_oklab,var(--marca)_8%,transparent)] font-semibold text-[color-mix(in_oklab,var(--marca)_75%,var(--foreground))]"
                        : "text-foreground hover:bg-accent/50"
                    )}
                  >
                    <Selo nome={marca.nome} />
                    <span className="min-w-0 flex-1 truncate">{marca.nome}</span>
                    {idsDaMarca.length > 1 && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {idsDaMarca.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="w-px shrink-0 bg-border" />

        {/* Segmento 2: lista completa, agrupada por marca, para entrar num CNPJ específico. */}
        <div className="relative">
          <button
            type="button"
            aria-expanded={abertoLista}
            title={rotuloEmpresa}
            onClick={() => {
              setAbertoLista((v) => !v);
              setAbertoMarca(false);
            }}
            style={corMarcaAtiva ? ({ "--marca": corMarcaAtiva } as React.CSSProperties) : undefined}
            className="flex h-full items-center gap-1.5 rounded-r-[10px] px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/60"
          >
            <span
              className={cn(
                "max-w-48 truncate",
                corMarcaAtiva
                  ? "text-[color-mix(in_oklab,var(--marca)_75%,var(--foreground))]"
                  : "text-muted-foreground"
              )}
            >
              {rotuloEmpresa}
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                abertoLista && "rotate-180"
              )}
            />
          </button>

          {abertoLista && (
            <div className="absolute top-[calc(100%+8px)] right-0 z-50 max-h-96 w-72 overflow-y-auto rounded-[10px] bg-popover p-1.5 shadow-lg ring-1 ring-foreground/10">
              {marcaEmFoco && (
                <>
                  {/* Volta para a marca inteira sem passar pelo segmento 1 —
                      é o par de "entrei num CNPJ e quero o consolidado". */}
                  <button
                    type="button"
                    onClick={() =>
                      selecionar((empresasPorMarca.get(marcaEmFoco.id) ?? []).map((e) => e.id))
                    }
                    className={cn(
                      "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      marcaAtiva
                        ? "bg-primary/8 font-medium text-primary"
                        : "text-foreground hover:bg-accent/50"
                    )}
                  >
                    Todos os CNPJs de {marcaEmFoco.nome}
                  </button>
                  <div className="my-1 h-px bg-border" />
                </>
              )}

              {(marcaEmFoco ? [marcaEmFoco] : marcas).map((marca) => {
                const lista = empresasPorMarca.get(marca.id) ?? [];
                if (lista.length === 0) return null;
                return (
                  <div key={marca.id} className="mb-1 last:mb-0">
                    {/* Com uma marca em foco o cabeçalho seria eco do rótulo
                        do botão acima — só aparece na lista completa. */}
                    {!marcaEmFoco && (
                      <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                        {marca.nome}
                      </p>
                    )}
                    {lista.map((empresa) => {
                      const ativa = cnpjUnico?.id === empresa.id;
                      return (
                        <button
                          key={empresa.id}
                          type="button"
                          onClick={() => selecionar([empresa.id])}
                          className={cn(
                            "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            ativa
                              ? "bg-primary/8 font-medium text-primary"
                              : "text-foreground hover:bg-accent/50"
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{empresa.nome}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
