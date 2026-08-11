"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Indicador } from "@/components/indicador";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { STATUS_PERIODO_LABEL, type StatusPeriodo } from "@/lib/ferias";
import type { OrigemHistorico, ProgramacaoFerias, ValorEmReais } from "@/lib/ferias-passivo";
import { formatarReais } from "@/lib/constants-beneficios";
import { formatarData } from "@/lib/datas";
import { normalizarTexto } from "@/lib/text";
import { CalendarOff, CheckCircle2, ChevronRight, Info, Scale, TriangleAlert } from "lucide-react";
import type { LinhaFerias, PassivoNaTela } from "./page";

// O QUE ESTA TELA NÃO MOSTRA, DE PROPÓSITO:
//
// - Valor em R$ por pessoa. Dias × salário ÷ 30 × 4/3 é reversível: publicar a
//   coluna equivale a publicar o salário, e GESTOR_SETOR alcança esta tela. A
//   lib preenche o campo e deixa a decisão para quem monta a tela — esta é a
//   decisão. Nome sai com DIAS; dinheiro só somado por CNPJ ou pelo grupo.
// - Calendário de barras dos próximos meses. Zero das 264 solicitações começa no
//   futuro: um calendário desenhado seria uma grade vazia, que lê como tela
//   quebrada. Enquanto estiver vazio, o bloco diz por que está vazio.

const FILTROS = [
  { chave: "TODOS", rotulo: "Todos" },
  // A MESMA conta do cartão "Férias vencidas" da tela de Pendências: 12+
  // meses de casa sem férias aprovada no último ano. O cartão navega pra cá
  // com filtro=RISCO_DOBRA e a lista bate pessoa a pessoa com o número dele —
  // é a soma de "vencidas confirmadas" + "sem histórico a conferir" + quem tem
  // histórico antigo mas está há 1 ano+ sem gozar.
  { chave: "RISCO_DOBRA", rotulo: "Risco de dobra" },
  { chave: "VENCIDO", rotulo: "Vencidas" },
  { chave: "VENCENDO", rotulo: "Vencendo" },
  { chave: "DISPONIVEL", rotulo: "Disponíveis" },
  { chave: "SEM_HISTORICO", rotulo: "Sem histórico" },
] as const;

type Filtro = (typeof FILTROS)[number]["chave"];

const ORDENS = [
  { chave: "PRAZO", rotulo: "Prazo legal (mais urgente)" },
  { chave: "SALDO", rotulo: "Saldo em dias" },
  { chave: "NOME", rotulo: "Nome" },
] as const;

type Ordem = (typeof ORDENS)[number]["chave"];

const TODOS_OS_SETORES = "__todos";

const VARIANTE: Record<StatusPeriodo, "default" | "secondary" | "destructive" | "outline"> = {
  EM_CURSO: "outline",
  DISPONIVEL: "default",
  VENCENDO: "secondary",
  VENCIDO: "destructive",
  CONCLUIDO: "outline",
};

/**
 * Abaixo desta cobertura a soma em R$ deixa de descrever o CNPJ.
 *
 * Não é o mesmo teste que "o total deu zero": a Centrysol tem 1 salário em 39
 * ativos — zero seria mentira óbvia, um número que parece real é mentira
 * convincente, que é pior. Mesmo corte já usado no Placar do grupo; se um dia
 * virar regra de negócio, os dois têm que ler a mesma constante.
 */
const COBERTURA_MINIMA_VALOR = 0.5;

/**
 * O valor a exibir, ou null quando o certo é "sem dado" — nunca R$ 0.
 *
 * "Não deve nada" e "não se sabe quanto deve" são estados diferentes, e um
 * `?? 0` transforma o segundo no primeiro. Três saídas:
 *   * ninguém no recorte tem salário cadastrado → não há o que somar;
 *   * há salários, mas cobrem a minoria dos dias → a soma descreve outra empresa;
 *   * não há dia de saldo → nada a valorar (quem chama mostra "—", não R$ 0,00,
 *     porque "zero reais" e "zero dias" são a mesma tela dizendo coisas
 *     diferentes; a coluna de dias já disse essa).
 */
