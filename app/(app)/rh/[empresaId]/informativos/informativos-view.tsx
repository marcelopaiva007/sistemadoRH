"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Megaphone, Send, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { enviarInformativo, type ResultadoEnvioInformativo } from "@/lib/actions/rh-informativos";
import { MAXIMO_MENSAGEM, MAXIMO_TITULO, type ModoPublico } from "@/lib/constants-informativos";
import { formatarDataHoraBrasilia } from "@/lib/datas";

type Pessoa = { id: string; nome: string; empresaId: string; setorId: string | null; canal: "TELEGRAM" | "EMAIL" | null };
type Enviado = {
  id: string;
  titulo: string;
  publico: string;
  enviadoPorNome: string | null;
  createdAt: Date;
  total: number;
  alcancados: number;
  cientes: number;
};

const inicial: ResultadoEnvioInformativo = { ok: true };

const MODOS: { value: ModoPublico; label: string; ajuda: string }[] = [
  { value: "TODOS", label: "Todos", ajuda: "Todo mundo ativo da marca." },
  { value: "EMPRESAS", label: "Por CNPJ", ajuda: "Todos de um ou mais CNPJs." },
  { value: "SETORES", label: "Por setor", ajuda: "Todos de um ou mais setores." },
  { value: "PESSOAS", label: "Pessoas escolhidas", ajuda: "Uma pessoa ou um grupo que você monta." },
];

