"use client";

/**
 * Histórico de marcações de ponto — a tela que responde "o que ficou gravado
 * nesta batida?".
 *
 * O monitor da primeira aba mostra o DIA e só o dia. Esta mostra qualquer
 * período, e mostra TUDO que a batida carrega: quem, quando, que tipo, a foto
 * tirada na hora, a coordenada (com endereço aproximado quando dá para
 * descobrir), o endereço IP e o aparelho, o NSR e o hash, a hora em que a
 * linha entrou no banco — e, embaixo, o que aconteceu com ela depois: pedidos
 * de ajuste, decisões e a trilha de auditoria.
 *
 * NADA AQUI EDITA MARCAÇÃO. A batida do REP-P é imutável (Portaria MTP
 * 671/2021): correção não reescreve a linha, abre um tratamento ao lado dela.
 * Por isso esta tela é só leitura — o caminho para corrigir continua sendo a
 * aba "Tratamento (PTRP)", e o que se corrigiu aparece aqui, junto do original.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronRight,
  FileEdit,
  History,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import {
  statusMarcacaoLabel,
  tipoMarcacaoLabel,
  tipoTratamentoLabel,
  TIPOS_MARCACAO_PONTO,
  type StatusDaMarcacao,
} from "@/lib/constants-ponto";
// Só o TIPO atravessa: import de tipo é apagado na compilação, então o leitor
// do banco (que importa `prisma`) não entra no pacote do navegador.
import type { MarcacaoDoHistorico } from "@/lib/ponto-historico";
import {
  enderecosDasMarcacoes,
  listarHistoricoDeMarcacoes,
} from "@/app/actions/rh-ponto-historico";

export type OpcaoColaboradorHistorico = { id: string; nome: string; ativo: boolean };

function BadgeStatus({ status }: { status: StatusDaMarcacao }) {
  const rotulo = statusMarcacaoLabel(status);
  switch (status) {
    case "VALIDA":
      return <Badge variant="outline" className="border-success/50 text-success">{rotulo}</Badge>;
    case "EM_TRATAMENTO":
      return <Badge variant="secondary">{rotulo}</Badge>;
    case "AJUSTADA":
      return <Badge variant="outline" className="border-primary/50 text-primary">{rotulo}</Badge>;
    default:
      return (
        <Badge variant="outline" className="border-dashed border-primary/50 text-muted-foreground">
          {rotulo}
        </Badge>
      );
  }
}

/** "-8.052341, -34.902110" — o que se cola numa busca de mapa. */
function coordenadaLegivel(m: MarcacaoDoHistorico): string | null {
  if (m.latitude === null || m.longitude === null) return null;
  return `${m.latitude.toFixed(6)}, ${m.longitude.toFixed(6)}`;
}

function linkDoMapa(m: MarcacaoDoHistorico): string | null {
  if (m.latitude === null || m.longitude === null) return null;
  return `https://www.google.com/maps?q=${m.latitude},${m.longitude}`;
}

