"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, FileText, CalendarDays, Stethoscope, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decidirFerias } from "@/lib/actions/rh-ferias";
import { decidirAusencia } from "@/lib/actions/rh-ausencias";
import { conferirDocumento, devolverDocumento } from "@/lib/actions/rh-documentos-conferencia";
import { tipoAusenciaLabel, tipoDocumentoLabel } from "@/lib/constants-dp";
import { formatarTamanho } from "@/lib/anexos";
import { formatarData, formatarDataHoraBrasilia } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

type Ferias = {
  id: string;
  empresaId: string;
  colaboradorId: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  diasAbono: number;
  observacoes: string | null;
  solicitadoPorNome: string | null;
  createdAt: Date;
  colaborador: { nome: string; setor: { nome: string }; empresa: { nome: string } };
};

type Ausencia = {
  id: string;
  empresaId: string;
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
  colaborador: { nome: string; setor: { nome: string }; empresa: { nome: string } };
};

type Documento = {
  id: string;
  empresaId: string;
  colaboradorId: string;
  tipo: string;
  descricao: string | null;
  emitidoEm: Date | null;
  validoAte: Date | null;
  observacoes: string | null;
  createdAt: Date;
  arquivo: { id: string; nome: string; tamanhoBytes: number } | null;
  colaborador: {
    nome: string;
    cpf: string | null;
    rg: string | null;
    rgOrgaoEmissor: string | null;
    rgUf: string | null;
    pis: string | null;
    ctpsNumero: string | null;
    ctpsSerie: string | null;
    ctpsUf: string | null;
    tituloEleitor: string | null;
    setor: { nome: string };
    empresa: { nome: string };
  };
};

type Decidida = {
  id: string;
  acao: string;
  resumo: string;
  usuarioNome: string | null;
  createdAt: Date;
};

/**
 * O que a pessoa digitou para o tipo de documento que anexou. É contra isto que
 * o RH compara a foto — sem, a conferência vira "parece um RG mesmo".
 */
function numeroDeclarado(d: Documento): string | null {
  const c = d.colaborador;
  const junta = (...partes: (string | null)[]) => partes.filter(Boolean).join(" · ") || null;
  switch (d.tipo) {
    case "RG":
      return junta(c.rg && `RG ${c.rg}`, c.rgOrgaoEmissor, c.rgUf);
    case "CPF":
      return c.cpf && `CPF ${c.cpf}`;
    case "CTPS":
      return junta(c.ctpsNumero && `CTPS ${c.ctpsNumero}`, c.ctpsSerie && `série ${c.ctpsSerie}`, c.ctpsUf);
    case "TITULO_ELEITOR":
      return c.tituloEleitor && `Título ${c.tituloEleitor}`;
    default:
      return null;
  }
}

