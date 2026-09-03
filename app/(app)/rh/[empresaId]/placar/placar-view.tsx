"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatarReais } from "@/lib/constants-beneficios";
import { MINIMO_SALARIOS_POR_CARGO, PISO_NACIONAL } from "@/lib/qualidade-salarial";
import type { QualidadeSalarial } from "@/lib/qualidade-salarial";
import { cn } from "@/lib/utils";
import { useControleFiltro } from "../filtro-empresas";

/**
 * Placar do grupo — os CNPJs lado a lado, um por linha.
 *
 * Painel e Indicadores consolidam por MARCA. Os 5 CNPJs da LM Telecom viram uma
 * linha de 31,1% de turnover, e dentro dela a RSM está em 40,9% e a LM SISTEMAS
 * em 0,0%. A média da marca não é o problema de ninguém: não existe uma empresa
 * com 31%. Esta tela desfaz a média.
 *
 * Os tipos de linha moram aqui, e não na page, porque quem define o contrato é
 * quem consome as props. A page importa com `import type` — some na compilação,
 * então nenhum módulo de cliente é puxado para dentro do Server Component.
 */

/** Uma linha da tabela: um CNPJ, ou o consolidado do grupo. */
export type LinhaPlacar = {
  empresaId: string;
  empresa: string;
  marca: string;
  ativos: number;
  admissoes: number;
  desligamentos: number;
  saldo: number;
  /** null quando não há headcount médio para dividir — "sem base", não 0%. */
  turnoverPct: number | null;
  /** null = sem dado. NUNCA 0: R$ 0 de folha é uma afirmação, e é falsa. */
  folhaBase: number | null;
  comSalario: number;
  /** null quando ninguém tem admissão preenchida. */
  tempoMedioAnos: number | null;
  /** % de ativos com admissão, salário e setor — os campos que ESTA tabela usa. */
  coberturaPct: number | null;
  /** Desligados sem data: não entram em janela nenhuma, nem na maior. */
  desligadosSemData: number;
  /** Fora do ranking por taxa (menos ativos que o piso, ou zero ativos). */
  amostraPequena: boolean;
  /** Por que saiu do ranking — some quando `amostraPequena` é falso. */
  motivoForaDoRanking: string | null;
};

/** O que o recorte deixou de fora. Calar sobre isso é como o número mente. */
export type ForaDoRecorte = {
  desligadosSemData: number;
  desligadosSemDataPorEmpresa: { empresa: string; total: number }[];
  desligadosAntesDaJanela: number;
  ativosSemSalario: number;
  empresasSemFolha: string[];
};

export type OpcaoSetor = { chave: string; rotulo: string; ativos: number };
export type OpcaoEmpresa = { id: string; nome: string; marca: string };

type ChaveColuna =
  | "empresa"
  | "ativos"
  | "admissoes"
  | "desligamentos"
  | "saldo"
  | "turnoverPct"
  | "folhaBase"
  | "tempoMedioAnos"
  | "coberturaPct";

type Coluna = {
  chave: ChaveColuna;
  rotulo: string;
  // "taxa" é o que o piso de amostra protege: uma razão com denominador pequeno
  // oscila muito. Coluna absoluta (ativos, folha) ordena todo mundo junto —
  // deve 0 dias é um fato, não um ruído de amostra.
  taxa: boolean;
  numerica: boolean;
  ajuda?: string;
};

const COLUNAS: Coluna[] = [
  { chave: "empresa", rotulo: "Empresa", taxa: false, numerica: false },
  { chave: "ativos", rotulo: "Ativos", taxa: false, numerica: true },
  { chave: "admissoes", rotulo: "Admissões", taxa: false, numerica: true },
  { chave: "desligamentos", rotulo: "Desligamentos", taxa: false, numerica: true },
  {
    chave: "saldo",
    rotulo: "Saldo",
    taxa: false,
    numerica: true,
    ajuda: "Admissões menos desligamentos na janela.",
  },
  {
    chave: "turnoverPct",
    rotulo: "Turnover",
    taxa: true,
    numerica: true,
    ajuda: "Desligados ÷ headcount médio da janela.",
  },
  {
    chave: "folhaBase",
    rotulo: "Folha-base importada",
    taxa: false,
    numerica: true,
    // O nome da coluna é uma trava: é a soma dos salários que ALGUÉM DIGITOU,
    // não o custo de pessoal. Falta encargo, benefício, hora extra e rescisão.
    ajuda:
      "Soma do salário base cadastrado. Não é custo de pessoal — não inclui encargos, benefícios nem rescisões.",
  },
  { chave: "tempoMedioAnos", rotulo: "Tempo de casa", taxa: false, numerica: true },
  {
    chave: "coberturaPct",
    rotulo: "Cobertura",
    taxa: true,
    numerica: true,
    ajuda:
      "% dos ativos com admissão, salário e setor preenchidos — os campos que esta tabela consome.",
  },
];

