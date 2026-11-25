"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Bar,
  BarChart,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { CLASSE_RECORTE, Segmentado } from "@/components/padroes/barra-de-filtros";
import { cn } from "@/lib/utils";
import { causaDesligamentoLabel, motivoDesligamentoLabel } from "@/lib/constants-dp";
import {
  type ChavePeriodo,
  type ConfigDaArea,
  type DetalheDoRecorte,
  type LinhaDoQuadro,
  type PlacarDaMeta,
} from "@/lib/desligamentos/painel";
import { ConfiguracaoDesligamentosDialog } from "./configuracao-dialog";

// A vista do painel — client por causa do recharts e dos filtros; todo número
// chega pronto do servidor (lib/desligamentos/painel.ts).

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function tempoDeCasa(dias: number | null): string {
  if (dias === null) return "—";
  if (dias < 90) return `${dias} dias`;
  const meses = Math.floor(dias / 30.44);
  if (meses < 24) return `${meses} meses`;
  return `${(dias / 365.25).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`;
}

// O semáforo é a exceção deliberada ao sistema monocromático (Modernist, ver
// components/indicador.tsx): a ordem de serviço do CEO pede verde abaixo da
// meta, amarelo entre a meta e o limite e vermelho acima do limite — é o
// código que a reunião de gerentes lê de longe. Cor nunca sozinha: o texto do
// selo diz a faixa (WCAG 1.4.1).
const SEMAFORO = {
  verde: { classe: "bg-emerald-700 text-white", texto: "Abaixo da meta" },
  amarelo: { classe: "bg-amber-400 text-black", texto: "Acima da meta, abaixo do limite" },
  vermelho: { classe: "bg-red-700 text-white", texto: "Acima do limite" },
} as const;

const CORES = { desligamentos: "var(--chart-2)", acumulado: "var(--chart-1)", admissoes: "var(--success)" };

type Props = {
  empresaId: string;
  placar: PlacarDaMeta;
  setores: LinhaDoQuadro[];
  gestores: LinhaDoQuadro[];
  detalhe: DetalheDoRecorte | null;
  config: ConfigDaArea;
  podeConfigurar: boolean;
  periodo: { chave: ChavePeriodo; rotulo: string; de: string; ate: string };
  ano: number;
  anoAtual: number;
  filtros: {
    setor: string | null;
    gestor: string | null;
    setores: { chave: string; nome: string }[];
    gestores: { chave: string; nome: string }[];
  };
  avisos: string[];
};

