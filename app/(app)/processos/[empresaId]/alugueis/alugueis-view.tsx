"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDollarSign, Pencil, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Indicador } from "@/components/indicador";
import { formatarReais } from "@/lib/constants-beneficios";
import {
  desfazerRecebimento,
  gerarParcelas,
  registrarRecebimento,
} from "@/lib/actions/processos-alugueis";
import { salvarContrato } from "@/lib/actions/processos-contratos";
import { STATUS_CONTRATO, rotulo } from "@/lib/processos/contratos";
import Link from "next/link";

type Parcela = {
  id: string;
  competencia: string;
  vencimentoTexto: string;
  vencimentoInput: string;
  vencido: boolean;
  valorPrevisto: number;
  recebido: boolean;
  recebidoEmTexto: string;
  valorRecebido: number | null;
};

export type ContratoDeAluguel = {
  id: string;
  empresaId: string;
  empresaNome: string;
  numero: string;
  titulo: string;
  status: string;
  tipo: string;
  inquilino: string;
  contraparteId: string;
  valorMensal: number | null;
  dataInicioInput: string;
  dataFimInput: string;
  indeterminado: boolean;
  /** Status conta nos totais e pode gerar parcela (VIGENTE/EM_RENOVACAO/SUSPENSO). */
  prazoCorrendo: boolean;
  diaVencimentoSugerido: number | null;
  podeEstender: boolean;
  parcelas: Parcela[];
};

