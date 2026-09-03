"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartColumn, FileDown, Info, Table2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Indicador } from "@/components/indicador";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { formatarReais } from "@/lib/constants-beneficios";
import { cn } from "@/lib/utils";
import type { LinhaCusto, LinhaFaixaEtaria, LinhaHeadcount, ResultadoTurnover } from "@/lib/bi";
import {
  AVISO_MEDIA_TEMPO_DE_CASA,
  MINIMO_PARA_QUARTIL,
  type LinhaTempoDeCasaPorGrupo,
  type ResumoTempoDeCasa,
} from "@/lib/tempo-de-casa";
import { useControleFiltro } from "../filtro-empresas";
import { RadarDesvio, type RadarDeDesvio } from "./radar-desvio";
import { NarrativaAbertura } from "./narrativa-abertura";
import type { Narrativa } from "@/lib/narrativa";

/**
 * Painel — a tela única de BI de RH.
 *
 * Nasceu da fusão de Painel + Indicadores. As duas liam a MESMA lib/bi.ts, com
 * o MESMO escopo e a MESMA janela de 12 meses: uma desenhava curvas, a outra
 * imprimia tabelas. Isso não é duas telas, é um botão — que agora é o
 * alternador gráfico/tabela aqui em cima. Manter as duas separadas garantia,
 * além do trabalho dobrado, que uma correção entrasse só em uma delas e os dois
 * números com o mesmo nome passassem a divergir.
 *
 * O que a fusão trouxe de novo, além de juntar: o radar de desvio no topo
 * (lib/anomalias.ts), a distribuição de tempo de casa no lugar da média solta
 * (lib/tempo-de-casa.ts), o escopo por `empresasVisiveis` + filtro de URL no
 * lugar do consolidado fixo por marca, e a janela ajustável no lugar dos 12
 * meses cravados.
 *
 * Os tipos das props moram aqui, e não na page: quem define o contrato é quem
 * consome. A page importa com `import type`, que some na compilação — nenhum
 * módulo de cliente é puxado para dentro do Server Component.
 */

export type OpcaoEmpresa = { id: string; nome: string; marca: string };

/** Uma linha do custo por setor, com a cobertura de salário que decide se o número vale. */
export type LinhaCustoNaTela = LinhaCusto & {
  ativos: number;
  comSalario: number;
  /** Falso quando menos da metade dos ativos do setor tem salário: a soma deixa de descrever o setor. */
  folhaConfiavel: boolean;
};

export type LinhaAbsenteismoNaTela = { setor: string; diasFalta: number; taxaPct: number };

/**
 * Absenteísmo com a contagem CRUA de registros junto — sem ela, taxa 0,0% e
 * "ninguém faltou" ficam indistinguíveis de "o módulo nunca foi usado".
 */
export type AbsenteismoNaTela = {
  /** Total de ausências já registradas no recorte, em qualquer data. */
  registrosNoEscopo: number;
  /** Quantas caem na janela de 30 dias que a taxa mede. */
  registrosNaJanela: number;
  linhas: LinhaAbsenteismoNaTela[];
};

type Vista = "graficos" | "tabelas";

// Cores validadas contra daltonismo e contraste (validador do guia de
// dataviz, todos os pares PASS):
//   série única/azul  var(--chart-1)   (= --chart-1 do tema)
//   admissões         #0d9488   × desligamentos var(--chart-2)  (ΔE deutan 13.1)
//   folha             var(--chart-1)   × benefícios    var(--chart-3)  (ΔE protan 32.3)
// Texto de rótulo/tooltip fica nos tokens de texto do tema, nunca na cor da
// série — a cor mora só na marca do gráfico.
const COR = {
  primaria: "var(--chart-1)",
  admissoes: "var(--chart-3)",
  desligamentos: "var(--destructive)",
  folha: "var(--chart-1)",
  beneficios: "var(--chart-4)",
} as const;

const estiloTooltip = {
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  color: "var(--card-foreground)",
  borderRadius: 0,
  boxShadow: "none",
} as const;

const eixoTick = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

/** Top 8 no gráfico e o resto em "Outros" — 20 categorias numa barra é ilegível. */
const TOP_SETORES = 8;

