"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registrarInfracao, indicarCondutor, sugerirCondutor } from "@/lib/actions/processos-frota";
import { NATUREZAS, STATUS_INDICACAO, STATUS_PROCESSUAL, formatarPlaca, rotulo } from "@/lib/processos/ctb";

export type MultaNaTela = {
  id: string;
  numeroAIT: string;
  placa: string;
  veiculoId: string;
  dataHoraInfracaoISO: string;
  dataHoraInfracaoTexto: string;
  descricao: string | null;
  natureza: string | null;
  pontos: number;
  valorOriginal: number | null;
  statusIndicacao: string;
  statusProcessual: string;
  prazoIndicacaoTexto: string;
  diasParaIndicar: number | null;
  condutorIndicadoNome: string | null;
  empresaNome: string;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function MultasView({
  empresaId,
  multas,
  veiculos,
  condutores,
  foco,
}: {
  empresaId: string;
  multas: MultaNaTela[];
  veiculos: { id: string; placa: string; modelo: string | null }[];
  condutores: { id: string; nome: string }[];
  /** Id da multa que a Central mandou abrir — rola até ela e abre a indicação. */
  foco: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  // O deep link da Central NÃO abre o painel de indicação — só rola até a
  // multa e a destaca. Dois motivos: (1) abrir o painel exige a consulta de
  // sugestão, que só o clique dispara — semeado pelo foco, o painel ficava
  // eternamente em "Procurando…"; (2) o mesmo `?foco=` serve a três ações da
  // Central (indicar, defesa, recurso) — abrir o painel de indicação numa
  // multa que veio pelo botão "Abrir defesa" seria a ação errada com cara de
  // atalho.
  const [indicando, setIndicando] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<{
    condutorId: string | null;
    nome: string | null;
    origem?: "alocacao" | "cadastro" | null;
  } | null>(null);
  const focoRef = useRef<HTMLDivElement>(null);

  // Rolagem do deep link. Só na montagem — não faz setState (o eslint barra).
  useEffect(() => {
    if (foco) focoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [foco]);

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...(f ?? {}), [nome]: e.target.value })),
    };
  }

  function salvar() {
    if (!form) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarInfracao({
        empresaId,
        veiculoId: form.veiculoId ?? "",
        numeroAIT: form.numeroAIT ?? "",
        orgaoAutuador: form.orgaoAutuador ?? null,
        dataHoraInfracao: form.dataHoraInfracao ?? "",
        descricao: form.descricao ?? null,
        natureza: form.natureza || null,
        geraPontos: form.geraPontos !== "nao",
        valorOriginal: form.valorOriginal ? Number(form.valorOriginal) : null,
        dataExpedicaoNA: form.dataExpedicaoNA ?? null,
        recebidaViaSne: form.recebidaViaSne === "sim",
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setForm(null);
      router.refresh();
    });
  }

  function abrirIndicacao(m: MultaNaTela) {
    setIndicando(m.id);
    setSugestao(null);
    setErro(null);
    // A pergunta que a AlocacaoVeiculo existe para responder: quem estava com
    // a placa naquele instante. Vem preenchida; a pessoa confirma ou corrige.
    iniciar(async () => {
      const r = await sugerirCondutor({ empresaId, veiculoId: m.veiculoId, quando: m.dataHoraInfracaoISO });
      if (r.ok) setSugestao({ condutorId: r.condutorId, nome: r.nome, origem: r.origem });
    });
  }

  function confirmarIndicacao(multaId: string, condutorId: string) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await indicarCondutor({ empresaId, infracaoId: multaId, condutorId, formaIndicacao: "TERMO_RESPONSABILIDADE" });
      if (!r.ok) {
        // Falha de verdade: nada foi gravado (multa já indicada, sem acesso).
        setErro(r.error);
        return;
      }
      // Gravou. `aviso` é o caso "indicada, mas fora do prazo".
      if (r.aviso) setAviso(r.aviso);
      setIndicando(null);
      setSugestao(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{erro}</p>
      )}
      {aviso && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">{aviso}</p>
      )}

      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => setForm({ geraPontos: "sim" })}>
          <Plus className="size-4" />
          Registrar multa
        </Button>
      </div>

      {form && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Registrar multa</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Veículo
              <select {...campo("veiculoId")} className={CAMPO}>
                <option value="">Escolha…</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>{formatarPlaca(v.placa)}{v.modelo ? ` · ${v.modelo}` : ""}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Nº do auto (AIT)
              <input {...campo("numeroAIT")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Data e hora da infração
              <input {...campo("dataHoraInfracao")} type="datetime-local" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Órgão autuador
              <input {...campo("orgaoAutuador")} className={CAMPO} placeholder="DETRAN-SP, PRF…" />
            </label>
            <label className="text-xs text-muted-foreground">
              Natureza
              <select {...campo("natureza")} className={CAMPO}>
                <option value="">—</option>
                {NATUREZAS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Pontua na CNH?
              <select {...campo("geraPontos")} className={CAMPO}>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Leia no auto: sete infrações do CTB não pontuam, mesmo sendo graves.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Valor (R$)
              <input {...campo("valorOriginal")} className={CAMPO} inputMode="decimal" />
            </label>
            <label className="text-xs text-muted-foreground">
              Data da notificação de autuação
              <input {...campo("dataExpedicaoNA")} type="date" className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                É dela que o prazo de 30 dias para indicar o condutor começa a contar.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Recebida pelo SNE?
              <select {...campo("recebidaViaSne")} className={CAMPO}>
                <option value="">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Descrição
              <input {...campo("descricao")} className={CAMPO} placeholder="Ex.: avanço de sinal vermelho" />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setErro(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {multas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma multa registrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {multas.map((m) => {
            const aIndicar = m.statusIndicacao === "PENDENTE";
            const atrasada = aIndicar && m.diasParaIndicar !== null && m.diasParaIndicar < 0;
            const emFoco = m.id === foco;
            return (
              <Card
                key={m.id}
                ref={emFoco ? focoRef : undefined}
                className={cn(
                  atrasada && "border-destructive/50",
                  !atrasada && aIndicar && m.diasParaIndicar !== null && m.diasParaIndicar <= 7 && "border-amber-500/50",
                  emFoco && "ring-2 ring-primary/40",
                )}
              >
                <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{formatarPlaca(m.placa)}</span>
                      <span className="text-sm text-muted-foreground">AIT {m.numeroAIT}</span>
                      {m.natureza && <Badge variant="outline" className="font-normal">{rotulo(NATUREZAS, m.natureza)}</Badge>}
                      <Badge variant="secondary" className="font-normal">{rotulo(STATUS_PROCESSUAL, m.statusProcessual)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {m.dataHoraInfracaoTexto}
                      {m.descricao ? ` · ${m.descricao}` : ""}
                      {m.pontos > 0 ? ` · ${m.pontos} pontos` : " · sem pontos"}
                      {m.valorOriginal !== null
                        ? ` · ${m.valorOriginal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.empresaNome}
                      {m.condutorIndicadoNome && (
                        <> · condutor: <span className="text-foreground">{m.condutorIndicadoNome}</span></>
                      )}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {aIndicar ? (
                      <>
                        <p
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            atrasada ? "text-destructive" : m.diasParaIndicar !== null && m.diasParaIndicar <= 7 ? "text-amber-600 dark:text-amber-500" : "",
                          )}
                        >
                          {m.diasParaIndicar === null
                            ? "sem data de notificação"
                            : atrasada
                              ? `prazo perdido há ${Math.abs(m.diasParaIndicar)}d`
                              : `${m.diasParaIndicar}d para indicar`}
                        </p>
                        <p className="text-[11px] text-muted-foreground">até {m.prazoIndicacaoTexto}</p>
                        {indicando !== m.id && (
                          <Button size="sm" className="mt-2 gap-2" variant={atrasada ? "destructive" : "default"} onClick={() => abrirIndicacao(m)}>
                            <UserCheck className="size-4" />
                            Indicar condutor
                          </Button>
                        )}
                      </>
                    ) : (
                      <Badge variant={m.statusIndicacao === "PERDIDO" ? "destructive" : "secondary"}>
                        {rotulo(STATUS_INDICACAO, m.statusIndicacao)}
                      </Badge>
                    )}
                  </div>
                </CardContent>

                {indicando === m.id && (
                  <CardContent className="border-t pt-3">
                    {sugestao?.condutorId ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Sparkles className="size-4 text-primary" />
                        <span className="text-sm">
                          {sugestao.origem === "cadastro" ? (
                            <>
                              Pelo cadastro do veículo, o motorista é <strong>{sugestao.nome}</strong>{" "}
                              (sem termo de alocação registrado).
                            </>
                          ) : (
                            <>
                              Pelo registro de entrega, <strong>{sugestao.nome}</strong> estava com o
                              veículo nesse momento.
                            </>
                          )}
                        </span>
                        <Button size="sm" disabled={pendente} onClick={() => confirmarIndicacao(m.id, sugestao.condutorId!)}>
                          Confirmar e indicar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSugestao({ condutorId: null, nome: null })}>
                          Foi outra pessoa
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {sugestao === null ? "Procurando quem estava com o veículo…" : "Ninguém registrado com o veículo nessa data. Quem dirigia?"}
                        </span>
                        {sugestao !== null &&
                          condutores.map((c) => (
                            <Button key={c.id} size="sm" variant="outline" disabled={pendente} onClick={() => confirmarIndicacao(m.id, c.id)}>
                              {c.nome}
                            </Button>
                          ))}
                        <Button size="sm" variant="ghost" onClick={() => { setIndicando(null); setSugestao(null); }}>Cancelar</Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
