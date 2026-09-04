"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { Search } from "lucide-react";
import {
  excluirFinanceiroVeiculo,
  registrarParcelaPaga,
  salvarFinanceiroVeiculo,
} from "@/lib/actions/processos-frota-financeiro";
import {
  reais,
  RECORRENCIAS,
  retratoFinanceiro,
  ROTULO_STATUS_VENCIMENTO,
  SITUACOES_FINANCEIRO,
  TIPOS_AQUISICAO,
  type StatusVencimento,
} from "@/lib/processos/frota-financeiro";

// A tela do Financeiro da Frota. Os DERIVADOS da listagem vêm prontos do
// servidor; a única conta refeita aqui é a PRÉVIA do formulário (§5.2 pede o
// vencimento em tempo real antes de salvar) — e ela usa exatamente as mesmas
// funções puras de lib/processos/frota-financeiro.ts, então não há segunda
// versão da regra para divergir.

export type LinhaFinanceiro = {
  veiculoId: string;
  placa: string;
  modelo: string;
  empresaNome: string;
  temRegistro: boolean;
  tipoAquisicao: string;
  situacao: string;
  credor: string;
  contratoNumero: string;
  valorTotal: number | null;
  valorParcela: number | null;
  qtdParcelasTotal: number | null;
  qtdParcelasPagas: number;
  dataPrimeiraParcelaInput: string;
  recorrencia: string;
  recorrenciaIntervaloDias: number | null;
  vencimentoManualInput: string;
  observacoes: string;
  status: StatusVencimento;
  vencimentoTexto: string | null;
  vencimentoTs: number | null;
  dias: number | null;
  parcelasRestantes: number | null;
  saldoDevedor: number | null;
  quitacaoPrevistaTexto: string | null;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

/** Badge do semáforo — cor + ícone + texto, nunca só a cor (§4). */
function BadgeStatus({ status }: { status: StatusVencimento }) {
  const rotuloTexto = ROTULO_STATUS_VENCIMENTO[status];
  if (status === "VENCIDO") return <Badge variant="destructive">{rotuloTexto}</Badge>;
  if (status === "PROXIMO")
    return (
      <Badge className="border-transparent bg-muted-foreground text-background hover:bg-muted-foreground">
        {rotuloTexto}
      </Badge>
    );
  if (status === "EM_DIA")
    return (
      <Badge className="border-transparent bg-success text-white hover:bg-success">
        {rotuloTexto}
      </Badge>
    );
  return <Badge variant="secondary">{rotuloTexto}</Badge>;
}

function formatarDataBr(input: string): string {
  const [a, m, d] = input.split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
}

export function FinanceiroView({
  empresaId,
  linhas,
  resumo,
}: {
  empresaId: string;
  linhas: LinhaFinanceiro[];
  resumo: { vencidos: number; proximos: number; aPagarNoMes: number; saldoDevedorTotal: number };
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmaPagar, setConfirmaPagar] = useState<string | null>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroCredor, setFiltroCredor] = useState("");

  const [form, setForm] = useState<Record<string, string> | null>(null);

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
      ) => setForm((f) => (f ? { ...f, [nome]: e.target.value } : f)),
    };
  }

  const numero = (s: string | undefined): number | null => {
    if (!s?.trim()) return null;
    const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
    return Number.isFinite(n) ? n : null;
  };

  // A PRÉVIA (§5.2): o mesmo retrato do servidor, sobre o que está digitado.
  const previa = useMemo(() => {
    if (!form) return null;
    const dataOuNull = (s: string | undefined) => (s?.trim() ? new Date(`${s}T00:00:00.000Z`) : null);
    return retratoFinanceiro(
      {
        tipoAquisicao: form.tipoAquisicao || "",
        situacao: form.situacao || "",
        valorParcela: numero(form.valorParcela),
        qtdParcelasTotal: numero(form.qtdParcelasTotal),
        qtdParcelasPagas: numero(form.qtdParcelasPagas) ?? 0,
        dataPrimeiraParcela: dataOuNull(form.dataPrimeiraParcela),
        recorrencia: form.recorrencia || "MENSAL",
        recorrenciaIntervaloDias: numero(form.recorrenciaIntervaloDias),
        dataProximoVencimento: dataOuNull(form.vencimentoManual),
      },
      new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),
    );
  }, [form]);

  const escondeParcelamento =
    form?.tipoAquisicao === "A_VISTA" || form?.situacao === "QUITADO";

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const c = filtroCredor.trim().toLowerCase();
    const resultado = linhas.filter((l) => {
      if (filtroStatus && l.status !== filtroStatus) return false;
      if (filtroTipo && l.tipoAquisicao !== filtroTipo) return false;
      if (c && !l.credor.toLowerCase().includes(c)) return false;
      if (b && ![l.placa, l.modelo].some((x) => x.toLowerCase().includes(b))) return false;
      return true;
    });
    // Ordenação padrão (§5.1): vencimento crescente — vencidos naturalmente no
    // topo (datas mais antigas) — e quem não tem data no fim.
    return resultado.sort((a, x) => {
      if (a.vencimentoTs != null && x.vencimentoTs != null) return a.vencimentoTs - x.vencimentoTs;
      if (a.vencimentoTs != null) return -1;
      if (x.vencimentoTs != null) return 1;
      return a.placa.localeCompare(x.placa);
    });
  }, [linhas, busca, filtroStatus, filtroTipo, filtroCredor]);

  function agir(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, sucesso?: string) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      if (sucesso) setAviso(sucesso);
      setForm(null);
      setConfirmaPagar(null);
      setConfirmaExcluir(null);
      router.refresh();
    });
  }

  function abrirEdicao(l: LinhaFinanceiro) {
    setErro(null);
    setAviso(null);
    setForm({
      veiculoId: l.veiculoId,
      tipoAquisicao: l.temRegistro ? l.tipoAquisicao : "FINANCIADO",
      situacao: l.temRegistro ? l.situacao : "EM_PAGAMENTO",
      credor: l.credor,
      contratoNumero: l.contratoNumero,
      valorTotal: l.valorTotal != null ? String(l.valorTotal) : "",
      valorParcela: l.valorParcela != null ? String(l.valorParcela) : "",
      qtdParcelasTotal: l.qtdParcelasTotal != null ? String(l.qtdParcelasTotal) : "",
      qtdParcelasPagas: String(l.qtdParcelasPagas),
      dataPrimeiraParcela: l.dataPrimeiraParcelaInput,
      recorrencia: l.recorrencia,
      recorrenciaIntervaloDias:
        l.recorrenciaIntervaloDias != null ? String(l.recorrenciaIntervaloDias) : "",
      vencimentoManual: l.vencimentoManualInput,
      observacoes: l.observacoes,
    });
  }

  function salvar() {
    if (!form) return;
    agir(
      () =>
        salvarFinanceiroVeiculo({
          empresaId,
          veiculoId: form.veiculoId,
          tipoAquisicao: form.tipoAquisicao,
          situacao: form.situacao,
          credor: form.credor || null,
          contratoNumero: form.contratoNumero || null,
          valorTotal: numero(form.valorTotal),
          valorParcela: numero(form.valorParcela),
          qtdParcelasTotal: numero(form.qtdParcelasTotal),
          qtdParcelasPagas: numero(form.qtdParcelasPagas) ?? 0,
          dataPrimeiraParcela: form.dataPrimeiraParcela || null,
          recorrencia: form.recorrencia,
          recorrenciaIntervaloDias: numero(form.recorrenciaIntervaloDias),
          dataProximoVencimento: form.vencimentoManual || null,
          observacoes: form.observacoes || null,
        }),
      "Financeiro salvo.",
    );
  }

  const veiculoDoForm = form ? linhas.find((l) => l.veiculoId === form.veiculoId) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Vencidos" valor={resumo.vencidos} estado={resumo.vencidos > 0 ? "alerta" : "padrao"} />
        <Indicador rotulo="Vencendo em 7 dias" valor={resumo.proximos} estado={resumo.proximos > 0 ? "alerta" : "padrao"} />
        <Indicador rotulo="A pagar no mês" valor={reais(resumo.aPagarNoMes)} />
        <Indicador rotulo="Saldo devedor da frota" valor={reais(resumo.saldoDevedorTotal)} />
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {aviso && <p className="text-sm text-success">{aviso}</p>}

      {form && (
        <Card>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <p className="sm:col-span-2 lg:col-span-3 text-sm font-medium">
              {veiculoDoForm ? `${veiculoDoForm.placa} · ${veiculoDoForm.modelo}` : "Veículo"}
            </p>

            <label className="text-xs text-muted-foreground">
              Tipo de aquisição
              <select {...campo("tipoAquisicao")} className={CAMPO}>
                {TIPOS_AQUISICAO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Situação
              <select {...campo("situacao")} className={CAMPO}>
                {SITUACOES_FINANCEIRO.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Credor (banco / consórcio / locadora)
              <input {...campo("credor")} className={CAMPO} maxLength={120} />
            </label>
            <label className="text-xs text-muted-foreground">
              Nº do contrato
              <input {...campo("contratoNumero")} className={CAMPO} maxLength={60} />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor total do contrato (R$)
              <input {...campo("valorTotal")} className={CAMPO} inputMode="decimal" />
            </label>

            {!escondeParcelamento && (
              <>
                <label className="text-xs text-muted-foreground">
                  Valor da parcela (R$)
                  <input {...campo("valorParcela")} className={CAMPO} inputMode="decimal" />
                </label>
                <label className="text-xs text-muted-foreground">
                  Total de parcelas
                  <input {...campo("qtdParcelasTotal")} className={CAMPO} inputMode="numeric" />
                </label>
                <label className="text-xs text-muted-foreground">
                  Parcelas já pagas
                  <input {...campo("qtdParcelasPagas")} className={CAMPO} inputMode="numeric" />
                </label>
                <label className="text-xs text-muted-foreground">
                  Primeira parcela
                  <input type="date" {...campo("dataPrimeiraParcela")} className={CAMPO} />
                </label>
                <label className="text-xs text-muted-foreground">
                  Recorrência
                  <select {...campo("recorrencia")} className={CAMPO}>
                    {RECORRENCIAS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
                {form.recorrencia === "PERSONALIZADA" && (
                  <label className="text-xs text-muted-foreground">
                    Intervalo (dias)
                    <input {...campo("recorrenciaIntervaloDias")} className={CAMPO} inputMode="numeric" />
                  </label>
                )}
                <label className="text-xs text-muted-foreground">
                  Próximo vencimento (manual — sobrepõe o cálculo)
                  <input type="date" {...campo("vencimentoManual")} className={CAMPO} />
                </label>
              </>
            )}

            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Observações
              <textarea {...campo("observacoes")} className={CAMPO} rows={2} maxLength={1000} />
            </label>

            {previa && !escondeParcelamento && (
              <p className="sm:col-span-2 lg:col-span-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Prévia: próximo vencimento{" "}
                <strong className="text-foreground">
                  {previa.proximoVencimento ? formatarDataBr(previa.proximoVencimento.toISOString().slice(0, 10)) : "—"}
                </strong>
                {" · "}restantes <strong className="text-foreground">{previa.parcelasRestantes ?? "—"}</strong>
                {" · "}saldo <strong className="text-foreground">{reais(previa.saldoDevedor)}</strong>
                {" · "}quitação prevista{" "}
                <strong className="text-foreground">
                  {previa.dataQuitacaoPrevista ? formatarDataBr(previa.dataQuitacaoPrevista.toISOString().slice(0, 10)) : "—"}
                </strong>
              </p>
            )}

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0 pt-0">
          <div className="flex flex-wrap items-end gap-2 px-4 pt-4 pb-1">
            <div className="relative sm:w-56">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Placa ou modelo…"
                className="pl-8"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <label className="text-xs text-muted-foreground">
              Status
              <select className={CAMPO} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos</option>
                {(Object.keys(ROTULO_STATUS_VENCIMENTO) as StatusVencimento[]).map((s) => (
                  <option key={s} value={s}>{ROTULO_STATUS_VENCIMENTO[s]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Tipo
              <select className={CAMPO} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS_AQUISICAO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Credor
              <input className={CAMPO} value={filtroCredor} onChange={(e) => setFiltroCredor(e.target.value)} />
            </label>
            <span className="pb-2 text-xs text-muted-foreground">
              {filtradas.length} de {linhas.length} veículo(s)
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veículo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Credor</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Próximo vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Saldo devedor</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum veículo com esses filtros.
                  </TableCell>
                </TableRow>
              )}
              {filtradas.map((l) => (
                <TableRow key={l.veiculoId}>
                  <TableCell>
                    <span className="font-medium tabular-nums">{l.placa}</span>
                    <span className="block text-xs text-muted-foreground">{l.modelo} · {l.empresaNome}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.temRegistro
                      ? (TIPOS_AQUISICAO.find((t) => t.value === l.tipoAquisicao)?.label ?? l.tipoAquisicao)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.credor || "—"}</TableCell>
                  <TableCell className="tabular-nums">{reais(l.valorParcela)}</TableCell>
                  <TableCell className="tabular-nums">
                    {l.qtdParcelasTotal != null ? `${l.qtdParcelasPagas}/${l.qtdParcelasTotal}` : l.temRegistro ? String(l.qtdParcelasPagas) : "—"}
                  </TableCell>
                  <TableCell>
                    {l.vencimentoTexto ? (
                      <span className="tabular-nums">
                        {l.vencimentoTexto}
                        {l.dias != null && (
                          <span className="block text-xs text-muted-foreground">
                            {l.dias < 0 ? `vencido há ${Math.abs(l.dias)} dia(s)` : `vence em ${l.dias} dia(s)`}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell><BadgeStatus status={l.status} /></TableCell>
                  <TableCell className="tabular-nums">{reais(l.saldoDevedor)}</TableCell>
                  <TableCell className="text-right">
                    {confirmaPagar === l.veiculoId ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        Confirmar parcela paga?
                        <Button
                          size="sm"
                          disabled={pendente}
                          onClick={() =>
                            agir(
                              () => registrarParcelaPaga({ empresaId, veiculoId: l.veiculoId }),
                              "Parcela registrada.",
                            )
                          }
                        >
                          Sim
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmaPagar(null)}>Não</Button>
                      </span>
                    ) : confirmaExcluir === l.veiculoId ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        Remover o financeiro? O veículo fica.
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pendente}
                          onClick={() =>
                            agir(
                              () => excluirFinanceiroVeiculo({ empresaId, veiculoId: l.veiculoId }),
                              "Registro removido.",
                            )
                          }
                        >
                          Remover
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmaExcluir(null)}>Não</Button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-1">
                        {l.temRegistro && l.situacao === "EM_PAGAMENTO" && (
                          <Button size="sm" variant="outline" onClick={() => { setConfirmaExcluir(null); setConfirmaPagar(l.veiculoId); }}>
                            Registrar parcela paga
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => abrirEdicao(l)}>
                          {l.temRegistro ? "Editar" : "Cadastrar"}
                        </Button>
                        {l.temRegistro && (
                          <Button size="sm" variant="ghost" onClick={() => { setConfirmaPagar(null); setConfirmaExcluir(l.veiculoId); }}>
                            Excluir
                          </Button>
                        )}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