export function PainelView({
  empresaId,
  janela,
  janelas,
  empresasDisponiveis,
  empresasSelecionadas,
  totalAtivos,
  turnover,
  movimento,
  evolucao,
  headcount,
  faixaEtaria,
  custo,
  folhaTotal,
  beneficiosTotal,
  comSalario,
  radar,
  tempo,
  tempoPorSetor,
  absenteismo,
  narrativa,
  exportacaoSegueATela,
}: {
  empresaId: string;
  janela: number;
  janelas: number[];
  empresasDisponiveis: OpcaoEmpresa[];
  empresasSelecionadas: string[];
  totalAtivos: number;
  turnover: ResultadoTurnover;
  movimento: { mes: string; admissoes: number; desligamentos: number }[];
  evolucao: { mes: string; total: number }[];
  headcount: LinhaHeadcount[];
  faixaEtaria: LinhaFaixaEtaria[];
  custo: LinhaCustoNaTela[];
  /** null quando a cobertura de salário é baixa demais para a soma significar algo. */
  folhaTotal: number | null;
  beneficiosTotal: number;
  comSalario: number;
  radar: RadarDeDesvio;
  tempo: ResumoTempoDeCasa;
  tempoPorSetor: LinhaTempoDeCasaPorGrupo[];
  absenteismo: AbsenteismoNaTela;
  narrativa: Narrativa;
  /** Falso quando o CSV/PDF sairia com escopo ou janela diferentes do que está na tela. */
  exportacaoSegueATela: boolean;
}) {
  // Gráfico × tabela é estado de cliente, não da URL: não muda número nenhum,
  // e mandar isso para o servidor custaria um round-trip para trocar a forma do
  // mesmo dado. Filtro e janela, que MUDAM os números, continuam na URL.
  const [vista, setVista] = useState<Vista>("graficos");
  const { selecionadas, aplicar } = useControleFiltro(empresaId);

  // O filtro de escopo desta tela, para os links de exportação carregarem
  // adiante — sem isto o CSV/PDF sempre saía com a marca da URL, ignorando o
  // "Todas as marcas"/CNPJ que a pessoa tivesse escolhido aqui em cima.
  const querySelecionadas = selecionadas.length > 0 ? `?empresas=${selecionadas.join(",")}` : "";

  const saldo = turnover.admissoes - turnover.desligados;
  const marcas = [...new Set(empresasDisponiveis.map(e => e.marca))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  return (
    <div className="space-y-6">
      {/* --- Cabeçalho ------------------------------------------------------ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Painel</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Quadro, movimentação, tempo de casa e custo — calculados na hora a partir da ficha, das
            ausências e dos benefícios já cadastrados. O que era a tela de Indicadores virou o botão{" "}
            <span className="font-medium text-foreground">Tabelas</span> aqui do lado: eram os
            mesmos números, na mesma janela, em outra forma.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            <AlternadorDeVista vista={vista} aoTrocar={setVista} />
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/api/rh/${empresaId}/indicadores/csv${querySelecionadas}`} />}
            >
              <FileDown className="size-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={`/api/rh/${empresaId}/indicadores/relatorio-pdf${querySelecionadas}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <FileDown className="size-4" />
              PDF
            </Button>
          </div>
          {/* O CSV e o PDF são as rotas que já existiam para Indicadores: escopo
              fixo na marca do CNPJ da rota, janela fixa de 12 meses. Enquanto
              elas não aceitarem filtro, um arquivo com números diferentes dos da
              tela sai calado — e quem levar isso para uma reunião só descobre lá. */}
          {!exportacaoSegueATela && (
            <p className="max-w-xs text-right text-xs text-muted-foreground">
              A exportação usa a marca inteira e janela de 12 meses — não segue o filtro nem a
              janela escolhidos aqui.
            </p>
          )}
        </div>
      </div>

      {/* --- Filtro --------------------------------------------------------- */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <CampoFiltro rotulo="Marca">
          <Select
            value={marcaSelecionada(empresasDisponiveis, selecionadas)}
            // `onValueChange` do base-ui entrega `string | null` — o null de
            // "limpou a seleção" cai no mesmo caminho de "todas as marcas".
            onValueChange={v =>
              aplicar(
                !v || v === "__todas"
                  ? []
                  : empresasDisponiveis.filter(e => e.marca === v).map(e => e.id)
              )
            }
            items={Object.fromEntries([
              ["__todas", "Todas as marcas"],
              ...marcas.map(m => [m, m] as const),
            ])}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas">Todas as marcas</SelectItem>
              {marcas.map(m => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFiltro>

        <CampoFiltro rotulo="CNPJ">
          <Select
            value={selecionadas.length === 1 ? selecionadas[0] : "__todos"}
            onValueChange={v => aplicar(!v || v === "__todos" ? [] : [v])}
            items={Object.fromEntries([
              ["__todos", "Todos os CNPJs"],
              ...empresasDisponiveis.map(e => [e.id, e.nome] as const),
            ])}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos">Todos os CNPJs</SelectItem>
              {empresasDisponiveis.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFiltro>

        <CampoFiltro rotulo="Janela">
          <SeletorDeJanela janela={janela} janelas={janelas} />
        </CampoFiltro>

        <p className="ml-auto max-w-sm text-xs text-muted-foreground">
          {empresasSelecionadas.length} de {empresasDisponiveis.length} CNPJs no recorte · turnover,
          movimentação e evolução do quadro medidos em {janela} meses.
        </p>
      </div>

      {empresasSelecionadas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            O filtro da URL não bateu com nenhum CNPJ que você enxerga.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Até 11/08/2026 tudo isto vinha empilhado numa página só: narrativa,
              radar, 4 KPIs, tempo de casa, 4 gráficos, custo, absenteísmo e
              rodapé — rolagem longa em que ninguém achava a mesma coisa duas
              vezes no mesmo lugar. As abas agrupam por PERGUNTA, não por tipo
              de gráfico: "como estamos" (Resumo), "quem é o time" (Quadro), "o
              que mudou" (Movimento), "quanto custa e quem faltou" (Custo).

              Ficam FORA das abas, de propósito: o filtro (vale para todas) e o
              rodapé de ressalvas — esconder atrás de aba o aviso de que metade
              das fichas não tem salário seria deixar o número mentir para quem
              não clicou. */}
          <Tabs defaultValue="resumo" className="w-full">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-lg bg-muted/60 p-1.5">
              <TabsTrigger value="resumo" className="rounded-md px-3 py-1.5 text-xs data-active:bg-background">
                Resumo
              </TabsTrigger>
              <TabsTrigger value="quadro" className="rounded-md px-3 py-1.5 text-xs data-active:bg-background">
                Quadro
              </TabsTrigger>
              <TabsTrigger value="movimento" className="rounded-md px-3 py-1.5 text-xs data-active:bg-background">
                Movimento
              </TabsTrigger>
              <TabsTrigger value="custo" className="rounded-md px-3 py-1.5 text-xs data-active:bg-background">
                Custo e faltas
              </TabsTrigger>
            </TabsList>

            {/* --- Resumo: como estamos ------------------------------------- */}
            <TabsContent value="resumo" className="space-y-6 pt-4">
              {/* --- "O que aconteceu", abertura em prosa ------------------------- */}
              <NarrativaAbertura empresaId={empresaId} narrativa={narrativa} />

              {/* --- Radar de desvio ---------------------------------------------- */}
              <RadarDesvio radar={radar} hrefCentral={`/rh/${empresaId}/sinais`} />

              {/* --- KPIs -------------------------------------------------------- */}
              <FaixaDeIndicadores>
                <Indicador
                  rotulo="Colaboradores ativos"
                  valor={`${totalAtivos}`}
                  complemento={
                    saldo === 0
                      ? `quadro estável em ${janela} meses`
                      : `${saldo > 0 ? "+" : ""}${saldo} em ${janela} meses`
                  }
                />
                <Indicador
                  rotulo={`Turnover (${janela} meses)`}
                  valor={turnover.headcountMedio > 0 ? `${turnover.taxaPct.toFixed(1)}%` : <SemDado />}
                  complemento={`${turnover.desligados} saída(s) · ${turnover.admissoes} admissão(ões)`}
                  estado={turnover.headcountMedio > 0 && turnover.taxaPct > 20 ? "alerta" : "padrao"}
                />
                <Indicador
                  rotulo="Tempo de casa (mediana)"
                  valor={
                    tempo.quartis ? `${formatarNumero(tempo.quartis.mediana)} ano(s)` : <SemDado />
                  }
                  complemento={
                    tempo.abaixoDeUmAnoPct !== null
                      ? `${tempo.abaixoDeUmAno} de ${tempo.comData} (${Math.round(tempo.abaixoDeUmAnoPct)}%) com menos de 1 ano`
                      : "ninguém com data de admissão preenchida"
                  }
                />
                <Indicador
                  rotulo="Folha + benefícios/mês"
                  valor={
                    folhaTotal === null ? <SemDado /> : formatarReais(folhaTotal + beneficiosTotal)
                  }
                  complemento={
                    folhaTotal === null
                      ? `só ${comSalario} de ${totalAtivos} ativos têm salário — a soma descreveria a minoria`
                      : comSalario < totalAtivos
                        ? `piso: ${comSalario} de ${totalAtivos} ativos com salário · sem encargos`
                        : "salário base + benefícios vigentes · sem encargos"
                  }
                />
              </FaixaDeIndicadores>

            </TabsContent>

            {/* --- Movimento: o que mudou na janela ------------------------- */}
            <TabsContent value="movimento" className="space-y-6 pt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Bloco
                  titulo={`Evolução do quadro (${janela} meses)`}
                  descricao="Colaboradores ativos no fim de cada mês, reconstruído a partir do quadro de hoje."
                >
                  {vista === "graficos" ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={evolucao} margin={{ left: -16, right: 8 }}>
                          <defs>
                            <linearGradient id="grad-headcount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={COR.primaria} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={COR.primaria} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} />
                          <YAxis
                            allowDecimals={false}
                            tick={eixoTick}
                            tickLine={false}
                            axisLine={false}
                            domain={["dataMin - 2", "dataMax + 2"]}
                          />
                          <Tooltip contentStyle={estiloTooltip} formatter={v => [`${v}`, "Ativos"]} />
                          <Area
                            type="monotone"
                            dataKey="total"
                            stroke={COR.primaria}
                            strokeWidth={2}
                            fill="url(#grad-headcount)"
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <TabelaDeSerie
                      colunas={[{ rotulo: "Mês" }, { rotulo: "Ativos no fim do mês", numerica: true }]}
                      linhas={evolucao.map(e => ({ chave: e.mes, celulas: [e.mes, e.total] }))}
                    />
                  )}
                </Bloco>

                <Bloco
                  titulo="Admissões × desligamentos"
                  descricao={`Movimentação mês a mês nos últimos ${janela} meses.`}
                >
                  {vista === "graficos" ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={movimento} margin={{ left: -16, right: 8 }}>
                          <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} />
                          <YAxis
                            allowDecimals={false}
                            tick={eixoTick}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip contentStyle={estiloTooltip} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line
                            type="monotone"
                            dataKey="admissoes"
                            name="Admissões"
                            stroke={COR.admissoes}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="desligamentos"
                            name="Desligamentos"
                            stroke={COR.desligamentos}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <TabelaDeSerie
                      colunas={[
                        { rotulo: "Mês" },
                        { rotulo: "Admissões", numerica: true },
                        { rotulo: "Desligamentos", numerica: true },
                      ]}
                      linhas={movimento.map(m => ({
                        chave: m.mes,
                        celulas: [
                          m.mes,
                          <span key="a" className="text-success">
                            {m.admissoes > 0 ? `+${m.admissoes}` : "—"}
                          </span>,
                          <span key="d" className="text-destructive">
                            {m.desligamentos > 0 ? `-${m.desligamentos}` : "—"}
                          </span>,
                        ],
                      }))}
                    />
                  )}
                </Bloco>

              </div>
            </TabsContent>

            {/* --- Quadro: quem é o time hoje ------------------------------- */}
            <TabsContent value="quadro" className="space-y-6 pt-4">
              <BlocoTempoDeCasa
                tempo={tempo}
                porSetor={tempoPorSetor}
                totalAtivos={totalAtivos}
                vista={vista}
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <Bloco
                  titulo="Colaboradores por setor"
                  descricao={
                    headcount.length > TOP_SETORES && vista === "graficos"
                      ? `Os ${TOP_SETORES} maiores setores; os demais somados em "Outros".`
                      : "Todos os setores com gente ativa."
                  }
                >
                  {headcount.length === 0 ? (
                    <Vazio texto="Nenhum colaborador ativo no recorte." />
                  ) : vista === "graficos" ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={agruparOutros(headcount)}
                          layout="vertical"
                          margin={{ left: 16, right: 24 }}
                        >
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tick={eixoTick}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="setor"
                            width={110}
                            tick={eixoTick}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip contentStyle={estiloTooltip} formatter={v => [`${v}`, "Colaboradores"]} />
                          <Bar
                            dataKey="total"
                            fill={COR.primaria}
                            radius={[0, 4, 4, 0]}
                            maxBarSize={18}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <TabelaDeSerie
                      colunas={[
                        { rotulo: "Setor" },
                        { rotulo: "Colaboradores", numerica: true },
                        { rotulo: "% do quadro", numerica: true },
                      ]}
                      linhas={headcount.map(h => ({
                        chave: h.setor,
                        celulas: [
                          h.setor,
                          h.total,
                          totalAtivos > 0 ? `${Math.round((h.total / totalAtivos) * 100)}%` : "—",
                        ],
                      }))}
                    />
                  )}
                </Bloco>

                <Bloco titulo="Faixa etária" descricao="Distribuição de idade dos ativos.">
                  {vista === "graficos" ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={faixaEtaria} margin={{ left: -16, right: 8 }}>
                          <XAxis dataKey="faixa" tick={eixoTick} tickLine={false} axisLine={false} />
                          <YAxis
                            allowDecimals={false}
                            tick={eixoTick}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip contentStyle={estiloTooltip} formatter={v => [`${v}`, "Colaboradores"]} />
                          <Bar
                            dataKey="total"
                            fill={COR.primaria}
                            maxBarSize={40}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <TabelaDeSerie
                      colunas={[{ rotulo: "Faixa" }, { rotulo: "Colaboradores", numerica: true }]}
                      linhas={faixaEtaria.map(f => ({ chave: f.faixa, celulas: [f.faixa, f.total] }))}
                    />
                  )}
                </Bloco>
              </div>
            </TabsContent>

            {/* --- Custo e faltas ------------------------------------------- */}
            <TabsContent value="custo" className="space-y-6 pt-4">
              <BlocoCusto custo={custo} vista={vista} />
              <BlocoAbsenteismo absenteismo={absenteismo} />
            </TabsContent>
          </Tabs>

          {/* --- O que ficou de fora ----------------------------------------
              Fora das abas de propósito: são as ressalvas do que os números
              NÃO cobrem (ficha sem salário, sem data de admissão). Atrás de
              uma aba, quem não clicasse levaria o número como completo. */}
          <Rodape tempo={tempo} totalAtivos={totalAtivos} comSalario={comSalario} janela={janela} />
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Tempo de casa
// --------------------------------------------------------------------------

/**
 * A média sozinha era o KPI do painel antigo e mentia por construção — o aviso
 * ao lado dela (`AVISO_MEDIA_TEMPO_DE_CASA`, texto da própria lib) explica por
 * quê, e os quartis mostram o que ela esconde: média 2,1 anos com mediana 1,4 e
 * p25 em 0,5 não descreve um quadro estável, descreve dois times diferentes.
 */
function BlocoTempoDeCasa({
  tempo,
  porSetor,
  totalAtivos,
  vista,
}: {
  tempo: ResumoTempoDeCasa;
  porSetor: LinhaTempoDeCasaPorGrupo[];
  totalAtivos: number;
  vista: Vista;
}) {
  const comQuartil = porSetor.filter(l => !l.amostraInsuficiente);
  const semQuartil = porSetor.filter(l => l.amostraInsuficiente);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tempo de casa</CardTitle>
        <CardDescription>
          {tempo.abaixoDeUmAnoPct !== null ? (
            <>
              <span className="font-medium text-foreground">
                {tempo.abaixoDeUmAno} dos {tempo.comData} ativos com data (
                {Math.round(tempo.abaixoDeUmAnoPct)}
                %) têm menos de 1 ano de casa
              </span>{" "}
              — sendo {tempo.abaixoDeSeisMeses} com menos de 6 meses e {tempo.abaixoDeTresMeses} com
              menos de 3.
            </>
          ) : (
            "Nenhum ativo do recorte tem data de admissão preenchida."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Quartil rotulo="p25" valor={tempo.quartis?.p25 ?? null} />
              <Quartil rotulo="Mediana" valor={tempo.quartis?.mediana ?? null} destaque />
              <Quartil rotulo="p75" valor={tempo.quartis?.p75 ?? null} />
            </div>

            {/* O aviso é FIXO ao lado da média, não um rodapé opcional: é a
                única defesa contra ler "tempo médio subiu" como boa notícia. */}
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Média</span>
                <span className="text-lg font-semibold tabular-nums">
                  {tempo.mediaAnos !== null ? `${formatarNumero(tempo.mediaAnos)} ano(s)` : "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{AVISO_MEDIA_TEMPO_DE_CASA}</p>
            </div>
          </div>

          <div>
            {vista === "graficos" ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tempo.faixas} margin={{ left: -16, right: 8, bottom: 8 }}>
                    <XAxis
                      dataKey="faixa"
                      tick={{ ...eixoTick, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={eixoTick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip formatter={v => [`${v}`, "Colaboradores"]} />
                    <Bar
                      dataKey="total"
                      fill={COR.primaria}
                      maxBarSize={44}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <TabelaDeSerie
                colunas={[
                  { rotulo: "Faixa" },
                  { rotulo: "Colaboradores", numerica: true },
                  { rotulo: "% do quadro", numerica: true },
                ]}
                linhas={tempo.faixas.map(f => ({
                  chave: f.faixa,
                  celulas: [
                    f.faixa,
                    f.total,
                    totalAtivos > 0 ? `${Math.round((f.total / totalAtivos) * 100)}%` : "—",
                  ],
                }))}
              />
            )}
          </div>
        </div>

        {/* O selo por setor é o que transforma o histograma em ação: 41% no
            grupo é um número; "Comercial com 64% abaixo de 1 ano" é uma
            conversa com um gestor específico. */}
        <div>
          <p className="mb-2 text-sm font-medium">Por setor</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Ativos</TableHead>
                  <TableHead className="text-right">p25</TableHead>
                  <TableHead className="text-right">Mediana</TableHead>
                  <TableHead className="text-right">p75</TableHead>
                  <TableHead className="text-right">&lt; 1 ano</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comQuartil.map(l => (
                  <LinhaSetorTempo key={l.grupo} linha={l} />
                ))}
                {semQuartil.length > 0 && (
                  <>
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={6}
                        className="bg-muted/40 py-2 text-xs text-muted-foreground"
                      >
                        Abaixo, setores com menos de {MINIMO_PARA_QUARTIL} datas de admissão: o
                        quartil sai, mas é o tempo de casa de meia dúzia de pessoas com nome de
                        estatística. Ficam fora da ordenação, não da conta.
                      </TableCell>
                    </TableRow>
                    {semQuartil.map(l => (
                      <LinhaSetorTempo key={l.grupo} linha={l} atenuada />
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaSetorTempo({
  linha,
  atenuada,
}: {
  linha: LinhaTempoDeCasaPorGrupo;
  atenuada?: boolean;
}) {
  return (
    <TableRow className={cn(atenuada && "text-muted-foreground")}>
      <TableCell className="font-medium">
        {linha.grupo}
        {linha.semData > 0 && (
          <span className="block text-xs font-normal text-muted-foreground">
            {linha.semData} sem data de admissão
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{linha.total}</TableCell>
      <TableCell className="text-right tabular-nums">
        {linha.quartis ? formatarNumero(linha.quartis.p25) : <SemDado />}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {linha.quartis ? formatarNumero(linha.quartis.mediana) : <SemDado />}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {linha.quartis ? formatarNumero(linha.quartis.p75) : <SemDado />}
      </TableCell>
      <TableCell className="text-right">
        {linha.abaixoDeUmAnoPct === null ? (
          <SemDado />
        ) : (
          <Badge
            variant={
              linha.abaixoDeUmAnoPct >= 60
                ? "destructive"
                : linha.abaixoDeUmAnoPct >= 40
                  ? "secondary"
                  : "outline"
            }
          >
            {Math.round(linha.abaixoDeUmAnoPct)}%
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

function Quartil({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number | null;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2 ring-1 ring-foreground/10",
        destaque ? "bg-primary/5" : "bg-card"
      )}
    >
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={cn("tabular-nums", destaque ? "text-2xl font-semibold" : "text-xl")}>
        {valor !== null ? formatarNumero(valor) : "—"}
      </div>
      <div className="text-xs text-muted-foreground">ano(s) de casa</div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Custo
// --------------------------------------------------------------------------

/**
 * Folha por setor com a cobertura de salário embutida.
 *
 * `custoPessoalPorSetor` faz `salarioBase ?? 0`, então um setor de 20 pessoas
 * com 1 salário cadastrado desenha uma barra minúscula que se lê como "setor
 * barato". O gráfico só mostra quem tem cobertura suficiente; a tabela mostra
 * todo mundo e escreve "sem dado" onde não dá para somar.
 */
function BlocoCusto({ custo, vista }: { custo: LinhaCustoNaTela[]; vista: Vista }) {
  const confiaveis = custo.filter(c => c.folhaConfiavel);
  const foraDoGrafico = custo.filter(c => !c.folhaConfiavel && c.ativos > 0);

  return (
    <Bloco
      titulo="Folha + benefícios por setor"
      descricao={
        <>
          Salário base cadastrado + benefícios vigentes, por mês.{" "}
          <span className="font-medium">Não é custo de pessoal</span> — não inclui encargos, hora
          extra nem rescisão.
          {foraDoGrafico.length > 0 && vista === "graficos" && (
            <>
              {" "}
              Fora do gráfico: {foraDoGrafico.map(c => c.setor).join(", ")} — menos da metade dos
              ativos com salário cadastrado.
            </>
          )}
        </>
      }
    >
      {custo.length === 0 ? (
        <Vazio texto="Nenhum salário ou benefício cadastrado ainda." />
      ) : vista === "graficos" ? (
        confiaveis.length === 0 ? (
          <Vazio texto="Nenhum setor do recorte tem salário cadastrado em metade do quadro — não há soma que descreva o custo." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agruparOutrosCusto(confiaveis)} margin={{ left: 8, right: 8 }}>
                <XAxis dataKey="setor" tick={eixoTick} tickLine={false} axisLine={false} />
                <YAxis
                  tick={eixoTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip formatter={(v, nome) => [formatarReais(Number(v)), nome]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="folha"
                  name="Folha"
                  stackId="custo"
                  fill={COR.folha}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="beneficios"
                  name="Benefícios"
                  stackId="custo"
                  fill={COR.beneficios}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setor</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Folha</TableHead>
                <TableHead className="text-right">Benefícios</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {custo.map(c => (
                <TableRow key={c.setor}>
                  <TableCell className="font-medium">{c.setor}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.ativos}</TableCell>
                  <TableCell className="text-right">
                    {c.folhaConfiavel ? (
                      <>
                        <span className="tabular-nums">{formatarReais(c.folha)}</span>
                        {c.comSalario < c.ativos && (
                          <span className="block text-xs text-muted-foreground">
                            piso — {c.comSalario} de {c.ativos}
                          </span>
                        )}
                      </>
                    ) : (
                      <SemDado detalhe={`${c.comSalario} de ${c.ativos} com salário`} />
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarReais(c.beneficios)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {c.folhaConfiavel ? formatarReais(c.total) : <SemDado />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Bloco>
  );
}

// --------------------------------------------------------------------------
// Absenteísmo
// --------------------------------------------------------------------------

/**
 * Três estados, nunca dois.
 *
 * A tela de Indicadores mostrava uma tabela de absenteísmo por setor calculada
 * em cima de uma tabela `Ausencia` sem uma linha sequer: saía 0,0% para todos os
 * setores, que se lê como "ninguém falta aqui". É o oposto — é ausência de
 * medição. Aqui a contagem crua de registros é medida junto e decide o que
 * aparece; quando o módulo começar a ser usado, o bloco vira tabela sozinho.
 */
function BlocoAbsenteismo({ absenteismo }: { absenteismo: AbsenteismoNaTela }) {
  if (absenteismo.registrosNoEscopo === 0) {
    return (
      <Card className="border-warning/40">
        <CardHeader>
          <CardTitle className="text-base">Absenteísmo</CardTitle>
        </CardHeader>
        <CardContent className="flex items-start gap-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <span className="font-medium">Sem medição: nenhuma ausência registrada</span> nos CNPJs
            do recorte — nem falta, nem atestado, nem licença. A taxa não é 0,0%: ela não existe.
            Qualquer número aqui descreveria o preenchimento do módulo, não a presença de ninguém. O
            bloco vira tabela por setor assim que a primeira ausência for lançada.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (absenteismo.registrosNaJanela === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Absenteísmo</CardTitle>
        </CardHeader>
        <CardContent className="flex items-start gap-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nenhuma ausência com início nos últimos 30 dias — a janela que a taxa mede. O módulo tem{" "}
            {absenteismo.registrosNoEscopo} registro(s) no histórico, então aqui 0% quer dizer
            &ldquo;ninguém faltou no mês&rdquo;, e não &ldquo;ninguém lança falta&rdquo;.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Bloco
      titulo="Absenteísmo por setor (últimos 30 dias)"
      descricao={`% dos dias úteis disponíveis perdidos por falta não abonada. ${absenteismo.registrosNaJanela} ausência(s) na janela.`}
    >
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Setor</TableHead>
              <TableHead className="text-right">Dias de falta</TableHead>
              <TableHead className="text-right">Taxa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {absenteismo.linhas.map(a => (
              <TableRow key={a.setor}>
                <TableCell className="font-medium">{a.setor}</TableCell>
                <TableCell className="text-right tabular-nums">{a.diasFalta}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      a.taxaPct > 5 ? "destructive" : a.taxaPct > 2 ? "secondary" : "outline"
                    }
                  >
                    {a.taxaPct.toFixed(1)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Bloco>
  );
}

// --------------------------------------------------------------------------
// Rodapé
// --------------------------------------------------------------------------

function Rodape({
  tempo,
  totalAtivos,
  comSalario,
  janela,
}: {
  tempo: ResumoTempoDeCasa;
  totalAtivos: number;
  comSalario: number;
  janela: number;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4 text-xs text-muted-foreground">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            O turnover reconstrói o quadro do início do período a partir do de hoje — é aproximação,
            assume que ninguém foi reativado no meio do caminho. A evolução do quadro usa a mesma
            reconstrução, então os {janela} meses à esquerda do gráfico são cálculo, não foto
            guardada.
          </span>
        </p>
        {tempo.semData > 0 && (
          <p className="pl-5.5">
            {tempo.semData} de {totalAtivos} ativos não têm data de admissão: ficam fora de quartil,
            média, faixas e tempo de casa por setor — não somem da contagem de gente.
          </p>
        )}
        {comSalario < totalAtivos && (
          <p className="pl-5.5">
            {totalAtivos - comSalario} de {totalAtivos} ativos não têm salário cadastrado. Onde a
            cobertura fica abaixo da metade, a coluna de dinheiro sai como{" "}
            <span className="font-medium">sem dado</span>: R$ 0 seria uma afirmação, e é falsa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Peças
// --------------------------------------------------------------------------

function AlternadorDeVista({ vista, aoTrocar }: { vista: Vista; aoTrocar: (v: Vista) => void }) {
  const opcoes: { valor: Vista; rotulo: string; icone: ReactNode }[] = [
    { valor: "graficos", rotulo: "Gráficos", icone: <ChartColumn className="size-3.5" /> },
    { valor: "tabelas", rotulo: "Tabelas", icone: <Table2 className="size-3.5" /> },
  ];
  return (
    <div className="flex rounded-lg border p-0.5">
      {opcoes.map(o => (
        <button
          key={o.valor}
          type="button"
          onClick={() => aoTrocar(o.valor)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
            o.valor === vista
              ? "bg-primary font-medium text-primary-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          )}
        >
          {o.icone}
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * A janela vive na URL (`?janela=`) e não em estado de cliente: ela MUDA os
 * números (turnover, movimentação, evolução), então precisa ir ao servidor de
 * qualquer jeito — e de brinde o link fica compartilhável, igual ao filtro de
 * CNPJ. `replace` e não `push`: trocar a janela não é navegar, e o "voltar" do
 * navegador não deve virar desfazer-filtro. Mesma decisão de `filtro-empresas`.
 */
function SeletorDeJanela({ janela, janelas }: { janela: number; janelas: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const trocarJanela = (meses: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("janela", String(meses));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex rounded-lg border p-0.5">
      {janelas.map(m => (
        <button
          key={m}
          type="button"
          onClick={() => trocarJanela(m)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm transition-colors",
            m === janela
              ? "bg-primary font-medium text-primary-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          )}
        >
          {m}m
        </button>
      ))}
    </div>
  );
}

function CampoFiltro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{texto}</p>;
}

function TabelaDeSerie({
  colunas,
  linhas,
}: {
  colunas: { rotulo: string; numerica?: boolean }[];
  linhas: { chave: string; celulas: ReactNode[] }[];
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {colunas.map(c => (
              <TableHead key={c.rotulo} className={cn(c.numerica && "text-right")}>
                {c.rotulo}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map(l => (
            <TableRow key={l.chave}>
              {l.celulas.map((celula, i) => (
                <TableCell
                  key={colunas[i].rotulo}
                  className={cn(
                    colunas[i].numerica && "text-right tabular-nums",
                    i === 0 && "font-medium"
                  )}
                >
                  {celula}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * "sem dado" em texto, nunca R$ 0 nem 0,0% — a mesma regra da tela de Pendências
 * aplicada a número: zero porque está em dia e zero porque ninguém preencheu são
 * coisas diferentes, e só uma delas é notícia boa.
 */
function SemDado({ detalhe }: { detalhe?: string }) {
  return (
    <span className="text-xs font-normal text-muted-foreground italic">
      sem dado
      {detalhe && <span className="block not-italic">{detalhe}</span>}
    </span>
  );
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function agruparOutros(headcount: LinhaHeadcount[]): LinhaHeadcount[] {
  const topo = headcount.slice(0, TOP_SETORES);
  const resto = headcount.slice(TOP_SETORES).reduce((t, h) => t + h.total, 0);
  return resto > 0 ? [...topo, { setor: "Outros", total: resto }] : topo;
}

function agruparOutrosCusto(custo: LinhaCustoNaTela[]): LinhaCusto[] {
  const topo = custo.slice(0, TOP_SETORES);
  const resto = custo.slice(TOP_SETORES);
  if (resto.length === 0) return topo;
  const folha = resto.reduce((t, c) => t + c.folha, 0);
  const beneficios = resto.reduce((t, c) => t + c.beneficios, 0);
  return [...topo, { setor: "Outros", folha, beneficios, total: folha + beneficios }];
}

function formatarNumero(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** A marca está "selecionada" quando o filtro é exatamente o conjunto de CNPJs dela. */
function marcaSelecionada(empresas: OpcaoEmpresa[], selecionadas: string[]): string {
  if (selecionadas.length === 0) return "__todas";
  const marcas = [...new Set(empresas.map(e => e.marca))];
  const exata = marcas.find(m => {
    const ids = empresas.filter(e => e.marca === m).map(e => e.id);
    return ids.length === selecionadas.length && ids.every(id => selecionadas.includes(id));
  });
  return exata ?? "__todas";
}
