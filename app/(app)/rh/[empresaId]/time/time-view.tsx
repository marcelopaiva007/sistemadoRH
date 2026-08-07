"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Info,
  MessagesSquare,
  UserX,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Indicador } from "@/components/indicador";
import { gerarTrilhaPadrao } from "@/lib/actions/rh-onboarding";
import { formatarData } from "@/lib/datas";
import { normalizarTexto } from "@/lib/text";
import type { LinhaTime, MarcoConversa, MeuTime } from "@/lib/meu-time";

// A trilha NÃO é editada aqui: marcar/adicionar/excluir item continua na ficha
// (IntegracaoCard). Esta tela só GERA a trilha de quem ainda não tem — é o
// clique que faltava para o módulo sair de zero linhas — e mostra o estado dos
// marcos. Duas telas editando a mesma trilha seria pedir conflito de estado.

const TODOS_OS_SETORES = "__todos";

const SINAIS = [
  { chave: "TODOS", rotulo: "Todos" },
  { chave: "RECEM", rotulo: "Recém-chegados (até 120 dias)" },
  { chave: "FERIAS_VENCIDAS", rotulo: "Férias vencidas" },
  { chave: "SEM_AVALIACAO", rotulo: "Sem avaliação no ciclo aberto" },
  { chave: "FICHA", rotulo: "Ficha incompleta" },
  { chave: "SEM_PORTAL", rotulo: "Nunca acessou o portal" },
  { chave: "SEM_LIDER", rotulo: "Sem líder definido" },
  { chave: "CONTRATO", rotulo: "Contrato de experiência vencendo" },
] as const;

type Sinal = (typeof SINAIS)[number]["chave"];

function casaSinal(l: LinhaTime, sinal: Sinal): boolean {
  switch (sinal) {
    case "TODOS":
      return true;
    case "RECEM":
      return l.recemChegado;
    case "FERIAS_VENCIDAS":
      return l.ferias.situacao === "VENCIDO";
    case "SEM_AVALIACAO":
      return l.avaliacao.situacao === "SEM_AVALIACAO";
    case "FICHA":
      return l.lacunas.length > 0;
    case "SEM_PORTAL":
      return l.nuncaAcessouPortal;
    case "SEM_LIDER":
      return l.semLider;
    case "CONTRATO":
      return l.janelaContrato.urgencia !== null;
  }
}

