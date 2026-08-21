"use client";

import { ChevronDown, ChevronRight, Building2, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useControleFiltro } from "./filtro-empresas";

type Marca = { id: string; nome: string; corPrimaria?: string | null };
type Empresa = { id: string; nome: string; marcaId: string };

// Reserva para marca sem corPrimaria cadastrada em Marcas & CNPJs: cada marca
// ganha uma cor estável pela posição na lista (que vem ordenada por nome), em
// vez de todas caírem no mesmo cinza — a cor é o que deixa a lateral legível
// de relance. Cadastrar a corPrimaria da marca substitui a reserva.
const PALETA_RESERVA = ["#2563eb", "#d97706", "#0891b2", "#059669", "#db2777", "#7c3aed"];

// "LM Telecom" -> "LM", "Centrysol" -> "CE": iniciais das duas primeiras
// palavras, ou as duas primeiras letras quando o nome é uma palavra só.
function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/);
  const sigla =
    palavras.length >= 2 ? `${palavras[0][0]}${palavras[1][0]}` : palavras[0].slice(0, 2);
  return sigla.toUpperCase();
}

// Os tons derivam da cor da marca com color-mix, em vez de tons fixos por
// marca: corPrimaria é livre no cadastro, então tinta (8%/14%) e texto
// precisam sair de qualquer cor. Misturar o texto com --foreground escurece a
// cor no tema claro e clareia no escuro com a mesma regra.
const TINTA_FUNDO = "bg-[color-mix(in_oklab,var(--marca)_8%,transparent)]";
const TINTA_SELO = "bg-[color-mix(in_oklab,var(--marca)_14%,transparent)]";
const TEXTO_MARCA = "text-[color-mix(in_oklab,var(--marca)_75%,var(--foreground))]";

