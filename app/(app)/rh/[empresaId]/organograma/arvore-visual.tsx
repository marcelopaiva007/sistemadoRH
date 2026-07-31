"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Users, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Organograma desenhado de cima para baixo, com caixas ligadas por linhas — o
// formato que as pessoas reconhecem como "organograma".
//
// A outra aba mostra a mesma hierarquia em lista indentada. Ela continua
// existindo porque é onde se DEFINE o líder de cada um, e para isso a lista
// ganha: cabe mais gente na tela e cada linha tem seu botão de editar. Aqui o
// objetivo é ler e apresentar a estrutura, não montá-la.

export type NoArvore = {
  id: string;
  nome: string;
  setor: { nome: string };
  posicao: { nome: string };
  filhos: NoArvore[];
};

const CONECTIVOS = new Set(["da", "das", "de", "do", "dos", "e"]);

// "MARIA DAS GRAÇAS DE SOUZA LIMA" -> "Maria das Graças Lima": primeiro nome e
// sobrenome bastam para caber na caixa sem virar reticências.
function nomeExibicao(nome: string): string {
  const partes = nome.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return nome;
  const capitalizar = (p: string) =>
    CONECTIVOS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1);
  if (partes.length <= 2) return partes.map(capitalizar).join(" ");
  const primeiro = partes[0];
  const ultimo = partes[partes.length - 1];
  const meioConectivo = partes.slice(1, -1).filter((p) => CONECTIVOS.has(p));
  return [primeiro, ...meioConectivo, ultimo].map(capitalizar).join(" ");
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter((x) => !CONECTIVOS.has(x.toLowerCase()));
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function contar(no: NoArvore): number {
  return no.filhos.reduce((s, f) => s + 1 + contar(f), 0);
}

