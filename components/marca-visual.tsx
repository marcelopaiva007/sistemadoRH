import { cn } from "@/lib/utils";

// Reserva para marca sem corPrimaria cadastrada em Marcas & CNPJs: cada marca
// ganha uma cor estável pela posição na lista (que vem ordenada por nome), em
// vez de todas caírem no mesmo cinza — a cor é o que deixa o selo legível de
// relance. Cadastrar a corPrimaria da marca substitui a reserva.
export const PALETA_RESERVA = ["#2563eb", "#d97706", "#0891b2", "#059669", "#db2777", "#7c3aed"];

// "LM Telecom" -> "LM", "Centrysol" -> "CE": iniciais das duas primeiras
// palavras, ou as duas primeiras letras quando o nome é uma palavra só.
export function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/);
  const sigla =
    palavras.length >= 2 ? `${palavras[0][0]}${palavras[1][0]}` : palavras[0].slice(0, 2);
  return sigla.toUpperCase();
}

// Os tons derivam da cor da marca com color-mix, em vez de tons fixos por
// marca: corPrimaria é livre no cadastro, então tinta (8%/14%) e texto
// precisam sair de qualquer cor. Misturar o texto com --foreground escurece a
// cor no tema claro e clareia no escuro com a mesma regra. Quem usa isto
// declara `style={{ "--marca": cor } as React.CSSProperties}` no ancestral.
export const TINTA_FUNDO = "bg-[color-mix(in_oklab,var(--marca)_8%,transparent)]";
export const TINTA_SELO = "bg-[color-mix(in_oklab,var(--marca)_14%,transparent)]";
export const TEXTO_MARCA = "text-[color-mix(in_oklab,var(--marca)_75%,var(--foreground))]";

export function Selo({ nome }: { nome: string }) {
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

/** Cor da marca, ou a reserva estável pela posição quando não há corPrimaria. */
export function corDaMarca(
  marcas: { id: string; corPrimaria?: string | null }[],
  marcaId: string
): string {
  const indice = marcas.findIndex((m) => m.id === marcaId);
  return marcas[indice]?.corPrimaria || PALETA_RESERVA[indice % PALETA_RESERVA.length];
}