type Opcao = { id: string; nome?: string; razaoSocial?: string };

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function AlugueisView({
  empresaId,
  contratos,
  empresas,
  contrapartes,
}: {
  empresaId: string;
  contratos: ContratoDeAluguel[];
  empresas: Opcao[];
  contrapartes: Opcao[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // O formulário do CONTRATO de aluguel — vive nesta tela por decisão do dono
  // (27/08/2026): aluguel a receber não se mistura com os contratos de
  // despesa. Motor único: grava pelo mesmo salvarContrato, com a categoria
  // RECEITA fixada aqui.
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});

  function abrirNovo() {
    setF({ empresa: empresas[0]?.id ?? "", status: "VIGENTE", indeterminado: "sim" });
    setEditandoId(null);
    setFormAberto(true);
    setErro(null);
  }

  function abrirEdicao(c: ContratoDeAluguel) {
    setF({
      empresa: c.empresaId,
      contraparte: c.contraparteId,
      numero: c.numero,
      titulo: c.titulo,
      valorMensal: c.valorMensal !== null ? String(c.valorMensal) : "",
      dataInicio: c.dataInicioInput,
      dataFim: c.dataFimInput,
      indeterminado: c.indeterminado || c.dataFimInput === "" ? "sim" : "nao",
      status: c.status,
    });
    setEditandoId(c.id);
    setFormAberto(true);
    setErro(null);
  }

  function salvar() {
    setErro(null);
    setAviso(null);
    const contratoEditado = contratos.find((c) => c.id === editandoId);
    iniciar(async () => {
      const r = await salvarContrato({
        id: editandoId,
        empresaId,
        empresaContratoId: f.empresa,
        numero: f.numero ?? "",
        contraparteId: f.contraparte ?? "",
        // Receita fixa: é o que faz este contrato ser um aluguel a receber.
        categoria: "RECEITA",
        tipo: contratoEditado?.tipo ?? "LOCACAO_IMOVEL",
        titulo: f.titulo ?? "",
        status: f.status || "VIGENTE",
        dataInicio: f.dataInicio ?? "",
        indeterminado: f.indeterminado !== "nao",
        dataFim: f.indeterminado !== "nao" ? null : f.dataFim || null,
        valorMensal: f.valorMensal ? Number(f.valorMensal.replace(",", ".")) : null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setFormAberto(false);
      setAviso(editandoId ? "Contrato de aluguel atualizado." : "Contrato de aluguel cadastrado — agora escolha o dia de vencimento e gere as parcelas.");
      router.refresh();
    });
  }
  const [receber, setReceber] = useState<{ id: string; data: string; valor: string } | null>(null);
  const [diaVenc, setDiaVenc] = useState<Record<string, string>>({});

  // O resumo do que a tela mostra, somando todas as parcelas visíveis.
  const resumo = useMemo(() => {
    let aReceber = 0;
    let emAtraso = 0;
    let recebido = 0;
    let qtdAtraso = 0;
    for (const c of contratos) {
      // Rascunho/encerrado/cancelado ficam fora dos totais — mesma régua da
      // Central (STATUS_COM_PRAZO_CORRENDO), calculada no servidor.
      if (!c.prazoCorrendo) continue;
      for (const p of c.parcelas) {
        if (p.recebido) recebido += p.valorRecebido ?? p.valorPrevisto;
        else {
          aReceber += p.valorPrevisto;
          if (p.vencido) {
            emAtraso += p.valorPrevisto;
            qtdAtraso++;
          }
        }
      }
    }
    return { aReceber, emAtraso, recebido, qtdAtraso };
  }, [contratos]);

  function gerar(contrato: ContratoDeAluguel) {
    const dia = Number(diaVenc[contrato.id] ?? "");
    if (!dia || dia < 1 || dia > 31) {
      setErro("Escolha o dia de vencimento (1 a 31) antes de gerar as parcelas.");
      return;
    }
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await gerarParcelas({ empresaId, contratoId: contrato.id, diaVencimento: dia });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setAviso(`${r.criadas ?? 0} parcela(s) geradas para o contrato ${contrato.numero}.`);
      router.refresh();
    });
  }

  function confirmarRecebimento() {
    if (!receber) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarRecebimento({
        empresaId,
        id: receber.id,
        recebidoEm: receber.data,
        valorRecebido: receber.valor ? Number(receber.valor.replace(",", ".")) : null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setReceber(null);
      router.refresh();
    });
  }

  function desfazer(id: string) {
    setErro(null);
    iniciar(async () => {
      const r = await desfazerRecebimento({ empresaId, id });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-success bg-card px-3 py-2 text-sm text-success">
          {aviso}
        </p>
      )}

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={abrirNovo}>
          <Plus className="size-4" />
          Cadastrar contrato de aluguel
        </Button>
      </div>

      {formAberto && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {editandoId ? "Editar contrato de aluguel" : "Novo contrato de aluguel"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-muted-foreground">
                Empresa dona do imóvel (CNPJ)
                <select value={f.empresa ?? ""} onChange={(e) => setF({ ...f, empresa: e.target.value })} className={CAMPO}>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Inquilino (contraparte)
                <select value={f.contraparte ?? ""} onChange={(e) => setF({ ...f, contraparte: e.target.value })} className={CAMPO}>
                  <option value="">Escolha…</option>
                  {contrapartes.map((c) => (
                    <option key={c.id} value={c.id}>{c.razaoSocial}</option>
                  ))}
                </select>
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  Não está na lista?{" "}
                  <Link href={`/processos/${empresaId}/contratos/contrapartes`} className="underline underline-offset-2">
                    Cadastre a contraparte
                  </Link>{" "}
                  e volte.
                </span>
              </label>
              <label className="text-xs text-muted-foreground">
                Número do contrato
                <input value={f.numero ?? ""} onChange={(e) => setF({ ...f, numero: e.target.value })} className={CAMPO} placeholder="Ex.: ALU-001" />
              </label>
              <label className="text-xs text-muted-foreground sm:col-span-2">
                Imóvel / título
                <input value={f.titulo ?? ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} className={CAMPO} placeholder="Ex.: Sala comercial — Rua X, 123, Guarabira" />
              </label>
              <label className="text-xs text-muted-foreground">
                Valor mensal (R$)
                <input type="number" step="0.01" value={f.valorMensal ?? ""} onChange={(e) => setF({ ...f, valorMensal: e.target.value })} className={CAMPO} />
              </label>
              <label className="text-xs text-muted-foreground">
                Início da vigência
                <input type="date" value={f.dataInicio ?? ""} onChange={(e) => setF({ ...f, dataInicio: e.target.value })} className={CAMPO} />
              </label>
              <label className="text-xs text-muted-foreground">
                Prazo
                <select value={f.indeterminado ?? "sim"} onChange={(e) => setF({ ...f, indeterminado: e.target.value })} className={CAMPO}>
                  <option value="sim">Indeterminado</option>
                  <option value="nao">Com data de fim</option>
                </select>
              </label>
              {f.indeterminado === "nao" && (
                <label className="text-xs text-muted-foreground">
                  Fim da vigência
                  <input type="date" value={f.dataFim ?? ""} onChange={(e) => setF({ ...f, dataFim: e.target.value })} className={CAMPO} />
                </label>
              )}
              <label className="text-xs text-muted-foreground">
                Status
                <select value={f.status ?? "VIGENTE"} onChange={(e) => setF({ ...f, status: e.target.value })} className={CAMPO}>
                  {STATUS_CONTRATO.map((st) => (
                    <option key={st.value} value={st.value}>{st.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={pendente} onClick={salvar}>
                {editandoId ? "Salvar alterações" : "Cadastrar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setFormAberto(false); setErro(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="A receber (em aberto)" valor={formatarReais(resumo.aReceber)} />
        <Indicador
          icone={resumo.qtdAtraso > 0 ? <span className="text-destructive">●</span> : undefined}
          rotulo="Em atraso"
          valor={formatarReais(resumo.emAtraso)}
        />
        <Indicador rotulo="Recebido" valor={formatarReais(resumo.recebido)} />
      </div>

      {receber && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registrar recebimento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Recebido em
              <input
                type="date"
                value={receber.data}
                onChange={(e) => setReceber({ ...receber, data: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor recebido (R$)
              <input
                type="number"
                step="0.01"
                value={receber.valor}
                onChange={(e) => setReceber({ ...receber, valor: e.target.value })}
                className={CAMPO}
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Em branco = o valor previsto da parcela.
              </span>
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button size="sm" disabled={pendente} onClick={confirmarRecebimento}>Confirmar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setReceber(null); setErro(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contratos.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum contrato de aluguel cadastrado ainda. Clique em{" "}
            <strong className="text-foreground">&ldquo;Cadastrar contrato de aluguel&rdquo;</strong>{" "}
            acima — o inquilino (contraparte) se cadastra uma vez e serve ao grupo inteiro.
          </CardContent>
        </Card>
      )}

      {contratos.map((c) => (
        <Card key={c.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleDollarSign className="size-4 text-muted-foreground" />
                  {c.numero} — {c.inquilino}
                  {c.status !== "VIGENTE" && <Badge variant="outline">{rotulo(STATUS_CONTRATO, c.status)}</Badge>}
                  <Button size="sm" variant="ghost" title="Editar contrato" onClick={() => abrirEdicao(c)}>
                    <Pencil className="size-4 text-muted-foreground" />
                  </Button>
                </CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {c.titulo}
                  {c.empresaNome && <span className="ml-2 text-xs">· {c.empresaNome}</span>}
                </p>
              </div>
              {(c.parcelas.length === 0 || c.podeEstender) && (
                <div className="flex items-end gap-2">
                  <label className="text-xs text-muted-foreground">
                    Dia do vencimento
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={diaVenc[c.id] ?? (c.diaVencimentoSugerido ? String(c.diaVencimentoSugerido) : "")}
                      onChange={(e) => setDiaVenc((d) => ({ ...d, [c.id]: e.target.value }))}
                      className={cn(CAMPO, "w-28")}
                    />
                  </label>
                  <Button size="sm" variant={c.parcelas.length === 0 ? "default" : "outline"} disabled={pendente} onClick={() => gerar(c)}>
                    {c.parcelas.length === 0 ? "Gerar parcelas" : "Estender parcelas"}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {c.parcelas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {c.valorMensal === null
                  ? "Este contrato não tem valor mensal — edite-o (lápis acima) para gerar as parcelas."
                  : "Escolha o dia de vencimento e gere as parcelas mensais deste contrato."}
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {c.parcelas.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                      p.recebido
                        ? "border-success bg-card"
                        : p.vencido
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-border",
                    )}
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{p.competencia}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {p.recebido ? (
                          <>recebido {p.recebidoEmTexto} · {formatarReais(p.valorRecebido ?? p.valorPrevisto)}</>
                        ) : (
                          <span className={cn(p.vencido && "text-destructive")}>
                            {p.vencido && (
                              <TriangleAlert className="mr-0.5 inline size-3 align-[-1px]" />
                            )}
                            vence {p.vencimentoTexto} · {formatarReais(p.valorPrevisto)}
                          </span>
                        )}
                      </span>
                    </div>
                    {p.recebido ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Desfazer"
                        disabled={pendente}
                        onClick={() => desfazer(p.id)}
                      >
                        <RotateCcw className="size-4 text-muted-foreground" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 whitespace-nowrap"
                        onClick={() =>
                          setReceber({ id: p.id, data: p.vencimentoInput, valor: String(p.valorPrevisto) })
                        }
                      >
                        <Check className="size-4" />
                        Recebi
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
