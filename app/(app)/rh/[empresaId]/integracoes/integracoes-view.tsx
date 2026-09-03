"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { itemOnboardingLabel } from "@/lib/constants-onboarding";
import { formatarData, diferencaEmDiasUTC, hojeUTC } from "@/lib/datas";
import { Indicador } from "@/components/indicador";

type Pendente = {
  id: string;
  item: string;
  descricao: string | null;
  responsavel: string | null;
  prazo: Date | null;
};

type Pessoa = {
  colaboradorId: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  setorNome: string;
  dataAdmissao: Date | null;
  total: number;
  concluidos: number;
  atrasados: number;
  pendentes: Pendente[];
};

export function IntegracoesView({
  emAberto,
  concluidas,
}: {
  emAberto: Pessoa[];
  concluidas: number;
}) {
  const totalAtrasados = emAberto.reduce((s, p) => s + p.atrasados, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1>Integrações em andamento</h1>
        <p className="text-sm text-muted-foreground">
          O que ainda falta para quem acabou de entrar começar de fato. Quem tem item atrasado
          aparece primeiro.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Integrações em aberto" valor={emAberto.length} />
        <Indicador rotulo="Itens atrasados" valor={totalAtrasados} estado={totalAtrasados > 0 ? "alerta" : "padrao"} />
        <Indicador rotulo="Integrações concluídas" valor={concluidas} />
      </div>

      {emAberto.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma integração em aberto. As trilhas são criadas na aba Integração da ficha do
            colaborador.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {emAberto.map((p) => (
            <Card key={p.colaboradorId}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Link href={`/rh/${p.empresaId}/colaboradores/${p.colaboradorId}`} className="hover:underline">
                    {p.nome}
                  </Link>
                  <Badge variant={p.atrasados > 0 ? "destructive" : "secondary"}>
                    {p.concluidos}/{p.total}
                  </Badge>
                  {p.atrasados > 0 && <Badge variant="destructive">{p.atrasados} atrasado(s)</Badge>}
                </CardTitle>
                <CardDescription>
                  {p.setorNome} · {p.empresaNome}
                  {p.dataAdmissao && ` · admitido em ${formatarData(p.dataAdmissao)}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {p.pendentes.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{i.item === "OUTRO" ? i.descricao : itemOnboardingLabel(i.item)}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {i.responsavel && <span>{i.responsavel}</span>}
                        {i.prazo && <SituacaoPrazo prazo={i.prazo} />}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SituacaoPrazo({ prazo }: { prazo: Date }) {
  const dias = diferencaEmDiasUTC(prazo, hojeUTC());
  if (dias < 0) return <span className="text-destructive">atrasado há {Math.abs(dias)} d</span>;
  if (dias === 0) return <span className="text-warning">vence hoje</span>;
  return <span>vence em {dias} d</span>;
}

