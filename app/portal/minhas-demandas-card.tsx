"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  aceitarNoPortal,
  entregarNoPortal,
  minhasDemandasNoPortal,
  reportarNoPortal,
  type DemandaNoPortal,
} from "@/lib/actions/portal-demandas";

// O que pediram a MIM — a porta do colaborador para o módulo Delegações.
//
// Decisão da Direção em 29/08/2026: demanda vai para qualquer pessoa, usuário
// ou funcionário. Quem tem login usa /delegacoes; quem não tem responde aqui,
// no portal que já usa para bater ponto — sem senha e sem cadastro novo.
//
// Card autossuficiente (carrega os próprios dados pela action) para não obrigar
// app/portal/page.tsx a saber de demandas: quem não tem nenhuma não paga
// consulta nem vê caixa vazia, porque o card SOME quando a lista está vazia.
//
// Mensagem inline, não toast — mesma razão do card de ponto: o card pode ser
// montado onde não existe Toaster, e sucesso invisível é pior que sucesso feio.

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

type Painel = { id: string; modo: "reportar" | "entregar" } | null;

export function MinhasDemandasCard() {
  const [demandas, setDemandas] = useState<DemandaNoPortal[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [painel, setPainel] = useState<Painel>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function carregar() {
    try {
      setDemandas(await minhasDemandasNoPortal());
    } catch {
      /* a lista é acompanhamento; falha aqui não pode derrubar o portal */
    } finally {
      setCarregado(true);
    }
  }

  useEffect(() => {
    let ativo = true;
    minhasDemandasNoPortal()
      .then((d) => {
        if (ativo) setDemandas(d);
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setCarregado(true);
      });
    return () => {
      ativo = false;
    };
  }, []);

  async function agir(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, feito: string) {
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const r = await fn();
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setPainel(null);
      setTexto("");
      setSucesso(feito);
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  // Card só existe quando há o que responder: portal limpo para quem não
  // participa do módulo, que é a maioria das pessoas.
  if (!carregado || demandas.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-5" />
          O que pediram a você
          <Badge variant="outline">{demandas.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {erro && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}
        {sucesso && (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            {sucesso}
          </p>
        )}

        <div className="divide-y">
          {demandas.map((d) => {
            const atrasada = d.diasParaPrazo < 0;
            return (
              <div key={d.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium">{d.titulo}</p>
                  <span
                    className={
                      atrasada
                        ? "text-xs font-semibold text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {atrasada
                      ? `${Math.abs(d.diasParaPrazo)} dia(s) de atraso`
                      : `até ${d.prazoTexto}`}
                  </span>
                </div>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  pedido por {d.solicitanteNome}
                </p>

                {d.descricao && <p className="mt-1 text-sm">{d.descricao}</p>}

                {/* O critério de aceite é o que decide se a entrega vale —
                    então ele fica À VISTA, não escondido atrás de um clique. */}
                <p className="mt-2 border-l-2 border-muted pl-3 text-sm">
                  <span className="text-xs text-muted-foreground">Fica pronto quando: </span>
                  {d.criterioAceite}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {d.podeAceitar && (
                    <Button
                      size="sm"
                      disabled={enviando}
                      onClick={() => agir(() => aceitarNoPortal({ id: d.id }), "Combinado aceito.")}
                    >
                      Aceito
                    </Button>
                  )}
                  {d.podeReportar && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setErro(null);
                        setSucesso(null);
                        setTexto("");
                        setPainel({ id: d.id, modo: "reportar" });
                      }}
                    >
                      Dar notícia
                    </Button>
                  )}
                  {d.podeEntregar && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setErro(null);
                        setSucesso(null);
                        setTexto("");
                        setPainel({ id: d.id, modo: "entregar" });
                      }}
                    >
                      Entregar
                    </Button>
                  )}
                </div>

                {painel?.id === d.id && (
                  <div className="mt-2 space-y-2">
                    {painel.modo === "entregar" && (
                      <p className="text-xs text-muted-foreground">
                        Quem pediu vai conferir com <strong>{d.evidenciaRotulo.toLowerCase()}</strong>.
                      </p>
                    )}
                    <textarea
                      className={CAMPO}
                      rows={2}
                      placeholder={
                        painel.modo === "entregar"
                          ? "A prova do que foi feito"
                          : "Onde está — o que já andou e o que falta"
                      }
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={enviando || texto.trim().length === 0}
                        onClick={() =>
                          painel.modo === "entregar"
                            ? agir(
                                () => entregarNoPortal({ id: d.id, evidencia: texto }),
                                "Entregue. Agora é com quem pediu.",
                              )
                            : agir(
                                () => reportarNoPortal({ id: d.id, conteudo: texto }),
                                "Notícia enviada.",
                              )
                        }
                      >
                        {painel.modo === "entregar" ? "Entregar" : "Enviar"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPainel(null)}>
                        Fechar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
