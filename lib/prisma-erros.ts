import { Prisma } from "@/app/generated/prisma/client";

/**
 * Violação de constraint UNIQUE (P2002).
 *
 * ATENÇÃO ao segundo parâmetro: o nome do índice **não aparece em
 * `error.message`** — a mensagem do Prisma lista os campos ("Unique
 * constraint failed on the fields: (`vagaId`, `candidatoId`)"). O nome do
 * índice só vem no erro original do driver, aninhado em `error.meta`.
 *
 * Por isso `e.message.includes("Alguma_constraint_key")` nunca casa: o catch
 * passa batido e o erro vaza como 500. Foi o que aconteceu na Fase 4 (a
 * segunda inscrição do mesmo candidato derrubava a página pública em vez de
 * mostrar "você já se inscreveu").
 */
export function violouUnique(e: unknown, indice?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  if (!indice) return true;
  return JSON.stringify(e.meta ?? {}).includes(indice);
}
