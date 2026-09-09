import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { paraLinhaPainelDirecao, SELECT_PAINEL_DIRECAO } from "@/lib/delegacoes/consultas";
import { PainelDirecaoView } from "./painel-direcao-view";

/**
 * PAINEL (spec §9.2/§9.3) — "como está TUDO", não só o que eu pedi ou recebi.
 *
 * ABERTO A TODO USUÁRIO DO MÓDULO desde 09/09/2026, por decisão do CEO. Até
 * aqui havia uma segunda guarda, `ehDirecao`: a do módulo respondia "você usa
 * Delegações?" e esta respondia "você vê o painel de TODO MUNDO?". A segunda
 * saiu — com ela, sai também o recorte por pessoa nesta tela, e qualquer um
 * que entre no módulo lê a lista inteira do grupo. É a única tela do módulo
 * que não passa por `demandasVisiveisPara` (lib/delegacoes/consultas.ts), e a
 * decisão foi tomada com isso à vista. Para voltar a fechar, é reintroduzir o
 * `ehDirecao` aqui E o `soDirecao` do item em delegacoes-nav.tsx — esconder do
 * menu nunca foi a guarda.
 *
 * RASCUNHO fica de fora: é anotação privada de quem ainda nem delegou —
 * mostrar rascunho alheio no painel geral seria expor intenção não
 * comunicada. ENCERRADA/CANCELADA vêm no dado (o filtro de status é da
 * tela, client-side) para não pedir uma segunda ida ao banco ao alternar
 * "mostrar histórico".
 */
export default async function PainelDirecaoPage() {
  await requireDelegacoesAccess();

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
