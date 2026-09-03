"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * A ficha / tela de detalhe (arquétipo C do handoff Modernist): cabeçalho com
 * identidade e situação, sub-navegação lateral AGRUPADA, conteúdo à direita.
 *
 * Existe porque a ficha do colaborador chegou a 19 abas numa linha só — a
 * régua do desenho é "no máximo 6 visíveis; acima disso vira sub-navegação
 * lateral agrupada". Os grupos são os da ficha (Cadastro, Tempo, Segurança,
 * Carreira, Patrimônio, Ciclo); Vaga, Ciclo de avaliação, Pesquisa, Folha,
 * Demanda e Conta usam a mesma casca com os grupos deles.
 *
 * É só apresentação em cima do `Tabs` do shadcn: o `?tab=` na URL, o
 * `defaultValue` e os `TabsContent` de cada tela continuam iguais — a
 * SubNav é o `TabsList` desenhado como coluna.
 */
export function FichaCabecalho({
  iniciais,
  titulo,
  contexto,
  situacao,
  acoes,
}: {
  /** Duas letras no quadrado de 56px. */
  iniciais: string;
  titulo: ReactNode;
  /** Setor · cargo · matrícula, em cinza sob o nome. */
  contexto?: ReactNode;
  /** As tags de situação (Ativo, CLT, Telegram vinculado, Férias vencendo…). */
  situacao?: ReactNode;
  /** O botão "Ações ▾" e o que mais for de comando. */
  acoes?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 border-b-2 border-border pb-4">
      <span
        aria-hidden
        className="flex size-14 shrink-0 items-center justify-center bg-foreground font-heading text-lg font-extrabold text-background"
      >
        {iniciais}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate">{titulo}</h1>
        {contexto && <p className="mt-0.5 text-sm text-muted-foreground">{contexto}</p>}
        {situacao && <div className="mt-2 flex flex-wrap items-center gap-1.5">{situacao}</div>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export type ItemSubNav = {
  value: string;
  label: string;
  /** Número à direita, 12px cinza. */
  contagem?: number;
  /** "!" em vermelho: férias vencendo, SST irregular. */
  alerta?: boolean;
  /** Esconde o item (ex.: Desligamento sem data de desligamento). */
  oculto?: boolean;
};

export function SubNav({ grupos }: { grupos: { titulo: string; itens: ItemSubNav[] }[] }) {
  return (
    <TabsList
      variant="line"
      className="h-auto w-[200px] shrink-0 flex-col items-stretch gap-4 self-start border-0 pr-4 group-data-vertical/tabs:h-auto"
    >
      {grupos.map((grupo) => {
        const itens = grupo.itens.filter((i) => !i.oculto);
        if (itens.length === 0) return null;
        return (
          <div key={grupo.titulo} className="flex flex-col">
            <p className="pb-1 pl-3 text-[10px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
              {grupo.titulo}
            </p>
            {itens.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  "mb-0 h-[26px] w-full justify-between border-b-0 border-l-2 border-l-transparent pr-2 pl-3 text-[13px] font-normal",
                  "data-active:border-l-primary data-active:font-extrabold",
                )}
              >
                <span className="truncate">{item.label}</span>
                <span className="ml-2 flex shrink-0 items-center gap-1 text-[12px] font-normal tabular-nums text-muted-foreground">
                  {item.alerta && (
                    <span aria-label="requer atenção" className="font-extrabold text-primary">
                      !
                    </span>
                  )}
                  {item.contagem != null && item.contagem > 0 && item.contagem}
                </span>
              </TabsTrigger>
            ))}
          </div>
        );
      })}
    </TabsList>
  );
}
