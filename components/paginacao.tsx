import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * "X–Y de Z" + Anterior/Próxima — controle de página para as listas longas
 * client-side do sistema. Nasceu embutido em ferias-view.tsx e virou peça
 * única quando a mesma lista (sem paginação nenhuma, rolagem só) apareceu em
 * mais 7 telas: Candidatos, Meu time, Desligamentos, Conformidade, matriz de
 * Treinamentos, Vagas e a conferência de Importações.
 *
 * Não sabe filtrar/ordenar/buscar nada — só mostra a página que
 * `usePaginacao` (lib/use-paginacao.ts) já calculou. `total === 0` não
 * desenha nada: lista vazia já tem sua própria mensagem na tabela.
 */
export function Paginacao({
  total,
  porPagina,
  paginaAtual,
  totalPaginas,
  onMudarPagina,
}: {
  total: number;
  porPagina: number;
  paginaAtual: number;
  totalPaginas: number;
  onMudarPagina: (pagina: number) => void;
}) {
  if (total === 0) return null;
  const inicio = (paginaAtual - 1) * porPagina;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {inicio + 1}–{Math.min(inicio + porPagina, total)} de {total}
      </p>
      {totalPaginas > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMudarPagina(paginaAtual - 1)}
            disabled={paginaAtual <= 1}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
            Anterior
          </button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Página {paginaAtual} de {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => onMudarPagina(paginaAtual + 1)}
            disabled={paginaAtual >= totalPaginas}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Próxima
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