function Selo({ nome }: { nome: string }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold",
        TINTA_SELO,
        TEXTO_MARCA
      )}
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * Árvore de marcas e CNPJs — e o filtro da tela.
 *
 * Clicar na marca mostra todos os CNPJs dela; clicar num CNPJ mostra só ele;
 * "Todas as marcas" volta à visão consolidada, que é o padrão.
 *
 * Antes a árvore navegava (trocava a empresa da URL) e havia um painel de
 * checkboxes ao lado fazendo o mesmo papel — virou um controle só, no lugar
 * onde as pessoas já clicavam. O visual atual (selo com as iniciais na cor da
 * marca, trilho colorido na marca selecionada) veio do redesenho de 08/2026:
 * a lista era texto puro colado e lia como planilha.
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
  const [aberto, setAberto] = useState(false);
  const [marcasExpandidas, setMarcasExpandidas] = useState<Set<string>>(
    new Set(marcas.map(m => m.id))
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

  const corDaMarca = (marcaId: string) => {
    const indice = marcas.findIndex(m => m.id === marcaId);
    return marcas[indice]?.corPrimaria || PALETA_RESERVA[indice % PALETA_RESERVA.length];
  };

  const semFiltro = selecionadas.length === 0;

  // Marca "ativa" é aquela cuja seleção é exatamente o conjunto de CNPJs dela —
  // assim clicar na marca e clicar num a um dos seus CNPJs se distinguem.
  const marcaAtiva = (marcaId: string) => {
    const ids = (empresasPorMarca.get(marcaId) ?? []).map(e => e.id);
    return (
      ids.length > 0 &&
      ids.length === selecionadas.length &&
      ids.every(id => selecionadas.includes(id))
    );
  };

  // Resumo pra linha fechada: nome da marca se a seleção bate exatamente com
  // ela, nome do CNPJ se for um só, contagem se for mistura, ou "Todas as
  // marcas" sem filtro nenhum.
  const marcaResumo = marcas.find(m => marcaAtiva(m.id));
  const cnpjUnico =
    !marcaResumo && selecionadas.length === 1
      ? empresas.find(e => e.id === selecionadas[0])
      : undefined;
  const resumo = semFiltro
    ? "Todas as marcas"
    : marcaResumo
      ? marcaResumo.nome
      : cnpjUnico
        ? cnpjUnico.nome
        : `${selecionadas.length} selecionadas`;
  // Cor que representa a seleção atual na linha fechada: a da marca filtrada,
  // ou a da marca do CNPJ único. Mistura de marcas não tem cor.
  const corResumo = marcaResumo
    ? corDaMarca(marcaResumo.id)
    : cnpjUnico
      ? corDaMarca(cnpjUnico.marcaId)
      : undefined;

  return (
    <div className="space-y-1 py-3">
      <div className="flex items-baseline justify-between px-2 pb-0.5">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Marcas &amp; CNPJs
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {empresas.length} CNPJs
        </span>
      </div>

      <button
        onClick={() => setAberto(v => !v)}
        style={corResumo ? ({ "--marca": corResumo } as React.CSSProperties) : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          !semFiltro
            ? corResumo
              ? cn(TINTA_FUNDO, TEXTO_MARCA, "font-semibold")
              : "bg-primary/8 font-semibold text-primary"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        {corResumo ? (
          <Selo nome={marcaResumo?.nome ?? resumo} />
        ) : semFiltro ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-accent">
            <LayoutGrid className="size-3 text-accent-foreground" />
          </span>
        ) : (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-accent">
            <Building2 className="size-3 text-accent-foreground" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{resumo}</span>
        {aberto ? (
          <ChevronDown className="size-4 shrink-0" />
        ) : (
          <ChevronRight className="size-4 shrink-0" />
        )}
      </button>

      {aberto && (
        <nav className="mt-1 space-y-1 border-t pt-2">
          <button
            onClick={() => aplicar([])}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              semFiltro
                ? "bg-primary/8 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-accent">
              <LayoutGrid className="size-3 text-accent-foreground" />
            </span>
            <span>Todas as marcas</span>
          </button>

          {marcas.map(marca => {
            const empresasDaMarca = empresasPorMarca.get(marca.id) ?? [];
            const expandida = marcasExpandidas.has(marca.id);
            const ativa = marcaAtiva(marca.id);
            const cor = corDaMarca(marca.id);

            return (
              <div key={marca.id} style={{ "--marca": cor } as React.CSSProperties}>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => aplicar(empresasDaMarca.map(e => e.id))}
                    className={cn(
                      // Trilho na cor da marca quando selecionada — mesma
                      // linguagem do item ativo da navegação logo abaixo
                      // (barra + tinta leve), só que na cor da marca.
                      "relative flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-1.5 pl-3 text-left text-sm font-medium transition-colors",
                      "before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:transition-colors",
                      ativa
                        ? cn(TINTA_FUNDO, TEXTO_MARCA, "font-semibold before:bg-[var(--marca)]")
                        : "text-foreground before:bg-transparent hover:bg-accent/50"
                    )}
                  >
                    <Selo nome={marca.nome} />
                    <span className="truncate">{marca.nome}</span>
                    {empresasDaMarca.length > 1 && (
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-xs tabular-nums",
                          ativa ? TEXTO_MARCA : "text-muted-foreground"
                        )}
                      >
                        {empresasDaMarca.length}
                      </span>
                    )}
                  </button>
                  {/* Expandir é separado de filtrar: quem quer ver os CNPJs da
                      marca nem sempre quer filtrar por ela. */}
                  <button
                    onClick={() => toggleExpandir(marca.id)}
                    aria-label={expandida ? `Recolher ${marca.nome}` : `Expandir ${marca.nome}`}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    {expandida ? (
                      <ChevronDown className="size-4 shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" />
                    )}
                  </button>
                </div>

                {expandida && (
                  <div className="mt-0.5 mb-1 ml-[13px] space-y-0.5 border-l-2 border-[color-mix(in_oklab,var(--marca)_30%,transparent)] pl-2.5">
                    {empresasDaMarca.map(empresa => {
                      const soEsta = selecionadas.length === 1 && selecionadas[0] === empresa.id;
                      return (
                        <button
                          key={empresa.id}
                          onClick={() => aplicar([empresa.id])}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
                            soEsta
                              ? cn(TINTA_FUNDO, TEXTO_MARCA, "font-medium")
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
      )}
    </div>
  );
}
