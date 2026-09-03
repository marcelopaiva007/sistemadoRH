"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TELAS_RH } from "@/app/(app)/rh/[empresaId]/rh-empresa-nav";
import { TELAS_PROCESSOS } from "@/app/(app)/processos/[empresaId]/processos-nav";
import { TELAS_DELEGACOES } from "@/app/(app)/delegacoes/delegacoes-nav";
import { SLUGS_COM_EMPRESA } from "@/components/modulos";

/**
 * A busca global da barra de topo (Ctrl K / ⌘K): telas dos três módulos e
 * pessoas, numa lista só.
 *
 * Telas vêm dos MESMOS grupos que desenham as laterais (TELAS_RH,
 * TELAS_PROCESSOS, TELAS_DELEGACOES) — não é um segundo índice para
 * envelhecer. Pessoas vêm de /api/busca, que aplica `empresasVisiveis` e
 * devolve o CPF mascarado; a pesquisa só dispara com 2+ caracteres e
 * espera 200 ms de pausa na digitação.
 *
 * Sem `cmdk`: é um Dialog do shadcn com um campo e uma lista, e a
 * navegação por setas/Enter feita à mão — o registry `base-nova` não tem o
 * Command, e para uma lista de 60 itens a peça inteira não se paga.
 */
type Pessoa = { id: string; nome: string; cpf: string; setor: string; empresa: string; href: string };
type Item = { chave: string; titulo: string; detalhe: string; href: string; tipo: "tela" | "pessoa" };

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function BuscaGlobal({
  sistemasPermitidos,
  empresaIds,
  role,
}: {
  sistemasPermitidos: string[];
  empresaIds: string[];
  role: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [aberta, setAberta] = useState(false);
  const [q, setQ] = useState("");
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [indice, setIndice] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  // Ctrl K / ⌘K de qualquer tela.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((v) => !v);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Pessoas: busca com pausa de 200 ms; o gestor de setor não tem fichas. O
  // estado não é zerado aqui (setState síncrono em efeito é o que o eslint
  // barra): quem decide se a lista aparece é `pessoasMostradas`, abaixo.
  useEffect(() => {
    // Pessoas só para quem alcança o RH: a rota barra do lado de lá também.
    if (!aberta || role === "GESTOR_SETOR" || !sistemasPermitidos.includes("rh") || q.trim().length < 2) return;
    let ativo = true;
    const t = setTimeout(() => {
      fetch(`/api/busca?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ pessoas: Pessoa[] }>) : null))
        .then((d) => {
          if (ativo && d) setPessoas(d.pessoas);
        })
        .catch(() => {});
    }, 200);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [q, aberta, role, sistemasPermitidos]);

  // O CNPJ das telas: o do caminho quando há um, senão o primeiro visível.
  const partes = pathname.split("/");
  const empresaAtual =
    SLUGS_COM_EMPRESA.includes(partes[1]) && empresaIds.includes(partes[2]) ? partes[2] : empresaIds[0];

  const telas: Item[] = [];
  if (role === "GESTOR_SETOR") {
    telas.push({ chave: "meu-setor", titulo: "Meu Setor", detalhe: "Pessoas", href: "/rh/meu-setor", tipo: "tela" });
  }
  if (empresaAtual && sistemasPermitidos.includes("rh")) {
    telas.push({ chave: "rh:", titulo: "Pendências", detalhe: "Pessoas", href: `/rh/${empresaAtual}`, tipo: "tela" });
    for (const t of TELAS_RH) {
      telas.push({ chave: `rh:${t.slug}`, titulo: t.label, detalhe: `Pessoas · ${t.grupo}`, href: `/rh/${empresaAtual}/${t.slug}`, tipo: "tela" });
    }
  }
  if (empresaAtual && sistemasPermitidos.includes("processos")) {
    for (const t of TELAS_PROCESSOS) {
      telas.push({ chave: `pr:${t.slug}`, titulo: t.label, detalhe: `Processos & Ativos · ${t.grupo}`, href: t.slug ? `/processos/${empresaAtual}/${t.slug}` : `/processos/${empresaAtual}`, tipo: "tela" });
    }
  }
  if (sistemasPermitidos.includes("delegacoes")) {
    for (const t of TELAS_DELEGACOES) {
      if (t.soDirecao && role !== "ADMIN" && role !== "DIRETORIA") continue;
      telas.push({ chave: `dl:${t.slug}`, titulo: t.label, detalhe: "Delegações", href: t.slug ? `/delegacoes/${t.slug}` : "/delegacoes", tipo: "tela" });
    }
  }

  const termo = normalizar(q.trim());
  const telasVisiveis = termo ? telas.filter((t) => normalizar(t.titulo).includes(termo)) : telas.slice(0, 8);
  const pessoasMostradas =
    termo.length >= 2 && role !== "GESTOR_SETOR" && sistemasPermitidos.includes("rh") ? pessoas : [];
  const itens: Item[] = [
    ...telasVisiveis,
    ...pessoasMostradas.map((p) => ({
      chave: `p:${p.id}`,
      titulo: p.nome,
      detalhe: `${p.cpf} · ${p.setor} · ${p.empresa}`,
      href: p.href,
      tipo: "pessoa" as const,
    })),
  ];
  const selecionado = Math.min(indice, Math.max(itens.length - 1, 0));

  function ir(item: Item) {
    setAberta(false);
    setQ("");
    router.push(item.href);
  }

  function aoTeclarNoCampo(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, itens.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && itens[selecionado]) {
      e.preventDefault();
      ir(itens[selecionado]);
    }
  }

  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label="Buscar tela ou pessoa (Ctrl K)"
        className="flex h-8 shrink-0 items-center gap-2 border border-input bg-card px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/45 lg:w-[300px]"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left lg:inline">Buscar tela ou pessoa</span>
        <kbd className="hidden border border-border px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
      </button>

      <Dialog
        open={aberta}
        onOpenChange={(v) => {
          setAberta(v);
          if (!v) {
            setQ("");
            setIndice(0);
            setPessoas([]);
          }
        }}
      >
        <DialogContent showCloseButton={false} className="top-[12vh] translate-y-0 gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Buscar tela ou pessoa</DialogTitle>
          <div className="flex items-center gap-2 border-b-2 border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setIndice(0);
              }}
              onKeyDown={aoTeclarNoCampo}
              placeholder="Tela ou nome da pessoa"
              aria-label="Buscar"
              aria-activedescendant={itens[selecionado] ? `busca-${itens[selecionado].chave}` : undefined}
              className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <kbd className="border border-border px-1 font-mono text-[10px] text-muted-foreground">Esc</kbd>
          </div>
          <ul ref={listaRef} role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
            {itens.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {termo.length >= 2 ? "Nada com esse nome." : "Digite o nome de uma tela ou de uma pessoa."}
              </li>
            )}
            {itens.map((item, i) => (
              <li
                key={item.chave}
                id={`busca-${item.chave}`}
                role="option"
                aria-selected={i === selecionado}
                onMouseEnter={() => setIndice(i)}
                onClick={() => ir(item)}
                className={cn(
                  "flex cursor-pointer items-baseline gap-3 border-l-2 px-3 py-2",
                  i === selecionado ? "border-primary bg-foreground/4" : "border-transparent",
                )}
              >
                <span className="w-14 shrink-0 text-[10.5px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
                  {item.tipo === "tela" ? "Tela" : "Pessoa"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", i === selecionado && "font-extrabold text-primary")}>
                    {item.titulo}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">{item.detalhe}</span>
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
