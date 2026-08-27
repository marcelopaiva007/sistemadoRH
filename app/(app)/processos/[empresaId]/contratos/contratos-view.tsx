"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrendingUp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarReais } from "@/lib/constants-beneficios";
import { registrarReajusteAplicado, salvarContrato } from "@/lib/actions/processos-contratos";
import {
  CATEGORIAS_CONTRATO,
  INDICES_REAJUSTE,
  STATUS_CONTRATO,
  TIPOS_CONTRATO,
  rotulo,
} from "@/lib/processos/contratos";

export type ContratoNaTela = {
  id: string;
  empresaId: string;
  empresaNome: string;
  numero: string;
  titulo: string;
  objeto: string | null;
  tipo: string;
  categoria: string;
  status: string;
  criticidade: string;
  gestorId: string | null;
  gestorNome: string | null;
  contraparteId: string;
  contraparteNome: string;
  dataAssinaturaInput: string;
  dataInicioInput: string;
  dataFimInput: string;
  dataFimTexto: string;
  diasParaFim: number | null;
  indeterminado: boolean;
  renovacaoAutomatica: boolean;
  avisoPrevioNaoRenovacaoDias: number | null;
  dataLimiteDenunciaTexto: string;
  diasParaDenuncia: number | null;
  janelaRenovatoriaFimTexto: string;
  locacaoNaoResidencial: boolean;
  buildToSuit: boolean;
  renunciaRevisionalPactuada: boolean;
  valorMensal: number | null;
  valorTotal: number | null;
  indiceReajuste: string | null;
  periodicidadeReajusteMeses: number | null;
  mesBaseReajuste: number | null;
  proximoReajusteTexto: string;
  /** O mês-base já chegou (ou passou) e o reajuste ainda não foi aplicado. */
  reajusteDevido: boolean;
  proximoReajusteInput: string;
  valorMensalInput: string;
  multaCompensatoriaPct: number | null;
  multaMoratoriaPct: number | null;
  foroComarca: string | null;
  foroUf: string | null;
  lgpdAplicavel: boolean;
  pontosFixacaoContratados: number | null;
  pontosFixacaoOcupados: number | null;
  observacoes: string | null;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const SECAO = "sm:col-span-2 lg:col-span-4 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function textoOuTraco(v: string | null) {
  return v && v.length > 0 ? v : "";
}