export function HistoricoPontoView({
  empresaId,
  colaboradores,
  periodoInicial,
}: {
  empresaId: string;
  colaboradores: OpcaoColaboradorHistorico[];
  /** Dias de Brasília calculados no servidor — o cliente não decide "hoje". */
  periodoInicial: { de: string; ate: string };
}) {
  const [de, setDe] = useState(periodoInicial.de);
  const [ate, setAte] = useState(periodoInicial.ate);
  const [colaboradorId, setColaboradorId] = useState("");
  const [tipo, setTipo] = useState("");

  const [marcacoes, setMarcacoes] = useState<MarcacaoDoHistorico[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [jaBuscou, setJaBuscou] = useState(false);

  /** id da marcação -> endereço aproximado. Chega depois da tabela. */
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState<MarcacaoDoHistorico | null>(null);

  const paginacao = usePaginacao(marcacoes);
  // `irPara` é o próprio setState do hook — identidade ESTÁVEL entre renders.
  // `resetar` não é: usá-lo aqui trocaria a identidade de `aplicar` a cada
  // render, e o efeito de primeira carga (que depende dela) rodaria em laço.
  const { irPara } = paginacao;

  // A consulta e a APLICAÇÃO do resultado, separadas: `consultar` não toca em
  // estado nenhum antes do await, o que deixa a primeira carga caber dentro de
  // um efeito sem disparar render em cascata.
  const consultar = useCallback(
    async (filtros: { de: string; ate: string; colaboradorId: string; tipo: string }) => {
      try {
        const res = await listarHistoricoDeMarcacoes({
          empresaId,
          de: filtros.de,
          ate: filtros.ate,
          colaboradorId: filtros.colaboradorId || undefined,
          tipo: filtros.tipo || undefined,
        });
        return res;
      } catch {
        // Não só o `erro` que a action devolve: queda de conexão ou pool
        // esgotado não devolvem resultado nenhum, e sem isto a tela ficaria em
        // "Carregando..." para sempre, sem dizer nada.
        return {
          marcacoes: [],
          truncado: false,
          erro: "Não foi possível carregar o histórico. Tente de novo.",
        };
      }
    },
    [empresaId],
  );

  const aplicar = useCallback(
    (res: Awaited<ReturnType<typeof consultar>>) => {
      setMarcacoes(res.marcacoes);
      setTruncado(res.truncado);
      setErro(res.erro ?? null);
      setCarregando(false);
      setJaBuscou(true);
      irPara(1);
    },
    [irPara],
  );

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    aplicar(await consultar({ de, ate, colaboradorId, tipo }));
  }, [consultar, aplicar, de, ate, colaboradorId, tipo]);

  // Primeira carga: o período padrão já vem preenchido, então a aba abre com
  // conteúdo em vez de um formulário vazio esperando um clique. As buscas
  // seguintes saem do botão — refazer a consulta a cada tecla digitada num
  // campo de data buscaria "01/01/0002" no meio da digitação.
  useEffect(() => {
    let cancelado = false;
    void consultar({
      de: periodoInicial.de,
      ate: periodoInicial.ate,
      colaboradorId: "",
      tipo: "",
    }).then((res) => {
      if (!cancelado) aplicar(res);
    });
    return () => {
      cancelado = true;
    };
  }, [consultar, aplicar, periodoInicial.de, periodoInicial.ate]);

  // Endereços das linhas À VISTA. Roda a cada troca de página: o serviço
  // externo tem teto por chamada (ver lib/ponto-endereco.ts), então pedir só o
  // que está na tela é o que faz a coisa caber.
  const idsDaPagina = paginacao.itensDaPagina
    .filter((m) => m.latitude !== null && m.longitude !== null)
    .map((m) => m.id);
  const chaveDaPagina = idsDaPagina.join(",");

  useEffect(() => {
    if (!chaveDaPagina) return;
    let cancelado = false;
    const ids = chaveDaPagina.split(",");
    void enderecosDasMarcacoes({ empresaId, ids })
      .then((novos) => {
        if (!cancelado) setEnderecos((atual) => ({ ...atual, ...novos }));
      })
      .catch(() => {
        // Endereço é conveniência: falhar aqui não pode tirar a tabela do ar.
      });
    return () => {
      cancelado = true;
    };
  }, [chaveDaPagina, empresaId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Histórico de Marcações</h2>
        <p className="text-xs text-muted-foreground">
          Cada batida com tudo que ficou gravado nela — foto, localização, aparelho, NSR e hash — e o
          histórico de alterações. Somente leitura: marcação registrada não é apagada nem reescrita.
        </p>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="hist-de" className="text-xs">De</Label>
              <Input id="hist-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hist-ate" className="text-xs">Até</Label>
              <Input id="hist-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hist-colab" className="text-xs">Colaborador</Label>
              <select
                id="hist-colab"
                value={colaboradorId}
                onChange={(e) => setColaboradorId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="">Todos</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.ativo ? "" : " (desligado)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hist-tipo" className="text-xs">Tipo de registro</Label>
              <select
                id="hist-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="">Todos</option>
                {TIPOS_MARCACAO_PONTO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => void buscar()} disabled={carregando} size="sm" className="gap-2 text-xs">
              <Search className="w-4 h-4" />
              {carregando ? "Buscando..." : "Buscar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {erro && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{erro}</span>
          </p>
        </div>
      )}

      {truncado && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          O período escolhido tem mais marcações do que esta consulta traz de uma vez. As mais recentes
          estão na lista; para ver o resto, estreite o período ou filtre por colaborador.
        </p>
      )}

      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Marcações do período
            </CardTitle>
            <CardDescription className="text-xs">
              {carregando ? "Carregando..." : `${marcacoes.length} marcação(ões)`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Colaborador</TableHead>
                  <TableHead className="text-xs">Data e hora</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Foto</TableHead>
                  <TableHead className="text-xs">Localização</TableHead>
                  <TableHead className="text-xs">Registrado em</TableHead>
                  <TableHead className="text-xs text-right">Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!carregando && marcacoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                      {jaBuscou && !erro
                        ? "Nenhuma marcação no período escolhido."
                        : "Escolha o período e clique em Buscar."}
                    </TableCell>
                  </TableRow>
                )}
                {paginacao.itensDaPagina.map((m) => {
                  const coordenada = coordenadaLegivel(m);
                  const endereco = enderecos[m.id];
                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs">
                        <span className="font-medium block">{m.colaboradorNome}</span>
                        <span className="text-muted-foreground">
                          {m.setor} · {m.cargo}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {formatarDataHoraBrasilia(m.dataHora)}
                      </TableCell>
                      <TableCell className="text-xs">{tipoMarcacaoLabel(m.tipo)}</TableCell>
                      <TableCell><BadgeStatus status={m.status} /></TableCell>
                      <TableCell className="text-xs">
                        {m.origem === "TRATAMENTO" ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground" title="Marcação incluída pelo RH — não houve batida, logo não há foto">
                            <FileEdit className="w-3.5 h-3.5" /> —
                          </span>
                        ) : m.temFoto ? (
                          <a
                            href={`/api/rh/${empresaId}/ponto/${m.id}/foto`}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir a foto tirada nesta batida (a visualização fica na auditoria)"
                            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-accent"
                          >
                            <Camera className="w-3.5 h-3.5 text-primary" /> ver
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground" title="Batida registrada sem foto">
                            <CameraOff className="w-3.5 h-3.5" /> sem foto
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[240px]">
                        {coordenada ? (
                          <>
                            <span className="block truncate" title={endereco ?? "Endereço ainda não determinado"}>
                              {endereco ?? "endereço não determinado"}
                            </span>
                            <a
                              href={linkDoMapa(m)!}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[10px] text-muted-foreground hover:underline"
                            >
                              {coordenada}
                            </a>
                            {!m.gpsValido && (
                              <span className="ml-1 text-[10px] text-destructive">fora da cerca</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {m.origem === "TRATAMENTO" ? "—" : "sem GPS"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap text-muted-foreground">
                        {formatarDataHoraBrasilia(m.registradoEm)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setAberta(m)}>
                          {m.alteracoes.length > 0 && (
                            <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">
                              {m.alteracoes.length}
                            </span>
                          )}
                          Abrir <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Paginacao
            total={paginacao.total}
            porPagina={paginacao.porPagina}
            paginaAtual={paginacao.paginaAtual}
            totalPaginas={paginacao.totalPaginas}
            onMudarPagina={paginacao.irPara}
          />
        </CardContent>
      </Card>

      <DetalheDaMarcacao
        empresaId={empresaId}
        marcacao={aberta}
        endereco={aberta ? enderecos[aberta.id] : undefined}
        onFechar={() => setAberta(null)}
      />
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="text-sm break-words">{children}</div>
    </div>
  );
}

function DetalheDaMarcacao({
  empresaId,
  marcacao,
  endereco,
  onFechar,
}: {
  empresaId: string;
  marcacao: MarcacaoDoHistorico | null;
  endereco?: string;
  onFechar: () => void;
}) {
  if (!marcacao) return null;
  const m = marcacao;
  const coordenada = coordenadaLegivel(m);

  return (
    <Dialog open={m !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            {m.colaboradorNome}
            <BadgeStatus status={m.status} />
          </DialogTitle>
          <DialogDescription className="text-xs">
            {tipoMarcacaoLabel(m.tipo)} · {formatarDataHoraBrasilia(m.dataHora)} · {m.setor} · {m.cargo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Data e horário da batida">
              <span className="font-mono">{formatarDataHoraBrasilia(m.dataHora)}</span>
            </Campo>
            <Campo rotulo="Registrado no sistema em">
              <span className="font-mono">{formatarDataHoraBrasilia(m.registradoEm)}</span>
            </Campo>
            <Campo rotulo="Tipo de registro">{tipoMarcacaoLabel(m.tipo)}</Campo>
            <Campo rotulo="Origem">
              {m.origem === "BATIDA"
                ? "Batida do REP-P (coletada pelo app/portal)"
                : "Incluída pelo RH por tratamento aprovado"}
            </Campo>
          </div>

          {/* Foto: a prova de quem bateu. Fica grande de propósito — a
              comparação com a foto de referência é feita a olho. */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Foto do momento do registro
            </p>
            {m.origem === "TRATAMENTO" ? (
              <p className="text-sm text-muted-foreground">
                Marcação incluída pelo RH — não houve batida, logo não existe foto.
              </p>
            ) : m.temFoto ? (
              <a
                href={`/api/rh/${empresaId}/ponto/${m.id}/foto`}
                target="_blank"
                rel="noreferrer"
                title="Abrir em tamanho cheio"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/rh/${empresaId}/ponto/${m.id}/foto`}
                  alt={`Foto da batida de ${m.colaboradorNome}`}
                  className="max-h-64 rounded-md border object-contain"
                />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">
                Batida registrada sem foto. Desde 20/08/2026 a foto é obrigatória; batidas anteriores
                a essa data podem não ter.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Localização (GPS)">
              {coordenada ? (
                <a href={linkDoMapa(m)!} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
                  {coordenada}
                </a>
              ) : (
                <span className="text-muted-foreground">não registrada</span>
              )}
              {m.precisaoGps !== null && (
                <span className="block text-xs text-muted-foreground">
                  precisão de ~{Math.round(m.precisaoGps)} m
                </span>
              )}
            </Campo>
            <Campo rotulo="Endereço correspondente">
              {coordenada ? (
                endereco ? (
                  <span className="inline-flex items-start gap-1">
                    <MapPin className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary" />
                    {endereco}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Não foi possível determinar o endereço desta coordenada.
                  </span>
                )
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Campo>
            <Campo rotulo="Cerca da empresa">
              {m.origem === "TRATAMENTO" ? (
                <span className="text-muted-foreground">—</span>
              ) : m.gpsValido ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <ShieldCheck className="w-3.5 h-3.5" /> dentro do raio permitido
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <ShieldAlert className="w-3.5 h-3.5" /> fora do raio permitido
                </span>
              )}
            </Campo>
            <Campo rotulo="Rede (IP)">
              {m.ipOrigem ? (
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  {m.ipValido ? (
                    <Wifi className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-destructive" />
                  )}
                  {m.ipOrigem}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Campo>
          </div>

          {m.dispositivoInfo && (
            <Campo rotulo="Aparelho / navegador">
              <span className="text-xs text-muted-foreground">{m.dispositivoInfo}</span>
            </Campo>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="NSR (número sequencial)">
              {m.nsr ? (
                <span className="font-mono">{m.nsr}</span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  não se aplica — marcação tratada não consome NSR e não entra no AFD
                </span>
              )}
            </Campo>
            <Campo rotulo="Hash SHA-256 (integridade)">
              <span className="font-mono text-[10px] break-all">{m.hashSHA256}</span>
            </Campo>
          </div>

          {m.origem === "TRATAMENTO" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-semibold">Decisão que criou esta marcação</p>
              {m.justificativa && <p className="text-sm">{m.justificativa}</p>}
              <p className="text-xs text-muted-foreground">
                Aprovada por {m.aprovadoPorNome ?? "—"}
                {m.aprovadoEm ? ` em ${formatarDataHoraBrasilia(m.aprovadoEm)}` : ""}.
              </p>
            </div>
          )}

          {/* Histórico de alterações. Nada some daqui: pedido rejeitado
              continua listado, com o motivo de quem pediu e o de quem recusou,
              lado a lado. */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Histórico de alterações
            </p>
            {m.alteracoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma alteração pedida sobre esta marcação — ela está como foi registrada.
              </p>
            ) : (
              <ul className="space-y-2">
                {m.alteracoes.map((a) => (
                  <li key={a.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{tipoTratamentoLabel(a.tipo)}</span>
                      <Badge variant={a.status === "APROVADO" ? "default" : a.status === "REJEITADO" ? "destructive" : "secondary"}>
                        {a.status === "PENDENTE" ? "Pendente" : a.status === "APROVADO" ? "Aprovado" : "Rejeitado"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        pedido por {a.origem === "COLABORADOR" ? "colaborador" : "RH"} em{" "}
                        {formatarDataHoraBrasilia(a.pedidoEm)}
                      </span>
                    </div>
                    {a.tipoMarcacao && a.horaSolicitada && (
                      <p className="text-xs text-muted-foreground">
                        Marcação pedida: {tipoMarcacaoLabel(a.tipoMarcacao)} às {a.horaSolicitada}.
                      </p>
                    )}
                    <p>
                      <span className="text-xs text-muted-foreground">Motivo de quem pediu: </span>
                      {a.motivo}
                    </p>
                    {a.motivoDecisao && (
                      <p>
                        <span className="text-xs text-muted-foreground">Motivo da decisão: </span>
                        {a.motivoDecisao}
                      </p>
                    )}
                    {a.decididoEm && (
                      <p className="text-xs text-muted-foreground">
                        Decidido por {a.decididoPorNome ?? "—"} em {formatarDataHoraBrasilia(a.decididoEm)}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Trilha de auditoria (LGPD). Append-only: o sistema grava, nunca
              apaga nem reescreve — ver lib/audit.ts. */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Trilha de auditoria
            </p>
            {m.auditoria.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum acesso ou decisão registrado sobre esta marcação até agora.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {m.auditoria.map((e) => (
                  <li key={e.id} className="p-2 text-xs">
                    <span className="font-mono text-muted-foreground">
                      {formatarDataHoraBrasilia(e.em)}
                    </span>{" "}
                    · <span className="font-medium">{e.usuarioNome ?? "—"}</span>
                    {e.usuarioRole ? ` (${e.usuarioRole})` : ""} · {e.resumo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
