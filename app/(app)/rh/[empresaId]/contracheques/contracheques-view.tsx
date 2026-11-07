"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  Camera,
  Download,
  FileCheck,
  Inbox,
  Lock,
  Mail,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { cn } from "@/lib/utils";
import {
  cobrarPendentesTelegramAction,
  enviarContrachequesAction,
  reenviarEmailContrachequeAction,
} from "@/lib/actions/rh-contracheques";
import { SITUACAO_LABEL, type Situacao } from "@/lib/contracheques/situacao";
import { montarCsvContracheques } from "@/lib/contracheques/exportar";
import { classeSelect } from "../colaboradores/[colaboradorId]/campos";

export type LinhaContracheque = {
  documentoId: string;
  empresaId: string;
  arquivoId: string | null;
  pessoa: string;
  cpf: string;
  colaboradorId: string;
  desligado: boolean;
  empresa: string;
  cnpj: string;
  setor: string;
  temTelegram: boolean;
  temEmail: boolean;
  email: string | null;
  folha: string;
  situacao: Situacao;
  enviadoEm: string | null;
  canal: string | null;
  envioErro: string | null;
  envios: number;
  cienciaTelegramEm: string | null;
  vistoEm: string | null;
  confirmadoEm: string | null;
  confirmadoIp: string | null;
  hashDocumento: string | null;
  fotoArquivoId: string | null;
  comprovanteArquivoId: string | null;
  lembretesEnviados: number;
  bloqueado: boolean;
};

const COR: Record<Situacao, string> = {
  NAO_ENVIADO: "bg-muted text-muted-foreground",
  SEM_CANAL: "bg-destructive/10 text-destructive",
  ENVIADO: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  CIENTE: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ABERTO: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  CONFIRMADO: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  ATRASADO: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  BLOQUEADO: "bg-red-500/10 text-red-700 dark:text-red-400",
};

const FILTROS: { valor: Situacao | "TODOS"; rotulo: string }[] = [
  { valor: "TODOS", rotulo: "Todos" },
  { valor: "NAO_ENVIADO", rotulo: "Não enviados" },
  { valor: "CIENTE", rotulo: "Cientes no bot" },
  { valor: "ABERTO", rotulo: "Abertos na tela" },
  { valor: "CONFIRMADO", rotulo: "Assinados" },
  { valor: "ATRASADO", rotulo: "Atrasados (>5 dias)" },
  { valor: "BLOQUEADO", rotulo: "Bloqueados" },
  { valor: "SEM_CANAL", rotulo: "Sem contato" },
];

const mesAno = (chave: string) => `${chave.slice(5, 7)}/${chave.slice(0, 4)}`;

