"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, FileEdit, XCircle } from "lucide-react";
import {
  minhasSolicitacoesPonto,
  solicitarAbonoFolga,
  solicitarAjustePonto,
  type MinhaSolicitacaoPonto,
} from "@/app/actions/portal-solicitacoes-ponto";
import {
  TIPOS_MARCACAO_PONTO,
  tipoMarcacaoLabel,
  tipoTratamentoLabel,
} from "@/lib/constants-ponto";

// Pedidos de ajuste de ponto e de abono em dia de folga, feitos pelo próprio
// colaborador. Renderizado nas DUAS portas (portal e app /ponto) — as actions
// aceitam as duas sessões via resolverIdentidadeDePonto.
//
// Mensagens inline, não toast: o app /ponto não monta o Toaster do sonner, e
// um sucesso que só aparece onde há Toaster é sucesso invisível na outra porta.

type TipoPedido = "AJUSTE" | "ABONO_FOLGA";

// dataFato é meia-noite UTC — formatar em UTC, senão o fuso do Brasil mostra
// o dia anterior. Mesma regra de formatarData em lib/datas.ts.
function formatarDataUTC(iso: string) {
  const d = new Date(iso);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

export function SolicitacoesPontoCard() {
  const [aberto, setAberto] = useState(false);
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>("AJUSTE");
  const [data, setData] = useState("");
  const [tipoMarcacao, setTipoMarcacao] = useState("ENTRADA_1");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [solicitacoes, setSolicitacoes] = useState<MinhaSolicitacaoPonto[]>([]);

  const carregar = async () => {
    try {
      setSolicitacoes(await minhasSolicitacoesPonto());
    } catch {
      /* lista é acompanhamento; falha aqui não pode derrubar o formulário */
    }
  };

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const lista = await minhasSolicitacoesPonto();
        if (ativo) setSolicitacoes(lista);
      } catch {
        /* idem */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      const res =
        tipoPedido === "AJUSTE"
          ? await solicitarAjustePonto({ data, tipoMarcacao, hora, motivo })
          : await solicitarAbonoFolga({ data, motivo });
      if (res.ok) {
        setSucesso("Pedido enviado! Ele fica aguardando a análise do RH — acompanhe o status aqui embaixo.");
        setData("");
        setHora("");
        setMotivo("");
        setAberto(false);
        await carregar();
      } else {
        setErro(res.error);
      }
    } catch {
      setErro("Falha de conexão ao enviar o pedido. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="bg-card text-card-foreground border rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <FileEdit className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-base leading-tight">Ajustes e abonos</h2>
            <p className="text-xs text-muted-foreground">
              Não conseguiu bater o ponto, ou precisa justificar um dia de folga? Peça aqui.
            </p>
          </div>
        </div>
        {!aberto && (
          <button
            onClick={() => {
              setAberto(true);
              setErro(null);
              setSucesso(null);
            }}
            className="shrink-0 p-2 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium"
          >
            Novo pedido
          </button>
        )}
      </div>

      {sucesso && (
        <div className="p-3 bg-card border border-success rounded-lg text-xs text-success flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{sucesso}</span>
        </div>
      )}

      {aberto && (
        <form onSubmit={enviar} className="space-y-3 rounded-lg border p-3">
          {erro && (
            <div className="p-2 rounded bg-destructive/10 text-xs text-destructive">{erro}</div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">O que você precisa?</label>
            <select
              value={tipoPedido}
              onChange={(e) => setTipoPedido(e.target.value as TipoPedido)}
              className="w-full h-9 text-sm border rounded-md px-2 bg-background"
            >
              <option value="AJUSTE">Ajuste de ponto — não consegui registrar uma marcação</option>
              <option value="ABONO_FOLGA">Abono — estava de folga e preciso regularizar o dia</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="dataPedido">
                {tipoPedido === "AJUSTE" ? "Dia da marcação" : "Dia da folga"}
              </label>
              <input
                id="dataPedido"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                required
              />
            </div>
            {tipoPedido === "AJUSTE" && (
              <div className="space-y-1">
                <label className="text-xs font-medium" htmlFor="horaPedido">
                  Horário que deveria constar
                </label>
                <input
                  id="horaPedido"
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                  required
                />
              </div>
            )}
          </div>

          {tipoPedido === "AJUSTE" && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Qual marcação?</label>
              <select
                value={tipoMarcacao}
                onChange={(e) => setTipoMarcacao(e.target.value)}
                className="w-full h-9 text-sm border rounded-md px-2 bg-background"
              >
                {TIPOS_MARCACAO_PONTO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="motivoPedido">
              Justificativa
            </label>
            <textarea
              id="motivoPedido"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                tipoPedido === "AJUSTE"
                  ? "Ex.: o celular ficou sem internet na hora da entrada."
                  : "Ex.: estava de folga na escala, mas o dia aparece como falta."
              }
              className="w-full min-h-[64px] text-sm border rounded-md p-2 bg-background"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Nada muda automaticamente: o pedido vai para o RH, que aprova ou recusa.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 p-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
            >
              {enviando ? "Enviando…" : "Enviar pedido ao RH"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                setErro(null);
              }}
              className="flex-1 p-2 rounded-md border text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {solicitacoes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Meus pedidos</p>
          <div className="divide-y rounded-lg border">
            {solicitacoes.map((s) => (
              <div key={s.id} className="p-3 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {s.tipo === "ABONO_FOLGA" ? tipoTratamentoLabel(s.tipo) : "Ajuste de ponto"}
                    {" · "}
                    {formatarDataUTC(s.dataFato)}
                    {s.tipoMarcacao && s.horaSolicitada
                      ? ` · ${tipoMarcacaoLabel(s.tipoMarcacao)} às ${s.horaSolicitada}`
                      : ""}
                  </span>
                  {s.status === "PENDENTE" && (
                    <span className="flex items-center gap-1 font-semibold text-muted-foreground shrink-0">
                      <Clock3 className="w-3.5 h-3.5" /> Aguardando RH
                    </span>
                  )}
                  {s.status === "APROVADO" && (
                    <span className="flex items-center gap-1 font-semibold text-success shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
                    </span>
                  )}
                  {s.status === "REJEITADO" && (
                    <span className="flex items-center gap-1 font-semibold text-destructive shrink-0">
                      <XCircle className="w-3.5 h-3.5" /> Recusado
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground italic">&ldquo;{s.motivo}&rdquo;</p>
                {s.status === "REJEITADO" && s.motivoDecisao && (
                  <p className="border-l-2 border-muted pl-2 text-muted-foreground">
                    <span className="font-medium">Resposta do RH:</span> {s.motivoDecisao}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
