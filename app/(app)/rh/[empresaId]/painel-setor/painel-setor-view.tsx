"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Indicador } from "@/components/indicador";
import type { PainelDoSetor } from "@/lib/painel-setor";

// A vista do Painel do Setor — client só por causa do recharts; todo número
// chega pronto do servidor (lib/painel-setor.ts) e aqui não se calcula nada.
// A MESMA vista serve a diretoria (que escolheu o setor no seletor) e o gestor
// (que chega com o setor do vínculo, em /rh/meu-setor) — duas portas, um
// número: gestor e diretoria nunca leem valores diferentes do mesmo setor.
const CORES = { total: "#2563eb", admissoes: "#16a34a", desligamentos: "#dc2626" };

function pct(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
function anos(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`;
}

export function PainelSetorView({ painel, rotuloEscopo }: { painel: PainelDoSetor; rotuloEscopo: string }) {
  const { time, comparativo, serie } = painel;
  const resumo = time.resumo;
  const turnoverAcima = comparativo.turnoverSetorPct > comparativo.turnoverEscopoPct;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Indicador
          rotulo="Ativos no setor"
          valor={painel.ativos}
          complemento={painel.cnpjsComSetor > 1 ? `em ${painel.cnpjsComSetor} CNPJs` : undefined}
        />
        <Indicador
          rotulo={`Turnover (${painel.janelaMeses}m)`}
          valor={pct(comparativo.turnoverSetorPct)}
          complemento={`${rotuloEscopo}: ${pct(comparativo.turnoverEscopoPct)}`}
          estado={turnoverAcima && comparativo.turnoverSetorPct > 20 ? "atencao" : "padrao"}
        />
        <Indicador
          rotulo="Entradas × saídas"
          valor={`${painel.admissoesJanela} × ${painel.desligamentosJanela}`}
          complemento={`na janela de ${painel.janelaMeses} meses`}
        />
        <Indicador
          rotulo="Férias vencidas"
          valor={resumo.feriasVencidas}
          estado={resumo.feriasVencidas > 0 ? "alerta" : "padrao"}
        />
        <Indicador
          rotulo="Sem avaliação no ciclo"
          valor={resumo.comCicloAberto > 0 ? resumo.semAvaliacaoNoCiclo : "—"}
          complemento={resumo.comCicloAberto > 0 ? `de ${resumo.comCicloAberto} com ciclo aberto` : "sem ciclo aberto"}
          estado={resumo.comCicloAberto > 0 && resumo.semAvaliacaoNoCiclo > 0 ? "atencao" : "padrao"}
        />
        <Indicador
          rotulo="Nunca acessou o portal"
          valor={resumo.nuncaAcessouPortal}
          complemento={`recém-chegados: ${resumo.recemChegados}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Evolução do quadro</CardTitle>
            <CardDescription>
              Pessoas no setor ao fim de cada mês, nos últimos {painel.janelaMeses} meses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={serie} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="mes" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip
                  formatter={(v: unknown) => [String(v ?? 0), "pessoas"] as [string, string]}
                  labelFormatter={(mes: unknown) => {
                    const m = serie.find((s) => s.mes === mes);
                    return `${String(mes)}${m?.fotografado ? " · foto mensal" : " · reconstituído"}`;
                  }}
                />
                <Area type="monotone" dataKey="total" name="Pessoas" stroke={CORES.total} fill={CORES.total} fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Entradas e saídas, mês a mês</CardTitle>
            <CardDescription>Admissões e desligamentos atribuídos a este setor.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serie} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="mes" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="admissoes" name="Admissões" fill={CORES.admissoes} radius={[3, 3, 0, 0]} />
                <Bar dataKey="desligamentos" name="Desligamentos" fill={CORES.desligamentos} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">O setor e {rotuloEscopo}, lado a lado</CardTitle>
          <CardDescription>Mesma fórmula nos dois lados — a comparação compara recortes, não métodos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Turnover ({painel.janelaMeses}m)</p>
              <p className="text-lg font-semibold tabular-nums">
                {pct(comparativo.turnoverSetorPct)}{" "}
                <span className="text-sm font-normal text-muted-foreground">vs {pct(comparativo.turnoverEscopoPct)}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tempo médio de casa</p>
              <p className="text-lg font-semibold tabular-nums">
                {anos(comparativo.tempoMedioSetorAnos)}{" "}
                <span className="text-sm font-normal text-muted-foreground">vs {anos(comparativo.tempoMedioEscopoAnos)}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Com menos de 1 ano de casa</p>
              <p className="text-lg font-semibold tabular-nums">
                {comparativo.pctAbaixoDeUmAno !== null ? pct(comparativo.pctAbaixoDeUmAno) : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          {painel.mesesFotografados.length > 0
            ? `Meses medidos pela foto mensal: ${painel.mesesFotografados.join(", ")} — os demais são reconstituídos do cadastro.`
            : null}
        </p>
        {painel.avisos.map((a) => (
          <p key={a}>• {a}</p>
        ))}
      </div>
    </div>
  );
}