export function ContrachequesView({
  empresaId,
  competencias,
  competencia,
  linhas,
}: {
  empresaId: string;
  competencias: { chave: string; total: number }[];
  competencia: string | null;
  linhas: LinhaContracheque[];
}) {
  const router = useRouter();
  const busca = useSearchParams();
  const [filtro, setFiltro] = useState<Situacao | "TODOS">("TODOS");
  const [soPendentes, setSoPendentes] = useState(false);
  const [setorFiltro, setSetorFiltro] = useState("TODOS");
  const [enviando, iniciar] = useTransition();
  const [emEnvio, setEmEnvio] = useState<string | null>(null);

  // Setores únicos
  const setores = useMemo(() => {
    const s = new Set(linhas.map((l) => l.setor).filter((x) => x && x !== "—"));
    return ["TODOS", ...Array.from(s).sort()];
  }, [linhas]);

  // Contadores
  const conta = (s: Situacao) => linhas.filter((l) => l.situacao === s).length;
  const cientes = linhas.filter((l) => l.cienciaTelegramEm !== null).length;
  const abertos = linhas.filter((l) => l.vistoEm !== null).length;
  const assinados = conta("CONFIRMADO");
  const pendentes = linhas.filter((l) => l.situacao !== "CONFIRMADO");
  const comProblema = linhas.filter((l) => !l.temEmail || !l.temTelegram || l.bloqueado).length;

  // Percentual assinado por CNPJ
  const taxaPorCnpj = useMemo(() => {
    const agrupado: Record<string, { nome: string; total: number; assinados: number }> = {};
    for (const l of linhas) {
      const item = (agrupado[l.cnpj] ??= { nome: l.empresa, total: 0, assinados: 0 });
      item.total++;
      if (l.situacao === "CONFIRMADO") item.assinados++;
    }
    return Object.entries(agrupado).map(([cnpj, v]) => ({
      cnpj,
      nome: v.nome,
      taxa: v.total > 0 ? Math.round((v.assinados / v.total) * 100) : 0,
      total: v.total,
      assinados: v.assinados,
    }));
  }, [linhas]);

  // Filtragem da lista
  const visiveis = useMemo(() => {
    return linhas.filter((l) => {
      if (soPendentes && l.situacao === "CONFIRMADO") return false;
      if (filtro !== "TODOS" && l.situacao !== filtro) return false;
      if (setorFiltro !== "TODOS" && l.setor !== setorFiltro) return false;
      return true;
    });
  }, [linhas, filtro, soPendentes, setorFiltro]);

  const naoEnviados = linhas.filter((l) => l.situacao === "NAO_ENVIADO");

  const trocarCompetencia = (chave: string) => {
    const p = new URLSearchParams(busca.toString());
    p.set("competencia", chave);
    router.push(`?${p.toString()}`);
  };

  // Disparo em lote inicial
  const enviar = (ids: string[], marca: string) => {
    if (!competencia || ids.length === 0) return;
    setEmEnvio(marca);
    iniciar(async () => {
      const r = await enviarContrachequesAction(empresaId, competencia, ids);
      setEmEnvio(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const partes = [`${r.avisados} avisado(s)`];
      if (r.semCanal) partes.push(`${r.semCanal} sem e-mail`);
      if (r.jaConfirmados) partes.push(`${r.jaConfirmados} já tinham assinado`);
      if (r.falhas) partes.push(`${r.falhas} com falha`);
      (r.semCanal || r.falhas ? toast.warning : toast.success)(partes.join(" · "));
      router.refresh();
    });
  };

  // Cobrança no Telegram em lote
  const cobrarTodosPendentes = () => {
    if (!competencia) return;
    const pendentesComTelegram = visiveis.filter((l) => l.situacao !== "CONFIRMADO" && l.temTelegram);
    if (pendentesComTelegram.length === 0) {
      toast.info("Nenhum colaborador pendente com Telegram vinculado para cobrar.");
      return;
    }

    if (
      !confirm(
        `Disparar mensagem de lembrete no Telegram para ${pendentesComTelegram.length} pessoa(s) pendente(s) desta competência?`
      )
    )
      return;

    setEmEnvio("cobranca-lote");
    iniciar(async () => {
      const r = await cobrarPendentesTelegramAction(
        empresaId,
        competencia,
        pendentesComTelegram.map((l) => l.documentoId)
      );
      setEmEnvio(null);
      if (r.ok) {
        toast.success(`Lembrete enviado para ${r.cobrados} colaborador(es) no Telegram.`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  // Reenviar individual (zera bloqueio e emite novo token)
  const reenviarIndividual = (documentoId: string) => {
    setEmEnvio(documentoId);
    iniciar(async () => {
      const r = await reenviarEmailContrachequeAction(empresaId, documentoId);
      setEmEnvio(null);
      if (r.ok) {
        toast.success("E-mail reenviado com novo link de assinatura. Bloqueio zerado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  // Cobrar individual no Telegram
  const cobrarIndividual = (documentoId: string) => {
    if (!competencia) return;
    setEmEnvio(documentoId);
    iniciar(async () => {
      const r = await cobrarPendentesTelegramAction(empresaId, competencia, [documentoId]);
      setEmEnvio(null);
      if (r.ok) {
        toast.success("Lembrete enviado no Telegram.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  // Exportar CSV
  const exportarCsv = () => {
    const dados = visiveis.map((l) => ({
      colaboradorNome: l.pessoa,
      colaboradorCpf: l.cpf,
      empresaNome: l.empresa,
      cnpj: l.cnpj,
      setor: l.setor,
      email: l.email ?? "—",
      temTelegram: l.temTelegram ? "Sim" : "Não",
      folha: l.folha,
      situacao: SITUACAO_LABEL[l.situacao] ?? l.situacao,
      enviadoEm: l.enviadoEm ?? "—",
      cienciaEm: l.cienciaTelegramEm ?? "—",
      vistoEm: l.vistoEm ?? "—",
      confirmadoEm: l.confirmadoEm ?? "—",
      ip: l.confirmadoIp ?? "—",
      hash: l.hashDocumento ?? "—",
      lembretesEnviados: l.lembretesEnviados,
    }));

    const csvConteudo = montarCsvContracheques(dados);
    const blob = new Blob([csvConteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `contracheques-${competencia ?? "competencia"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Relatório CSV baixado com sucesso.");
  };

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Contracheques com Assinatura Eletrônica"
        resumo={
          <>
            Envie o contracheque mensal por e-mail com link exclusivo de assinatura. O colaborador autentica informando seu CPF,
            confere o PDF, tira a selfie e assina. O Telegram avisa e cobra até que o status seja concluído.
          </>
        }
      />

      {competencias.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 size-8" aria-hidden />
          Nenhum contracheque no Dossiê ainda. Solte o arquivo do contador na{" "}
          <Link href={`/rh/${empresaId}/caixa-documentos`} className="font-semibold underline">
            Caixa de documentos
          </Link>{" "}
          — cada contracheque vai para a ficha da pessoa e aparece aqui.
        </div>
      ) : (
        <>
          {/* Barra de Ações do Topo */}
          <div className="flex flex-wrap items-end justify-between gap-3 bg-muted/20 p-3 rounded-lg border">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm">
                <span className="block text-xs font-medium text-muted-foreground">Competência</span>
                <select
                  className={cn(classeSelect, "w-40")}
                  value={competencia ?? ""}
                  onChange={(e) => trocarCompetencia(e.target.value)}
                >
                  {competencias.map((c) => (
                    <option key={c.chave} value={c.chave}>
                      {mesAno(c.chave)} ({c.total})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="block text-xs font-medium text-muted-foreground">Setor</span>
                <select
                  className={cn(classeSelect, "w-44")}
                  value={setorFiltro}
                  onChange={(e) => setSetorFiltro(e.target.value)}
                >
                  {setores.map((s) => (
                    <option key={s} value={s}>
                      {s === "TODOS" ? "Todos os setores" : s}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                disabled={naoEnviados.length === 0 || enviando}
                onClick={() => {
                  if (confirm(`Enviar o e-mail de assinatura de ${mesAno(competencia!)} para ${naoEnviados.length} colaborador(es)?`)) {
                    enviar(
                      naoEnviados.map((l) => l.documentoId),
                      "todos"
                    );
                  }
                }}
              >
                <Send className="size-4 mr-1.5" aria-hidden />
                {emEnvio === "todos"
                  ? "Enviando..."
                  : naoEnviados.length === 0
                  ? "Todos enviados"
                  : `Enviar a ${naoEnviados.length} pendentes`}
              </Button>

              <Button
                variant="outline"
                disabled={enviando || pendentes.length === 0}
                onClick={cobrarTodosPendentes}
                className="gap-1.5"
              >
                <Bell className="size-4 text-amber-600" aria-hidden />
                Cobrar pendentes no Telegram
              </Button>
            </div>

            <div>
              <Button variant="secondary" size="sm" onClick={exportarCsv} className="gap-1.5">
                <Download className="size-4" /> Exportar CSV
              </Button>
            </div>
          </div>

          {/* Faixa de 6 Indicadores */}
          <FaixaDeIndicadores colunas={6}>
            <Indicador
              rotulo="Enviados"
              valor={linhas.length - naoEnviados.length}
              complemento={`${linhas.length} no total`}
            />
            <Indicador
              rotulo="Cientes no Telegram"
              valor={cientes}
              complemento={linhas.length ? `${Math.round((cientes / linhas.length) * 100)}% cientes` : "—"}
            />
            <Indicador
              rotulo="Abertos na Tela"
              valor={abertos}
              complemento="leram o documento"
            />
            <Indicador
              rotulo="Assinados com Foto"
              valor={assinados}
              complemento={linhas.length ? `${Math.round((assinados / linhas.length) * 100)}% concluído` : "—"}
              estado={assinados === linhas.length && linhas.length > 0 ? "padrao" : "atencao"}
            />
            <Indicador
              rotulo="Pendentes"
              valor={pendentes.length}
              complemento={`${conta("ATRASADO")} em atraso`}
              estado={conta("ATRASADO") > 0 ? "alerta" : "padrao"}
            />
            <Indicador
              rotulo="Com Problema"
              valor={comProblema}
              complemento="sem e-mail/Telegram/bloq"
              estado={comProblema > 0 ? "alerta" : "padrao"}
            />
          </FaixaDeIndicadores>

          {/* Discriminativo por CNPJ */}
          {taxaPorCnpj.length > 1 && (
            <div className="flex flex-wrap gap-2 text-xs bg-slate-50 p-2.5 rounded border text-slate-600">
              <span className="font-semibold text-slate-800">Adesão por Empresa:</span>
              {taxaPorCnpj.map((t) => (
                <span key={t.cnpj} className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border">
                  <span>{t.nome}:</span>
                  <b className={t.taxa >= 80 ? "text-emerald-600" : "text-amber-600"}>
                    {t.taxa}% ({t.assinados}/{t.total})
                  </b>
                </span>
              ))}
            </div>
          )}

          {/* Filtros em Pills e Toggle Só Pendentes */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
              {FILTROS.map((f) => {
                const totalFiltro =
                  f.valor === "TODOS"
                    ? linhas.length
                    : f.valor === "SEM_CANAL"
                    ? linhas.filter((l) => !l.temEmail || !l.temTelegram).length
                    : conta(f.valor);

                return (
                  <Button
                    key={f.valor}
                    size="sm"
                    variant={filtro === f.valor ? "default" : "outline"}
                    onClick={() => setFiltro(f.valor)}
                    className="text-xs h-7"
                  >
                    {f.rotulo}
                    <span className="ml-1 opacity-75">({totalFiltro})</span>
                  </Button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="soPendentes"
                checked={soPendentes}
                onCheckedChange={(c) => setSoPendentes(c === true)}
              />
              <label htmlFor="soPendentes" className="text-xs font-medium cursor-pointer text-slate-700">
                Apenas pendentes de assinatura
              </label>
            </div>
          </div>

          {/* Tabela de Colaboradores */}
          <div className="overflow-x-auto rounded-md border bg-white">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Trilha de Datas</TableHead>
                  <TableHead>Cobranças</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum colaborador encontrado com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
                {visiveis.map((l) => (
                  <TableRow key={l.documentoId}>
                    {/* Colaborador */}
                    <TableCell className="text-sm">
                      <Link
                        href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}?tab=dossie`}
                        className="font-medium hover:underline text-slate-900"
                      >
                        {l.pessoa}
                      </Link>
                      {l.desligado && <span className="ml-1 text-xs text-destructive">(desligado)</span>}
                      <span className="block text-xs text-muted-foreground">
                        CPF: {l.cpf} · {l.empresa} ({l.setor})
                      </span>
                    </TableCell>

                    {/* Contato */}
                    <TableCell className="text-xs space-y-1">
                      <div className="flex items-center gap-1 text-slate-700">
                        <Mail className="size-3 text-slate-400" />
                        <span>{l.email ?? <span className="text-destructive font-medium">Sem e-mail</span>}</span>
                      </div>
                      <div>
                        {l.temTelegram ? (
                          <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">
                            Telegram ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground bg-slate-100">
                            Sem Telegram
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Situação */}
                    <TableCell className="text-xs">
                      <Badge variant="secondary" className={cn("font-medium", COR[l.situacao])}>
                        {SITUACAO_LABEL[l.situacao]}
                      </Badge>
                      {l.bloqueado && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-red-600 font-medium">
                          <Lock className="size-3" /> Bloqueado (5 erros)
                        </span>
                      )}
                      {l.envioErro && l.situacao !== "CONFIRMADO" && (
                        <span className="mt-1 block text-[11px] text-destructive">{l.envioErro}</span>
                      )}
                    </TableCell>

                    {/* Trilha de Datas */}
                    <TableCell className="text-xs text-muted-foreground space-y-0.5">
                      {l.enviadoEm && <div>Enviado: {l.enviadoEm}</div>}
                      {l.cienciaTelegramEm && <div className="text-amber-700">Ciente: {l.cienciaTelegramEm}</div>}
                      {l.confirmadoEm ? (
                        <div className="text-emerald-700 font-medium">Assinado: {l.confirmadoEm}</div>
                      ) : l.vistoEm ? (
                        <div className="text-indigo-600">Abriu: {l.vistoEm}</div>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    {/* Cobranças */}
                    <TableCell className="text-xs text-muted-foreground">
                      {l.lembretesEnviados > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Bell className="size-3 text-amber-500" /> {l.lembretesEnviados} cobrança(s)
                        </span>
                      ) : (
                        "0"
                      )}
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {l.confirmadoEm ? (
                          <>
                            {l.comprovanteArquivoId ? (
                              <a
                                href={`/api/rh/${l.empresaId}/arquivos/${l.comprovanteArquivoId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-medium"
                              >
                                <FileCheck className="size-3.5 text-emerald-600" /> Ver comprovante
                              </a>
                            ) : l.fotoArquivoId ? (
                              <a
                                href={`/api/rh/${l.empresaId}/arquivos/${l.fotoArquivoId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border text-slate-700 hover:bg-slate-50"
                              >
                                <Camera className="size-3.5" /> Ver foto
                              </a>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {l.temTelegram && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={enviando}
                                onClick={() => cobrarIndividual(l.documentoId)}
                                className="text-xs h-8 px-2"
                                title="Enviar lembrete pelo Telegram agora"
                              >
                                <Bell className="size-3.5 mr-1 text-amber-600" /> Cobrar
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={enviando}
                              onClick={() => reenviarIndividual(l.documentoId)}
                              className="text-xs h-8 px-2"
                              title={l.bloqueado ? "Desbloquear e reenviar link" : "Reenviar e-mail"}
                            >
                              {l.bloqueado ? (
                                <span className="text-red-700 flex items-center gap-1">
                                  <Lock className="size-3" /> Desbloquear
                                </span>
                              ) : (
                                <>
                                  <Send className="size-3 mr-1" /> Reenviar
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