export function AprovacoesView({
  ferias,
  ausencias,
  documentos,
  decididasRecentes,
}: {
  ferias: Ferias[];
  ausencias: Ausencia[];
  documentos: Documento[];
  decididasRecentes: Decidida[];
}) {
  const router = useRouter();
  const total = ferias.length + ausencias.length + documentos.length;

  // A lista pode misturar CNPJs (empresasVisiveis + filtro `?empresas=` da
  // barra lateral, não só o CNPJ da rota) — mostra o nome da empresa sempre,
  // sem condicional: o CNPJ "da rota" não é mais referência confiável do que
  // "a pessoa está vendo", já que agora pode estar filtrado.
  const empresaLabel = (nomeEmpresa: string) => ` · ${nomeEmpresa}`;

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
              empresaId={f.empresaId}
              colaboradorId={f.colaboradorId}
              titulo={f.colaborador.nome}
              subtitulo={`${f.colaborador.setor.nome}${empresaLabel(f.colaborador.empresa.nome)}`}
              linhas={[
                `${formatarData(f.dataInicio)} a ${formatarData(f.dataFim)} · ${f.dias} dia(s)${f.diasAbono ? ` + ${f.diasAbono} de abono` : ""}`,
                f.observacoes ?? "",
                `Solicitado por ${f.solicitadoPorNome ?? "—"} em ${formatarDataHoraBrasilia(f.createdAt)}`,
              ]}
              onDecidir={async (decisao, motivo) => {
                const resultado = await decidirFerias(f.empresaId, f.id, decisao, motivo);
                if (resultado.ok) router.refresh();
                return resultado;
              }}
            />
          ))}
        </CardContent>
      </Card>

      {/* Chegou do portal e ainda não passou por ninguém. Abrir o anexo é o
          trabalho: o que o colaborador digitou pode não bater com a foto. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IdCard className="size-4" />
            Documentos a conferir ({documentos.length})
          </CardTitle>
          <CardDescription>
            Cópias enviadas pelo colaborador no portal. Abra o anexo e confira contra o que está na
            ficha antes de aceitar — devolver apaga o arquivo e avisa a pessoa pelo Telegram.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documentos.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum documento aguardando conferência.
            </p>
          )}
          {documentos.map((d) => (
            <ItemAprovacao
              key={d.id}
              empresaId={d.empresaId}
              colaboradorId={d.colaboradorId}
              titulo={d.colaborador.nome}
              subtitulo={`${d.colaborador.setor.nome} · ${tipoDocumentoLabel(d.tipo)}${empresaLabel(d.colaborador.empresa.nome)}`}
              linhas={[
                // O número que a pessoa digitou, para bater com a foto.
                numeroDeclarado(d) ?? "Sem número digitado para este documento.",
                d.descricao ?? "",
                d.validoAte ? `Válido até ${formatarData(d.validoAte)}` : "",
                d.observacoes ?? "",
                `Enviado em ${formatarDataHoraBrasilia(d.createdAt)}`,
              ]}
              anexo={
                d.arquivo
                  ? {
                      href: `/api/rh/${d.empresaId}/arquivos/${d.arquivo.id}`,
                      nome: `${d.arquivo.nome} · ${formatarTamanho(d.arquivo.tamanhoBytes)}`,
                    }
                  : undefined
              }
              rotuloAprovar="Conferir"
              rotuloReprovar="Devolver"
              motivoObrigatorio
              onDecidir={async (decisao, motivo) => {
                const resultado =
                  decisao === "APROVADA"
                    ? await conferirDocumento(d.empresaId, d.id)
                    : await devolverDocumento(d.empresaId, d.id, motivo ?? "");
                if (resultado.ok) router.refresh();
                return resultado;
              }}
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
              empresaId={a.empresaId}
              colaboradorId={a.colaboradorId}
              titulo={a.colaborador.nome}
              subtitulo={`${a.colaborador.setor.nome}${empresaLabel(a.colaborador.empresa.nome)}`}
              etiqueta={tipoAusenciaLabel(a.tipo)}
              linhas={[
                `${formatarData(a.dataInicio)} a ${formatarData(a.dataFim)} · ${a.dias} dia(s)${a.abonada ? " · abonada" : " · não abonada"}`,
                a.observacoes ?? "",
                `Registrado por ${a.registradoPorNome ?? "—"} em ${formatarDataHoraBrasilia(a.createdAt)}`,
              ]}
              anexo={
                a.arquivo
                  ? { href: `/api/rh/${a.empresaId}/arquivos/${a.arquivo.id}`, nome: a.arquivo.nome }
                  : null
              }
              onDecidir={async (decisao, motivo) => {
                const resultado = await decidirAusencia(a.empresaId, a.id, decisao, motivo);
                if (resultado.ok) router.refresh();
                return resultado;
              }}
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
  rotuloAprovar = "Aprovar",
  rotuloReprovar = "Reprovar",
  motivoObrigatorio = false,
  onDecidir,
}: {
  empresaId: string;
  colaboradorId: string;
  titulo: string;
  subtitulo: string;
  etiqueta?: string;
  linhas: string[];
  anexo?: { href: string; nome: string } | null;
  /** "Aprovar" não descreve conferir um RG — cada fila nomeia sua própria ação. */
  rotuloAprovar?: string;
  rotuloReprovar?: string;
  /** Devolver documento sem dizer o porquê faz a pessoa reenviar a mesma foto. */
  motivoObrigatorio?: boolean;
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
      toast.success(decisao === "APROVADA" ? `${rotuloAprovar} com sucesso.` : "Devolvido ao colaborador.");
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
            {rotuloAprovar}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => setPedindoMotivo((v) => !v)}
          >
            <X className="size-4" />
            {rotuloReprovar}
          </Button>
        </div>
      </div>

      {pedindoMotivo && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              motivoObrigatorio
                ? "O que precisa ser corrigido? (o colaborador vai ler isto)"
                : "Motivo da reprovação (fica no histórico)"
            }
            className="max-w-md"
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={enviando || (motivoObrigatorio && motivo.trim().length < 5)}
            onClick={() => decidir("REPROVADA", motivo)}
          >
            Confirmar {rotuloReprovar.toLowerCase()}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPedindoMotivo(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
