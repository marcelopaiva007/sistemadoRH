"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Paperclip, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { BarraDeFiltros } from "@/components/padroes/barra-de-filtros";
import { gerarCsv } from "@/lib/csv";
import { RegistrarExameDialog } from "../colaboradores/[colaboradorId]/registrar-exame-dialog";
import { cn } from "@/lib/utils";

export type LinhaRelatorioAso = {
  colaboradorId: string;
  empresaId: string;
  nome: string;
  empresaNome: string;
  setorNome: string;
  /** Rótulo do tipo do exame mais recente — null quando nunca houve ASO. */
  tipoLabel: string | null;
  realizadoTexto: string | null;
  validadeTexto: string | null;
  /**
   * Dias até o vencimento do ASO vigente: negativo = vencido há |dias| dias.
   * null = sem ASO cadastrado, ou ASO sem validade preenchida — os dois pedem
   * a mesma providência (regularizar o cadastro).
   */
  dias: number | null;
  temExame: boolean;
};

// As faixas do painel, da mais grave para a menos. O atraso é partido em
// degraus porque a pergunta do RH não é "quantos vencidos", é "por onde
// começo": um ASO vencido há 14 meses é outra conversa (e outro risco numa
// fiscalização) que um vencido semana passada.
const FAIXAS = [
  { chave: "mais-1-ano", rotulo: "Vencido há mais de 1 ano", cor: "bg-destructive" },
  { chave: "6-12-meses", rotulo: "Vencido há 6 meses a 1 ano", cor: "bg-destructive/85" },
  { chave: "3-6-meses", rotulo: "Vencido há 3 a 6 meses", cor: "bg-destructive/70" },
  { chave: "1-3-meses", rotulo: "Vencido há 1 a 3 meses", cor: "bg-destructive/55" },
  { chave: "ate-30-dias", rotulo: "Vencido há até 30 dias", cor: "bg-destructive/40" },
  { chave: "sem-aso", rotulo: "Sem ASO ou sem validade", cor: "bg-foreground/60" },
  { chave: "vence-30", rotulo: "Vence em até 30 dias", cor: "bg-muted-foreground/50" },
  { chave: "em-dia", rotulo: "Em dia", cor: "bg-muted-foreground/20" },
] as const;

type Faixa = (typeof FAIXAS)[number]["chave"];

function faixaDe(dias: number | null): Faixa {
  if (dias === null) return "sem-aso";
  if (dias > 30) return "em-dia";
  if (dias >= 0) return "vence-30";
  const atraso = -dias;
  if (atraso > 365) return "mais-1-ano";
  if (atraso > 180) return "6-12-meses";
  if (atraso > 90) return "3-6-meses";
  if (atraso > 30) return "1-3-meses";
  return "ate-30-dias";
}

const vencido = (l: LinhaRelatorioAso) => l.dias !== null && l.dias < 0;
const semAso = (l: LinhaRelatorioAso) => l.dias === null;

/**
 * A fila do relatório: vencidos do MAIS ANTIGO para o mais novo, depois quem
 * não tem ASO (sem data para ranquear, mas tão irregular quanto), depois o que
 * ainda vai vencer, do mais próximo para o mais distante.
 */
function ordenar(linhas: LinhaRelatorioAso[]): LinhaRelatorioAso[] {
  const peso = (l: LinhaRelatorioAso) => (vencido(l) ? 0 : semAso(l) ? 1 : 2);
  return [...linhas].sort((a, b) => {
    const p = peso(a) - peso(b);
    if (p !== 0) return p;
    if (a.dias === null || b.dias === null) return a.nome.localeCompare(b.nome, "pt-BR");
    return a.dias - b.dias;
  });
}

type Resumo = {
  nome: string;
  ativos: number;
  vencidos: number;
  semAso: number;
  vence30: number;
  maiorAtraso: number;
};

function resumirPor(linhas: LinhaRelatorioAso[], chave: (l: LinhaRelatorioAso) => string): Resumo[] {
  const mapa = new Map<string, Resumo>();
  for (const l of linhas) {
    const nome = chave(l);
    const r = mapa.get(nome) ?? { nome, ativos: 0, vencidos: 0, semAso: 0, vence30: 0, maiorAtraso: 0 };
    r.ativos++;
    if (vencido(l)) {
      r.vencidos++;
      r.maiorAtraso = Math.max(r.maiorAtraso, -l.dias!);
    } else if (semAso(l)) r.semAso++;
    else if (l.dias! <= 30) r.vence30++;
    mapa.set(nome, r);
  }
  // Quem tem mais gente irregular primeiro; no empate, o atraso mais antigo.
  return [...mapa.values()].sort(
    (a, b) => b.vencidos + b.semAso - (a.vencidos + a.semAso) || b.maiorAtraso - a.maiorAtraso,
  );
}

