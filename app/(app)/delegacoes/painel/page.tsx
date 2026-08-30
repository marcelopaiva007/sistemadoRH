import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { ehDirecao, paraLinhaPainelDirecao, SELECT_PAINEL_DIRECAO } from "@/lib/delegacoes/consultas";
import { PainelDirecaoView } from "./painel-direcao-view";

/**
 * PAINEL DA DIREÇÃO (spec §9.2/§9.3) — "como está TUDO", não só o que eu
 * pedi ou recebi. Só quem `ehDirecao` entra: a guarda do módulo
 * (`requireDelegacoesAccess`) responde "você usa Delegações?"; esta segunda
 * pergunta é "você vê o painel de TODO MUNDO?" — a mesma distinção que
 * `lib/delegacoes/consultas.ts` documenta entre guarda de módulo e
 * visibilidade por linha.
 *
 * RASCUNHO fica de fora: é anotação privada de quem ainda nem delegou —
 * mostrar rascunho alheio no painel geral seria expor intenção não
 * comunicada. ENCERRADA/CANCELADA vêm no dado (o filtro de status é da
 * tela, client-side) para não pedir uma segunda ida ao banco ao alternar
 * "mostrar histórico".
 */
export default async function PainelDirecaoPage() {
  const usuario = await requireDelegacoesAccess();
  if (!ehDirecao(usuario)) redirect("/delegacoes");

  const [linhas, marcas] = await Promise.all([
    prisma.demanda.findMany({
      where: { status: { not: "RASCUNHO" } },
      select: SELECT_PAINEL_DIRECAO,
      orderBy: { prazo: "asc" },
    }),
    prisma.marca.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const demandas = linhas.map((d) => paraLinhaPainelDirecao(d));

  return <PainelDirecaoView demandas={demandas} marcas={marcas} />;
}