export function PlacarView({
  empresaId,
  linhas,
  grupo,
  foraDoRecorte,
  janela,
  janelas,
  setorSelecionado,
  setores,
  empresasDisponiveis,
  empresasSelecionadas,
  mediaSimplesPct,
  pisoAtivos,
  qualidadeSalarial,
}: {
  empresaId: string;
  linhas: LinhaPlacar[];
  /** Consolidado do recorte. null quando o filtro não deixou nenhuma empresa. */
  grupo: LinhaPlacar | null;
  foraDoRecorte: ForaDoRecorte;
  janela: number;
  janelas: number[];
  setorSelecionado: string | null;
  setores: OpcaoSetor[];
  empresasDisponiveis: OpcaoEmpresa[];
  empresasSelecionadas: string[];
  /** Média simples das linhas — mostrada só para explicar por que NÃO é usada. */
  mediaSimplesPct: number | null;
  pisoAtivos: number;
  /** Do mesmo recorte da tabela (empresas + setor), agregado por cargo no grupo. */
  qualidadeSalarial: QualidadeSalarial;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // O mesmo controle da árvore da lateral: marca/CNPJ vivem em `?empresas=`.
  // Reaproveitar em vez de criar um segundo parâmetro mantém os dois filtros
  // sincronizados — mudar aqui repinta a árvore, e vice-versa.
  const { selecionadas, aplicar } = useControleFiltro(empresaId);

  // Ordem inicial: turnover do pior para o melhor. A pergunta que traz alguém
  // a esta tela é "quem está me custando gente", não "quem é o maior".
  const [ordem, setOrdem] = useState<{ chave: ChaveColuna; desc: boolean }>({
    chave: "turnoverPct",
    desc: true,
  });

  const colunaOrdenada = COLUNAS.find(c => c.chave === ordem.chave)!;

  const trocarParametro = (chave: string, valor: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (valor === null) params.delete(chave);
    else params.set(chave, valor);
    const query = params.toString();
    // replace, não push: filtrar não é navegar. Mesma decisão de filtro-empresas.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const { ranqueadas, foraDoRanking } = useMemo(() => {
    const comparar = (a: LinhaPlacar, b: LinhaPlacar) => {
      if (ordem.chave === "empresa") {
        const cmp = a.empresa.localeCompare(b.empresa, "pt-BR");
        return ordem.desc ? -cmp : cmp;
      }
      const va = a[ordem.chave] as number | null;
      const vb = b[ordem.chave] as number | null;
      // "Sem dado" cai sempre no fim, nos dois sentidos: null não é um número
      // pequeno. Ordenar por folha crescente com Centrysol no topo faria a
      // empresa sem salário nenhum parecer a mais barata do grupo.
      if (va === null && vb === null) return a.empresa.localeCompare(b.empresa, "pt-BR");
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va === vb) return a.empresa.localeCompare(b.empresa, "pt-BR");
      return ordem.desc ? vb - va : va - vb;
    };

    // Só coluna de TAXA segrega amostra pequena. Sem isso, VAPT (7 pessoas) e
    // Mobility (4) lideram o ranking de turnover com 0% — três meses sem ninguém
    // sair, em quatro pessoas, não é retenção, é falta de evento.
    if (!colunaOrdenada.taxa) return { ranqueadas: [...linhas].sort(comparar), foraDoRanking: [] };
    return {
      ranqueadas: linhas.filter(l => !l.amostraPequena).sort(comparar),
      foraDoRanking: linhas.filter(l => l.amostraPequena).sort(comparar),
    };
  }, [linhas, ordem, colunaOrdenada]);

  const rotuloEmpresas =
    selecionadas.length === 0
      ? "Todas as marcas"
      : selecionadas.length === 1
        ? (empresasDisponiveis.find(e => e.id === selecionadas[0])?.nome ?? "1 CNPJ")
        : `${selecionadas.length} CNPJs`;

  const marcas = [...new Set(empresasDisponiveis.map(e => e.marca))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  return (
    <div className="space-y-6">
      <div>
        <h1>Placar do grupo</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Um CNPJ por linha — não uma linha por marca. Painel e Indicadores consolidam pela marca, e
          a média some com o extremo: os CNPJs da LM Telecom aparecem juntos como uma empresa só,
          enquanto a RSM e a LM SISTEMAS estão em pontos opostos da tabela.
        </p>
      </div>

      {/* --- Barra de filtro ------------------------------------------------ */}
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
              ["__todos", rotuloEmpresas],
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

        <CampoFiltro rotulo="Setor">
          <Select
            value={setorSelecionado ?? "__todos"}
            onValueChange={v => trocarParametro("setor", v === "__todos" ? null : v)}
            items={Object.fromEntries([
              ["__todos", "Todos os setores"],
              ...setores.map(s => [s.chave, s.rotulo] as const),
            ])}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos">Todos os setores</SelectItem>
              {setores.map(s => (
                <SelectItem key={s.chave} value={s.chave}>
                  {s.rotulo} ({s.ativos})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFiltro>

        <CampoFiltro rotulo="Janela">
          <div className="flex rounded-lg border p-0.5">
            {janelas.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => trocarParametro("janela", String(m))}
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
        </CampoFiltro>
      </div>

      {/* Setor filtrado muda TUDO na linha, inclusive o denominador do turnover.
          Sem esta faixa, a tabela parece o grupo inteiro encolhido. */}
      {setorSelecionado && (
        <p className="text-sm text-muted-foreground">
          Filtrado pelo setor{" "}
          <span className="font-medium text-foreground">
            {setores.find(s => s.chave === setorSelecionado)?.rotulo ?? setorSelecionado}
          </span>
          . Ativos, admissões, desligamentos e turnover são só desse setor em cada CNPJ — CNPJ sem
          ninguém nele aparece abaixo da tabela.
        </p>
      )}

      {/* --- Tabela --------------------------------------------------------- */}
      {empresasSelecionadas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            O filtro da URL não bateu com nenhum CNPJ que você enxerga.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUNAS.map(c => (
                  <TableHead
                    key={c.chave}
                    className={cn("whitespace-nowrap", c.numerica && "text-right")}
                    title={c.ajuda}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOrdem(o =>
                          o.chave === c.chave
                            ? { chave: c.chave, desc: !o.desc }
                            : { chave: c.chave, desc: c.chave !== "empresa" }
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        c.numerica && "flex-row-reverse",
                        ordem.chave === c.chave ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {ordem.chave !== c.chave ? (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      ) : ordem.desc ? (
                        <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUp className="size-3" />
                      )}
                      {c.rotulo}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupo && (
                <LinhaGrupo
                  grupo={grupo}
                  janela={janela}
                  qtdCnpjs={linhas.length}
                  mediaSimplesPct={mediaSimplesPct}
                />
              )}

              {ranqueadas.map(l => (
                <LinhaEmpresa key={l.empresaId} linha={l} />
              ))}

              {foraDoRanking.length > 0 && (
                <>
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={COLUNAS.length}
                      className="bg-muted/40 py-2 text-xs text-muted-foreground"
                    >
                      Fora da ordenação por {colunaOrdenada.rotulo.toLowerCase()} — menos de{" "}
                      {pisoAtivos} ativos. Uma taxa sobre poucas pessoas oscila demais para
                      comparar: uma saída a mais move a agulha em dezenas de pontos.
                    </TableCell>
                  </TableRow>
                  {foraDoRanking.map(l => (
                    <LinhaEmpresa key={l.empresaId} linha={l} atenuada />
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* --- Rodapé: o que ficou de fora ------------------------------------ */}
      <Card className="border-border">
        <CardContent className="space-y-3 py-4 text-sm">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-2">
              {foraDoRecorte.desligadosSemData > 0 && (
                <p>
                  <span className="font-medium">
                    {foraDoRecorte.desligadosSemData} desligamentos sem data ficam fora da janela
                  </span>
                  {foraDoRecorte.desligadosSemDataPorEmpresa.length > 0 && (
                    <>
                      {" — destes, "}
                      {listar(
                        foraDoRecorte.desligadosSemDataPorEmpresa.map(
                          e => `${e.total} na ${e.empresa}`
                        )
                      )}
                    </>
                  )}
                  . Não entram em janela nenhuma, nem na de 24 meses. O turnover de quem os
                  concentra está <span className="font-medium">subestimado</span>: a empresa aparece
                  melhor do que é.
                </p>
              )}
              {foraDoRecorte.desligadosAntesDaJanela > 0 && (
                <p className="text-muted-foreground">
                  Outros {foraDoRecorte.desligadosAntesDaJanela} desligamentos têm data anterior aos{" "}
                  {janela} meses — estão fora por recorte, não por falta de cadastro. Abrir a janela
                  para 24 meses traz parte deles.
                </p>
              )}
              {foraDoRecorte.ativosSemSalario > 0 && (
                <p className="text-muted-foreground">
                  {foraDoRecorte.ativosSemSalario} ativos não têm salário cadastrado.
                  {foraDoRecorte.empresasSemFolha.length > 0 && (
                    <>
                      {" "}
                      A folha de {foraDoRecorte.empresasSemFolha.join(", ")} aparece como{" "}
                      <span className="font-medium">sem dado</span> — a soma cobriria gente de menos
                      para descrever a empresa, e R$ 0 seria uma afirmação falsa.
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 border-t pt-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Não há coluna de absenteísmo.</span> A
              tabela de ausências não tem nenhum registro no grupo, então a coluna mostraria 0,0%
              para os oito CNPJs — falta de medição com cara de desempenho bom. Ela entra quando o
              módulo de ausências começar a ser usado.
            </p>
          </div>
        </CardContent>
      </Card>

      <SecaoQualidadeSalarial qualidade={qualidadeSalarial} />
    </div>
  );
}

// --------------------------------------------------------------------------
// Qualidade do dado salarial
// --------------------------------------------------------------------------

/**
 * Diagnóstico de PREENCHIMENTO do salário, não análise de remuneração — a
 * distinção é o produto. Medido em 05/08/2026: 135 dos 166 salários de ativos
 * eram exatamente R$ 1.621 (o piso), 19 valores distintos na base inteira, e
 * fora o CEO o teto era R$ 2.498 — gerência e diretoria não estão na base. A
 * coluna "Folha-base importada" lá em cima é construída sobre isso; esta seção
 * existe para ninguém ler aquela coluna como custo real sem passar por aqui.
 */
function SecaoQualidadeSalarial({ qualidade }: { qualidade: QualidadeSalarial }) {
  const q = qualidade;
  const pctModal = q.comSalario > 0 ? Math.round((q.noModal / q.comSalario) * 100) : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Qualidade do dado salarial</h3>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Não é análise de salário — é diagnóstico de preenchimento.
          {q.valorModal !== null && pctModal !== null && (
            <>
              {" "}
              {q.noModal} dos {q.comSalario} salários cadastrados ({pctModal}%) são exatamente{" "}
              {formatarReais(q.valorModal)}: o campo registra o piso de contratação, e a
              remuneração real (comissão, periculosidade, hora extra) não existe em campo nenhum
              do sistema.
            </>
          )}
        </p>
      </div>

      {q.comSalario === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Nenhum ativo com salário cadastrado no recorte — não há o que diagnosticar.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* --- Por cargo -------------------------------------------------- */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Com salário</TableHead>
                  <TableHead className="text-right" title="Quantos valores diferentes existem entre os salários do cargo.">
                    Valores distintos
                  </TableHead>
                  <TableHead className="text-right" title="% dos salários do cargo exatamente no valor mais frequente dele.">
                    No valor modal
                  </TableHead>
                  <TableHead className="text-right" title="Maior salário do cargo menos o menor. R$ 0 = todo mundo ganha o mesmo no papel.">
                    Amplitude
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.porCargo.map(l => (
                  <TableRow key={l.cargo}>
                    <TableCell className="font-medium">{l.cargo}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.comSalario} de {l.ativos}
                    </TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", l.valoresDistintos === 1 && "text-muted-foreground")}
                    >
                      {l.valoresDistintos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(l.noModalPct)}% em {formatarReais(l.valorModal)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", l.achatado && "text-muted-foreground")}>
                      {l.achatado ? "R$ 0 — todos iguais" : formatarReais(l.amplitudeReais)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {q.foraDaTabela.cargos > 0 && (
            <p className="text-xs text-muted-foreground">
              Fora da tabela: {q.foraDaTabela.cargos} cargos com menos de{" "}
              {MINIMO_SALARIOS_POR_CARGO} salários cadastrados ({q.foraDaTabela.salarios} pessoas)
              — abaixo disso, &ldquo;amplitude&rdquo; seria o salário de alguém com outro nome.
            </p>
          )}

          {/* --- Abaixo do piso --------------------------------------------- */}
          {q.abaixoDoPiso.length > 0 && (
            <Card>
              <CardContent className="space-y-3 py-4 text-sm">
                <div>
                  <p className="font-medium">
                    Abaixo do piso nacional ({formatarReais(PISO_NACIONAL)})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Salário mensal abaixo do mínimo só é regular com jornada parcial ou estágio —
                    e com jornada semanal preenchida em {q.comJornada} de {q.ativos} ativos e tipo
                    de contrato em {q.comTipoContrato} de {q.ativos}, o sistema não sabe dizer qual
                    caso é qual. Por isso o rótulo é o do dado que falta, não uma acusação.
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {q.abaixoDoPiso.map(f => (
                    <li key={f.valor} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium tabular-nums">{formatarReais(f.valor)}</span>
                      <span className="text-muted-foreground">
                        — {f.pessoas} {f.pessoas === 1 ? "pessoa" : "pessoas"} ·{" "}
                        {listar(f.cargos)}
                      </span>
                      {f.comJornada < f.pessoas && (
                        <Badge variant="outline" className="border-border font-normal text-muted-foreground">
                          jornada não cadastrada
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* --- Gênero ----------------------------------------------------- */}
          <Card>
            <CardContent className="space-y-3 py-4 text-sm">
              <div>
                <p className="font-medium">Gênero — composição, não remuneração</p>
                <p className="text-xs text-muted-foreground">
                  {/* A frase de gap fica no card de limitações abaixo; aqui só o que o dado sustenta. */}
                  O que este cadastro sustenta afirmar é quem ocupa cada cargo — não quanto cada
                  lado ganha.
                </p>
              </div>
              {q.genero.umLadoSo.length === 0 ? (
                <p className="text-muted-foreground">
                  Nenhum cargo do recorte tem composição de um lado só (entre os com sexo
                  registrado suficiente para afirmar algo).
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {q.genero.umLadoSo.map(c => (
                    <li key={c.cargo} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{c.cargo}</span>
                      <span className="tabular-nums text-muted-foreground">
                        — {c.homens} {c.homens === 1 ? "homem" : "homens"} · {c.mulheres}{" "}
                        {c.mulheres === 1 ? "mulher" : "mulheres"}
                        {c.semRegistro > 0 && ` (${c.semRegistro} sem registro de sexo)`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* --- Limitações, nas palavras da lib ----------------------------- */}
          <Card className="border-border">
            <CardContent className="space-y-2 py-4 text-sm">
              {q.avisos.map(a => (
                <div key={a} className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-muted-foreground">{a}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function CampoFiltro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}

/**
 * A linha do grupo é o POOL do recorte, não a média das linhas abaixo.
 *
 * A média simples daria o mesmo peso à Mobility (4 pessoas) e à RSM (68) — hoje
 * ela sai em 16,1% contra 26,6% do consolidado. Como as duas coisas se chamam
 * "média do grupo" na conversa, a linha diz qual das duas está mostrando.
 */
function LinhaGrupo({
  grupo,
  janela,
  qtdCnpjs,
  mediaSimplesPct,
}: {
  grupo: LinhaPlacar;
  janela: number;
  qtdCnpjs: number;
  mediaSimplesPct: number | null;
}) {
  const divergeDaMedia =
    mediaSimplesPct !== null &&
    grupo.turnoverPct !== null &&
    qtdCnpjs > 1 &&
    Math.abs(mediaSimplesPct - grupo.turnoverPct) >= 1;

  return (
    <TableRow className="border-b-2 bg-muted/50 font-medium hover:bg-muted/50">
      <TableCell>
        <div>Grupo consolidado</div>
        <div className="text-xs font-normal text-muted-foreground">
          {qtdCnpjs} {qtdCnpjs === 1 ? "CNPJ somado" : "CNPJs somados"} como uma folha só, janela de{" "}
          {janela} meses
          {divergeDaMedia && (
            <>
              {" · "}a média simples das linhas daria {formatarPct(mediaSimplesPct)}, dando o mesmo
              peso a um CNPJ de 4 pessoas e a um de 68
            </>
          )}
        </div>
      </TableCell>
      <Celulas linha={grupo} />
    </TableRow>
  );
}

function LinhaEmpresa({ linha, atenuada }: { linha: LinhaPlacar; atenuada?: boolean }) {
  const router = useRouter();

  return (
    <TableRow
      // Clique na linha inteira é conveniência; o link real está no nome, que é
      // o que teclado e leitor de tela alcançam.
      onClick={() => router.push(`/rh/${linha.empresaId}`)}
      className={cn("cursor-pointer", atenuada && "text-muted-foreground")}
    >
      <TableCell>
        <Link
          href={`/rh/${linha.empresaId}`}
          onClick={e => e.stopPropagation()}
          className="font-medium hover:underline"
        >
          {linha.empresa}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <span>{linha.marca}</span>
          {linha.amostraPequena && linha.motivoForaDoRanking && (
            <Badge variant="outline" className="font-normal">
              {linha.motivoForaDoRanking}
            </Badge>
          )}
          {/* O aviso mora na linha, não só no rodapé: quem ordena por turnover e
              lê a primeira linha precisa saber ali que ela está subestimada. */}
          {linha.desligadosSemData > 0 && (
            <Badge variant="outline" className="border-border font-normal text-muted-foreground">
              +{linha.desligadosSemData} saíram sem data
            </Badge>
          )}
        </div>
      </TableCell>
      <Celulas linha={linha} />
    </TableRow>
  );
}

/** As colunas numéricas, iguais na linha do grupo e na de empresa. */
function Celulas({ linha }: { linha: LinhaPlacar }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{linha.ativos}</TableCell>
      <TableCell className="text-right tabular-nums">{linha.admissoes}</TableCell>
      <TableCell className="text-right tabular-nums">{linha.desligamentos}</TableCell>
      <TableCell
        className={cn(
          "text-right tabular-nums",
          linha.saldo < 0 && "text-destructive",
          linha.saldo > 0 && "text-success"
        )}
      >
        {linha.saldo > 0 ? `+${linha.saldo}` : linha.saldo}
      </TableCell>
      <TableCell className="text-right">
        {linha.turnoverPct === null ? (
          <SemDado />
        ) : (
          <span
            className={cn(
              "tabular-nums",
              linha.turnoverPct >= 30 && "font-medium text-destructive",
              linha.turnoverPct >= 20 && linha.turnoverPct < 30 && "text-muted-foreground"
            )}
          >
            {formatarPct(linha.turnoverPct)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {linha.folhaBase === null ? (
          // Com zero ativos no recorte, "0 de 0 com salário" é ruído: a linha já
          // carrega o crachá dizendo que não há ninguém aqui.
          <SemDado
            detalhe={
              linha.ativos > 0 ? `${linha.comSalario} de ${linha.ativos} com salário` : undefined
            }
          />
        ) : (
          <>
            <div className="tabular-nums">{formatarReais(linha.folhaBase)}</div>
            {linha.comSalario < linha.ativos && (
              <div className="text-xs font-normal text-muted-foreground">
                piso — só {linha.comSalario} de {linha.ativos}
              </div>
            )}
          </>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {linha.tempoMedioAnos === null ? (
          <SemDado />
        ) : (
          `${formatarNumero(linha.tempoMedioAnos)} anos`
        )}
      </TableCell>
      <TableCell className="text-right">
        {linha.coberturaPct === null ? (
          <SemDado />
        ) : (
          <span className={cn("tabular-nums", linha.coberturaPct < 50 && "text-muted-foreground")}>
            {Math.round(linha.coberturaPct)}%
          </span>
        )}
      </TableCell>
    </>
  );
}

/**
 * "sem dado" em texto, nunca R$ 0 nem 0,0%.
 *
 * É a regra da tela de Pendências aplicada a número: zero porque está em dia e
 * zero porque ninguém preencheu são coisas diferentes, e só uma delas é notícia
 * boa.
 */
function SemDado({ detalhe }: { detalhe?: string }) {
  return (
    <span className="text-xs font-normal text-muted-foreground italic">
      sem dado
      {detalhe && <span className="block not-italic">{detalhe}</span>}
    </span>
  );
}

/** "30 na RSM e 1 na BRNET" — o "e" antes do último, como se escreve. */
function listar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

function formatarPct(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
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