export function PainelDesligamentosView(props: Props) {
  const { empresaId, placar, setores, gestores, detalhe, config, periodo, ano, anoAtual, filtros, avisos } = props;
  const router = useRouter();
  const pathname = usePathname();
  const busca = useSearchParams();
  const [ordemGestores, setOrdemGestores] = useState<"turnover" | "custo">("turnover");
  const [de, setDe] = useState(periodo.de);
  const [ate, setAte] = useState(periodo.ate);
  // "Personalizado" só abre os campos de data; a URL muda no "Aplicar". Sem
  // isso, o clique navegava sem datas, o servidor voltava para o ano atual (é
  // o que ele faz com período inválido) e os campos nunca chegavam a aparecer.
  const [personalizando, setPersonalizando] = useState(periodo.chave === "personalizado");

  const navegar = (mudancas: Record<string, string | null>) => {
    const proximos = new URLSearchParams(busca.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") proximos.delete(chave);
      else proximos.set(chave, valor);
    }
    const qs = proximos.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const semaforo = SEMAFORO[placar.faixa];
  const nomeDoRecorte = filtros.setor
    ? `setor ${filtros.setores.find((s) => s.chave === filtros.setor)?.nome ?? ""}`
    : filtros.gestor
      ? `equipe de ${filtros.gestores.find((g) => g.chave === filtros.gestor)?.nome ?? ""}`
      : null;
  const gestoresOrdenados =
    ordemGestores === "custo" ? [...gestores].sort((a, b) => b.custo - a.custo || b.saidas - a.saidas) : gestores;
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Desligamentos"
        resumo={
          <>
            {placar.desligamentos} desligamento(s) em {ano}
            {placar.emAndamento ? " até hoje" : ""}
            {nomeDoRecorte ? ` no ${nomeDoRecorte}` : ""} —{" "}
            <b className="text-foreground">{pct(placar.realizadoPct)}</b> do quadro médio, para uma meta de{" "}
            {pct(config.metaPct)} e um limite de {pct(config.limitePct)}.
          </>
        }
        acoes={
          <ConfiguracaoDesligamentosDialog empresaId={empresaId} config={config} podeConfigurar={props.podeConfigurar} />
        }
      />

      <p className="text-sm italic text-muted-foreground">
        “Cada gestor é responsável pela equipe que tem — temos que contratar bem para demitir menos.”
      </p>

      {/* Filtros: período, setor, gestor. Sem filtro de CNPJ, de propósito. */}
      <div className="flex flex-wrap items-end gap-3">
        <Segmentado
          rotulo="Período das tabelas"
          valor={personalizando ? "personalizado" : periodo.chave}
          aoMudar={(v) => {
            if (v === "personalizado") {
              setPersonalizando(true);
              return;
            }
            setPersonalizando(false);
            navegar({ periodo: v === "ano" ? null : v, de: null, ate: null });
          }}
          opcoes={[
            { valor: "ano", label: "Ano atual" },
            { valor: "12m", label: "12 meses" },
            { valor: "24m", label: "24 meses" },
            { valor: "personalizado", label: "Personalizado" },
          ]}
        />
        {personalizando && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!de || !ate || de > ate) return;
              navegar({ periodo: "personalizado", de, ate });
            }}
          >
            <label className="text-xs text-muted-foreground">
              De
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={cn(CLASSE_RECORTE, "block")} />
            </label>
            <label className="text-xs text-muted-foreground">
              Até
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={cn(CLASSE_RECORTE, "block")} />
            </label>
            <button
              type="submit"
              disabled={!de || !ate || de > ate}
              title={de && ate && de > ate ? "A data inicial é depois da final." : undefined}
              className="h-9 border border-input px-3 text-[13px] hover:bg-muted disabled:opacity-50"
            >
              Aplicar
            </button>
          </form>
        )}
        <label className="text-xs text-muted-foreground">
          Setor
          <select
            value={filtros.setor ?? ""}
            onChange={(e) => navegar({ setor: e.target.value || null })}
            className={cn(CLASSE_RECORTE, "block")}
          >
            <option value="">Todos os setores</option>
            {filtros.setores.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Gestor
          <select
            value={filtros.gestor ?? ""}
            onChange={(e) => navegar({ gestor: e.target.value || null })}
            className={cn(CLASSE_RECORTE, "block")}
          >
            <option value="">Todos os gestores</option>
            {filtros.gestores.map((g) => (
              <option key={g.chave} value={g.chave}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Ano da meta
          <select
            value={String(ano)}
            onChange={(e) => navegar({ ano: e.target.value === String(anoAtual) ? null : e.target.value })}
            className={cn(CLASSE_RECORTE, "block")}
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {(filtros.setor || filtros.gestor || periodo.chave !== "ano" || ano !== anoAtual) && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="h-9 px-2 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* 1. Placar da meta */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Placar da meta — {ano}</CardTitle>
              <CardDescription>
                Desligamentos do ano ÷ quadro médio do ano
                {nomeDoRecorte ? ` (${nomeDoRecorte})` : ""}. Transferência entre empresas do grupo não conta.
              </CardDescription>
            </div>
            <span className={cn("rounded px-3 py-1.5 text-sm font-bold", semaforo.classe)}>
              {pct(placar.realizadoPct)} · {semaforo.texto}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FaixaDeIndicadores colunas={5}>
            <Indicador
              rotulo={`Realizado em ${ano}`}
              valor={placar.desligamentos}
              complemento={`${pct(placar.realizadoPct)} de um quadro médio de ${placar.quadroMedio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`}
            />
            {/* Só o número no valor: "14 pessoas" em 36px não cabe em cinco
                colunas e a tela cortava para "14 pess…". A unidade vai embaixo. */}
            <Indicador
              rotulo={`Meta (${pct(config.metaPct)})`}
              valor={placar.metaPessoas}
              complemento={
                placar.mesMetaUltrapassada
                  ? `pessoas · ultrapassada em ${placar.mesMetaUltrapassada}`
                  : "pessoas · não ultrapassada"
              }
              estado={placar.mesMetaUltrapassada ? "atencao" : "padrao"}
            />
            <Indicador
              rotulo={`Limite (${pct(config.limitePct)})`}
              valor={placar.limitePessoas}
              complemento={
                placar.mesLimiteUltrapassado
                  ? `pessoas · ultrapassado em ${placar.mesLimiteUltrapassado}`
                  : "pessoas · não ultrapassado"
              }
              estado={placar.mesLimiteUltrapassado ? "alerta" : "padrao"}
            />
            <Indicador
              rotulo="Projeção até 31/12"
              valor={placar.projecao ? placar.projecao.desligamentos : "—"}
              complemento={
                placar.projecao
                  ? `${pct(placar.projecao.pct)} pelo ritmo atual · ${SEMAFORO[placar.projecao.faixa].texto.toLowerCase()}`
                  : "ano fechado"
              }
              estado={placar.projecao?.faixa === "vermelho" ? "alerta" : placar.projecao?.faixa === "amarelo" ? "atencao" : "padrao"}
            />
            <Indicador
              rotulo="Folga até o limite"
              valor={Math.max(0, placar.limitePessoas - placar.desligamentos)}
              complemento={
                placar.desligamentos > placar.limitePessoas
                  ? `${placar.desligamentos - placar.limitePessoas} acima do limite`
                  : "desligamentos ainda dentro do limite"
              }
            />
          </FaixaDeIndicadores>

          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={placar.serie} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <XAxis dataKey="mes" fontSize={11} tickLine={false} />
              <YAxis fontSize={11} tickLine={false} allowDecimals={false} width={32} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="desligamentos" name="Desligamentos no mês" fill={CORES.desligamentos} radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="acumulado" name="Acumulado no ano" stroke={CORES.acumulado} strokeWidth={2} dot={false} />
              <ReferenceLine y={placar.metaPessoas} stroke="var(--success)" strokeDasharray="4 4" label={{ value: `meta ${placar.metaPessoas}`, fontSize: 11, position: "insideTopLeft" }} />
              <ReferenceLine y={placar.limitePessoas} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: `limite ${placar.limitePessoas}`, fontSize: 11, position: "insideTopLeft" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 2. Custo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Custo dos desligamentos — {ano}</CardTitle>
          <CardDescription>
            Custo mínimo de {reais(config.custoPorDesligamento)} por desligamento
            {config.personalizada ? " (definido pela diretoria)" : " (valor padrão — a diretoria pode ajustar)"}. É piso, não
            conta exata: não inclui recrutamento, treinamento nem a produtividade perdida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FaixaDeIndicadores colunas={3}>
            <Indicador
              rotulo="Custo total"
              valor={reais(placar.custo.total)}
              complemento={`${placar.desligamentos} × ${reais(placar.custo.porDesligamento)}`}
            />
            <Indicador
              rotulo="Acima da meta"
              valor={reais(placar.custo.acimaDaMeta)}
              complemento={`o que passou de ${placar.metaPessoas} desligamentos`}
              estado={placar.custo.acimaDaMeta > 0 ? "atencao" : "padrao"}
            />
            <Indicador
              rotulo="Acima do limite"
              valor={reais(placar.custo.acimaDoLimite)}
              complemento={`o que passou de ${placar.limitePessoas} desligamentos`}
              estado={placar.custo.acimaDoLimite > 0 ? "alerta" : "padrao"}
            />
          </FaixaDeIndicadores>
        </CardContent>
      </Card>

      {/* 3. Quadro por setor */}
      <QuadroDeLinhas
        titulo="Quadro por setor"
        descricao={`Entradas, saídas e custo: ${periodo.rotulo}. Turnover: sempre os últimos 12 meses. Do pior para o melhor; em vermelho, acima do limite de ${pct(config.limitePct)}. Clique num setor para ver o detalhe.`}
        rotuloDaLinha="Setor"
        linhas={setores}
        selecionada={filtros.setor}
        aoClicar={(chave) => navegar({ setor: chave === filtros.setor ? null : chave, gestor: null })}
      />

      {/* 4. Quadro por gestor */}
      <QuadroDeLinhas
        titulo="Quadro por gestor"
        descricao={`Mesmos indicadores agrupados pelo gestor responsável. Entradas, saídas e custo: ${periodo.rotulo}. Clique num gestor para ver a equipe.`}
        rotuloDaLinha="Gestor"
        linhas={gestoresOrdenados}
        selecionada={filtros.gestor}
        aoClicar={(chave) => navegar({ gestor: chave === filtros.gestor ? null : chave, setor: null })}
        mostrarOrigem
        acao={
          <Segmentado
            rotulo="Ordenar gestores por"
            valor={ordemGestores}
            aoMudar={setOrdemGestores}
            opcoes={[
              { valor: "turnover", label: "Por turnover" },
              { valor: "custo", label: "Por custo" },
            ]}
          />
        }
      />

      {/* 5. Detalhe do recorte clicado */}
      {detalhe && nomeDoRecorte && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhe — {nomeDoRecorte}</CardTitle>
            <CardDescription>Admissões e desligamentos dos últimos 12 meses; quem saiu e por quê no período ({periodo.rotulo}).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={detalhe.mesAMes} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="mes" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="admissoes" name="Admissões" fill={CORES.admissoes} radius={[3, 3, 0, 0]} />
                <Bar dataKey="desligamentos" name="Desligamentos" fill={CORES.desligamentos} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {detalhe.porCausa.length > 0 && (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="text-muted-foreground">Causa da saída:</span>
                {detalhe.porCausa.map((c) => (
                  <span key={c.causa ?? "sem"} className="border border-border px-2 py-0.5">
                    {c.causa ? causaDesligamentoLabel(c.causa) : "Sem causa registrada"}: <b className="tabular-nums">{c.total}</b>
                  </span>
                ))}
              </div>
            )}

            {detalhe.saidas.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma saída neste recorte no período.</p>
            ) : (
              <div className="rounded-md border">
                <Table compacta>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pessoa</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>{filtros.setor ? "Gestor" : "Setor"}</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Causa</TableHead>
                      <TableHead className="text-right">Tempo de casa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalhe.saidas.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Link href={`/rh/${s.empresaId}/colaboradores/${s.id}`} className="font-medium hover:underline">
                            {s.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{s.data}</TableCell>
                        <TableCell className="text-muted-foreground">{s.cargo}</TableCell>
                        <TableCell className="text-muted-foreground">{filtros.setor ? s.gestor : s.setor}</TableCell>
                        <TableCell>{s.motivo ? motivoDesligamentoLabel(s.motivo) : "—"}</TableCell>
                        <TableCell>
                          {s.causa ? causaDesligamentoLabel(s.causa) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{tempoDeCasa(s.diasDeCasa)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {avisos.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {avisos.map((a) => (
            <p key={a}>• {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function QuadroDeLinhas({
  titulo,
  descricao,
  rotuloDaLinha,
  linhas,
  selecionada,
  aoClicar,
  mostrarOrigem = false,
  acao,
}: {
  titulo: string;
  descricao: string;
  rotuloDaLinha: string;
  linhas: LinhaDoQuadro[];
  selecionada: string | null;
  aoClicar: (chave: string) => void;
  mostrarOrigem?: boolean;
  acao?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            <CardDescription>{descricao}</CardDescription>
          </div>
          {acao}
        </div>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada a mostrar neste recorte.</p>
        ) : (
          <div className="rounded-md border">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>{rotuloDaLinha}</TableHead>
                  <TableHead className="text-right">Ativos hoje</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Turnover 12m</TableHead>
                  <TableHead className="text-right">Menos de 1 ano</TableHead>
                  <TableHead className="text-right" title="Dispensas pela empresa × pedidos de demissão (outros motivos à parte)">
                    Empresa × pedido
                  </TableHead>
                  <TableHead className="text-right">Custo estimado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow
                    key={l.chave}
                    onClick={() => aoClicar(l.chave)}
                    className={cn("cursor-pointer", l.chave === selecionada && "bg-muted")}
                  >
                    <TableCell>
                      <span className="font-medium">{l.nome}</span>
                      {mostrarOrigem && (l.saidasPeloSetor ?? 0) > 0 && (
                        <span
                          className="block text-xs text-muted-foreground"
                          title="A ficha não guardava o líder no dia da saída; a saída foi atribuída ao principal líder do setor."
                        >
                          {l.saidasPeloSetor} de {l.saidas} saída(s) atribuída(s) pelo setor
                        </span>
                      )}
                      {l.amostraPequena && (
                        <span className="block text-xs text-muted-foreground">equipe pequena — taxa oscila muito</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.ativos}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.entradas}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.saidas}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", l.saldo < 0 && "font-semibold")}>
                      {l.saldo > 0 ? `+${l.saldo}` : l.saldo}
                    </TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", l.acimaDoLimite && "font-bold text-destructive")}
                    >
                      {pct(l.turnover12mPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct(l.pctMenosDeUmAno)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.dispensasEmpresa} × {l.pedidos}
                      {l.outrosMotivos > 0 && <span className="text-muted-foreground"> (+{l.outrosMotivos})</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{reais(l.custo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