export function ContratosView({
  empresaId,
  contratos,
  contrapartes,
  gestores,
  empresas,
  statusInicial,
}: {
  empresaId: string;
  contratos: ContratoNaTela[];
  contrapartes: { id: string; razaoSocial: string; cnpjCpf: string }[];
  gestores: { id: string; nome: string }[];
  empresas: { id: string; nome: string }[];
  /** Vem da URL — a Central manda "TODOS" para o contrato do alerta aparecer. */
  statusInicial: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [filtroStatus, setFiltroStatus] = useState(statusInicial);
  const [reajuste, setReajuste] = useState<{ id: string; numero: string; data: string; valor: string } | null>(null);

  function aplicarReajuste() {
    if (!reajuste) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarReajusteAplicado({
        empresaId,
        id: reajuste.id,
        aplicadoEm: reajuste.data,
        novoValorMensal: reajuste.valor ? Number(reajuste.valor.replace(",", ".")) : null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setReajuste(null);
      router.refresh();
    });
  }

  // "Encerrado" e "cancelado" ficam fora por padrão: contrato morto não some
  // (é prova do que foi combinado, e o prazo de guarda corre do fim), mas
  // também não pode competir por atenção com o que ainda tem prazo correndo.
  const visiveis = useMemo(
    () => (filtroStatus === "TODOS" ? contratos : contratos.filter((c) => c.status === filtroStatus)),
    [contratos, filtroStatus],
  );

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...(f ?? {}), [nome]: e.target.value })),
    };
  }
  const marcado = (nome: string) => form?.[nome] === "sim";
  function alternar(nome: string) {
    setForm((f) => ({ ...(f ?? {}), [nome]: f?.[nome] === "sim" ? "" : "sim" }));
  }

  function novo() {
    setErro(null);
    setForm({ status: "VIGENTE", categoria: "DESPESA", criticidade: "NORMAL", empresaAlvo: empresaId });
  }

  // TODOS os campos entram no prefill. Campo fora do formulário na edição é
  // campo apagado no salvar — foi assim que a edição de condutor apagava a
  // validade da CNH de quem só corrigia a categoria.
  function editar(c: ContratoNaTela) {
    setErro(null);
    setForm({
      id: c.id,
      empresaAlvo: c.empresaId,
      numero: c.numero,
      titulo: c.titulo,
      objeto: textoOuTraco(c.objeto),
      contraparteId: c.contraparteId,
      tipo: c.tipo,
      categoria: c.categoria,
      status: c.status,
      criticidade: c.criticidade,
      gestorId: textoOuTraco(c.gestorId),
      dataAssinatura: c.dataAssinaturaInput,
      dataInicio: c.dataInicioInput,
      dataFim: c.dataFimInput,
      indeterminado: c.indeterminado ? "sim" : "",
      renovacaoAutomatica: c.renovacaoAutomatica ? "sim" : "",
      avisoPrevioNaoRenovacaoDias: c.avisoPrevioNaoRenovacaoDias?.toString() ?? "",
      locacaoNaoResidencial: c.locacaoNaoResidencial ? "sim" : "",
      buildToSuit: c.buildToSuit ? "sim" : "",
      renunciaRevisionalPactuada: c.renunciaRevisionalPactuada ? "sim" : "",
      valorMensal: c.valorMensal?.toString() ?? "",
      valorTotal: c.valorTotal?.toString() ?? "",
      indiceReajuste: textoOuTraco(c.indiceReajuste),
      periodicidadeReajusteMeses: c.periodicidadeReajusteMeses?.toString() ?? "",
      mesBaseReajuste: c.mesBaseReajuste?.toString() ?? "",
      multaCompensatoriaPct: c.multaCompensatoriaPct?.toString() ?? "",
      multaMoratoriaPct: c.multaMoratoriaPct?.toString() ?? "",
      foroComarca: textoOuTraco(c.foroComarca),
      foroUf: textoOuTraco(c.foroUf),
      lgpdAplicavel: c.lgpdAplicavel ? "sim" : "",
      pontosFixacaoContratados: c.pontosFixacaoContratados?.toString() ?? "",
      pontosFixacaoOcupados: c.pontosFixacaoOcupados?.toString() ?? "",
      observacoes: textoOuTraco(c.observacoes),
    });
  }

  function salvar() {
    if (!form) return;
    const numero = (v: string | undefined) => (v && v !== "" ? Number(v.replace(",", ".")) : null);
    setErro(null);
    iniciar(async () => {
      const r = await salvarContrato({
        id: form.id || null,
        empresaId,
        // O CNPJ que assina vem do FORMULÁRIO, não da URL: a tela é
        // consolidada, e cadastrar um contrato da empresa B estando na URL da
        // empresa A é o caso normal, não a exceção. O servidor confere se a
        // pessoa alcança esse CNPJ — o <select> aqui só oferece o que ela vê.
        empresaContratoId: form.empresaAlvo || empresaId,
        numero: form.numero ?? "",
        titulo: form.titulo ?? "",
        objeto: form.objeto ?? null,
        contraparteId: form.contraparteId ?? "",
        tipo: form.tipo || "OUTRO",
        categoria: form.categoria || "DESPESA",
        status: form.status || "VIGENTE",
        criticidade: form.criticidade || "NORMAL",
        gestorId: form.gestorId || null,
        dataAssinatura: form.dataAssinatura || null,
        dataInicio: form.dataInicio ?? "",
        dataFim: form.dataFim || null,
        indeterminado: form.indeterminado === "sim",
        renovacaoAutomatica: form.renovacaoAutomatica === "sim",
        avisoPrevioNaoRenovacaoDias: numero(form.avisoPrevioNaoRenovacaoDias),
        locacaoNaoResidencial: form.locacaoNaoResidencial === "sim",
        buildToSuit: form.buildToSuit === "sim",
        renunciaRevisionalPactuada: form.renunciaRevisionalPactuada === "sim",
        valorMensal: numero(form.valorMensal),
        valorTotal: numero(form.valorTotal),
        indiceReajuste: form.indiceReajuste || null,
        periodicidadeReajusteMeses: numero(form.periodicidadeReajusteMeses),
        mesBaseReajuste: numero(form.mesBaseReajuste),
        multaCompensatoriaPct: numero(form.multaCompensatoriaPct),
        multaMoratoriaPct: numero(form.multaMoratoriaPct),
        foroComarca: form.foroComarca ?? null,
        foroUf: form.foroUf ?? null,
        lgpdAplicavel: form.lgpdAplicavel === "sim",
        pontosFixacaoContratados: numero(form.pontosFixacaoContratados),
        pontosFixacaoOcupados: numero(form.pontosFixacaoOcupados),
        observacoes: form.observacoes ?? null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setForm(null);
      router.refresh();
    });
  }

  const semContraparte = contrapartes.length === 0;
  const eLocacao = marcado("locacaoNaoResidencial");
  const ePoste = form?.tipo === "COMPARTILHAMENTO_POSTE";

  // Trocar o tipo (ou desmarcar locação) LIMPA os campos que sumiram da tela.
  // Sem isto o valor continuava no estado e ia junto no salvar: um contrato de
  // fornecedor gravava "40 pontos de fixação contratados", e o dado
  // contradizia o próprio tipo do contrato sem ninguém ver.
  function trocarTipo(valor: string) {
    setForm((f) => ({
      ...(f ?? {}),
      tipo: valor,
      ...(valor === "COMPARTILHAMENTO_POSTE" ? {} : { pontosFixacaoContratados: "", pontosFixacaoOcupados: "" }),
    }));
  }
  function alternarLocacao() {
    setForm((f) => {
      const virandoLocacao = f?.locacaoNaoResidencial !== "sim";
      return {
        ...(f ?? {}),
        locacaoNaoResidencial: virandoLocacao ? "sim" : "",
        ...(virandoLocacao ? {} : { buildToSuit: "", renunciaRevisionalPactuada: "" }),
      };
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        >
          <option value="TODOS">Todos os status</option>
          {STATUS_CONTRATO.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <Button size="sm" className="gap-2" disabled={semContraparte} onClick={novo}>
          <Plus className="size-4" />
          Cadastrar contrato
        </Button>
      </div>

      {semContraparte && (
        <p className="rounded-md border border-amber-600/40 bg-amber-600/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Cadastre primeiro a contraparte — quem assina do outro lado. Ela é do grupo inteiro:
          o mesmo locador ou fornecedor serve a todos os CNPJs, sem recadastrar.
        </p>
      )}

      {reajuste && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aplicar reajuste — {reajuste.numero}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-4">
              Registrar aqui fecha a pendência e reagenda o próximo reajuste a partir desta data. Sem
              isso, o alerta deste contrato ficaria vencido para sempre.
            </p>
            <label className="text-xs text-muted-foreground">
              Passou a valer em
              <input
                type="date"
                value={reajuste.data}
                onChange={(e) => setReajuste({ ...reajuste, data: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Novo valor mensal (R$)
              <input
                type="number"
                step="0.01"
                value={reajuste.valor}
                onChange={(e) => setReajuste({ ...reajuste, valor: e.target.value })}
                className={CAMPO}
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Em branco mantém o valor atual.
              </span>
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button size="sm" disabled={pendente} onClick={aplicarReajuste}>Registrar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setReajuste(null); setErro(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {form && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{form.id ? "Editar contrato" : "Cadastrar contrato"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p className={SECAO}>Identificação</p>
            <label className="text-xs text-muted-foreground">
              Empresa (CNPJ que assina)
              <select {...campo("empresaAlvo")} className={CAMPO}>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
              {form.id && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  Dá para corrigir: contrato não se apaga, então o CNPJ errado precisa ter conserto.
                </span>
              )}
            </label>
            <label className="text-xs text-muted-foreground">
              Número
              <input {...campo("numero")} className={CAMPO} placeholder="CT-2026-014" />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Título
              <input {...campo("titulo")} className={CAMPO} placeholder="Locação da torre — Sítio Boa Vista" />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Contraparte
              <select {...campo("contraparteId")} className={CAMPO}>
                <option value="">Escolha…</option>
                {contrapartes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razaoSocial}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Tipo
              <select
                value={form.tipo ?? ""}
                onChange={(e) => trocarTipo(e.target.value)}
                className={CAMPO}
              >
                <option value="">Escolha…</option>
                {TIPOS_CONTRATO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Natureza
              <select {...campo("categoria")} className={CAMPO}>
                {/* Receita sai das opções: aluguel a receber se cadastra na
                    tela de Aluguéis (decisão do dono, 27/08/2026). */}
                {CATEGORIAS_CONTRATO.filter((c) => c.value !== "RECEITA").map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Status
              <select {...campo("status")} className={CAMPO}>
                {STATUS_CONTRATO.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Criticidade
              <select {...campo("criticidade")} className={CAMPO}>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Gestor responsável
              <select {...campo("gestorId")} className={CAMPO}>
                <option value="">Sem gestor</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Vira o dono das pendências deste contrato na Central.
              </span>
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Objeto
              <textarea {...campo("objeto")} rows={2} className={CAMPO} />
            </label>

            <p className={SECAO}>Vigência</p>
            <label className="text-xs text-muted-foreground">
              Assinatura
              <input {...campo("dataAssinatura")} type="date" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Início da vigência
              <input {...campo("dataInicio")} type="date" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Fim da vigência
              <input {...campo("dataFim")} type="date" className={CAMPO} disabled={marcado("indeterminado")} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marcado("indeterminado")}
                onChange={() => alternar("indeterminado")}
                className="size-4"
              />
              Prazo indeterminado
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marcado("renovacaoAutomatica")}
                onChange={() => alternar("renovacaoAutomatica")}
                className="size-4"
              />
              Renova automaticamente
            </label>
            <label className="text-xs text-muted-foreground">
              Aviso prévio de não-renovação (dias)
              <input {...campo("avisoPrevioNaoRenovacaoDias")} type="number" min={1} className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Copie da cláusula. É daqui que sai a data-limite para dizer que não renova — se ela
                couber dentro da vigência.
              </span>
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={eLocacao}
                onChange={alternarLocacao}
                className="size-4"
              />
              Locação não residencial
            </label>
            {eLocacao && (
              <>
                <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-4">
                  A janela da ação renovatória (12 a 6 meses antes do fim) é calculada sozinha a
                  partir da data de fim. Perdida, o direito decai — não se suspende nem se
                  interrompe, nem com negociação em andamento (Lei 8.245/1991, art. 51, §5º).
                </p>
                <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={marcado("buildToSuit")}
                    onChange={() => alternar("buildToSuit")}
                    className="size-4"
                  />
                  Build to suit (art. 54-A)
                </label>
                <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={marcado("renunciaRevisionalPactuada")}
                    onChange={() => alternar("renunciaRevisionalPactuada")}
                    className="size-4"
                  />
                  Renúncia ao direito de revisão pactuada
                </label>
              </>
            )}

            <p className={SECAO}>Financeiro e reajuste</p>
            <label className="text-xs text-muted-foreground">
              Valor mensal (R$)
              <input {...campo("valorMensal")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor total (R$)
              <input {...campo("valorTotal")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Índice de reajuste
              <select {...campo("indiceReajuste")} className={CAMPO}>
                <option value="">Não informado</option>
                {INDICES_REAJUSTE.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Periodicidade (meses)
              <input {...campo("periodicidadeReajusteMeses")} type="number" min={12} className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Mínimo 12 — abaixo disso a cláusula é nula (Lei 10.192/2001, art. 2º, §1º).
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Mês-base do reajuste
              <select {...campo("mesBaseReajuste")} className={CAMPO}>
                <option value="">Não informado</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>

            <p className={SECAO}>Jurídico</p>
            <label className="text-xs text-muted-foreground">
              Multa compensatória (%)
              <input {...campo("multaCompensatoriaPct")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Multa moratória (%)
              <input {...campo("multaMoratoriaPct")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Foro — comarca
              <input {...campo("foroComarca")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Foro — UF
              <input {...campo("foroUf")} className={CAMPO} maxLength={2} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marcado("lgpdAplicavel")}
                onChange={() => alternar("lgpdAplicavel")}
                className="size-4"
              />
              Há tratamento de dados pessoais
            </label>
            {ePoste && (
              <>
                <label className="text-xs text-muted-foreground">
                  Pontos de fixação contratados
                  <input {...campo("pontosFixacaoContratados")} type="number" min={0} className={CAMPO} />
                </label>
                <label className="text-xs text-muted-foreground">
                  Pontos de fixação ocupados
                  <input {...campo("pontosFixacaoOcupados")} type="number" min={0} className={CAMPO} />
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                    Ocupar mais que o contratado é a origem da cobrança retroativa da distribuidora.
                  </span>
                </label>
              </>
            )}
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Observações
              <textarea {...campo("observacoes")} rows={2} className={CAMPO} />
            </label>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setErro(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Contraparte</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead>Vigência até</TableHead>
                <TableHead>Decidir renovação</TableHead>
                <TableHead className="text-right">Valor/mês</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {contratos.length === 0
                      ? "Nenhum contrato cadastrado. Sem contrato cadastrado, nenhum prazo de renovação é cobrado."
                      : "Nenhum contrato com este status."}
                  </TableCell>
                </TableRow>
              )}
              {visiveis.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="font-medium">{c.numero}</span>
                    <span className="block text-xs text-muted-foreground">{c.titulo}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      <Badge variant="secondary">{rotulo(TIPOS_CONTRATO, c.tipo)}</Badge>
                      {c.status !== "VIGENTE" && (
                        <Badge variant="outline">{rotulo(STATUS_CONTRATO, c.status)}</Badge>
                      )}
                      {c.criticidade === "ALTA" && <Badge variant="destructive">Crítico</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.contraparteNome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.empresaNome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.gestorNome ?? <span className="text-amber-600 dark:text-amber-500">sem gestor</span>}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular-nums",
                      c.diasParaFim !== null && c.diasParaFim < 0 && "font-semibold text-destructive",
                      c.diasParaFim !== null && c.diasParaFim >= 0 && c.diasParaFim <= 90 &&
                        "text-amber-600 dark:text-amber-500",
                    )}
                  >
                    {c.dataFimTexto}
                    {c.janelaRenovatoriaFimTexto && (
                      <span className="block text-[11px] text-muted-foreground">
                        renovatória até {c.janelaRenovatoriaFimTexto}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {c.dataLimiteDenunciaTexto ? (
                      <span
                        className={cn(
                          c.diasParaDenuncia !== null && c.diasParaDenuncia < 0 &&
                            "font-semibold text-destructive",
                          c.diasParaDenuncia !== null && c.diasParaDenuncia >= 0 &&
                            c.diasParaDenuncia <= 30 && "text-amber-600 dark:text-amber-500",
                        )}
                      >
                        {c.dataLimiteDenunciaTexto}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {c.renovacaoAutomatica && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <TriangleAlert className="size-3" />
                        renova sozinho
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.valorMensal !== null ? formatarReais(c.valorMensal) : "—"}
                    {c.proximoReajusteTexto && (
                      <span className="block text-[11px] text-muted-foreground">
                        reajuste em {c.proximoReajusteTexto}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {c.reajusteDevido && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-1 gap-1"
                        onClick={() =>
                          setReajuste({
                            id: c.id,
                            numero: c.numero,
                            data: c.proximoReajusteInput,
                            valor: c.valorMensalInput,
                          })
                        }
                      >
                        <TrendingUp className="size-4" />
                        Aplicar reajuste
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => editar(c)}>
                      <Pencil className="size-4" />
                    </Button>
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