export function ArvoreVisual({
  empresaId,
  arvores,
}: {
  empresaId: string;
  arvores: NoArvore[];
}) {
  const [zoom, setZoom] = useState(100);

  if (arvores.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma hierarquia montada ainda. Defina líderes na aba Estrutura e o desenho aparece aqui.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((z) => Math.max(50, z - 10))}
          disabled={zoom <= 50}
          aria-label="Diminuir zoom"
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{zoom}%</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((z) => Math.min(150, z + 10))}
          disabled={zoom >= 150}
          aria-label="Aumentar zoom"
        >
          <ZoomIn className="size-4" />
        </Button>
        <span className="ml-2 text-xs text-muted-foreground">
          Clique numa caixa com subordinados para recolher o ramo.
        </span>
      </div>

      {/* A árvore é mais larga que a tela em estrutura grande: rola na
          horizontal dentro da própria caixa, sem empurrar a página. */}
      <div className="max-h-[75vh] overflow-auto rounded-lg border bg-muted/20 p-6">
        {/* Alinhado à esquerda, não centralizado: centralizar num conteúdo mais
            largo que a tela fazia a página abrir num pedaço qualquer do meio,
            sem a raiz à vista. */}
        <div
          className="flex origin-top-left flex-col items-start gap-8"
          style={{ zoom: `${zoom}%` }}
        >
          {arvores.map((raiz) => (
            <Ramo key={raiz.id} empresaId={empresaId} no={raiz} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Acima disto, os filhos saem do desenho clássico lado a lado.
//
// A hierarquia real é rasa e larga: dois supervisores concentram 109 das 166
// pessoas. Com todos em linha a árvore passava de 34.000px — ninguém acha
// ninguém rolando isso.
//
// O 3 não é gosto: medindo a distribuição real de subordinados diretos
// ([1,1,2,2,2,2,3,3,3,4,4,6,6,7,8,52,57]), é o maior limite que mantém o
// desenho dentro da largura da tela (1072px), acabando com a rolagem
// horizontal. Subir para 4 custa 1304px e economiza 6 linhas; 6 custa 2184px
// e economiza 11. Nenhum dos dois paga.
const MAX_LADO_A_LADO = 3;

// Grupo grande de FOLHAS vira grade em vez de coluna única.
//
// Quem não tem ninguém abaixo não precisa de espaço vertical para a própria
// subárvore — e é o caso de 57 de 57 e 47 de 52 nos dois grupos gigantes.
// Empilhar essa gente em coluna única gerava 12.400px de altura à toa.
const COLUNAS_FOLHAS = 3;

function Ramo({ empresaId, no }: { empresaId: string; no: NoArvore }) {
  const [aberto, setAberto] = useState(true);
  const temFilhos = no.filhos.length > 0;
  const total = contar(no);
  const empilhar = no.filhos.length > MAX_LADO_A_LADO;

  return (
    <div className={cn("flex flex-col", empilhar ? "items-start" : "items-center")}>
      <Caixa
        empresaId={empresaId}
        no={no}
        total={total}
        aberto={aberto}
        onAlternar={temFilhos ? () => setAberto((a) => !a) : undefined}
      />

      {temFilhos && aberto && !empilhar && (
        <>
          {/* Haste que desce da caixa até a barra horizontal dos filhos. */}
          <div className="h-5 w-px bg-border" />
          <div className="flex items-start">
            {no.filhos.map((filho, i) => {
              const primeiro = i === 0;
              const ultimo = i === no.filhos.length - 1;
              const unico = no.filhos.length === 1;
              return (
                <div key={filho.id} className="flex flex-col items-center px-3">
                  {/* Barra horizontal: metade para quem está na ponta, inteira
                      no meio — é o que dá o desenho de forquilha. */}
                  <div className="flex h-5 w-full items-start">
                    {!unico && (
                      <>
                        <div className={cn("h-px flex-1", primeiro ? "bg-transparent" : "bg-border")} />
                        <div className="h-5 w-px bg-border" />
                        <div className={cn("h-px flex-1", ultimo ? "bg-transparent" : "bg-border")} />
                      </>
                    )}
                    {unico && <div className="mx-auto h-5 w-px bg-border" />}
                  </div>
                  <Ramo empresaId={empresaId} no={filho} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {temFilhos && aberto && empilhar && (
        // Coluna com um tronco à esquerda; cada filho pendura por um L. O
        // tronco para no último filho (por isso a altura casa com o centro da
        // última caixa) para não sobrar linha solta embaixo.
        <div className="relative ml-6 pl-6">
          {/* Tronco: começa no topo e morre na altura do último L, para não
              sobrar linha solta abaixo do último filho. */}
          <div className="absolute bottom-[3.25rem] left-0 top-0 w-px bg-border" />

          {/* Quem tem equipe embaixo vai um por linha: precisa da altura da
              própria subárvore. */}
          {no.filhos
            .filter((f) => f.filhos.length > 0)
            .map((filho) => (
              <div key={filho.id} className="relative py-1.5">
                <div className="absolute left-[-1.5rem] top-[2.25rem] h-px w-6 bg-border" />
                <Ramo empresaId={empresaId} no={filho} />
              </div>
            ))}

          {/* Folhas em grade — nada pendura embaixo delas. */}
          {(() => {
            const folhas = no.filhos.filter((f) => f.filhos.length === 0);
            if (folhas.length === 0) return null;
            return (
              <div className="relative py-1.5">
                <div className="absolute left-[-1.5rem] top-[2.25rem] h-px w-6 bg-border" />
                <div
                  className="grid gap-2"
                  // 13rem é a largura da caixa (w-52). Coluna fluida brigaria
                  // com ela e desalinharia a grade.
                  style={{ gridTemplateColumns: `repeat(${COLUNAS_FOLHAS}, 13rem)` }}
                >
                  {folhas.map((f) => (
                    <Caixa key={f.id} empresaId={empresaId} no={f} total={0} aberto />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Caixa({
  empresaId,
  no,
  total,
  aberto,
  onAlternar,
}: {
  empresaId: string;
  no: NoArvore;
  total: number;
  aberto: boolean;
  onAlternar?: () => void;
}) {
  return (
    <div className="w-52 shrink-0 rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {iniciais(no.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/rh/${empresaId}/colaboradores/${no.id}`}
            className="block truncate text-sm font-medium leading-tight hover:underline"
            title={no.nome}
          >
            {nomeExibicao(no.nome)}
          </Link>
          <p className="truncate text-xs text-muted-foreground" title={no.posicao.nome}>
            {no.posicao.nome}
          </p>
          <p className="truncate text-[11px] text-muted-foreground/80" title={no.setor.nome}>
            {no.setor.nome}
          </p>
        </div>
      </div>

      {onAlternar && (
        <button
          type="button"
          onClick={onAlternar}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded border-t pt-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {aberto ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <Users className="size-3" />
          {total}
        </button>
      )}
    </div>
  );
}
