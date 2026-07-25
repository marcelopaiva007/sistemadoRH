"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, FileText, CalendarDays, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decidirFerias } from "@/lib/actions/rh-ferias";
import { decidirAusencia } from "@/lib/actions/rh-ausencias";
import { tipoAusenciaLabel } from "@/lib/constants-dp";
import { formatarData, formatarDataHoraBrasilia } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

type Ferias = {
  id: string;
  colaboradorId: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  diasAbono: number;
  observacoes: string | null;
  solicitadoPorNome: string | null;
  createdAt: Date;
  colaborador: { nome: string; setor: { nome: string } };
};

type Ausencia = {
  id: string;
  colaboradorId: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  abonada: boolean;
  observacoes: string | null;
  registradoPorNome: string | null;
  createdAt: Date;
  arquivo: { id: string; nome: string } | null;
  colaborador: { nome: string; setor: { nome: string } };
};

type Decidida = {
  id: string;
  acao: string;
  resumo: string;
  usuarioNome: string | null;
  createdAt: Date;
};

export function AprovacoesView({
  empresaId,
  ferias,
  ausencias,
  decididasRecentes,
}: {
  empresaId: string;
  ferias: Ferias[];
  ausencias: Ausencia[];
  decididasRecentes: Decidida[];
}) {
  const total = ferias.length + ausencias.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Central de aprovações</h2>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "Nada esperando decisão no momento."
            : `${total} solicitaç${total > 1 ? "ões" : "ão"} aguardando decisão.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4" />
            Férias ({ferias.length})
          </CardTitle>
          <CardDescription>Programações que precisam do aval do RH antes de valer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ferias.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma férias pendente.</p>
          )}
          {ferias.map((f) => (
            <ItemAprovacao
              key={f.id}
              empresaId={empresaId}
              colaboradorId={f.colaboradorId}
              titulo={f.colaborador.nome}
              subtitulo={f.colaborador.setor.nome}
              linhas={[
                `${formatarData(f.dataInicio)} a ${formatarData(f.dataFim)} · ${f.dias} dia(s)${f.diasAbono ? ` + ${f.diasAbono} de abono` : ""}`,
                f.observacoes ?? "",
                `Solicitado por ${f.solicitadoPorNome ?? "—"} em ${formatarDataHoraBrasilia(f.createdAt)}`,
              ]}
              onDecidir={(decisao, motivo) => decidirFerias(empresaId, f.id, decisao, motivo)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="size-4" />
            Ausências ({ausencias.length})
          </CardTitle>
          <CardDescription>
            Atestados e faltas registrados aguardando validação. Aprovar mantém a ausência como
            abonada conforme registrada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ausencias.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma ausência pendente.</p>
          )}
          {ausencias.map((a) => (
            <ItemAprovacao
              key={a.id}
              empresaId={empresaId}
              colaboradorId={a.colaboradorId}
              titulo={a.colaborador.nome}
              subtitulo={a.colaborador.setor.nome}
              etiqueta={tipoAusenciaLabel(a.tipo)}
              linhas={[
                `${formatarData(a.dataInicio)} a ${formatarData(a.dataFim)} · ${a.dias} dia(s)${a.abonada ? " · abonada" : " · não abonada"}`,
                a.observacoes ?? "",
                `Registrado por ${a.registradoPorNome ?? "—"} em ${formatarDataHoraBrasilia(a.createdAt)}`,
              ]}
              anexo={
                a.arquivo
                  ? { href: `/api/rh/${empresaId}/arquivos/${a.arquivo.id}`, nome: a.arquivo.nome }
                  : null
              }
              onDecidir={(decisao, motivo) => decidirAusencia(empresaId, a.id, decisao, motivo)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decisões recentes</CardTitle>
          <CardDescription>Últimas 10 decisões registradas na trilha de auditoria.</CardDescription>
        </CardHeader>
        <CardContent>
          {decididasRecentes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma decisão registrada ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {decididasRecentes.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 border-b pb-2 last:border-0">
                  <span>{d.resumo}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.usuarioNome ?? "—"} · {formatarDataHoraBrasilia(d.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemAprovacao({
  empresaId,
  colaboradorId,
  titulo,
  subtitulo,
  etiqueta,
  linhas,
  anexo,
  onDecidir,
}: {
  empresaId: string;
  colaboradorId: string;
  titulo: string;
  subtitulo: string;
  etiqueta?: string;
  linhas: string[];
  anexo?: { href: string; nome: string } | null;
  onDecidir: (decisao: "APROVADA" | "REPROVADA", motivo?: string) => Promise<ActionResult>;
}) {
  const [motivo, setMotivo] = useState("");
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function decidir(decisao: "APROVADA" | "REPROVADA", comMotivo?: string) {
    setEnviando(true);
    const resultado = await onDecidir(decisao, comMotivo);
    setEnviando(false);
    if (resultado.ok) {
      toast.success(decisao === "APROVADA" ? "Aprovado." : "Reprovado.");
      setPedindoMotivo(false);
      setMotivo("");
    } else {
      toast.error(resultado.error);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/rh/${empresaId}/colaboradores/${colaboradorId}`}
              className="font-medium hover:underline"
            >
              {titulo}
            </Link>
            <span className="text-xs text-muted-foreground">{subtitulo}</span>
            {etiqueta && <Badge variant="outline">{etiqueta}</Badge>}
          </div>
          {linhas
            .filter(Boolean)
            .map((linha, i) => (
              <p key={i} className={i === 0 ? "mt-1 text-sm" : "text-xs text-muted-foreground"}>
                {linha}
              </p>
            ))}
          {anexo && (
            <a
              href={anexo.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              <FileText className="size-4" />
              {anexo.nome}
            </a>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" disabled={enviando} onClick={() => decidir("APROVADA")}>
            <Check className="size-4" />
            Aprovar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => setPedindoMotivo((v) => !v)}
          >
            <X className="size-4" />
            Reprovar
          </Button>
        </div>
      </div>

      {pedindoMotivo && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo da reprovação (fica no histórico)"
            className="max-w-md"
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={enviando}
            onClick={() => decidir("REPROVADA", motivo)}
          >
            Confirmar reprovação
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPedindoMotivo(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