export function InformativosView({
  empresaId,
  empresas,
  setores,
  pessoas,
  enviados,
}: {
  empresaId: string;
  empresas: { id: string; nome: string }[];
  setores: { id: string; nome: string; empresaId: string }[];
  pessoas: Pessoa[];
  enviados: Enviado[];
}) {
  const [modo, setModo] = useState<ModoPublico>("PESSOAS");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [formKey, setFormKey] = useState(0);

  const nomeEmpresa = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome])), [empresas]);
  const nomeSetor = useMemo(() => new Map(setores.map((s) => [s.id, s.nome])), [setores]);
  const variasEmpresas = empresas.length > 1;

  // A mesma conta da action, para o RH ver ANTES de enviar quantos recebem e
  // por onde. A action refaz tudo no servidor — isto é só a prévia.
  const publico = useMemo(() => {
    if (modo === "TODOS") return pessoas;
    if (modo === "EMPRESAS") return pessoas.filter((p) => escolhidos.has(p.empresaId));
    if (modo === "SETORES") return pessoas.filter((p) => p.setorId && escolhidos.has(p.setorId));
    return pessoas.filter((p) => escolhidos.has(p.id));
  }, [modo, escolhidos, pessoas]);
  const porTelegram = publico.filter((p) => p.canal === "TELEGRAM").length;
  const porEmail = publico.filter((p) => p.canal === "EMAIL").length;
  const soPortal = publico.length - porTelegram - porEmail;

  const [estado, acao, enviando] = useActionState(async (prev: ResultadoEnvioInformativo, fd: FormData) => {
    const r = await enviarInformativo(prev, fd);
    if (r.ok && r.enviado) {
      const { avisados, semCanal, falhas } = r.enviado;
      toast.success(
        `Informativo enviado: ${avisados} avisada(s)` +
          (semCanal ? `, ${semCanal} sem canal (verão no portal)` : "") +
          (falhas ? `, ${falhas} com falha` : "") +
          ".",
      );
      setEscolhidos(new Set());
      setBusca("");
      setFormKey((k) => k + 1);
    } else if (!r.ok) {
      toast.error(r.error);
    }
    return r;
  }, inicial);

  function alternar(id: string, marcado: boolean) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  function trocarModo(v: ModoPublico) {
    setModo(v);
    setEscolhidos(new Set());
  }

  const termo = busca.trim().toLowerCase();
  const encontradas = termo
    ? pessoas.filter((p) => p.nome.toLowerCase().includes(termo) && !escolhidos.has(p.id)).slice(0, 30)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2">
          <Megaphone className="size-5" />
          Informativos
        </h1>
        <p className="text-sm text-muted-foreground">
          Mande um comunicado para uma pessoa, um setor, um CNPJ ou a marca inteira. Vai pelo Telegram (ou por
          e-mail, para quem não tem Telegram) e fica no portal. Cada pessoa confirma que leu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo informativo</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            key={formKey}
            action={acao}
            className="space-y-5"
            onSubmit={(e) => {
              if (publico.length === 0) {
                e.preventDefault();
                toast.error("Escolha pelo menos um destinatário.");
                return;
              }
              if (!window.confirm(`Enviar este informativo para ${publico.length} pessoa(s)?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="empresaId" value={empresaId} />
            <input type="hidden" name="modo" value={modo} />
            {[...escolhidos].map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}

            <div className="space-y-2">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" name="titulo" required maxLength={MAXIMO_TITULO} placeholder="Ex.: Feriado de 15 de novembro" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mensagem">Mensagem</Label>
              <Textarea
                id="mensagem"
                name="mensagem"
                required
                maxLength={MAXIMO_MENSAGEM}
                rows={6}
                placeholder="O que as pessoas precisam saber."
              />
            </div>

            <div className="space-y-2">
              <Label>Para quem</Label>
              <RadioGroup
                value={modo}
                onValueChange={(v) => trocarModo((v ?? "PESSOAS") as ModoPublico)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {MODOS.map((m) => (
                  <div key={m.value} className="flex items-start gap-2 rounded-md border p-3">
                    <RadioGroupItem value={m.value} id={`modo-${m.value}`} className="mt-0.5" />
                    <div>
                      <Label htmlFor={`modo-${m.value}`} className="font-normal">
                        {m.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{m.ajuda}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {modo === "EMPRESAS" && (
              <ListaDeEscolha
                itens={empresas.map((e) => ({ id: e.id, rotulo: e.nome }))}
                escolhidos={escolhidos}
                alternar={alternar}
              />
            )}
            {modo === "SETORES" && (
              <ListaDeEscolha
                itens={setores.map((s) => ({
                  id: s.id,
                  rotulo: variasEmpresas ? `${s.nome} · ${nomeEmpresa.get(s.empresaId) ?? ""}` : s.nome,
                }))}
                escolhidos={escolhidos}
                alternar={alternar}
              />
            )}
            {modo === "PESSOAS" && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar pelo nome…"
                    className="pl-8"
                  />
                </div>
                {encontradas.length > 0 && (
                  <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
                    {encontradas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          alternar(p.id, true);
                          setBusca("");
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span>{p.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {nomeSetor.get(p.setorId ?? "") ?? ""}
                          {variasEmpresas ? ` · ${nomeEmpresa.get(p.empresaId) ?? ""}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {escolhidos.size > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pessoas
                      .filter((p) => escolhidos.has(p.id))
                      .map((p) => (
                        <Badge key={p.id} variant="secondary" className="gap-1">
                          {p.nome}
                          <button type="button" onClick={() => alternar(p.id, false)} aria-label={`Tirar ${p.nome}`}>
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-md bg-muted p-3 text-sm">
              {publico.length === 0 ? (
                <span className="text-muted-foreground">Ninguém escolhido ainda.</span>
              ) : (
                <>
                  <b>{publico.length}</b> pessoa(s): {porTelegram} pelo Telegram, {porEmail} por e-mail
                  {soPortal > 0 && (
                    <>
                      , <b>{soPortal}</b> sem Telegram nem e-mail — verão só quando abrirem o portal
                    </>
                  )}
                  .
                </>
              )}
            </div>

            {!estado.ok && <p className="text-sm text-destructive">{estado.error}</p>}
            <Button type="submit" disabled={enviando || publico.length === 0}>
              <Send className="size-4" />
              {enviando ? "Enviando…" : "Enviar informativo"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enviados</CardTitle>
          <CardDescription>
            {enviados.length === 0 ? "Nenhum informativo enviado ainda." : "Os 50 mais recentes. Abra para ver quem leu."}
          </CardDescription>
        </CardHeader>
        {enviados.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Informativo</TableHead>
                  <TableHead>Para</TableHead>
                  <TableHead className="text-right">Avisados</TableHead>
                  <TableHead className="text-right">Ciência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enviados.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/rh/${empresaId}/informativos/${i.id}`} className="font-medium hover:underline">
                        {i.titulo}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatarDataHoraBrasilia(i.createdAt)}
                        {i.enviadoPorNome ? ` · ${i.enviadoPorNome}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{i.publico}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.alcancados}/{i.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.cientes}/{i.total}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ListaDeEscolha({
  itens,
  escolhidos,
  alternar,
}: {
  itens: { id: string; rotulo: string }[];
  escolhidos: Set<string>;
  alternar: (id: string, marcado: boolean) => void;
}) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">Nada para escolher aqui.</p>;
  return (
    <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
      {itens.map((i) => (
        <div key={i.id} className="flex items-center gap-2">
          <Checkbox
            id={`escolha-${i.id}`}
            checked={escolhidos.has(i.id)}
            onCheckedChange={(v) => alternar(i.id, !!v)}
          />
          <Label htmlFor={`escolha-${i.id}`} className="font-normal">
            {i.rotulo}
          </Label>
        </div>
      ))}
    </div>
  );
}
