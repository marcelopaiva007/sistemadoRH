"use client";

import { useState } from "react";
import { HelpCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AJUDA_DAS_TELAS,
  type AjudaDaTelaConteudo,
  type ChaveAjuda,
} from "@/lib/ajuda-telas";

/**
 * Botão "?" ao lado do título da tela, com a ajuda do módulo.
 *
 * Diálogo e não popover: o conteúdo passa de uma tela no celular, e popover
 * com rolagem interna é onde a leitura se perde. Diálogo também fecha com Esc
 * e devolve o foco ao botão sozinho.
 *
 * Fica AO LADO do `<h1>` existente em vez de virar um `PageHeader` que envolve
 * o título: 49 telas repetem o mesmo par h1+p, e trocá-las todas seria um diff
 * enorme para entregar exatamente o mesmo pixel. Aqui basta somar um elemento
 * onde a ajuda faz falta.
 */
export function AjudaDaTela({ modulo }: { modulo: ChaveAjuda }) {
  const [aberto, setAberto] = useState(false);
  // Anotado, e não inferido: com `as const` no objeto, o tipo de cada entrada é
  // literal e `videoUrl` — opcional e hoje ausente em todas — não existiria na
  // união. Ler pelo tipo declarado mantém o campo acessível para quando a
  // primeira entrada passar a ter vídeo.
  const ajuda: AjudaDaTelaConteudo = AJUDA_DAS_TELAS[modulo];

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      >
        <HelpCircle className="size-4" />
        Como usar
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Como usar esta tela</DialogTitle>
            <DialogDescription>{ajuda.oQueFaz}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {ajuda.comoFazer.map((bloco) => (
              <section key={bloco.acao}>
                <h3 className="mb-2 text-sm font-semibold">{bloco.acao}</h3>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                  {bloco.passos.map((passo, i) => (
                    <li key={i}>{passo}</li>
                  ))}
                </ol>
              </section>
            ))}

            {/* O bloco que mais evita retrabalho: são as armadilhas reais, não
                repetição do que os botões já dizem. */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Cuidados</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {ajuda.cuidados.map((cuidado, i) => (
                  <li key={i} className="border-l-2 border-muted pl-3">
                    {cuidado}
                  </li>
                ))}
              </ul>
            </section>

            {ajuda.videoUrl && (
              <Button
                variant="outline"
                size="sm"
                render={
                  <a href={ajuda.videoUrl} target="_blank" rel="noopener noreferrer" />
                }
              >
                <PlayCircle className="size-4 mr-1.5" />
                Ver em vídeo
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