const SITUACOES = [
  { valor: "atrasados", rotulo: "Atrasados (vencidos + sem ASO)" },
  { valor: "todos", rotulo: "Todos os ativos" },
  ...FAIXAS.map((f) => ({ valor: f.chave, rotulo: f.rotulo })),
] as const;

type Situacao = "atrasados" | "todos" | Faixa;

const TODOS = "";

export function RelatorioAsoView({
  linhas,
  geradoEm,
  empresaId,
}: {
  linhas: LinhaRelatorioAso[];
  geradoEm: string;
  /** CNPJ do caminho — só para o link da Caixa de documentos. */
  empresaId: string;
}) {
  const [situacao, setSituacao] = useState<Situacao>("atrasados");
  const [setor, setSetor] = useState(TODOS);
  const [empresa, setEmpresa] = useState(TODOS);
  const [busca, setBusca] = useState("");
  // Pessoa cujo ASO está sendo anexado. Pedido do RH em 28/09/2026: a lista
  // mostrava o atraso mas não dizia onde entregar o documento do médico — o
  // formulário ficava na ficha, aba Segurança → SST. Agora abre aqui mesmo, e
  // a lista se atualiza ao salvar sem perder os filtros.
  const [anexando, setAnexando] = useState<LinhaRelatorioAso | null>(null);
  const router = useRouter();

  const porFaixa = useMemo(() => {
    const contagem = Object.fromEntries(FAIXAS.map((f) => [f.chave, 0])) as Record<Faixa, number>;
    for (const l of linhas) contagem[faixaDe(l.dias)]++;
    return contagem;
  }, [linhas]);

  const total = linhas.length;
  const vencidos = linhas.filter(vencido);
  const qtdSemAso = porFaixa["sem-aso"];
  const regulares = porFaixa["vence-30"] + porFaixa["em-dia"];
  const maisAntigo = ordenar(vencidos)[0] ?? null;
  const maiorFaixa = Math.max(1, ...Object.values(porFaixa));

  const porEmpresa = useMemo(() => resumirPor(linhas, (l) => l.empresaNome), [linhas]);
  const porSetor = useMemo(() => resumirPor(linhas, (l) => l.setorNome), [linhas]);
  const setores = useMemo(() => [...new Set(linhas.map((l) => l.setorNome))].sort(), [linhas]);
  const empresas = useMemo(() => [...new Set(linhas.map((l) => l.empresaNome))].sort(), [linhas]);

  const exibidas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return ordenar(
      linhas.filter((l) => {
        if (situacao === "atrasados" && !vencido(l) && !semAso(l)) return false;
        if (situacao !== "atrasados" && situacao !== "todos" && faixaDe(l.dias) !== situacao) return false;
        if (setor !== TODOS && l.setorNome !== setor) return false;
        if (empresa !== TODOS && l.empresaNome !== empresa) return false;
        if (termo && !l.nome.toLocaleLowerCase("pt-BR").includes(termo)) return false;
        return true;
      }),
    );
  }, [linhas, situacao, setor, empresa, busca]);

  const filtrado = situacao !== "atrasados" || setor !== TODOS || empresa !== TODOS || busca !== "";

  function situacaoTexto(l: LinhaRelatorioAso): string {
    if (l.dias === null) return l.temExame ? "ASO sem validade cadastrada" : "Sem ASO cadastrado";
    if (l.dias < 0) return `Vencido há ${-l.dias} d`;
    return `Vence em ${l.dias} d`;
  }

  function exportarCsv() {
    const csv = gerarCsv(
      ["Colaborador", "CNPJ", "Setor", "Tipo do último ASO", "Realizado em", "Validade", "Situação", "Dias de atraso"],
      exibidas.map((l) => [
        l.nome,
        l.empresaNome,
        l.setorNome,
        l.tipoLabel ?? "",
        l.realizadoTexto ?? "",
        l.validadeTexto ?? "",
        situacaoTexto(l),
        l.dias !== null && l.dias < 0 ? String(-l.dias) : "",
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-aso-${geradoEm.split("/").reverse().join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Relatório de ASO"
        resumo={
          <>
            {vencidos.length} de {total} colaboradores ativos com ASO vencido e {qtdSemAso} sem ASO válido
            {maisAntigo && (
              <>
                {" "}
                — o mais antigo venceu há <b className="text-foreground">{-maisAntigo.dias!} dias</b> (
                {maisAntigo.nome})
              </>
            )}
            . Posição de {geradoEm}. Chegou um lote de ASOs em PDF?{" "}
            <Link href={`/rh/${empresaId}/caixa-documentos`} className="font-semibold text-foreground underline">
              Solte na Caixa de documentos
            </Link>{" "}
            — a leitura automática grava cada um na ficha certa.
          </>
        }
        acoes={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={exibidas.length === 0}>
              <Download className="size-4" aria-hidden /> Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Imprimir
            </Button>
          </div>
        }
      />

      <FaixaDeIndicadores colunas={5}>
        <Indicador rotulo="Ativos" valor={total} complemento="base do relatório" />
        <Indicador
          rotulo="ASO vencido"
          valor={vencidos.length}
          complemento={maisAntigo ? `mais antigo: ${-maisAntigo.dias!} dias` : "nenhum vencido"}
          estado={vencidos.length > 0 ? "alerta" : "padrao"}
        />
        <Indicador
          rotulo="Sem ASO válido"
          valor={qtdSemAso}
          complemento="nunca cadastrado ou sem validade"
          estado={qtdSemAso > 0 ? "alerta" : "padrao"}
        />
        <Indicador
          rotulo="Vence em 30 dias"
          valor={porFaixa["vence-30"]}
          complemento="agendar o periódico"
          estado={porFaixa["vence-30"] > 0 ? "atencao" : "padrao"}
        />
        <Indicador
          rotulo="Em dia"
          valor={total === 0 ? "—" : `${Math.round((regulares / total) * 100)}%`}
          complemento={`${regulares} com ASO válido hoje`}
        />
      </FaixaDeIndicadores>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>Tempo de atraso</CardTitle>
          <CardDescription>
            Cada colaborador ativo pelo ASO mais recente (demissional não conta). Clique numa faixa para ver
            quem está nela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5">
            {FAIXAS.map((f) => {
              const n = porFaixa[f.chave];
              const ativa = situacao === f.chave;
              return (
                <li key={f.chave}>
                  <button
                    type="button"
                    onClick={() => setSituacao(ativa ? "atrasados" : f.chave)}
                    aria-pressed={ativa}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-muted/60 sm:grid-cols-[14rem_1fr_3.5rem]",
                      ativa && "bg-muted",
                    )}
                  >
                    <span className="truncate text-muted-foreground">{f.rotulo}</span>
                    <span className="h-4 rounded-sm bg-muted/40">
                      <span
                        className={cn("block h-full rounded-sm", f.cor, n === 0 && "hidden")}
                        style={{ width: `${Math.max(2, (n / maiorFaixa) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className={cn("grid gap-6", empresas.length > 1 && "lg:grid-cols-2")}>
        {empresas.length > 1 && (
          <TabelaResumo
            titulo="Por CNPJ"
            descricao="Onde está a maior parte do atraso."
            linhas={porEmpresa}
            selecionado={empresa}
            aoSelecionar={(nome) => setEmpresa(nome === empresa ? TODOS : nome)}
          />
        )}
        <TabelaResumo
          titulo="Por setor"
          descricao="Setores com mais gente irregular primeiro. Clique para filtrar a lista."
          linhas={porSetor}
          selecionado={setor}
          aoSelecionar={(nome) => setSetor(nome === setor ? TODOS : nome)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Colaboradores</CardTitle>
          <CardDescription>
            Do ASO vencido há mais tempo para o mais recente; depois quem não tem ASO e, por último, o que
            ainda vai vencer. Chegou o ASO do médico? Clique em <b>Anexar ASO</b> na linha da pessoa: o
            documento fica na ficha dela e a situação se atualiza aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="print:hidden">
            <BarraDeFiltros
              busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar colaborador" }}
              recortes={
                <>
                  {empresas.length > 1 && (
                    <Seletor rotulo="CNPJ" valor={empresa} aoMudar={setEmpresa} opcoes={empresas} />
                  )}
                  <Seletor rotulo="Setor" valor={setor} aoMudar={setSetor} opcoes={setores} />
                </>
              }
              estado={
                <select
                  aria-label="Situação"
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value as Situacao)}
                >
                  {SITUACOES.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              }
              limpar={
                filtrado ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSituacao("atrasados");
                      setSetor(TODOS);
                      setEmpresa(TODOS);
                      setBusca("");
                    }}
                  >
                    Limpar
                  </Button>
                ) : undefined
              }
              contagem={<span className="text-xs text-muted-foreground">{exibidas.length} colaborador(es)</span>}
            />
          </div>

          {exibidas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ninguém nesta situação.</p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-right">#</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Último ASO</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right print:hidden">Documento do médico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exibidas.map((l, i) => {
                    // Mais de 6 meses vencido ganha destaque na linha inteira:
                    // é o topo da fila, e numa lista impressa a cor do selo
                    // some — o negrito não.
                    const critico = l.dias !== null && l.dias < -180;
                    return (
                      <TableRow key={l.colaboradorId} className={cn(critico && "bg-destructive/5")}>
                        <TableCell className="text-right text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell>
                          {/* Abre a ficha já na aba de ASO (histórico de exames). */}
                          <Link
                            href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}?tab=seguranca`}
                            className={cn("hover:underline", critico ? "font-bold" : "font-medium")}
                          >
                            {l.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{l.empresaNome}</TableCell>
                        <TableCell className="text-muted-foreground">{l.setorNome}</TableCell>
                        <TableCell>
                          {l.tipoLabel ?? "—"}
                          {l.realizadoTexto && (
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {l.realizadoTexto}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{l.validadeTexto ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={l.dias === null || l.dias < 0 ? "destructive" : "secondary"}>
                            {situacaoTexto(l)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right print:hidden">
                          <Button
                            size="sm"
                            variant={l.dias === null || l.dias < 0 ? "default" : "outline"}
                            aria-haspopup="dialog"
                            onClick={() => setAnexando(l)}
                          >
                            <Paperclip className="size-4" aria-hidden /> Anexar ASO
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {anexando && (
        <RegistrarExameDialog
          // O CNPJ DO COLABORADOR, não o do caminho: o relatório mistura
          // empresas, e a action só aceita o colaborador na empresa dele.
          empresaId={anexando.empresaId}
          colaboradorId={anexando.colaboradorId}
          colaboradorNome={`${anexando.nome} · ${anexando.empresaNome}`}
          // Quem já teve ASO está renovando: o periódico é o caso comum.
          tipoPadrao={anexando.temExame ? "PERIODICO" : undefined}
          aberto
          aoMudarAberto={(aberto) => {
            // Só fecha se o diálogo aberto ainda é o desta pessoa: um envio
            // lento de quem já foi fechado não pode derrubar o de outra linha.
            const id = anexando.colaboradorId;
            if (!aberto) setAnexando((atual) => (atual?.colaboradorId === id ? null : atual));
          }}
          aoRegistrar={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Seletor({
  rotulo,
  valor,
  aoMudar,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: string[];
}) {
  return (
    <select
      aria-label={rotulo}
      className="max-w-[14rem] rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
    >
      <option value={TODOS}>{rotulo}: todos</option>
      {opcoes.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function TabelaResumo({
  titulo,
  descricao,
  linhas,
  selecionado,
  aoSelecionar,
}: {
  titulo: string;
  descricao: string;
  linhas: Resumo[];
  selecionado: string;
  aoSelecionar: (nome: string) => void;
}) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-auto rounded-md border print:max-h-none">
          <Table compacta>
            <TableHeader>
              <TableRow>
                <TableHead>{titulo.replace("Por ", "")}</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Vencidos</TableHead>
                <TableHead className="text-right">Sem ASO</TableHead>
                <TableHead className="text-right">Maior atraso</TableHead>
                <TableHead className="text-right">Em dia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((r) => {
                const emDia = r.ativos - r.vencidos - r.semAso;
                return (
                  <TableRow
                    key={r.nome}
                    className={cn("cursor-pointer", selecionado === r.nome && "bg-muted")}
                    onClick={() => aoSelecionar(r.nome)}
                  >
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.ativos}</TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", r.vencidos > 0 && "font-semibold text-destructive")}
                    >
                      {r.vencidos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.semAso}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.maiorAtraso > 0 ? `${r.maiorAtraso} d` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round((emDia / r.ativos) * 100)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
