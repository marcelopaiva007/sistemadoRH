"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Camera, FileText, Inbox, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { cn } from "@/lib/utils";
import { enviarContrachequesAction } from "@/lib/actions/rh-contracheques";
import { SITUACAO_LABEL, type Situacao } from "@/lib/contracheques/situacao";
import { classeSelect } from "../colaboradores/[colaboradorId]/campos";

export type LinhaContracheque = {
  documentoId: string;
  /** CNPJ do contracheque (da ficha): arquivos e foto saem pela rota dele. */
  empresaId: string;
  arquivoId: string | null;
  pessoa: string;
  colaboradorId: string;
  desligado: boolean;
  empresa: string;
  setor: string;
  temTelegram: boolean;
  temEmail: boolean;
  folha: string;
  situacao: Situacao;
  enviadoEm: string | null;
  canal: string | null;
  envioErro: string | null;
  envios: number;
  vistoEm: string | null;
  confirmadoEm: string | null;
  confirmadoIp: string | null;
  fotoArquivoId: string | null;
};

const COR: Record<Situacao, string> = {
  NAO_ENVIADO: "bg-muted text-muted-foreground",
  SEM_CANAL: "bg-destructive/10 text-destructive",
  ENVIADO: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ABERTO: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  CONFIRMADO: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

const FILTROS: { valor: Situacao | "TODOS"; rotulo: string }[] = [
  { valor: "TODOS", rotulo: "Todos" },
  { valor: "NAO_ENVIADO", rotulo: "Não enviados" },
  { valor: "SEM_CANAL", rotulo: "Sem como avisar" },
  { valor: "ENVIADO", rotulo: "Não abriram" },
  { valor: "ABERTO", rotulo: "Falta confirmar" },
  { valor: "CONFIRMADO", rotulo: "Confirmados" },
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
  const [enviando, iniciar] = useTransition();
  const [emEnvio, setEmEnvio] = useState<string | null>(null);

  const conta = (s: Situacao) => linhas.filter((l) => l.situacao === s).length;
  const naoEnviados = linhas.filter((l) => l.situacao === "NAO_ENVIADO");
  const visiveis = useMemo(() => (filtro === "TODOS" ? linhas : linhas.filter((l) => l.situacao === filtro)), [filtro, linhas]);

  const trocarCompetencia = (chave: string) => {
    const p = new URLSearchParams(busca.toString());
    p.set("competencia", chave);
    router.push(`?${p.toString()}`);
  };

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
      if (r.semCanal) partes.push(`${r.semCanal} sem Telegram nem e-mail`);
      if (r.jaConfirmados) partes.push(`${r.jaConfirmados} já tinham confirmado`);
      if (r.falhas) partes.push(`${r.falhas} com falha — tente de novo`);
      (r.semCanal || r.falhas ? toast.warning : toast.success)(partes.join(" · "));
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Contracheques"
        resumo={
          <>
            Envie o contracheque do mês a cada pessoa e acompanhe quem confirmou o recebimento. A pessoa recebe o aviso no
            Telegram (ou por e-mail), abre o contracheque no portal e confirma com uma foto, como na batida de ponto.
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
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-muted-foreground">Competência</span>
              <select className={cn(classeSelect, "w-44")} value={competencia ?? ""} onChange={(e) => trocarCompetencia(e.target.value)}>
                {competencias.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {mesAno(c.chave)} ({c.total})
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={naoEnviados.length === 0 || enviando}
              onClick={() => {
                if (confirm(`Enviar o aviso do contracheque de ${mesAno(competencia!)} a ${naoEnviados.length} pessoa(s)?`)) {
                  enviar(
                    naoEnviados.map((l) => l.documentoId),
                    "todos",
                  );
                }
              }}
            >
              <Send className="size-4" aria-hidden />
              {emEnvio === "todos"
                ? "Enviando..."
                : naoEnviados.length === 0
                  ? "Todos já foram enviados"
                  : `Enviar a ${naoEnviados.length} que ainda não receberam`}
            </Button>
            <p className="text-xs text-muted-foreground">
              Contracheque novo desta competência (chegou depois pela Caixa) aparece como &quot;Não enviado&quot; — é só
              enviar de novo.
            </p>
          </div>

          <FaixaDeIndicadores colunas={4}>
            <Indicador rotulo="Contracheques" valor={linhas.length} complemento={competencia ? mesAno(competencia) : "—"} />
            <Indicador
              rotulo="Confirmados com foto"
              valor={conta("CONFIRMADO")}
              complemento={linhas.length ? `${Math.round((conta("CONFIRMADO") / linhas.length) * 100)}% do total` : "—"}
            />
            <Indicador
              rotulo="Enviados sem confirmação"
              valor={conta("ENVIADO") + conta("ABERTO")}
              complemento={`${conta("ABERTO")} abriram e não confirmaram`}
              estado={conta("ENVIADO") + conta("ABERTO") > 0 ? "atencao" : "padrao"}
            />
            <Indicador
              rotulo="Sem como avisar"
              valor={conta("SEM_CANAL")}
              complemento="sem Telegram nem e-mail"
              estado={conta("SEM_CANAL") > 0 ? "alerta" : "padrao"}
            />
          </FaixaDeIndicadores>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
            {FILTROS.map((f) => (
              <Button key={f.valor} size="sm" variant={filtro === f.valor ? "default" : "outline"} onClick={() => setFiltro(f.valor)}>
                {f.rotulo}
                {f.valor !== "TODOS" && ` (${conta(f.valor)})`}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Folha</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Confirmação</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Ninguém nesta situação.
                    </TableCell>
                  </TableRow>
                )}
                {visiveis.map((l) => (
                  <TableRow key={l.documentoId}>
                    <TableCell className="text-sm">
                      <Link href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}?tab=dossie`} className="font-medium hover:underline">
                        {l.pessoa}
                      </Link>
                      {l.desligado && <span className="ml-1 text-xs text-destructive">(desligado)</span>}
                      <span className="block text-xs text-muted-foreground">
                        {l.empresa} · {l.setor}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.arquivoId ? (
                        <a href={`/api/rh/${l.empresaId}/arquivos/${l.arquivoId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                          <FileText className="size-3.5" aria-hidden /> {l.folha}
                        </a>
                      ) : (
                        l.folha
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="secondary" className={COR[l.situacao]}>
                        {SITUACAO_LABEL[l.situacao]}
                      </Badge>
                      {l.enviadoEm && (
                        <span className="mt-1 block text-muted-foreground">
                          {l.canal ? `Avisado por ${l.canal === "TELEGRAM" ? "Telegram" : "e-mail"}` : "Tentativa"} em {l.enviadoEm}
                          {l.envios > 1 ? ` (${l.envios}ª vez)` : ""}
                        </span>
                      )}
                      {l.envioErro && l.situacao !== "CONFIRMADO" && <span className="mt-1 block text-destructive">{l.envioErro}</span>}
                      {l.situacao === "NAO_ENVIADO" && !l.temTelegram && !l.temEmail && (
                        <span className="mt-1 block text-destructive">Sem Telegram nem e-mail — não há como avisar.</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.confirmadoEm ? (
                        <>
                          {l.confirmadoEm}
                          {l.confirmadoIp && <span className="block">IP {l.confirmadoIp}</span>}
                          {l.fotoArquivoId && (
                            <a
                              href={`/api/rh/${l.empresaId}/arquivos/${l.fotoArquivoId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                            >
                              <Camera className="size-3.5" aria-hidden /> Ver a foto
                            </a>
                          )}
                        </>
                      ) : l.vistoEm ? (
                        `Abriu em ${l.vistoEm}`
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.situacao !== "CONFIRMADO" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={enviando}
                          onClick={() => enviar([l.documentoId], l.documentoId)}
                        >
                          <Send className="size-3.5" aria-hidden />
                          {emEnvio === l.documentoId ? "Enviando..." : l.situacao === "NAO_ENVIADO" ? "Enviar" : "Reenviar"}
                        </Button>
                      )}
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
