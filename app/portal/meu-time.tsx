"use client";

import { CalendarClock, CheckCircle2, FileWarning, Info, MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/datas";
import type { AvaliacaoDaLinha, FeriasDaLinha, JanelaContrato, MarcoConversa, TrilhaDaLinha } from "@/lib/meu-time";

// A aba "Meu time" do portal: o gestor real (52/215 ativos têm supervisor
// definido apontando para alguém) vê a própria equipe com a MESMA conta da
// tela do módulo RH — lib/meu-time.ts roda nos dois lugares. Aqui é leitura:
// férias, avaliação e trilha se resolvem com o RH; o que o gestor faz com isso
// é a conversa.
//
// O recorte é decidido no servidor (app/portal/page.tsx, supervisorId da
// sessão) e o payload é montado campo a campo lá — nada de id de empresa,
// salário ou presença de CPF atravessa para cá.

export type LinhaTimePortal = {
  id: string;
  nome: string;
  setor: string;
  cargo: string;
  empresa: string;
  tempoDeCasa: string | null;
  diasDeCasa: number | null;
  recemChegado: boolean;
  ferias: FeriasDaLinha;
  avaliacao: AvaliacaoDaLinha;
  lacunas: string[];
  nuncaAcessouPortal: boolean;
  trilha: TrilhaDaLinha | null;
  janelaContrato: JanelaContrato;
};

export type MeuTimePortal = {
  linhas: LinhaTimePortal[];
  avisos: string[];
};

export function MeuTimeDoGestor({ time }: { time: MeuTimePortal }) {
  const recemChegados = time.linhas.filter((l) => l.recemChegado);

  return (
    <div className="space-y-4">
      {recemChegados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessagesSquare className="size-4" />
              Primeiros 90 dias
              <Badge variant="secondary">{recemChegados.length}</Badge>
            </CardTitle>
            <CardDescription>
              Quem entrou há menos de 120 dias. As conversas de 30, 60 e 90 dias são suas — é a
              intervenção de retenção mais barata que existe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recemChegados.map((l) => (
                <li key={l.id} className="space-y-1.5 py-3">
                  <div className="text-sm font-medium">{l.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.cargo} · {l.diasDeCasa} dia{l.diasDeCasa === 1 ? "" : "s"} de casa
                  </div>
                  {l.trilha &&
                    (l.trilha.gerada ? (
                      <div className="flex flex-wrap gap-1.5">
                        {l.trilha.marcos.map((m) => (
                          <ChipMarco key={m.item} marco={m} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Trilha de integração ainda não gerada — peça ao RH.
                      </p>
                    ))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sua equipe</CardTitle>
          <CardDescription>
            Quem reporta a você, com o mesmo retrato que o RH vê. Para agir sobre férias, avaliação
            ou cadastro, fale com o RH.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {time.linhas.map((l) => (
              <li key={l.id} className="space-y-1.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.cargo} · {l.setor} · {l.empresa}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {l.tempoDeCasa ?? "sem data de admissão"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <BadgeFerias ferias={l.ferias} />
                  <BadgeAvaliacao avaliacao={l.avaliacao} />
                  <BadgeContrato janela={l.janelaContrato} />
                  {l.lacunas.length > 0 && (
                    <Badge variant="outline" title={l.lacunas.join(", ")}>
                      ficha incompleta ({l.lacunas.length})
                    </Badge>
                  )}
                  {l.nuncaAcessouPortal && (
                    <Badge variant="outline" title="Nunca abriu o portal — o convite é pelo bot do Telegram (/portal)">
                      nunca acessou o portal
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {time.avisos.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <div className="space-y-1">
            {time.avisos.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChipMarco({ marco }: { marco: MarcoConversa }) {
  const dias = marco.label.replace(/\D/g, "");
  switch (marco.status) {
    case "FEITA":
      return (
        <Badge variant="outline" className="text-success">
          <CheckCircle2 className="size-3" />
          {dias} d feita
        </Badge>
      );
    case "ATRASADA":
      return (
        <Badge variant="destructive">
          <CalendarClock className="size-3" />
          {dias} d — era {formatarData(marco.prazo)}
        </Badge>
      );
    case "AGENDADA":
      return (
        <Badge variant="outline">
          {dias} d · até {formatarData(marco.prazo)}
        </Badge>
      );
    case "SEM_PRAZO":
      return <Badge variant="secondary">{dias} d · sem prazo</Badge>;
    case "FORA_DA_TRILHA":
      return (
        <Badge variant="secondary" title="A trilha desta pessoa foi gerada antes de os marcos existirem">
          {dias} d · fora da trilha
        </Badge>
      );
  }
}

function BadgeFerias({ ferias }: { ferias: FeriasDaLinha }) {
  switch (ferias.situacao) {
    case "SEM_DATA":
      return <Badge variant="outline" className="text-muted-foreground">férias: sem data de admissão</Badge>;
    case "PRIMEIRO_ANO":
      return <Badge variant="outline">férias: 1º ano em curso</Badge>;
    case "EM_DIA":
      return <Badge variant="outline">férias em dia</Badge>;
    case "DISPONIVEL":
      return <Badge variant="secondary">{ferias.saldoTotal} dias de férias disponíveis</Badge>;
    case "VENCENDO":
      return (
        <Badge variant="secondary" className="text-warning">
          férias vencendo em {ferias.diasAteLimite} d
        </Badge>
      );
    case "VENCIDO":
      return (
        <Badge
          variant="destructive"
          title={
            ferias.semHistorico
              ? "Nenhuma férias registrada no sistema: pode ser buraco de cadastro — confirme com o RH"
              : "Passou do limite legal de concessão"
          }
        >
          férias vencidas{ferias.semHistorico ? "?" : ""}
        </Badge>
      );
  }
}

function BadgeAvaliacao({ avaliacao }: { avaliacao: AvaliacaoDaLinha }) {
  switch (avaliacao.situacao) {
    case "SEM_CICLO":
      // Sem ciclo aberto não há pendência — o chip some em vez de acusar.
      return null;
    case "SEM_AVALIACAO":
      return (
        <Badge variant="secondary" className="text-warning">
          sem avaliação no ciclo aberto
        </Badge>
      );
    case "EM_ANDAMENTO":
      return (
        <Badge variant="secondary">
          avaliação {avaliacao.concluidas}/{avaliacao.total}
        </Badge>
      );
    case "CONCLUIDA":
      return <Badge variant="default">avaliação concluída</Badge>;
  }
}

/** Só aparece dentro da janela de decisão — fora dela, silêncio (nada a decidir ainda). */
function BadgeContrato({ janela }: { janela: JanelaContrato }) {
  if (janela.urgencia === null || janela.diasAteFim === null) return null;
  const texto =
    janela.diasAteFim < 0
      ? `contrato vencido há ${Math.abs(janela.diasAteFim)} d`
      : `contrato vence em ${janela.diasAteFim} d`;
  return (
    <Badge variant={janela.urgencia === "critica" ? "destructive" : "secondary"} className={janela.urgencia === "atencao" ? "text-warning" : undefined}>
      <FileWarning className="size-3" />
      {texto}
    </Badge>
  );
}
