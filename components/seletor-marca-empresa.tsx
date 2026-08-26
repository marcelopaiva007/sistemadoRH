"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronDown, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { Selo, corDaMarca } from "@/components/marca-visual";
import { urlDoFiltro, PARAM } from "@/app/(app)/rh/[empresaId]/filtro-empresas";
import { moduloDoCaminho, SLUGS_COM_EMPRESA } from "@/components/modulos";

type Marca = { id: string; nome: string; corPrimaria: string | null };
type Empresa = { id: string; nome: string; marcaId: string };

/**
 * Troca de marca/CNPJ na barra de topo — visível em toda a área logada, não só
 * dentro de `/rh/[empresaId]` (onde antes existia como árvore na lateral,
 * `lista-empresas.tsx`, removida por fazer o mesmo papel deste seletor num
 * lugar só alcançável de dentro de uma empresa). Dois segmentos: o da
 * esquerda escolhe a marca (ou "Todas as marcas", que limpa o filtro); o da
 * direita entra num CNPJ. O segundo tem DUAS formas, e é de propósito — com
 * uma marca em foco ele mostra só os CNPJs dela, sem marca em foco ele é a
 * lista completa agrupada por marca. Ver o comentário de `marcaEmFoco`.
 *
 * Dentro de um módulo escopado por empresa (`/rh/<empresa>`,
 * `/processos/<empresa>` — ver components/modulos.ts), reaproveita o MESMO
 * mecanismo de `filtro-empresas.tsx` (querystring `?empresas=`, trocando só o
 * segmento da URL) — não é um controle paralelo. Fora dali (Início, Usuários,
 * Produtividade RH, Atualizações) não há "empresa atual" nenhuma para
 * filtrar, então a escolha navega direto para `/<módulo>/<empresa>`, igual ao
 * que os cartões da home já fazem.
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

  // Fecha os dois popovers ao clicar fora, apertar Esc, ou navegar pelo
  // histórico do navegador — sem isto o painel fica flutuando por cima da tela.
  //
  // `popstate` está aqui porque este componente vive no layout de (app) e NÃO
  // remonta entre rotas: o Voltar/Avançar do navegador (e o gesto de swipe do
  // trackpad) troca a página sem passar por mousedown nem por Escape, e o
  // painel aberto atravessava a navegação. Fechar por efeito na troca de
  // `pathname` seria o caminho óbvio, mas é setState dentro de efeito — o que
  // o eslint do projeto barra (react-hooks/set-state-in-effect).
  useEffect(() => {
    function fechar() {
      setAbertoMarca(false);
      setAbertoLista(false);
    }
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) fechar();
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("popstate", fechar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("popstate", fechar);
    };
  }, []);

  if (marcas.length === 0) return null;

  const partes = pathname.split("/");
  // Qualquer modulo escopado por empresa, e nao so o RH: a partir do segundo
  // modulo (Processos & Ativos, 23/08/2026) travar isto em "rh" faria o seletor
  // se comportar como se estivesse FORA de uma empresa dentro do modulo novo —
  // e o `selecionar` de baixo jogaria quem troca de CNPJ de volta no RH, sem
  // aviso. Ver components/modulos.ts.
  const dentroDeEmpresa =
    SLUGS_COM_EMPRESA.includes(partes[1]) && empresas.some((e) => e.id === partes[2]);
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
    // Nunca chega a ser exibido: fora de uma empresa o segmento inteiro some
    // (ver abaixo). Fica como string vazia em vez de "—" para o dia em que
    // alguém reintroduzir o segmento sem ler este comentário.
    ? ""
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

  // Aplica a seleção: dentro de /rh mexe na querystring e no segmento de
  // empresa da URL; fora de /rh não há o que filtrar, então navega para dentro
  // da empresa, igual aos cartões da home.
  //
  // Lista VAZIA é "Todas as marcas": apaga o filtro e volta à visão consolidada
  // do grupo. Sem esse caminho o seletor nomeava um estado ("Todas as marcas",
  // "Todos os CNPJs", nos rótulos acima) que ele mesmo não conseguia alcançar —
  // escolher uma marca virava viagem sem volta, a não ser editando a URL.
  function selecionar(ids: string[]) {
    if (dentroDeEmpresa && empresaIdAtual) {
      // A conta de para-onde-ir é a MESMA da árvore de filtro das telas — mora
      // em filtro-empresas.tsx e é testada em scripts/test-troca-empresa-caminho.ts.
      router.replace(
        urlDoFiltro({
          empresaIds: ids,
          pathname,
          busca: searchParams.toString(),
          empresaIdAtual,
        }),
        { scroll: false },
      );
    } else {
      // Fora de um módulo escopado não existe "limpar filtro": a tela inicial
      // já é a visão do grupo inteiro, e o item "Todas as marcas" nem é
      // renderizado ali.
      if (ids.length === 0) return;
      // Entra no módulo em que a pessoa está, e não sempre no RH: escolher um
      // CNPJ na raiz de Processos & Ativos tem que continuar em Processos &
      // Ativos. Só as telas sem módulo (Início, Usuários, Produtividade RH,
      // Atualizações) caem no RH, que é de onde elas vieram.
      const modulo = moduloDoCaminho(pathname);
      const destino = modulo?.escopadoPorEmpresa ? modulo.slug : "rh";
      router.push(`/${destino}/${ids[0]}?empresas=${ids.join(",")}`);
    }
    setAbertoMarca(false);
    setAbertoLista(false);
  }

  // `min-w-0` em vez de `shrink-0`: os rótulos dentro já truncam
  // (`max-w-36`/`max-w-48`), mas com o container travado eles nunca chegavam a
  // truncar — a barra inteira é que crescia e levava a página junto no celular.
  return (
    <div ref={raizRef} className="relative flex min-w-0 items-stretch">
      {/* `min-w-0` em CADA nível até o rótulo: o encolhimento é uma corrente —
          bastou a caixa interna não ter o dela para, na linha apertada, ela
          transbordar PINTANDO por cima do vizinho da direita (foi o que
          atropelou "Usuários e perfis" na v1.120.1). */}
      <div className="flex min-w-0 items-stretch rounded-[10px] border border-border bg-card">
        {/* Segmento 1: pula direto para a visão consolidada de uma marca. */}
        <div className="relative flex min-w-0">
          <button
            type="button"
            aria-expanded={abertoMarca}
            title={rotuloMarca}
            onClick={() => {
              setAbertoMarca((v) => !v);
              setAbertoLista(false);
            }}
            className={cn(
              "flex h-full min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/60",
              dentroDeEmpresa ? "rounded-l-[10px]" : "rounded-[10px]",
            )}
          >
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-20 truncate font-semibold text-foreground sm:max-w-36">{rotuloMarca}</span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                abertoMarca && "rotate-180"
              )}
            />
          </button>

          {abertoMarca && (
            <div className="absolute top-[calc(100%+8px)] left-0 z-50 w-56 rounded-[10px] bg-popover p-1.5 shadow-lg ring-1 ring-foreground/10">
              {/* Só dentro de /rh: é o botão de LIMPAR o filtro, e fora do
                  módulo não há filtro nenhum para limpar (a tela inicial já é a
                  visão do grupo). Mesmo ícone e rótulo da árvore lateral que
                  este seletor substituiu, para quem já usava não reaprender. */}
              {dentroDeEmpresa && (
                <>
                  <button
                    type="button"
                    onClick={() => selecionar([])}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      semFiltro
                        ? "bg-primary/8 font-medium text-primary"
                        : "text-foreground hover:bg-accent/50"
                    )}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-accent">
                      <LayoutGrid className="size-3 text-accent-foreground" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">Todas as marcas</span>
                  </button>
                  <div className="my-1 h-px bg-border" />
                </>
              )}

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

        {/* Segmento 2 só existe DENTRO de uma empresa. Em Início, Usuários,
            Produtividade e Atualizações não há CNPJ em contexto, e o segmento
            aparecia como um traço solto ("—") de 53px com uma seta — lia como
            controle quebrado. Escolher a marca (segmento 1) é o que leva para
            dentro; o CNPJ vem depois. */}
        {dentroDeEmpresa && <div className="w-px shrink-0 bg-border" />}

        {/* Entra num CNPJ. Com marca em foco, só os CNPJs dela; sem marca em
            foco, a lista completa agrupada por marca. */}
        {dentroDeEmpresa && (
        <div className="relative flex min-w-0">
          <button
            type="button"
            aria-expanded={abertoLista}
            title={rotuloEmpresa}
            onClick={() => {
              setAbertoLista((v) => !v);
              setAbertoMarca(false);
            }}
            style={corMarcaAtiva ? ({ "--marca": corMarcaAtiva } as React.CSSProperties) : undefined}
            className="flex h-full min-w-0 items-center gap-1.5 rounded-r-[10px] px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/60"
          >
            <span
              className={cn(
                "max-w-24 truncate sm:max-w-48",
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
        )}
      </div>
    </div>
  );
}
