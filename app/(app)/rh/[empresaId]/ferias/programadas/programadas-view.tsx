"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Indicador } from "@/components/indicador";
import type { ProgramacaoFerias } from "@/lib/ferias-passivo";
import { STATUS_SOLICITACAO_BADGE } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Info } from "lucide-react";
import type { LinhaProgramada } from "./page";

// A lista que o cartão "Férias programadas" da tela de Férias abre.
//
// O indicador "Começam nos próximos N meses" NÃO é recontado aqui: ele vem de
// `programacao.agendadas`, a mesma saída de `resumirProgramacaoFerias` que o
// cartão mostra — contador e lista nunca podem discordar (bug recorrente do
// projeto). O filtro NA_JANELA usa `naJanela`, calculado no servidor pela
// mesma `contaComoProgramada`.

const FILTROS = [
  { chave: "TODAS", rotulo: "Todas" },
  { chave: "EM_GOZO", rotulo: "Em gozo" },
  // Rótulo montado no render — a janela (6 meses) vem da lib, não daqui.
  { chave: "NA_JANELA", rotulo: "" },
  { chave: "PENDENTES", rotulo: "Aguardando aprovação" },
] as const;

type Filtro = (typeof FILTROS)[number]["chave"];

// Mesmo limite da tabela da tela de Férias — a agenda do grupo inteiro pode
// passar de cem linhas quando o RH estiver programando de verdade.
const ITENS_POR_PAGINA = 20;

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;


