"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { criarVaga } from "@/lib/actions/rh-vagas";
import { statusVagaLabel } from "@/lib/constants-ats";
import { TIPOS_CONTRATO } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";
import { Indicador } from "@/components/indicador";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Vaga = {
  id: string;
  titulo: string;
  status: string;
  publicada: boolean;
  slug: string;
  quantidade: number;
  abertaEm: Date;
  setorNome: string | null;
  posicaoNome: string | null;
  totalCandidatos: number;
  emAndamento: number;
  contratados: number;
};

const varianteStatus: Record<string, "default" | "secondary" | "outline"> = {
  ABERTA: "default",
  PAUSADA: "outline",
  ENCERRADA: "secondary",
};

export function VagasView({
  empresaId,
  vagas,
  setores,
  posicoes,
}: {
  empresaId: string;
  vagas: Vaga[];
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
}) {
  const [criarAberto, setCriarAberto] = useState(false);
  const { itensDaPagina: vagasNaPagina, ...paginacao } = usePaginacao(vagas);

  const abertas = vagas.filter((v) => v.status === "ABERTA").length;
  const candidatosAtivos = vagas.reduce((s, v) => s + v.emAndamento, 0);
  const posicoesEmAberto = vagas.filter((v) => v.status === "ABERTA").reduce((s, v) => s + v.quantidade, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Vagas &amp; recrutamento</h2>
          <p className="text-sm text-muted-foreground">
            Funil de candidatos por vaga. Vaga publicada ganha uma página pública de inscrição.
          </p>
        </div>
        <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova vaga
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <NovaVagaForm
              empresaId={empresaId}
              setores={setores}
              posicoes={posicoes}
              onSuccess={() => setCriarAberto(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Vagas abertas" valor={abertas} />
        <Indicador rotulo="Posições em aberto" valor={posicoesEmAberto} />
        <Indicador rotulo="Candidatos em processo" valor={candidatosAtivos} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Página de carreiras</span> — um endereço só,
          com as vagas publicadas de todo o grupo. É este que se divulga.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href="/carreiras" target="_blank" rel="noreferrer" />}>
            Abrir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${window.location.origin}/carreiras`;
              navigator.clipboard.writeText(url).then(
                () => toast.success("Link de carreiras copiado."),
                () => toast.error("Não foi possível copiar. O link é: " + url),
              );
            }}
          >
            <Copy className="size-3.5" />
            Copiar link
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vagas</CardTitle>
          <CardDescription>Abertas primeiro. Clique para ver o funil de candidatos.</CardDescription>
        </CardHeader>
        <CardContent>
          {vagas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma vaga cadastrada ainda.</p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vaga</TableHead>
                    <TableHead>Setor / cargo</TableHead>
                    <TableHead>Aberta em</TableHead>
                    <TableHead>Candidatos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Página pública</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vagasNaPagina.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <Link href={`/rh/${empresaId}/vagas/${v.id}`} className="font-medium hover:underline">
                          {v.titulo}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {v.quantidade} posição(ões)
                          {v.contratados > 0 && ` · ${v.contratados} contratado(s)`}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {v.setorNome ?? "—"}
                        {v.posicaoNome && <span className="block text-xs">{v.posicaoNome}</span>}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{formatarData(v.abertaEm)}</TableCell>
                      <TableCell className="tabular-nums">
                        {v.emAndamento} <span className="text-xs text-muted-foreground">de {v.totalCandidatos}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={varianteStatus[v.status] ?? "outline"}>{statusVagaLabel(v.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        {v.publicada && v.status === "ABERTA" ? (
                          <BotaoCopiarLink slug={v.slug} />
                        ) : (
                          <span className="text-xs text-muted-foreground">não publicada</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4">
            <Paginacao
              total={paginacao.total}
              porPagina={paginacao.porPagina}
              paginaAtual={paginacao.paginaAtual}
              totalPaginas={paginacao.totalPaginas}
              onMudarPagina={paginacao.irPara}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BotaoCopiarLink({ slug }: { slug: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        const url = `${window.location.origin}/vagas/${slug}`;
        navigator.clipboard.writeText(url).then(
          () => toast.success("Link da vaga copiado."),
          () => toast.error("Não foi possível copiar. O link é: " + url),
        );
      }}
    >
      <Copy className="size-3.5" />
      Copiar link
    </Button>
  );
}


function NovaVagaForm({
  empresaId,
  setores,
  posicoes,
  onSuccess,
}: {
  empresaId: string;
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarVaga(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Vaga criada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova vaga</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" placeholder="Ex.: Técnico de instalação" required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="setorId">Setor</Label>
          <select id="setorId" name="setorId" defaultValue="" className={classeSelect}>
            <option value="">—</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="posicaoId">Cargo</Label>
          <select id="posicaoId" name="posicaoId" defaultValue="" className={classeSelect}>
            <option value="">—</option>
            {posicoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantidade">Posições</Label>
          <Input id="quantidade" name="quantidade" type="number" min={1} defaultValue={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tipoContrato">Tipo de contrato</Label>
          <select id="tipoContrato" name="tipoContrato" defaultValue="" className={classeSelect}>
            <option value="">—</option>
            {TIPOS_CONTRATO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="faixaSalarial">Faixa salarial (aparece na página pública)</Label>
        <Input id="faixaSalarial" name="faixaSalarial" placeholder="Ex.: A combinar" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="requisitos">Requisitos</Label>
        <Textarea id="requisitos" name="requisitos" rows={3} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="publicada" value="true" className="size-4 rounded border-input accent-primary" />
        Publicar a página de inscrição agora
      </label>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar vaga"}
        </Button>
      </DialogFooter>
    </form>
  );
}
