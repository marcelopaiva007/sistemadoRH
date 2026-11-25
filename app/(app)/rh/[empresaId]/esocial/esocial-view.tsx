"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { Indicador } from "@/components/indicador";
import { formatarData, formatarDataHoraBrasilia } from "@/lib/datas";
import {
  TIPOS_EVENTO_ESOCIAL,
  situacaoDoPrazo,
  type TipoEventoEsocial,
} from "@/lib/prazos-legais";
// Só o TIPO vem de lib/esocial.ts — ela importa o Prisma, e valor de lá num
// Client Component derruba o bundle (o caso da v1.156.0, ver
// lib/pendencias-natureza.ts).
import type { EventoEsocial } from "@/lib/esocial";
import { desfazerEnvioEsocial, marcarEventoEsocialEnviado } from "@/lib/actions/rh-esocial";
import { CampoTexto, FormularioAction } from "../colaboradores/[colaboradorId]/campos";

type Filtro = "PENDENTES" | "ENVIADOS" | "TODOS";

const codigoDo = (tipo: TipoEventoEsocial) => TIPOS_EVENTO_ESOCIAL.find((t) => t.value === tipo)!;

export function EsocialView({
  empresaId,
  escopo,
  eventos,
  hoje,
  desde,
}: {
  empresaId: string;
  escopo: string[];
  eventos: EventoEsocial[];
  hoje: Date;
  desde: Date;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtro, setFiltro] = useState<Filtro>("PENDENTES");
  const [tipo, setTipo] = useState<TipoEventoEsocial | "TODOS">("TODOS");
  const [marcando, setMarcando] = useState<EventoEsocial | null>(null);
  const [desfazendo, iniciarDesfazer] = useTransition();

  const pendentes = eventos.filter((e) => e.envio === null);
  // O número do cartão "eSocial a enviar" de Pendências: pendente e fora a CAT
  // (que já é o cartão "CAT sem emitir"). Mesma régua de
  // lib/esocial.ts::contaComoPendencia — repetida aqui só porque aquele
  // arquivo não entra no navegador.
  const noCartao = pendentes.filter((e) => e.contaNoCartao);
  const catsPendentes = pendentes.filter((e) => !e.contaNoCartao);
  const vencidos = pendentes.filter((e) => situacaoDoPrazo(e.prazo, hoje).situacao === "VENCIDO");
  const enviados = eventos.filter((e) => e.envio !== null);

  const visiveis = eventos.filter(
    (e) =>
      (tipo === "TODOS" || e.tipo === tipo) &&
      (filtro === "TODOS" || (filtro === "PENDENTES" ? e.envio === null : e.envio !== null)),
  );

  // O CSV leva o mesmo recorte da tela: o `?empresas=` da URL, ou os CNPJs do
  // escopo quando não há filtro (a rota faz a mesma interseção com o que o
  // usuário enxerga).
  const empresasParam = searchParams.get("empresas") ?? escopo.join(",");
  const linkCsv = (t: TipoEventoEsocial) => {
    const q = new URLSearchParams();
    if (empresasParam) q.set("empresas", empresasParam);
    if (filtro !== "PENDENTES") q.set("enviados", "1");
    return `/api/rh/${empresaId}/esocial/${t}/csv?${q.toString()}`;
  };

  const desfazer = (e: EventoEsocial) => {
    if (!confirm(`Desfazer a marcação de envio de ${e.colaboradorNome}? O prazo volta para Pendências.`)) return;
    iniciarDesfazer(async () => {
      const r = await desfazerEnvioEsocial(empresaId, e.tipo, e.referenciaId);
      if (r.ok) {
        toast.success("Marcação desfeita.");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Prazos eSocial"
        resumo={
          pendentes.length === 0
            ? "Nenhum evento esperando ir ao escritório."
            : `${pendentes.length} ${pendentes.length === 1 ? "evento a enviar" : "eventos a enviar"} ao escritório contábil${vencidos.length > 0 ? ` — ${vencidos.length} com prazo vencido` : ""}.`
        }
      />

      <p className="max-w-3xl text-sm text-muted-foreground">
        O sistema não transmite ao eSocial: quem transmite é o escritório contábil. Aqui ficam o prazo
        legal de cada evento, os dados para exportar e a marcação de que eles já foram para o escritório
        — marcado, o evento sai das Pendências. Entram os fatos a partir de {formatarData(desde)}.{" "}
        <b className="font-semibold text-foreground">Dia útil aqui é segunda a sexta</b>: o sistema não
        tem tabela de feriados, então num feriado o prazo real pode ser um dia depois do mostrado —
        nunca antes.
      </p>

      <FaixaDeIndicadores>
        <Indicador
          rotulo="A enviar"
          valor={noCartao.length}
          estado={noCartao.length > 0 ? "alerta" : "padrao"}
          complemento="O número do cartão de Pendências"
        />
        <Indicador rotulo="Com prazo vencido" valor={vencidos.length} complemento="Pendentes, prazo já passou" />
        <Indicador rotulo="CAT a emitir" valor={catsPendentes.length} complemento='Conta em "CAT sem emitir"' />
        <Indicador rotulo="Enviados" valor={enviados.length} complemento="Marcados ou CAT emitida" />
      </FaixaDeIndicadores>

      <Card>
        <CardHeader>
          <CardTitle>Exportar para o escritório</CardTitle>
          <CardDescription>
            Um CSV por evento (abre no Excel), com os dados que a ficha tem — o que o sistema não guarda,
            o escritório completa. Leva o filtro abaixo: {filtro === "PENDENTES" ? "só os pendentes" : "pendentes e enviados"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TIPOS_EVENTO_ESOCIAL.map((t) => (
            <a key={t.value} href={linkCsv(t.value)} className={buttonVariants({ variant: "outline" })}>
              <Download />
              {t.codigo} · {t.label}
            </a>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>Prazo mais apertado primeiro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["PENDENTES", `Pendentes (${pendentes.length})`],
                ["ENVIADOS", `Enviados (${enviados.length})`],
                ["TODOS", `Todos (${eventos.length})`],
              ] as const
            ).map(([valor, rotulo]) => (
              <Button
                key={valor}
                size="sm"
                variant={filtro === valor ? "default" : "outline"}
                onClick={() => setFiltro(valor)}
              >
                {rotulo}
              </Button>
            ))}
            <span className="mx-1 self-center text-muted-foreground">·</span>
            <Button size="sm" variant={tipo === "TODOS" ? "default" : "outline"} onClick={() => setTipo("TODOS")}>
              Todos os eventos
            </Button>
            {TIPOS_EVENTO_ESOCIAL.map((t) => (
              <Button
                key={t.value}
                size="sm"
                variant={tipo === t.value ? "default" : "outline"}
                onClick={() => setTipo(t.value)}
              >
                {t.codigo}
              </Button>
            ))}
          </div>

          {visiveis.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum evento neste filtro.</p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Data do fato</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((e) => {
                    const s = situacaoDoPrazo(e.prazo, hoje);
                    return (
                      <TableRow key={`${e.tipo}|${e.referenciaId}`}>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-semibold">{codigoDo(e.tipo).codigo}</span>{" "}
                          <span className="text-muted-foreground">{codigoDo(e.tipo).label}</span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/rh/${e.empresaId}/colaboradores/${e.colaboradorId}`}
                            className="font-medium hover:underline"
                          >
                            {e.colaboradorNome}
                          </Link>
                          <span className="block text-[12px] text-muted-foreground">{e.detalhe}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.empresaNome}</TableCell>
                        <TableCell className="tabular-nums whitespace-nowrap">{formatarData(e.dataEvento)}</TableCell>
                        <TableCell>
                          <span className="tabular-nums whitespace-nowrap">{formatarData(e.prazo)}</span>
                          <span className="block text-[12px] text-muted-foreground">{e.regra}</span>
                        </TableCell>
                        <TableCell>
                          {e.envio ? (
                            <span title={e.envio.observacao ?? undefined}>
                              <Badge variant="default">Enviado</Badge>
                              <span className="block text-[12px] text-muted-foreground">
                                {e.envio.id === null
                                  ? (e.envio.observacao ?? "CAT emitida")
                                  : `${formatarDataHoraBrasilia(e.envio.enviadoEm)}${e.envio.enviadoPorNome ? ` · ${e.envio.enviadoPorNome}` : ""}`}
                              </span>
                            </span>
                          ) : (
                            <Badge
                              variant={s.situacao === "NO_PRAZO" ? "secondary" : "destructive"}
                              className="whitespace-nowrap"
                            >
                              {s.situacao === "VENCIDO"
                                ? `Vencido há ${-s.dias} ${s.dias === -1 ? "dia" : "dias"}`
                                : s.situacao === "HOJE"
                                  ? "Vence hoje"
                                  : `Faltam ${s.dias} ${s.dias === 1 ? "dia" : "dias"}`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {e.envio === null ? (
                            <Button size="sm" variant="outline" onClick={() => setMarcando(e)}>
                              Marcar enviado
                            </Button>
                          ) : e.envio.id !== null ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={desfazendo}
                              onClick={() => desfazer(e)}
                              title="Desfazer a marcação"
                            >
                              <Undo2 />
                              Desfazer
                            </Button>
                          ) : null}
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

      {/* `key` remonta o formulário a cada evento, senão a observação do
          anterior vaza para o próximo. */}
      <Dialog open={marcando !== null} onOpenChange={(aberto) => !aberto && setMarcando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Enviado ao escritório
              {marcando && ` — ${codigoDo(marcando.tipo).codigo} de ${marcando.colaboradorNome}`}
            </DialogTitle>
          </DialogHeader>
          {marcando && (
            <FormularioAction
              key={`${marcando.tipo}|${marcando.referenciaId}`}
              action={marcarEventoEsocialEnviado.bind(null, empresaId, marcando.tipo, marcando.referenciaId)}
              textoBotao="Marcar como enviado"
              mensagemSucesso="Marcado como enviado ao escritório."
              onSuccess={() => {
                setMarcando(null);
                router.refresh();
              }}
            >
              <p className="text-sm text-muted-foreground">
                Confirme só depois que os dados chegaram ao escritório contábil. O evento sai das
                Pendências; dá para desfazer depois.
              </p>
              <CampoTexto
                name="observacao"
                label="Observação (opcional)"
                placeholder="Ex.: enviado por e-mail para a Fulana em 26/11"
                maxLength={500}
              />
            </FormularioAction>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
