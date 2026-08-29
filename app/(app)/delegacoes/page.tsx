import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Indicador } from "@/components/indicador";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { APENAS_ATIVAS, paraLinha, SELECT_LISTA, type DemandaNaTela } from "@/lib/delegacoes/consultas";
import { LinhaDemanda } from "./linha-demanda";

/**
 * RECEBIDAS — o que cobram de mim.
 *
 * Sempre `responsavelId = eu`, inclusive para a Direção: esta tela responde
 * "o que EU tenho que entregar", e não "o que existe no sistema". A visão de
 * tudo é o Painel da Direção, que chega no PR 6 com o classificador.
 *
 * Os blocos são por URGÊNCIA, não por status, com uma exceção no topo: as que
 * esperam meu aceite vêm primeiro, porque o relógio do aceite já está correndo
 * (regra 5: 24h/48h/72h conforme a criticidade) e a pessoa costuma nem saber
 * que recebeu. Um item aparece em UM bloco só — a regra da Central de
 * Pendências, onde indicador que discorda do bloco é o defeito clássico.
 */
export default async function RecebidasPage() {
  const usuario = await requireDelegacoesAccess();

  const linhas = await prisma.demanda.findMany({
    where: { AND: [{ responsavelId: usuario.id }, APENAS_ATIVAS] },
    select: SELECT_LISTA,
    orderBy: { prazo: "asc" },
  });

  const demandas = linhas.map((d) => paraLinha(d));

  // As fatias, na ordem em que a pessoa deve olhar. `aguardandoAceite` sai da
  // corrida por prazo de propósito: aceitar é o que destrava tudo.
  const aguardandoAceite = demandas.filter((d) => d.status === "ENVIADA");
  const emAndamento = demandas.filter((d) => d.status !== "ENVIADA");
  const atrasadas = emAndamento.filter((d) => d.diasParaPrazo < 0);
  const estaSemana = emAndamento.filter((d) => d.diasParaPrazo >= 0 && d.diasParaPrazo <= 7);
  const adiante = emAndamento.filter((d) => d.diasParaPrazo > 7);
  const entregues = demandas.filter((d) => d.status === "ENTREGUE").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Delegações
        </p>
        <h2 className="text-xl font-semibold tracking-tight">Recebidas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O que foi delegado a você, do prazo mais curto para o mais longo. Abra a demanda para
          ver o critério de aceite antes de aceitar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Aguardando seu aceite" valor={aguardandoAceite.length} estado={aguardandoAceite.length > 0 ? "atencao" : "padrao"} />
        <Indicador rotulo="Atrasadas" valor={atrasadas.length} estado={atrasadas.length > 0 ? "alerta" : "padrao"} />
        <Indicador rotulo="Vencem em 7 dias" valor={estaSemana.length} />
        <Indicador rotulo="Entregues, aguardando aceite de quem pediu" valor={entregues} />
      </div>

      <Bloco titulo="Esperando seu aceite" itens={aguardandoAceite} tom="atencao" />
      <Bloco titulo="Atrasadas" itens={atrasadas} tom="alerta" />
      <Bloco titulo="Vencem nos próximos 7 dias" itens={estaSemana} />
      <Bloco titulo="Mais adiante" itens={adiante} />

      {demandas.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma demanda para você agora.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Quando alguém delegar algo a você, aparece aqui — e o sistema cobra no prazo.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Bloco vazio não aparece: lista com título e nada embaixo é ruído. */
function Bloco({
  titulo,
  itens,
  tom,
}: {
  titulo: string;
  itens: DemandaNaTela[];
  tom?: "alerta" | "atencao";
}) {
  if (itens.length === 0) return null;
  return (
    <Card
      className={
        tom === "alerta"
          ? "border-destructive/30"
          : tom === "atencao"
            ? "border-amber-500/30"
            : undefined
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {titulo}
          <Badge variant="outline">{itens.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {itens.map((d) => (
          <LinhaDemanda key={d.id} d={d} mostrar="solicitante" />
        ))}
      </CardContent>
    </Card>
  );
}