export function TimeView({
  time,
  escopo,
}: {
  time: MeuTime;
  escopo: { cnpjs: number; marcas: string[] };
}) {
  const [setor, setSetor] = useState<string>(TODOS_OS_SETORES);
  const [sinal, setSinal] = useState<Sinal>("TODOS");
  const [busca, setBusca] = useState("");

  const { linhas, recemChegados, resumo, avisos } = time;

  // Setor é tabela POR EMPRESA: com o recorte no grupo, o mesmo nome existe em
  // vários CNPJs. O seletor agrupa pelo nome normalizado e mostra a grafia mais
  // frequente — mesma regra do filtro da tela de Férias.
  const setores = useMemo(() => {
    const baldes = new Map<string, Map<string, number>>();
    for (const l of linhas) {
      const chave = normalizarTexto(l.setor);
      const grafias = baldes.get(chave) ?? new Map<string, number>();
      grafias.set(l.setor, (grafias.get(l.setor) ?? 0) + 1);
      baldes.set(chave, grafias);
    }
    return [...baldes.entries()]
      .map(([chave, grafias]) => {
        const ordenadas = [...grafias.entries()].sort((a, b) => b[1] - a[1]);
        return {
          chave,
          rotulo: ordenadas[0][0],
          total: ordenadas.reduce((t, [, n]) => t + n, 0),
        };
      })
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [linhas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter((l) => setor === TODOS_OS_SETORES || normalizarTexto(l.setor) === setor)
      .filter((l) => casaSinal(l, sinal))
      .filter(
        (l) =>
          !termo ||
          l.nome.toLowerCase().includes(termo) ||
          l.cargo.toLowerCase().includes(termo) ||
          l.empresa.toLowerCase().includes(termo),
      );
  }, [linhas, setor, sinal, busca]);

  // O bloco de recém-chegados respeita o recorte de setor (é "quem entrou NO
  // meu time"), mas ignora busca e sinal: ele é uma lista de trabalho, não um
  // resultado de filtro.
  const recemNoSetor = useMemo(
    () =>
      recemChegados.filter(
        (l) => setor === TODOS_OS_SETORES || normalizarTexto(l.setor) === setor,
      ),
    [recemChegados, setor],
  );

  // Mesma lógica dos recém-chegados: lista de trabalho, respeita setor,
  // ignora busca/sinal. Ordenada por urgência — quem vence primeiro no topo.
  const contratoNaJanela = useMemo(
    () =>
      linhas
        .filter(
          (l) =>
            l.janelaContrato.urgencia !== null &&
            (setor === TODOS_OS_SETORES || normalizarTexto(l.setor) === setor),
        )
        .sort((a, b) => (a.janelaContrato.diasAteFim ?? 0) - (b.janelaContrato.diasAteFim ?? 0)),
    [linhas, setor],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu time</h1>
        <p className="text-sm text-muted-foreground">
          Uma equipe, pessoa a pessoa: tempo de casa, férias, avaliação do ciclo, ficha e acesso ao
          portal. Recorte: {escopo.cnpjs} CNPJ{escopo.cnpjs === 1 ? "" : "s"} ·{" "}
          {escopo.marcas.join(", ")}. O gestor vê a própria equipe pelo portal do colaborador.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <Indicador rotulo="Pessoas no recorte" valor={resumo.total} />
        <Indicador
          rotulo="Recém-chegados"
          valor={resumo.recemChegados}
          complemento="menos de 120 dias"
        />
        <Indicador
          rotulo="Férias vencidas"
          valor={resumo.feriasVencidas}
          estado={resumo.feriasVencidas > 0 ? "alerta" : "padrao"}
        />
        <Indicador
          rotulo="Sem avaliação no ciclo"
          valor={resumo.comCicloAberto > 0 ? resumo.semAvaliacaoNoCiclo : "—"}
          complemento={
            resumo.comCicloAberto > 0 ? `de ${resumo.comCicloAberto} com ciclo aberto` : "sem ciclo aberto"
          }
          estado={resumo.comCicloAberto > 0 && resumo.semAvaliacaoNoCiclo > 0 ? "atencao" : "padrao"}
        />
        <Indicador
          rotulo="Nunca acessou o portal"
          valor={resumo.nuncaAcessouPortal}
          estado={resumo.nuncaAcessouPortal > 0 ? "atencao" : "padrao"}
        />
        <Indicador rotulo="Sem líder definido" valor={resumo.semLider} estado={resumo.semLider > 0 ? "atencao" : "padrao"} />
        <Indicador
          rotulo="Contrato vencendo"
          valor={resumo.contratosNaJanela}
          estado={resumo.contratosNaJanela > 0 ? "alerta" : "padrao"}
        />
      </div>

      <PrimeirosNoventaDias linhas={recemNoSetor} />
      <JanelaDeContrato linhas={contratoNaJanela} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Pessoas
          </CardTitle>
          <CardDescription>
            Cada sinal é um clique de distância da ficha, onde ele se resolve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={setor} onValueChange={(v) => setSetor(!v ? TODOS_OS_SETORES : String(v))}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_OS_SETORES}>Todos os setores</SelectItem>
                {setores.map((s) => (
                  <SelectItem key={s.chave} value={s.chave}>
                    {s.rotulo} ({s.total})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sinal} onValueChange={(v) => setSinal((v as Sinal) ?? "TODOS")}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Sinal" />
              </SelectTrigger>
              <SelectContent>
                {SINAIS.map((s) => (
                  <SelectItem key={s.chave} value={s.chave}>
                    {s.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, cargo ou empresa"
              className="max-w-xs"
            />
            <span className="text-xs text-muted-foreground">
              {visiveis.length} de {linhas.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tempo de casa</TableHead>
                  <TableHead>Férias</TableHead>
                  <TableHead>Avaliação do ciclo</TableHead>
                  <TableHead>Sinais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {/* Link com o empresaId da PESSOA, não o da URL: a ficha é
                          escopada ao CNPJ do vínculo e o recorte aqui cruza CNPJ. */}
                      <Link
                        href={`/rh/${l.empresaId}/colaboradores/${l.id}`}
                        className="font-medium hover:underline"
                      >
                        {l.nome}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {l.setor} · {l.cargo}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.empresa}</TableCell>
                    <TableCell className="text-sm">
                      {l.tempoDeCasa ?? <span className="text-muted-foreground">sem data</span>}
                      {l.recemChegado && (
                        <Badge variant="secondary" className="ml-2">
                          {l.diasDeCasa} d
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <BadgeFerias ferias={l.ferias} />
                    </TableCell>
                    <TableCell>
                      <BadgeAvaliacao avaliacao={l.avaliacao} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.lacunas.length > 0 && (
                          <Badge variant="outline" title={l.lacunas.join(", ")}>
                            ficha incompleta ({l.lacunas.length})
                          </Badge>
                        )}
                        {l.nuncaAcessouPortal && <Badge variant="outline">nunca acessou o portal</Badge>}
                        {l.semLider && (
                          <Badge variant="outline" className="text-warning">
                            <UserX className="size-3" />
                            sem líder
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Ninguém casa com este recorte.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {avisos.length > 0 && (
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Bloco dos primeiros 90 dias
// ---------------------------------------------------------------

// Mora DENTRO da tela de time, não numa rota própria: são ~29 pessoas em 12
// células de setor×CNPJ — uma tela só para isso ficaria quase sempre vazia, e
// tela que abre vazia mata o hábito de abrir. Aqui o bloco aparece junto da
// lista que o RH já veio olhar.
function PrimeirosNoventaDias({ linhas }: { linhas: LinhaTime[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare className="size-4" />
          Primeiros 90 dias
          {linhas.length > 0 && <Badge variant="secondary">{linhas.length}</Badge>}
        </CardTitle>
        <CardDescription>
          Quem entrou há menos de 120 dias e o estado das conversas de 30, 60 e 90 dias. O risco de
          saída está concentrado no primeiro ano — a conversa de 30 dias é a intervenção de retenção
          mais barata que existe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ninguém com menos de 120 dias de casa neste recorte.
          </p>
        ) : (
          <ul className="divide-y">
            {linhas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-48">
                  <Link
                    href={`/rh/${l.empresaId}/colaboradores/${l.id}`}
                    className="font-medium hover:underline"
                  >
                    {l.nome}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {l.setor} · {l.cargo} · {l.empresa} · {l.diasDeCasa} dia
                    {l.diasDeCasa === 1 ? "" : "s"} de casa
                  </div>
                </div>
                {l.trilha && <TrilhaDoRecemChegado linha={l} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------
// Janela de decisão do contrato de experiência
// ---------------------------------------------------------------

// Mesmo raciocínio do bloco de 90 dias: mora aqui dentro, não numa rota
// própria — é lista curta (18 ativos medidos entre 60-100 dias de casa na
// base de 05/08/2026), e uma tela dedicada para isso nasceria vazia na
// maioria dos dias. "O vencimento mais caro do RH" (CLT art. 445/451):
// decidir no dia 89 custa zero; decidir no dia 91 custa aviso prévio e 40%
// do FGTS. O prazo não avisa — este bloco é o aviso que faltava.
function JanelaDeContrato({ linhas }: { linhas: LinhaTime[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="size-4" />
          Contrato de experiência vencendo
          {linhas.length > 0 && <Badge variant="destructive">{linhas.length}</Badge>}
        </CardTitle>
        <CardDescription>
          Contrato por prazo (experiência, temporário, estágio) a 90 dias ou menos do fim.
          Rescindir ou renovar antes do prazo é decisão de custo zero; deixar passar vira contrato
          indeterminado por força de lei.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum contrato por prazo dentro da janela de 90 dias neste recorte.
          </p>
        ) : (
          <ul className="divide-y">
            {linhas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-48">
                  <Link
                    href={`/rh/${l.empresaId}/colaboradores/${l.id}`}
                    className="font-medium hover:underline"
                  >
                    {l.nome}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {l.setor} · {l.cargo} · {l.empresa}
                  </div>
                </div>
                <Badge
                  variant={l.janelaContrato.urgencia === "critica" ? "destructive" : "secondary"}
                  className={l.janelaContrato.urgencia === "atencao" ? "text-warning" : undefined}
                >
                  {(l.janelaContrato.diasAteFim ?? 0) < 0
                    ? `vencido há ${Math.abs(l.janelaContrato.diasAteFim ?? 0)} d`
                    : `vence em ${l.janelaContrato.diasAteFim} d`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TrilhaDoRecemChegado({ linha }: { linha: LinhaTime }) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const trilha = linha.trilha;
  if (!trilha) return null;

  if (!trilha.gerada) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Trilha de integração não gerada</span>
        <Button
          size="sm"
          variant="outline"
          disabled={gerando}
          onClick={async () => {
            setGerando(true);
            // empresaId da PESSOA: a action confere o vínculo colaborador ×
            // empresa, e o recorte desta tela cruza CNPJ.
            const r = await gerarTrilhaPadrao(linha.empresaId, linha.id);
            setGerando(false);
            if (r.ok) {
              toast.success("Trilha gerada — as conversas de 30/60/90 já têm prazo.");
              // O revalidate da action mira o /time do CNPJ da pessoa; quando a
              // URL aberta é a de outro CNPJ do grupo, só o refresh atualiza.
              router.refresh();
            } else {
              toast.error(r.error);
            }
          }}
        >
          {gerando ? "Gerando..." : "Gerar trilha padrão"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={trilha.concluidos === trilha.total ? "default" : "secondary"}>
        trilha {trilha.concluidos}/{trilha.total}
      </Badge>
      {trilha.marcos.map((m) => (
        <ChipMarco key={m.item} marco={m} />
      ))}
    </div>
  );
}

function ChipMarco({ marco }: { marco: MarcoConversa }) {
  // Rótulo curto: "30 d", "60 d", "90 d" — o contexto do chip já diz que é a
  // conversa do marco.
  const dias = marco.label.replace(/\D/g, "");
  switch (marco.status) {
    case "FEITA":
      return (
        <Badge variant="outline" className="text-success" title={`${marco.label}: feita`}>
          <CheckCircle2 className="size-3" />
          {dias} d
        </Badge>
      );
    case "ATRASADA":
      return (
        <Badge
          variant="destructive"
          title={`${marco.label}: atrasada — prazo era ${formatarData(marco.prazo)}`}
        >
          <CalendarClock className="size-3" />
          {dias} d atrasada
        </Badge>
      );
    case "AGENDADA":
      return (
        <Badge variant="outline" title={`${marco.label}: até ${formatarData(marco.prazo)}`}>
          {dias} d · {formatarData(marco.prazo)}
        </Badge>
      );
    case "SEM_PRAZO":
      // Trilha gerada sem data de admissão no cadastro: o marco existe, mas
      // ninguém sabe quando ele cai.
      return (
        <Badge variant="secondary" title={`${marco.label}: sem prazo (falta a data de admissão)`}>
          {dias} d · sem prazo
        </Badge>
      );
    case "FORA_DA_TRILHA":
      // Trilha gerada antes de os marcos entrarem no catálogo — o item não
      // existe no banco. Mostrar "agendada" aqui seria inventar registro.
      return (
        <Badge
          variant="secondary"
          title={
            `${marco.label}: não está na trilha desta pessoa` +
            (marco.prazo ? ` (cairia em ${formatarData(marco.prazo)})` : "") +
            " — adicione pela ficha, se fizer sentido"
          }
        >
          {dias} d · fora da trilha
        </Badge>
      );
  }
}

// ---------------------------------------------------------------
// Badges de férias e avaliação
// ---------------------------------------------------------------

function BadgeFerias({ ferias }: { ferias: LinhaTime["ferias"] }) {
  const sufixoHistorico = ferias.semHistorico ? " — sem histórico de gozo no sistema" : "";
  switch (ferias.situacao) {
    case "SEM_DATA":
      return (
        <Badge variant="outline" className="text-muted-foreground" title="Sem data de admissão não há período aquisitivo para calcular">
          sem data de admissão
        </Badge>
      );
    case "PRIMEIRO_ANO":
      return (
        <Badge variant="outline" title="Ainda não completou 12 meses — nenhum período adquirido">
          1º ano em curso
        </Badge>
      );
    case "EM_DIA":
      return <Badge variant="outline">em dia</Badge>;
    case "DISPONIVEL":
      return (
        <Badge variant="secondary" title={`Saldo de ${ferias.saldoTotal} dia(s)${sufixoHistorico}`}>
          {ferias.saldoTotal} dias disponíveis
        </Badge>
      );
    case "VENCENDO":
      return (
        <Badge
          variant="secondary"
          className="text-warning"
          title={`Vence em ${ferias.diasAteLimite} dia(s)${sufixoHistorico}`}
        >
          vencendo em {ferias.diasAteLimite} d
        </Badge>
      );
    case "VENCIDO":
      return (
        <Badge
          variant="destructive"
          title={
            `Passou do limite concessivo há ${Math.abs(ferias.diasAteLimite ?? 0)} dia(s) — pagamento em dobro (art. 137)` +
            (ferias.semHistorico
              ? ". Sem NENHUMA férias registrada: pode ser buraco de cadastro, confira na tela de Férias"
              : "")
          }
        >
          vencidas{ferias.semHistorico ? "?" : ""}
        </Badge>
      );
  }
}

function BadgeAvaliacao({ avaliacao }: { avaliacao: LinhaTime["avaliacao"] }) {
  switch (avaliacao.situacao) {
    case "SEM_CICLO":
      // Sem ciclo aberto no CNPJ, não avaliar não é pendência — travessão, não
      // "sem avaliação".
      return (
        <span className="text-sm text-muted-foreground" title="O CNPJ desta pessoa não tem ciclo de avaliação aberto">
          — sem ciclo aberto
        </span>
      );
    case "SEM_AVALIACAO":
      return (
        <Badge variant="secondary" className="text-warning" title="Há ciclo aberto e ninguém criou avaliação para esta pessoa">
          sem avaliação
        </Badge>
      );
    case "EM_ANDAMENTO":
      return (
        <Badge variant="secondary">
          {avaliacao.concluidas}/{avaliacao.total} concluídas
        </Badge>
      );
    case "CONCLUIDA":
      return (
        <Badge variant="default">
          concluída{avaliacao.total > 1 ? ` (${avaliacao.total})` : ""}
        </Badge>
      );
  }
}