function reaisOuSemDado(
  valor: ValorEmReais,
  cobertura: { ativos: number; semSalario: number },
): number | null {
  if (cobertura.ativos > 0 && cobertura.semSalario >= cobertura.ativos) return null;
  const dias = valor.diasValorados + valor.diasSemValoracao;
  if (dias === 0 || valor.diasValorados === 0) return null;
  return valor.diasValorados / dias >= COBERTURA_MINIMA_VALOR ? valor.reais : null;
}

const emReais = (v: number | null) => (v === null ? "sem dado" : formatarReais(v));

/** Sem dia de saldo não há valor a exibir — travessão, não R$ 0,00 nem "sem dado". */
const emReaisComSaldo = (dias: number, v: number | null) => (dias === 0 ? "—" : emReais(v));

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export function FeriasView({
  empresaId,
  linhas,
  passivo,
  programacao,
  origem,
  escopo,
}: {
  empresaId: string;
  linhas: LinhaFerias[];
  passivo: PassivoNaTela;
  programacao: ProgramacaoFerias;
  origem: OrigemHistorico;
  escopo: { cnpjs: number; marcas: string[] };
}) {
  // ?filtro=VENCIDO abre direto na aba "Vencidas" — é como o cartão "Férias
  // vencidas" da tela de Pendências chega aqui já listando quem ele contou.
  const searchParams = useSearchParams();
  const filtroDaUrl = searchParams.get("filtro");
  const filtroInicial: Filtro = FILTROS.some((f) => f.chave === filtroDaUrl)
    ? (filtroDaUrl as Filtro)
    : "TODOS";
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const [setor, setSetor] = useState<string>(TODOS_OS_SETORES);
  const [ordem, setOrdem] = useState<Ordem>("PRAZO");
  const [busca, setBusca] = useState("");

  const contagem = useMemo(() => {
    const conta = (s: StatusPeriodo) =>
      linhas.filter((l) => l.periodo?.status === s && !l.semHistorico).length;
    return {
      vencidas: conta("VENCIDO"),
      vencendo: conta("VENCENDO"),
      disponiveis: conta("DISPONIVEL"),
      semHistorico: linhas.filter((l) => l.semHistorico).length,
    };
  }, [linhas]);

  // Setor é tabela POR EMPRESA: com o recorte no grupo, "Comercial" existe seis
  // vezes com ids diferentes, e "Recursos Humanos"/"RECURSOS HUMANOS" coexistem
  // na base. O filtro agrupa pelo nome normalizado e mostra a grafia mais
  // frequente — por id, escolher "Comercial" esvaziaria cinco CNPJs.
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
      .filter((l) => {
        if (filtro === "SEM_HISTORICO") return l.semHistorico;
        if (filtro === "RISCO_DOBRA") return l.riscoDobra;
        if (filtro !== "TODOS") return l.periodo?.status === filtro && !l.semHistorico;
        return true;
      })
      .filter((l) => setor === TODOS_OS_SETORES || normalizarTexto(l.setor) === setor)
      .filter(
        (l) =>
          !termo ||
          l.nome.toLowerCase().includes(termo) ||
          l.setor.toLowerCase().includes(termo) ||
          l.empresa.toLowerCase().includes(termo),
      )
      .sort((a, b) => {
        if (ordem === "NOME") return a.nome.localeCompare(b.nome, "pt-BR");
        if (ordem === "SALDO") return b.saldoTotal - a.saldoTotal || a.nome.localeCompare(b.nome, "pt-BR");
        // Padrão: quem está mais perto (ou mais além) do limite legal primeiro —
        // é o prazo que decide a ordem de trabalho do DP, não o alfabeto. Quem
        // não tem período com saldo vai para o fim, nunca para o topo.
        const da = a.periodo?.diasAteLimite ?? Number.MAX_SAFE_INTEGER;
        const db = b.periodo?.diasAteLimite ?? Number.MAX_SAFE_INTEGER;
        return da - db || a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [linhas, filtro, setor, ordem, busca]);

  const { itensDaPagina: visiveisNaPagina, ...paginacao } = usePaginacao(visiveis);

  // Qualquer filtro/busca/ordenação nova volta para a página 1 — senão dá pra
  // sobrar numa página vazia depois de estreitar a lista.
  const comReset =
    <A,>(setter: (v: A) => void) =>
    (v: A) => {
      setter(v);
      paginacao.resetar();
    };
  const mudarFiltro = comReset(setFiltro);
  const mudarSetor = comReset(setSetor);
  const mudarOrdem = comReset(setOrdem);
  const mudarBusca = comReset(setBusca);

  // Cobertura salarial do recorte inteiro: é ela que decide se o total do grupo
  // sai em R$ ou como "sem dado".
  const coberturaGrupo = passivo.porEmpresa.reduce(
    (acc, e) => ({ ativos: acc.ativos + e.ativos, semSalario: acc.semSalario + e.semSalario }),
    { ativos: 0, semSalario: 0 },
  );
  const provisaoGrupo = reaisOuSemDado(passivo.provisao.total, coberturaGrupo);
  const vencidoGrupo = reaisOuSemDado(passivo.vencido.valor, coberturaGrupo);
  const vencidoEmDobro = vencidoGrupo === null ? null : vencidoGrupo * 2;

  const cnpjsSemSalario = passivo.porEmpresa.filter((e) => e.semSalario > 0);
  const totalSemSalario = cnpjsSemSalario.reduce((t, e) => t + e.semSalario, 0);
  const cnpjsComValor = passivo.porEmpresa.filter((e) => reaisOuSemDado(e.valor, e) !== null).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Férias</h2>
        <p className="text-sm text-muted-foreground">
          Quem tem férias a vencer, vencidas ou saldo disponível. O prazo de gozo é de 12 meses após o
          fim do período aquisitivo — passando disso o pagamento é em dobro (CLT art. 137).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Recorte: {plural(escopo.cnpjs, "CNPJ", "CNPJs")}
          {escopo.marcas.length > 0 && ` · ${escopo.marcas.join(", ")}`} ·{" "}
          {plural(passivo.ativosConsiderados, "ativo considerado", "ativos considerados")}. Use o
          filtro de marca/CNPJ na lateral para estreitar.
        </p>
      </div>

      {/* Duas abas, não uma tela só: "Fila por colaborador" é o trabalho do
          dia a dia (quem programar), "Passivo & panorama" é o relatório que
          se consulta de vez em quando (quanto isso custa/expõe o grupo). Uma
          tela só com os dois virou rolagem longa demais para achar qualquer
          coisa — cada aba carrega metade da informação. */}
      <Tabs defaultValue="fila">
        <TabsList variant="line">
          <TabsTrigger value="fila">Fila por colaborador ({linhas.length})</TabsTrigger>
          <TabsTrigger value="passivo">Passivo &amp; panorama</TabsTrigger>
        </TabsList>

        <TabsContent value="fila" className="space-y-6 pt-4">
          {/* --- Fila por pessoa -------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              rotulo="Vencidas confirmadas"
              valor={contagem.vencidas}
              complemento={
                passivo.vencido.pessoasSemHistorico > 0
                  ? `+${passivo.vencido.pessoasSemHistorico} com período vencido e sem histórico`
                  : "com histórico de gozo registrado"
              }
              estado={contagem.vencidas > 0 ? "alerta" : "padrao"}
            />
            <Indicador
              rotulo="Vencendo em 90 dias"
              valor={contagem.vencendo}
              estado={contagem.vencendo > 0 ? "atencao" : "padrao"}
            />
            <Indicador rotulo="Com saldo disponível" valor={contagem.disponiveis} />
            <Indicador
              rotulo="Sem histórico"
              valor={contagem.semHistorico}
              complemento="conferir antes de cobrar"
              estado={contagem.semHistorico > 0 ? "atencao" : "padrao"}
            />
          </div>

          {contagem.semHistorico > 0 && (
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                <b>
                  {contagem.semHistorico} colaborador(es) não têm nenhuma férias registrada e já
                  passaram do primeiro período aquisitivo
                </b>{" "}
                — carregam {passivo.semHistorico.dias} dos {passivo.diasTotais} dias de saldo do
                recorte. Se de fato nunca gozaram, o passivo da aba ao lado é maior do que parece; se
                o histórico não foi importado, está inflado. Não dá para saber pelo dado: a base foi
                importada sem o histórico de gozo. Enquanto não forem conferidos, esses não entram na
                conta de &quot;vencidas confirmadas&quot;. Para corrigir, abra a ficha da pessoa e
                lance as férias já gozadas no cartão de Férias.
                {passivo.semHistorico.semRegistroAlgum > contagem.semHistorico && (
                  <>
                    {" "}
                    No recorte inteiro são {passivo.semHistorico.semRegistroAlgum} ativos sem
                    registro nenhum — os demais ainda não fecharam 12 meses de casa, então não têm
                    período adquirido nem saldo.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {origem.aviso && (
            <Alert>
              <Info />
              <AlertDescription>
                <b>O histórico de gozo é estimado.</b> {origem.aviso} Ou seja: o saldo em dias é
                confiável, a linha do tempo não — não use as datas destes registros para reconstruir
                quando alguém saiu de férias.
                {origem.criadasNoSistema === 0 && (
                  <> Nenhuma das solicitações nasceu de um pedido feito dentro do sistema.</>
                )}
              </AlertDescription>
            </Alert>
          )}

          {passivo.ativosSemAdmissao > 0 && (
            <Alert>
              <Info />
              <AlertDescription>
                <b>{passivo.ativosSemAdmissao} colaborador(es) ativos estão sem data de admissão</b>{" "}
                e por isso ficam de fora desta tela e do passivo — sem ela não há período aquisitivo
                para derivar.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Situação por colaborador</CardTitle>
              <CardDescription>
                Ordenada pelo prazo legal: quem está mais perto do limite (ou já passou) aparece
                primeiro. O período mostrado é o mais próximo do limite entre os que ainda têm
                saldo. Clique no nome para abrir a ficha, programar férias ou lançar as que já foram
                gozadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Buscar por nome, setor ou CNPJ..."
                  value={busca}
                  onChange={(e) => mudarBusca(e.target.value)}
                  className="max-w-xs"
                />
                <Select
                  value={setor}
                  onValueChange={(v) => mudarSetor(!v ? TODOS_OS_SETORES : String(v))}
                  items={Object.fromEntries([
                    [TODOS_OS_SETORES, "Todos os setores"],
                    ...setores.map((s) => [s.chave, `${s.rotulo} (${s.total})`] as const),
                  ])}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
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
                <Select
                  value={ordem}
                  onValueChange={(v) => mudarOrdem((v as Ordem) ?? "PRAZO")}
                  items={Object.fromEntries(ORDENS.map((o) => [o.chave, `Ordenar: ${o.rotulo}`]))}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDENS.map((o) => (
                      <SelectItem key={o.chave} value={o.chave}>
                        Ordenar: {o.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1">
                  {FILTROS.map((f) => (
                    <button
                      key={f.chave}
                      type="button"
                      onClick={() => mudarFiltro(f.chave)}
                      className={
                        filtro === f.chave
                          ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                          : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      }
                    >
                      {f.rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border">
                <div className="overflow-x-auto">
                  <Table compacta>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>CNPJ</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Período aquisitivo</TableHead>
                        <TableHead>Gozar até</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Próximo período</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiveisNaPagina.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                            Nenhum colaborador nesta situação.
                          </TableCell>
                        </TableRow>
                      )}
                      {visiveisNaPagina.map((l) => (
                        <TableRow key={l.colaboradorId}>
                          <TableCell>
                            <Link
                              href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}?tab=ferias`}
                              className="font-medium hover:underline"
                            >
                              {l.nome}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{l.empresa}</TableCell>
                          <TableCell className="text-muted-foreground">{l.setor}</TableCell>
                          <TableCell className="tabular-nums">
                            {l.periodo
                              ? `${formatarData(l.periodo.inicio)} — ${formatarData(l.periodo.fim)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {l.periodo ? formatarData(l.periodo.limiteConcessivo) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{l.saldoTotal}</TableCell>
                          <TableCell>
                            {l.semHistorico ? (
                              <Badge variant="outline">Sem histórico</Badge>
                            ) : !l.periodo ? (
                              <Badge variant="outline">Em dia</Badge>
                            ) : l.periodo.status === "VENCIDO" ? (
                              <Badge variant="destructive">
                                Vencida há {Math.abs(l.periodo.diasAteLimite)} d
                              </Badge>
                            ) : l.periodo.status === "VENCENDO" ? (
                              <Badge variant="secondary">Vence em {l.periodo.diasAteLimite} d</Badge>
                            ) : (
                              <Badge variant={VARIANTE[l.periodo.status]}>
                                {STATUS_PERIODO_LABEL[l.periodo.status]}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.emCurso?.progresso ? (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className="h-full rounded-full bg-primary transition-[width]"
                                    style={{ width: `${l.emCurso.progresso.percentual}%` }}
                                  />
                                </div>
                                <span className="text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                                  {l.emCurso.progresso.meses}/12 meses
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Link
                              href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}?tab=ferias`}
                              className="inline-block rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Abrir ficha do colaborador para conferência e correção"
                            >
                              <CheckCircle2 className="size-4" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
        </TabsContent>

        <TabsContent value="passivo" className="space-y-6 pt-4">
          {/* --- Passivo -----------------------------------------------------
              Dias e reais em blocos separados de propósito: nem todo dia de
              saldo vira real, e uma coluna só somaria os dois tipos de
              ignorância. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="size-4" />
                Passivo de férias
              </CardTitle>
              <CardDescription>
                Saldo acumulado do recorte, em dias e em reais. Base de cálculo: dias × salário base
                ÷ 30 × 4/3 (1/3 constitucional) — <b>sem encargos patronais</b> (INSS, FGTS), então
                o desembolso real é maior que o exibido.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Indicador
                  rotulo="Saldo total"
                  valor={`${passivo.diasTotais} dias`}
                  complemento={`em ${plural(passivo.ativosConsiderados, "ativo", "ativos")}`}
                />
                <Indicador
                  rotulo="Provisão (R$)"
                  valor={emReaisComSaldo(passivo.diasTotais, provisaoGrupo)}
                  complemento={
                    passivo.diasTotais === 0
                      ? "nenhum saldo a provisionar"
                      : provisaoGrupo === null
                        ? `salário cadastrado cobre ${passivo.provisao.total.diasValorados} dos ${passivo.diasTotais} dias — não dá para somar`
                        : passivo.provisao.total.parcial
                          ? `${passivo.provisao.total.diasValorados} de ${passivo.diasTotais} dias valorados — piso, não total`
                          : `${passivo.provisao.total.diasValorados} dias valorados`
                  }
                />
                <Indicador
                  rotulo="Vencidas (art. 137)"
                  valor={`${passivo.vencido.dias} dias`}
                  complemento={`${plural(passivo.vencido.pessoas, "pessoa", "pessoas")}${
                    passivo.vencido.pessoasSemHistorico > 0
                      ? ` · ${passivo.vencido.pessoasSemHistorico} sem histórico a confirmar`
                      : ""
                  }`}
                  estado={passivo.vencido.dias > 0 ? "alerta" : "padrao"}
                />
                <Indicador
                  rotulo="Exposição vencida"
                  valor={emReaisComSaldo(passivo.vencido.dias, vencidoGrupo)}
                  complemento={
                    passivo.vencido.dias === 0
                      ? "nenhuma férias vencida no recorte"
                      : vencidoEmDobro === null
                        ? "sem salário cadastrado para valorar estes dias"
                        : `em dobro: ${formatarReais(vencidoEmDobro)}${
                            passivo.vencido.valor.parcial
                              ? ` · ${passivo.vencido.valor.diasSemValoracao} dias sem valoração`
                              : ""
                          }`
                  }
                  estado={vencidoGrupo !== null && vencidoGrupo > 0 ? "alerta" : "padrao"}
                />
              </div>

              <div className="rounded-md border">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CNPJ</TableHead>
                        <TableHead className="text-right">Ativos</TableHead>
                        <TableHead className="text-right">Saldo (dias)</TableHead>
                        <TableHead className="text-right">Provisão (R$)</TableHead>
                        <TableHead className="text-right">Vencidas (dias)</TableHead>
                        <TableHead className="text-right">Exposição (R$)</TableHead>
                        <TableHead className="text-right">Com salário</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {passivo.porEmpresa.map((e) => {
                        const provisao = reaisOuSemDado(e.valor, e);
                        const exposicao = reaisOuSemDado(e.valorVencido, e);
                        return (
                          <TableRow key={e.empresaId}>
                            <TableCell className="font-medium">{e.empresa}</TableCell>
                            <TableCell className="text-right tabular-nums">{e.ativos}</TableCell>
                            <TableCell className="text-right tabular-nums">{e.dias}</TableCell>
                            <TableCell
                              className={
                                provisao === null
                                  ? "text-right text-muted-foreground"
                                  : "text-right tabular-nums"
                              }
                            >
                              {emReaisComSaldo(e.dias, provisao)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {e.diasVencidos > 0 ? (
                                <span className="text-destructive">{e.diasVencidos}</span>
                              ) : (
                                "0"
                              )}
                            </TableCell>
                            <TableCell
                              className={
                                exposicao === null
                                  ? "text-right text-muted-foreground"
                                  : "text-right tabular-nums"
                              }
                            >
                              {emReaisComSaldo(e.diasVencidos, exposicao)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {e.ativos - e.semSalario} de {e.ativos}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* A frase que impede a leitura "o grupo deve R$ X": a soma cobre
                  parte dos CNPJs, e é preciso dizer quais e por quê. */}
              {totalSemSalario > 0 && (
                <Alert>
                  <TriangleAlert />
                  <AlertDescription>
                    <b>
                      {totalSemSalario} dos {coberturaGrupo.ativos} ativos não têm salário cadastrado
                    </b>{" "}
                    ({cnpjsSemSalario.map((e) => `${e.empresa} ${e.semSalario}`).join(", ")}).{" "}
                    {passivo.semValoracao.dias > 0 ? (
                      <>
                        Eles carregam {passivo.semValoracao.dias} dias de saldo que{" "}
                        <b>não entram na conta em reais</b> — esses dias não valem R$ 0, valem um
                        número que ninguém sabe.{" "}
                        {cnpjsComValor === 0 ? (
                          <>
                            Nenhum CNPJ deste recorte tem cobertura salarial suficiente para somar
                            reais: aqui a leitura é em <b>dias</b>, não em dinheiro.
                          </>
                        ) : (
                          <>
                            Os valores desta tela vêm dos{" "}
                            {plural(cnpjsComValor, "CNPJ", "CNPJs")} com dado suficiente, e são{" "}
                            <b>piso</b>, não total.
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        Hoje nenhum deles tem saldo acumulado, então nada ficou de fora da soma — mas
                        assim que fecharem 12 meses de casa o valor desses CNPJs passa a ser
                        desconhecido, e não zero.
                      </>
                    )}{" "}
                    Coluna de dias e coluna de reais são separadas por isso.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* --- Programação --------------------------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle>Programação dos próximos {programacao.janelaMeses} meses</CardTitle>
              <CardDescription>
                O que já está agendado, contra o que precisa ser agendado para não vencer.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-dashed p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarOff className="size-4 text-muted-foreground" />
                    Férias programadas: {programacao.agendadas}
                  </div>
                  {/* Chega já filtrado na janela: a lista que abre mostra
                      exatamente as linhas que este número contou. O ?empresas=
                      da lateral segue junto para o recorte não alargar. */}
                  <Link
                    href={`/rh/${empresaId}/ferias/programadas?filtro=NA_JANELA${
                      searchParams.get("empresas") ? `&empresas=${searchParams.get("empresas")}` : ""
                    }`}
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Ver todas
                    <ChevronRight className="size-4" />
                  </Link>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {programacao.vazia ? (
                    <>
                      Nada programado ainda — <b>as férias programadas aparecerão aqui</b> conforme
                      o RH lançar os pedidos.{" "}
                      {programacao.totalRegistros === 0 ? (
                        <>Não há registro nenhum de férias neste recorte: nem histórico, nem agenda.</>
                      ) : (
                        <>
                          Os {programacao.totalRegistros} registros existentes são histórico já
                          gozado, não agenda
                          {programacao.ultimoInicioRegistrado &&
                            ` (o mais recente começa em ${formatarData(programacao.ultimoInicioRegistrado)})`}
                          . O módulo hoje é arquivo do DP, não ferramenta de programação.
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {plural(programacao.agendadas, "período começa", "períodos começam")} nos
                      próximos {programacao.janelaMeses} meses, de {programacao.totalRegistros}{" "}
                      registros no histórico.
                    </>
                  )}
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Info className="size-4 text-muted-foreground" />
                  Precisam sair em até {passivo.fila.janelaMeses} meses: {passivo.fila.dias} dias
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plural(passivo.fila.pessoas, "pessoa atinge", "pessoas atingem")} o limite legal
                  dentro da janela e ainda dá para agendar sem pagamento em dobro. Quem já venceu não
                  entra nesta conta — está no bloco de cima.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Os avisos da lib são renderizados literalmente: tela e assistente
              precisam dizer a mesma coisa sobre o mesmo número. Reescrever aqui
              é como as duas versões começam a divergir. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">O que estes números não cobrem</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {passivo.avisos.map((aviso) => (
                  <li key={aviso} className="flex gap-2">
                    <span aria-hidden className="text-muted-foreground/60">
                      •
                    </span>
                    <span>{aviso}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
