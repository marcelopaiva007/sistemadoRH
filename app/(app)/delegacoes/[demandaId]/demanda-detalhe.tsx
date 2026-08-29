"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  ROTULO_EVENTO,
  STATUS_DEMANDA_BADGE,
  rotuloCriticidade,
  rotuloEvidencia,
  rotuloPeriodicidade,
} from "@/lib/constants-delegacoes";
import {
  aceitarDemanda,
  aceitarEntrega,
  cancelarDemanda,
  devolverEntrega,
  enviarDemanda,
  entregarDemanda,
  marcarEmRisco,
  reportarProgresso,
  repactuarPrazo,
} from "@/lib/actions/delegacoes";

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

type Demanda = {
  id: string;
  titulo: string;
  descricao: string | null;
  criterioAceite: string;
  evidenciaExigida: string;
  criticidade: number;
  status: string;
  emRisco: boolean;
  prazoTexto: string;
  prazoOriginalTexto: string;
  prazoMudou: boolean;
  periodicidadeRetorno: string;
  area: string | null;
  marcaNome: string | null;
  solicitanteNome: string;
  responsavelNome: string;
  aceiteEmTexto: string | null;
  encerradaEmTexto: string | null;
  limiteAceiteTexto: string | null;
};

type Podem = {
  enviar: boolean;
  aceitar: boolean;
  entregar: boolean;
  encerrar: boolean;
  devolver: boolean;
  cancelar: boolean;
  repactuar: boolean;
  reportar: boolean;
  marcarRisco: boolean;
};

type Entrega = {
  id: string;
  evidenciaTipo: string;
  evidenciaTexto: string | null;
  temArquivo: boolean;
  resultado: string | null;
  aceita: boolean | null;
  motivoDevolucao: string | null;
  quandoTexto: string;
};

type Repactuacao = {
  id: string;
  de: string;
  para: string;
  motivo: string;
  autorNome: string;
  quandoTexto: string;
};

type ItemLinha = {
  id: string;
  tipo: "EVENTO" | "INTERACAO";
  rotulo: string;
  autorNome: string;
  texto: string | null;
  quandoTexto: string;
};

/** Qual formulário está aberto — um de cada vez, no lugar da ação. */
type Painel = "entregar" | "repactuar" | "reportar" | "devolver" | "cancelar" | null;

