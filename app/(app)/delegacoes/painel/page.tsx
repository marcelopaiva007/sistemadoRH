import { whereMarcasDoGrupoDe } from "@/lib/grupo";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import {
  demandasDoMeuGrupo,
  paraLinhaPainelDirecao,
  SELECT_PAINEL_DIRECAO,
} from "@/lib/delegacoes/consultas";
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
 * comunicada.
 *
 * HISTÓRICO LIMITADO (26/11/2026, auditoria): até aqui ENCERRADA/CANCELADA
 * vinham TODAS no dado, para o filtro "mostrar histórico" não pedir uma
 * segunda ida ao banco — e o painel crescia sem teto, serializando no HTML o
 * histórico inteiro do grupo. Agora são duas consultas: as ATIVAS vêm todas
 * (é o que o painel existe para mostrar, e o volume é o do trabalho em
 * curso), e do histórico só as `historico` mais recentes (padrão
 * HISTORICO_POR_PAGINA), com "ver mais" que sobe o número pela URL.
 *
 * O link para o detalhe NÃO vem em toda linha: o painel é aberto a todos,
 * o detalhe não (`podeAbrirNoPainel`, lib/delegacoes/consultas.ts).
 */
const HISTORICO_POR_PAGINA = 100;
const HISTORICO_MAXIMO = 2000;

function lerLimiteHistorico(valor: string | undefined): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) return HISTORICO_POR_PAGINA;
  return Math.min(n, HISTORICO_MAXIMO);
}

export default async function PainelDirecaoPage({
  searchParams,
}: {
  searchParams: Promise<{ historico?: string }>;
}) {
  const usuario = await requireDelegacoesAccess();
  const { historico } = await searchParams;
  const limiteHistorico = lerLimiteHistorico(historico);

  const doGrupo = demandasDoMeuGrupo(usuario.id);
  const [ativas, encerradas, marcas] = await Promise.all([
    prisma.demanda.findMany({
      where: { AND: [{ status: { notIn: ["RASCUNHO", "ENCERRADA", "CANCELADA"] } }, doGrupo] },
      select: SELECT_PAINEL_DIRECAO,
      orderBy: { prazo: "asc" },
    }),
    // Uma a mais que o limite: é como se sabe se existe "ver mais" sem um
    // `count` separado.
    prisma.demanda.findMany({
      where: { AND: [{ status: { in: ["ENCERRADA", "CANCELADA"] } }, doGrupo] },
      select: SELECT_PAINEL_DIRECAO,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: limiteHistorico + 1,
    }),
    prisma.marca.findMany({
      where: { ativo: true, ...whereMarcasDoGrupoDe(usuario.id!) },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const haMaisHistorico = encerradas.length > limiteHistorico;
  const demandas = [...ativas, ...encerradas.slice(0, limiteHistorico)].map((d) =>
    paraLinhaPainelDirecao(d, usuario),
  );

  return (
    <PainelDirecaoView
      demandas={demandas}
      marcas={marcas}
      historico={{
        // Veio de "ver mais": a tela já abre com o histórico à mostra.
        aberto: historico !== undefined,
        limite: limiteHistorico,
        haMais: haMaisHistorico,
        proximoLimite:
          haMaisHistorico && limiteHistorico < HISTORICO_MAXIMO
            ? Math.min(limiteHistorico + HISTORICO_POR_PAGINA, HISTORICO_MAXIMO)
            : null,
      }}
    />
  );
}
