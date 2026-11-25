import { whereMarcasDoGrupoDe } from "@/lib/grupo";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { paraLinha, paraPainel, SELECT_LISTA, SELECT_PAINEL } from "@/lib/delegacoes/consultas";
import { STATUS_TERMINAIS } from "@/lib/delegacoes/estados";
import { montarPainelEntregas } from "@/lib/delegacoes/painel-entregas";
import { listarPessoasParaDelegar } from "@/lib/delegacoes/pessoas";
import { DelegadasView } from "./delegadas-view";

/**
 * DELEGADAS POR MIM — o que eu cobro dos outros, e a porta de criar demanda.
 *
 * `solicitanteId = eu`, sempre. A fila que importa aqui é a das ENTREGUES:
 * demanda entregue fica parada esperando MEU aceite, e enquanto eu não olho, o
 * responsável já fez a parte dele — é o único ponto do fluxo em que a demora é
 * de quem pediu. Por isso ela vem no topo, separada.
 */
// 26/11/2026: cada demanda é lida UMA vez. Antes eram duas consultas que se
// sobrepunham — a lista (não terminais, SELECT_LISTA) e o painel (o histórico
// INTEIRO, todos os status, SELECT_PAINEL) —, então toda demanda em aberto vinha
// duas vezes e as canceladas vinham só para serem descartadas dentro de
// montarPainelEntregas. Agora a lista já traz os campos do painel, e a segunda
// consulta busca só as ENCERRADAS (o único histórico que o painel conta e a
// lista esconde). CANCELADA nem sai do banco: o painel a ignorava.
const SELECT_LISTA_E_PAINEL = {
  ...SELECT_LISTA,
  enviadaEm: SELECT_PAINEL.enviadaEm,
  aceiteEm: SELECT_PAINEL.aceiteEm,
  horasEstimadas: SELECT_PAINEL.horasEstimadas,
  entregas: SELECT_PAINEL.entregas,
} as const;

export default async function DelegadasPage() {
  const usuario = await requireDelegacoesAccess();

  const [linhas, encerradas, pessoas, marcas] = await Promise.all([
    prisma.demanda.findMany({
      // Aqui NÃO se usa APENAS_ATIVAS: o RASCUNHO é meu e precisa aparecer,
      // senão salvar rascunho grava algo que nenhuma tela lista depois — e o
      // único botão de "Enviar ao responsável" mora no detalhe, inalcançável
      // sem link. Encerradas e canceladas continuam fora.
      where: {
        AND: [{ solicitanteId: usuario.id }, { status: { notIn: [...STATUS_TERMINAIS] } }],
      },
      select: SELECT_LISTA_E_PAINEL,
      orderBy: { prazo: "asc" },
    }),
    // O painel de entregas quer o histórico — inclusive ENCERRADA, que a lista
    // acima esconde de propósito. As não terminais já vieram acima.
    prisma.demanda.findMany({
      where: { solicitanteId: usuario.id, status: "ENCERRADA" },
      select: SELECT_PAINEL,
    }),
    // A lista de quem pode receber demanda — fonte única, compartilhada com a
    // tela de Reuniões (ver lib/delegacoes/pessoas.ts, extraída em 31/08/2026).
    listarPessoasParaDelegar(usuario.id),
    prisma.marca.findMany({
      where: { ativo: true, ...whereMarcasDoGrupoDe(usuario.id!) },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const demandas = linhas.map((d) => paraLinha(d));
  const painel = montarPainelEntregas([...linhas, ...encerradas].map((d) => paraPainel(d)));

  return <DelegadasView demandas={demandas} painel={painel} usuarios={pessoas} marcas={marcas} />;
}