export function DemandaDetalhe({
  demanda,
  papel,
  podem,
  entregas,
  repactuacoes,
  linhaDoTempo,
}: {
  demanda: Demanda;
  papel: "SOLICITANTE" | "RESPONSAVEL" | "TERCEIRO";
  podem: Podem;
  entregas: Entrega[];
  repactuacoes: Repactuacao[];
  linhaDoTempo: ItemLinha[];
}) {
  const router = useRouter();
  const [painel, setPainel] = useState<Painel>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();

  function texto(nome: string) {
    return {
      value: campos[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setCampos((c) => ({ ...c, [nome]: e.target.value })),
    };
  }

  function abrir(p: Painel) {
    setErro(null);
    setCampos({});
    setPainel(p);
  }

  /** Toda ação passa por aqui: mesmo tratamento de erro, mesmo refresh. */
  function agir(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setPainel(null);
      setCampos({});
      router.refresh();
    });
  }

  const exigeArquivo = demanda.evidenciaExigida === "ARQUIVO";

  return (
    <div className="space-y-6">
      <Link
        href={papel === "RESPONSAVEL" ? "/delegacoes" : "/delegacoes/delegadas"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Delegações
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{demanda.titulo}</h2>
            <StatusBadge status={demanda.status} map={STATUS_DEMANDA_BADGE} />
            {demanda.emRisco && (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                em risco
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {demanda.solicitanteNome} pediu a {demanda.responsavelNome}
            {" · "}
            {rotuloCriticidade(demanda.criticidade)}
            {" · prazo "}
            {demanda.prazoTexto}
            {demanda.marcaNome && <> · {demanda.marcaNome}</>}
            {demanda.area && <> · {demanda.area}</>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {podem.enviar && (
            <Button disabled={pendente} onClick={() => agir(() => enviarDemanda({ id: demanda.id }))}>
              Enviar ao responsável
            </Button>
          )}
          {podem.aceitar && (
            <Button disabled={pendente} onClick={() => agir(() => aceitarDemanda({ id: demanda.id }))}>
              Aceito
            </Button>
          )}
          {podem.reportar && (
            <Button variant="outline" onClick={() => abrir("reportar")}>
              Reportar andamento
            </Button>
          )}
          {podem.repactuar && (
            <Button variant="outline" onClick={() => abrir("repactuar")}>
              Repactuar prazo
            </Button>
          )}
          {podem.entregar && <Button onClick={() => abrir("entregar")}>Entregar</Button>}
          {podem.encerrar && (
            <Button disabled={pendente} onClick={() => agir(() => aceitarEntrega({ id: demanda.id }))}>
              Aceitar entrega e encerrar
            </Button>
          )}
          {podem.devolver && (
            <Button variant="outline" onClick={() => abrir("devolver")}>
              Devolver
            </Button>
          )}
          {podem.marcarRisco && (
            <Button
              variant="outline"
              disabled={pendente}
              onClick={() => agir(() => marcarEmRisco({ id: demanda.id, ligar: !demanda.emRisco }))}
            >
              {demanda.emRisco ? "Tirar o sinal de risco" : "Marcar em risco"}
            </Button>
          )}
          {podem.cancelar && (
            <Button variant="ghost" onClick={() => abrir("cancelar")}>
              Cancelar demanda
            </Button>
          )}
        </div>
      </div>

      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      {painel === "entregar" && (
        <Painel titulo="Entregar">
          <p className="text-xs text-muted-foreground">
            Esta demanda exige a evidência como <strong>{rotuloEvidencia(demanda.evidenciaExigida)}</strong>.
          </p>
          {exigeArquivo ? (
            // Honestidade sobre o que ainda não existe: o anexo de arquivo usa a
            // esteira Arquivo/Blob e entra junto com a tela de upload. Prometer
            // um campo que não grava seria pior que dizer o que falta.
            <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              O anexo de arquivo ainda não está disponível nesta tela. Combine com quem pediu
              uma evidência em texto ou link, ou peça para trocar a exigência da demanda.
            </p>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Evidência</span>
              <input className={CAMPO} {...texto("evidencia")} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              O que foi feito (opcional)
            </span>
            <textarea className={CAMPO} rows={2} {...texto("resultado")} />
          </label>
          <Acoes
            pendente={pendente}
            rotulo="Entregar"
            desabilitado={exigeArquivo}
            onConfirmar={() =>
              agir(() =>
                entregarDemanda({
                  id: demanda.id,
                  evidenciaTexto: campos.evidencia ?? "",
                  resultado: campos.resultado ?? "",
                }),
              )
            }
            onCancelar={() => setPainel(null)}
          />
        </Painel>
      )}

      {painel === "repactuar" && (
        <Painel titulo="Repactuar prazo">
          <p className="text-xs text-muted-foreground">
            O prazo combinado ({demanda.prazoOriginalTexto}) fica registrado — repactuar não o
            apaga.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Novo prazo</span>
            <input type="date" className={CAMPO} {...texto("prazoNovo")} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Motivo</span>
            <textarea className={CAMPO} rows={2} {...texto("motivo")} />
          </label>
          <Acoes
            pendente={pendente}
            rotulo="Repactuar"
            onConfirmar={() =>
              agir(() =>
                repactuarPrazo({
                  id: demanda.id,
                  prazoNovo: campos.prazoNovo ?? "",
                  motivo: campos.motivo ?? "",
                }),
              )
            }
            onCancelar={() => setPainel(null)}
          />
        </Painel>
      )}

      {painel === "reportar" && (
        <Painel titulo="Reportar andamento">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Onde está</span>
            <textarea className={CAMPO} rows={2} {...texto("conteudo")} />
          </label>
          <Acoes
            pendente={pendente}
            rotulo="Enviar"
            onConfirmar={() =>
              agir(() => reportarProgresso({ id: demanda.id, conteudo: campos.conteudo ?? "" }))
            }
            onCancelar={() => setPainel(null)}
          />
        </Painel>
      )}

      {painel === "devolver" && (
        <Painel titulo="Devolver a entrega">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              O que faltou — o responsável precisa saber
            </span>
            <textarea className={CAMPO} rows={2} {...texto("motivo")} />
          </label>
          <Acoes
            pendente={pendente}
            rotulo="Devolver"
            onConfirmar={() =>
              agir(() => devolverEntrega({ id: demanda.id, motivo: campos.motivo ?? "" }))
            }
            onCancelar={() => setPainel(null)}
          />
        </Painel>
      )}

      {painel === "cancelar" && (
        <Painel titulo="Cancelar a demanda">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Motivo</span>
            <textarea className={CAMPO} rows={2} {...texto("motivo")} />
          </label>
          <Acoes
            pendente={pendente}
            rotulo="Cancelar demanda"
            onConfirmar={() =>
              agir(() => cancelarDemanda({ id: demanda.id, motivo: campos.motivo ?? "" }))
            }
            onCancelar={() => setPainel(null)}
          />
        </Painel>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O combinado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Como sabemos que ficou pronto</p>
            <p className="mt-0.5 whitespace-pre-line">{demanda.criterioAceite}</p>
          </div>
          {demanda.descricao && (
            <div>
              <p className="text-xs text-muted-foreground">Contexto</p>
              <p className="mt-0.5 whitespace-pre-line">{demanda.descricao}</p>
            </div>
          )}
          <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <Dado rotulo="Evidência exigida" valor={rotuloEvidencia(demanda.evidenciaExigida)} />
            <Dado rotulo="Retorno" valor={rotuloPeriodicidade(demanda.periodicidadeRetorno)} />
            <Dado
              rotulo="Prazo"
              valor={
                demanda.prazoMudou
                  ? `${demanda.prazoTexto} (combinado: ${demanda.prazoOriginalTexto})`
                  : demanda.prazoTexto
              }
            />
            <Dado
              rotulo="Aceite"
              valor={
                demanda.aceiteEmTexto ??
                (demanda.limiteAceiteTexto ? `esperado até ${demanda.limiteAceiteTexto}` : "—")
              }
            />
          </div>
        </CardContent>
      </Card>

      {entregas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entregas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {entregas.map((e) => (
                <div key={e.id} className="px-6 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {e.quandoTexto} ·{" "}
                    {e.aceita === null
                      ? "aguardando quem pediu"
                      : e.aceita
                        ? "aceita"
                        : "devolvida"}
                  </p>
                  <p className="mt-1">
                    <span className="text-xs text-muted-foreground">
                      {rotuloEvidencia(e.evidenciaTipo)}:{" "}
                    </span>
                    {e.temArquivo ? "arquivo anexado" : (e.evidenciaTexto ?? "—")}
                  </p>
                  {e.resultado && <p className="mt-1 whitespace-pre-line">{e.resultado}</p>}
                  {e.motivoDevolucao && (
                    <p className="mt-2 border-l-2 border-muted pl-3 text-sm whitespace-pre-line">
                      <span className="text-xs text-muted-foreground">Devolvida porque: </span>
                      {e.motivoDevolucao}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {repactuacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repactuações</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {repactuacoes.map((r) => (
                <div key={r.id} className="px-6 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {r.quandoTexto} · {r.autorNome}
                  </p>
                  <p className="mt-0.5">
                    {r.de} → <strong>{r.para}</strong>
                  </p>
                  <p className="mt-1 border-l-2 border-muted pl-3 whitespace-pre-line">{r.motivo}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {linhaDoTempo.map((i) => (
              <div key={i.id} className="px-6 py-2.5 text-sm">
                <p className="text-xs text-muted-foreground">
                  {i.quandoTexto} · {i.autorNome}
                </p>
                <p className="mt-0.5">
                  {i.tipo === "EVENTO" ? (ROTULO_EVENTO[i.rotulo] ?? i.rotulo) : i.rotulo}
                </p>
                {i.texto && (
                  <p className="mt-1 border-l-2 border-muted pl-3 whitespace-pre-line">{i.texto}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Painel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Acoes({
  pendente,
  rotulo,
  desabilitado,
  onConfirmar,
  onCancelar,
}: {
  pendente: boolean;
  rotulo: string;
  desabilitado?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pendente || desabilitado} onClick={onConfirmar}>
        {rotulo}
      </Button>
      <Button variant="ghost" onClick={onCancelar}>
        Fechar
      </Button>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-foreground">{valor}</p>
    </div>
  );
}
