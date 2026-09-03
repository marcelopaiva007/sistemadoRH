import type { ReactNode } from "react";

/**
 * A barra que aparece quando há linhas marcadas na tabela (handoff Modernist).
 *
 * Tinta sobre papel invertidos — fundo `--foreground`, texto `--background` —
 * porque ela é um MODO: enquanto está na tela, as ações valem para a seleção,
 * não para a linha sob o cursor. Substitui os botões de massa que ficavam
 * sempre visíveis acima da tabela mesmo sem nada marcado.
 */
export function BarraDeSelecao({
  quantidade,
  ressalva,
  acoes,
  aoLimpar,
}: {
  quantidade: number;
  /** Aviso honesto antes do clique (ex.: "3 sem Telegram nem e-mail"). */
  ressalva?: ReactNode;
  acoes?: ReactNode;
  aoLimpar: () => void;
}) {
  if (quantidade === 0) return null;
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 bg-foreground px-3 py-1.5 text-background">
      <span className="text-[13px]">
        <b className="font-extrabold tabular-nums">{quantidade}</b> selecionado
        {quantidade > 1 ? "s" : ""}
        {ressalva && <span className="opacity-70"> · {ressalva}</span>}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {acoes}
        <button
          type="button"
          onClick={aoLimpar}
          className="text-[13px] underline underline-offset-2 opacity-80 transition-opacity hover:opacity-100"
        >
          Limpar seleção
        </button>
      </div>
    </div>
  );
}