export function ProgramadasView({
  empresaId,
  linhas,
  programacao,
  escopo,
}: {
  empresaId: string;
  linhas: LinhaProgramada[];
  programacao: ProgramacaoFerias;
  escopo: { cnpjs: number; marcas: string[] };
}) {
  // O cartão da tela de Férias chega com ?filtro=NA_JANELA para a primeira
  // impressão ser exatamente o número que ele mostrou.
  const searchParams = useSearchParams();
  const filtroDaUrl = searchParams.get("filtro");
  const filtroInicial: Filtro = FILTROS.some((f) => f.chave === filtroDaUrl)
    ? (filtroDaUrl as Filtro)
    : "TODAS";
  const [filtro, setFiltroBruto] = useState<Filtro>(filtroInicial);
  const [busca, setBuscaBruta] = useState("");
  const [pagina, setPagina] = useState(1);

  const setFiltro = (v: Filtro) => {
    setFiltroBruto(v);
    setPagina(1);
  };
  const setBusca = (v: string) => {
    setBuscaBruta(v);
    setPagina(1);
  };

  // O ?empresas= da lateral segue junto em toda navegação — sair da tela não
  // pode alargar o recorte que o usuário estreitou.
  const empresasParam = searchParams.get("empresas");
  const comEmpresas = (href: string) =>
    empresasParam ? `${href}${href.includes("?") ? "&" : "?"}empresas=${empresasParam}` : href;

  const contagem = useMemo(() => {
    const emGozo = linhas.filter((l) => l.emGozo);
    const futuras = linhas.filter((l) => !l.emGozo);
    return {
      emGozo: emGozo.length,
      proximoRetorno: emGozo.length
        ? emGozo.reduce((min, l) => Math.min(min, l.terminaEmDias), Infinity)
        : null,
      futuras: futuras.length,
      diasFuturos: futuras.reduce((t, l) => t + l.dias, 0),
      abonoFuturo: futuras.reduce((t, l) => t + l.diasAbono, 0),
      pendentes: linhas.filter((l) => l.status === "PENDENTE").length,
    };
  }, [linhas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter((l) => {
        if (filtro === "EM_GOZO") return l.emGozo;
        if (filtro === "NA_JANELA") return l.naJanela;
        if (filtro === "PENDENTES") return l.status === "PENDENTE";
        return true;
      })
      .filter(
        (l) =>
          !termo ||
          l.nome.toLowerCase().includes(termo) ||
          l.setor.toLowerCase().includes(termo) ||
          l.empresa.toLowerCase().includes(termo),
      );
    // Sem seletor de ordem: agenda se lê por data de início, e o servidor já
    // mandou assim.
  }, [linhas, filtro, busca]);

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const visiveisNaPagina = visiveis.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={comEmpresas(`/rh/${empresaId}/ferias`)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Férias
        </Link>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Férias programadas</h2>
        <p className="text-sm text-muted-foreground">
          Tudo que está agendado e ainda não terminou: quem está em gozo neste momento e quem ainda
          vai sair. Pedidos reprovados ou cancelados não são agenda e ficam de fora.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Recorte: {plural(escopo.cnpjs, "CNPJ", "CNPJs")}
          {escopo.marcas.length > 0 && ` · ${escopo.marcas.join(", ")}`}. Use o filtro de marca/CNPJ
          na lateral para estreitar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Em gozo agora"
          valor={contagem.emGozo}
          complemento={
            contagem.proximoRetorno === null
              ? "ninguém fora por férias hoje"
              : `próximo retorno em ${plural(contagem.proximoRetorno, "dia", "dias")}`
          }
        />
        <Indicador
          rotulo={`Começam nos próximos ${programacao.janelaMeses} meses`}
          valor={programacao.agendadas}
          complemento={'mesma conta do cartão "Férias programadas"'}
        />
        <Indicador
          rotulo="Programadas no total"
          valor={contagem.futuras}
          complemento={
            contagem.futuras === 0
              ? "nenhum período por começar"
              : contagem.pendentes > 0
                ? `${contagem.pendentes} aguardando aprovação`
                : "todas aprovadas"
          }
          estado={contagem.pendentes > 0 ? "atencao" : "padrao"}
        />
        <Indicador
          rotulo="Dias programados"
          valor={contagem.diasFuturos}
          complemento={
            contagem.abonoFuturo > 0
              ? `+${contagem.abonoFuturo} de abono pecuniário`
              : "nos períodos por começar"
          }
        />
      </div>

      {linhas.length === 0 && (
        <Alert>
          <Info />
          <AlertDescription>
            <b>Nada programado ainda</b> — as férias programadas aparecerão aqui conforme o RH
            lançar os pedidos, pela ficha do colaborador (cartão de Férias).{" "}
            {programacao.totalRegistros === 0 ? (
              <>Não há registro nenhum de férias neste recorte: nem histórico, nem agenda.</>
            ) : (
              <>
                Os {programacao.totalRegistros} registros existentes são histórico já gozado, não
                agenda
                {programacao.ultimoInicioRegistrado &&
                  ` (o mais recente começa em ${formatarData(programacao.ultimoInicioRegistrado)})`}
                .
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agenda</CardTitle>
          <CardDescription>
            Ordenada pela data de início. Clique no nome para abrir a ficha do colaborador e ver o
            pedido completo — aprovar ou reprovar continua na tela de Aprovações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por nome, setor ou CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => setFiltro(f.chave)}
                  className={
                    filtro === f.chave
                      ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                >
                  {f.chave === "NA_JANELA" ? `Próximos ${programacao.janelaMeses} meses` : f.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveisNaPagina.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        {linhas.length === 0
                          ? "Nenhuma férias programada."
                          : "Nenhuma férias programada neste filtro."}
                      </TableCell>
                    </TableRow>
                  )}
                  {visiveisNaPagina.map((l) => (
                    <TableRow key={l.solicitacaoId}>
                      <TableCell>
                        <Link
                          href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}?tab=ferias`}
                          className="font-medium hover:underline"
                        >
                          {l.nome}
                        </Link>
                        {!l.colaboradorAtivo && (
                          <Badge variant="outline" className="ml-2">
                            desligado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.empresa}</TableCell>
                      <TableCell className="text-muted-foreground">{l.setor}</TableCell>
                      <TableCell className="tabular-nums">{formatarData(l.inicio)}</TableCell>
                      <TableCell className="tabular-nums">{formatarData(l.fim)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.dias}
                        {l.diasAbono > 0 && (
                          <span className="text-xs text-muted-foreground"> +{l.diasAbono} abono</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {l.emGozo
                          ? l.terminaEmDias === 0
                            ? "termina hoje"
                            : `em gozo — termina em ${l.terminaEmDias} d`
                          : l.comecaEmDias === 0
                            ? "começa hoje"
                            : `começa em ${l.comecaEmDias} d`}
                      </TableCell>
                      <TableCell>
                        {/* Só PENDENTE e APROVADA chegam aqui (STATUS_DE_AGENDA filtra no servidor). */}
                        <StatusBadge status={l.status} map={STATUS_SOLICITACAO_BADGE} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Link
                          href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}?tab=ferias`}
                          className="inline-block rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Abrir ficha do colaborador"
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

          {visiveis.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {inicioPagina + 1}–{Math.min(inicioPagina + ITENS_POR_PAGINA, visiveis.length)} de{" "}
                {visiveis.length}
              </p>
              {totalPaginas > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPagina(paginaAtual - 1)}
                    disabled={paginaAtual <= 1}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                    Anterior
                  </button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    Página {paginaAtual} de {totalPaginas}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPagina(paginaAtual + 1)}
                    disabled={paginaAtual >= totalPaginas}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    Próxima
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
