"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { criarReuniao } from "@/lib/actions/delegacoes";
import type { PessoaParaDelegar } from "@/lib/delegacoes/pessoas";
import { OPCOES_CRITICIDADE } from "@/lib/constants-delegacoes";

// A tela de Reuniões. A regra (o que uma reunião exige, como vira demanda de
// convocado) mora em lib/delegacoes/reunioes.ts e na action; aqui é só
// formulário e leitura.

export type ReuniaoLinha = {
  id: string;
  titulo: string;
  pauta: string | null;
  local: string | null;
  quandoTexto: string;
  passada: boolean;
  convocados: { demandaId: string; nome: string; status: string; emRisco: boolean }[];
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

/**
 * O status da demanda TRADUZIDO para a pergunta desta tela ("quem confirmou
 * presença?") — não o rótulo genérico da máquina. ENVIADA numa reunião é
 * "ainda não confirmou", não "aguardando aceite".
 */
const ROTULO_CONVOCADO: Record<string, string> = {
  ENVIADA: "não confirmou ainda",
  ACEITA: "confirmou presença",
  EM_EXECUCAO: "confirmou presença",
  ENTREGUE: "participação registrada",
  ENCERRADA: "concluída",
  CANCELADA: "cancelada",
  RASCUNHO: "rascunho",
};

function BadgeConvocado({ status, emRisco }: { status: string; emRisco: boolean }) {
  const rotulo = ROTULO_CONVOCADO[status] ?? status;
  if (status === "ACEITA" || status === "EM_EXECUCAO" || status === "ENTREGUE" || status === "ENCERRADA")
    return (
      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-700">
        {rotulo}
      </Badge>
    );
  if (status === "CANCELADA") return <Badge variant="outline">{rotulo}</Badge>;
  return <Badge variant={emRisco ? "destructive" : "secondary"}>{rotulo}</Badge>;
}

// Mesma normalização do seletor de Delegadas: "jose" acha "José".
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Quantas pessoas a pesquisa mostra por vez — o resto pede mais letras. */
const LIMITE_PESQUISA = 20;

export function ReunioesView({
  reunioes,
  pessoas,
  marcas,
}: {
  reunioes: ReuniaoLinha[];
  pessoas: PessoaParaDelegar[];
  marcas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [formAberto, setFormAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<Map<string, PessoaParaDelegar>>(new Map());

  function texto(nome: string) {
    return {
      value: campos[nome] ?? "",
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
      ) => setCampos((c) => ({ ...c, [nome]: e.target.value })),
    };
  }

  function alternar(p: PessoaParaDelegar) {
    setEscolhidos((atual) => {
      const novo = new Map(atual);
      if (novo.has(p.id)) novo.delete(p.id);
      else novo.set(p.id, p);
      return novo;
    });
  }

  // Favoritos sempre visíveis; o resto do quadro aparece pela pesquisa — o
  // mesmo desenho do seletor de Delegadas (centenas de nomes não viram lista).
  const candidatos = useMemo(() => {
    const b = semAcento(busca.trim());
    const favoritos = pessoas.filter((p) => p.favorito);
    if (!b) return favoritos;
    return pessoas.filter((p) => semAcento(p.nome).includes(b)).slice(0, LIMITE_PESQUISA);
  }, [pessoas, busca]);

  function marcar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await criarReuniao({
        titulo: campos.titulo ?? "",
        pauta: campos.pauta ?? "",
        local: campos.local ?? "",
        dataHora: campos.dataHora ?? "",
        criticidade: Number(campos.criticidade || 3),
        marcaId: campos.marcaId || null,
        convocados: [...escolhidos.values()].map((p) => ({ id: p.id, idEhFicha: p.idEhFicha })),
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      if (r.aviso) setAviso(r.aviso);
      setFormAberto(false);
      setCampos({});
      setEscolhidos(new Map());
      setBusca("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reuniões</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Marque uma vez e convoque todo mundo: cada convocado recebe a própria demanda no
            Telegram e no e-mail — aceitar é confirmar presença, e a cobrança automática lembra
            quem não confirmou. Depois da reunião, encerre cada demanda aceitando a participação
            ou dando a baixa em quem compareceu.
          </p>
        </div>
        {!formAberto && (
          <Button
            onClick={() => {
              setCampos({ criticidade: "3" });
              setFormAberto(true);
            }}
          >
            Marcar reunião
          </Button>
        )}
      </div>

      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {aviso}
        </p>
      )}

      {formAberto && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marcar reunião</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-muted-foreground">Assunto</span>
                <input className={CAMPO} maxLength={120} {...texto("titulo")} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Data e hora</span>
                <input type="datetime-local" className={CAMPO} {...texto("dataHora")} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Local ou link (opcional)
                </span>
                <input className={CAMPO} {...texto("local")} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Criticidade</span>
                <select className={CAMPO} {...texto("criticidade")}>
                  {OPCOES_CRITICIDADE.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Marca (opcional)</span>
                <select className={CAMPO} {...texto("marcaId")}>
                  <option value="">—</option>
                  {marcas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-muted-foreground">Pauta (opcional)</span>
                <textarea className={CAMPO} rows={2} {...texto("pauta")} />
              </label>
            </div>

            <div>
              <span className="mb-1 block text-xs text-muted-foreground">
                Convocados — {escolhidos.size} escolhido(s)
              </span>
              {escolhidos.size > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {[...escolhidos.values()].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs hover:bg-muted/70"
                      onClick={() => alternar(p)}
                      title="Clique para tirar da lista"
                    >
                      {p.nome} ✕
                    </button>
                  ))}
                </div>
              )}
              <div className="relative mb-2">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={`Pesquisar pelo nome — ${pessoas.length} pessoas`}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
                {candidatos.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {busca.trim()
                      ? "Ninguém com esse nome."
                      : "Sem favoritos ainda — pesquise pelo nome."}
                  </p>
                )}
                {candidatos.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={escolhidos.has(p.id)}
                      onChange={() => alternar(p)}
                    />
                    <span className="min-w-0 truncate">
                      {p.favorito ? "★ " : ""}
                      {p.marcaNome ? `${p.marcaNome} · ` : ""}
                      {p.nome}
                      {p.cargo ? ` — ${p.cargo}` : ""}
                    </span>
                    {!p.temTelegram && (
                      <span className="ml-auto shrink-0 text-[11px] text-amber-600 dark:text-amber-500">
                        sem Telegram
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={pendente || escolhidos.size === 0} onClick={marcar}>
                Marcar e convocar {escolhidos.size > 0 ? `(${escolhidos.size})` : ""}
              </Button>
              <Button variant="ghost" onClick={() => setFormAberto(false)}>
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {reunioes.length === 0 && !formAberto && (
        <p className="text-sm text-muted-foreground">
          Nenhuma reunião marcada ainda — a primeira nasce no botão acima.
        </p>
      )}

      {reunioes.map((r) => (
        <Card key={r.id} className={r.passada ? "opacity-80" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {r.titulo}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {r.quandoTexto}
                {r.local ? ` · ${r.local}` : ""}
                {r.passada ? " · já aconteceu" : ""}
              </span>
            </CardTitle>
            {r.pauta && (
              <p className="text-sm whitespace-pre-line text-muted-foreground">{r.pauta}</p>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {r.convocados.map((c) => (
                <div key={c.demandaId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                  <BadgeConvocado status={c.status} emRisco={c.emRisco} />
                  <Link
                    href={`/delegacoes/${c.demandaId}`}
                    className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    abrir demanda
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
