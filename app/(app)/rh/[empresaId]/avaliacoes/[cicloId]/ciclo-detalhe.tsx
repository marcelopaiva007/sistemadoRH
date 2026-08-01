"use client";

import Link from "next/link";
import { Fragment, useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  encerrarCiclo,
  gerarAvaliacoes,
  adicionarAvaliadorExtra,
  enviarConvitesDoCiclo,
  salvarNotasAvaliacao,
  excluirAvaliacao,
} from "@/lib/actions/rh-avaliacao";
import {
  COMPETENCIAS,
  NIVEIS_POTENCIAL,
  faixaDesempenho,
  potencialLabel,
  tipoAvaliadorLabel,
  tipoCicloLabel,
} from "@/lib/constants-avaliacao";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Avaliacao = {
  id: string;
  colaboradorId: string;
  tipoAvaliador: string;
  avaliadorId: string;
  avaliadorNome: string | null;
  notaFinal: number | null;
  potencial: string | null;
  pontosFortes: string | null;
  pontosDesenvolvimento: string | null;
  comentarios: string | null;
  status: string;
  concluidaEm: Date | null;
  colaborador: { nome: string; setor: { nome: string } };
  notas: { competencia: string; nota: number }[];
};

type Ciclo = {
  id: string;
  empresaId: string;
  nome: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  encerrado: boolean;
};

export function CicloDetalhe({
  empresaId,
  ciclo,
  avaliacoes,
  colaboradores,
}: {
  empresaId: string;
  ciclo: Ciclo;
  avaliacoes: Avaliacao[];
  colaboradores: { id: string; nome: string }[];
}) {
  const [gerando, setGerando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [convidando, setConvidando] = useState(false);
  const [confirmarConvite, setConfirmarConvite] = useState(false);
  const [preencher, setPreencher] = useState<Avaliacao | null>(null);
  const [adicionarAberto, setAdicionarAberto] = useState(false);

  const nineBox = montarNineBox(avaliacoes);

  return (
    <div className="space-y-6">
      <Link href={`/rh/${empresaId}/avaliacoes`} className="text-sm text-muted-foreground hover:underline">
        ← Avaliações
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{ciclo.nome}</h2>
            <Badge variant={ciclo.encerrado ? "secondary" : "default"}>
              {ciclo.encerrado ? "Encerrado" : "Aberto"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {tipoCicloLabel(ciclo.tipo)} · {formatarData(ciclo.dataInicio)} a {formatarData(ciclo.dataFim)}
          </p>
        </div>
        {!ciclo.encerrado && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={gerando}
              onClick={async () => {
                setGerando(true);
                const r = await gerarAvaliacoes(empresaId, ciclo.id);
                setGerando(false);
                if (r.ok) toast.success("Avaliações geradas.");
                else toast.error(r.error);
              }}
            >
              {gerando ? "Gerando..." : "Gerar avaliações"}
            </Button>
            <Button variant="outline" disabled={convidando} onClick={() => setConfirmarConvite(true)}>
              <Send className="size-4" />
              {convidando ? "Enviando..." : "Convidar por Telegram"}
            </Button>
            {ciclo.tipo === "360" && (
              <Dialog open={adicionarAberto} onOpenChange={setAdicionarAberto}>
                <DialogTrigger render={<Button variant="outline" />}>
                  <Plus className="size-4" />
                  Avaliador extra
                </DialogTrigger>
                <DialogContent>
                  <AdicionarAvaliadorForm
                    empresaId={empresaId}
                    cicloId={ciclo.id}
                    colaboradores={colaboradores}
                    onSuccess={() => setAdicionarAberto(false)}
                  />
                </DialogContent>
              </Dialog>
            )}
            <Button
              variant="destructive"
              disabled={encerrando}
              onClick={async () => {
                setEncerrando(true);
                const r = await encerrarCiclo(empresaId, ciclo.id);
                setEncerrando(false);
                if (r.ok) toast.success("Ciclo encerrado.");
                else toast.error(r.error);
              }}
            >
              {encerrando ? "Encerrando..." : "Encerrar ciclo"}
            </Button>
          </div>
        )}
      </div>

      {nineBox.algumaCelulaPreenchida && (
        <Card>
          <CardHeader>
            <CardTitle>Nine-box</CardTitle>
            <CardDescription>
              Desempenho (média das competências na avaliação do gestor) × potencial, informado pelo
              gestor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NineBoxGrid nineBox={nineBox} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Avaliações</CardTitle>
          <CardDescription>Uma linha por avaliador de cada colaborador.</CardDescription>
        </CardHeader>
        <CardContent>
          {avaliacoes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma avaliação gerada ainda. Use &quot;Gerar avaliações&quot; acima.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Avaliador</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {avaliacoes.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.colaborador.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{a.colaborador.setor.nome}</TableCell>
                      <TableCell>
                        {tipoAvaliadorLabel(a.tipoAvaliador)}
                        {a.avaliadorNome && <span className="ml-1.5 text-muted-foreground">({a.avaliadorNome})</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">{a.notaFinal ? a.notaFinal.toFixed(1) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "CONCLUIDA" ? "default" : "outline"}>
                          {a.status === "CONCLUIDA" ? "Concluída" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setPreencher(a)}>
                            {a.status === "CONCLUIDA" ? "Ver / editar" : "Preencher"}
                          </Button>
                          <BotaoExcluirAvaliacao
                            onConfirm={async () => {
                              const r = await excluirAvaliacao(empresaId, a.id);
                              if (r.ok) toast.success("Avaliação excluída.");
                              else toast.error(r.error);
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disparo em massa não pode ser um clique só: a mensagem vai para o
          Telegram pessoal de dezenas de pessoas e não tem como voltar atrás. */}
      <Dialog open={confirmarConvite} onOpenChange={setConfirmarConvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar por Telegram</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Vai sair uma mensagem para cada pessoa com avaliação pendente neste ciclo —{" "}
              <strong>{new Set(avaliacoes.filter((a) => a.status !== "CONCLUIDA").map((a) => a.avaliadorId)).size} pessoa(s)</strong>{" "}
              hoje. Uma mensagem por pessoa, não uma por avaliação.
            </p>
            <p className="text-muted-foreground">
              Quem não tem Telegram vinculado fica de fora e aparece na contagem do resultado. Quem
              já respondeu tudo não recebe. Pode repetir depois — vira cobrança de quem falta.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmarConvite(false)}>
              Cancelar
            </Button>
            <Button
              disabled={convidando}
              onClick={async () => {
                setConvidando(true);
                const r = await enviarConvitesDoCiclo(empresaId, ciclo.id);
                setConvidando(false);
                setConfirmarConvite(false);
                if (r.ok && r.resultado) {
                  const { enviados, falhas, semTelegram } = r.resultado;
                  toast.success(
                    `${enviados} convite(s) enviado(s).` +
                      (falhas > 0 ? ` ${falhas} falharam.` : "") +
                      (semTelegram > 0 ? ` ${semTelegram} sem Telegram vinculado.` : ""),
                  );
                } else if (!r.ok) {
                  toast.error(r.error);
                }
              }}
            >
              {convidando ? "Enviando..." : "Enviar agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preencher} onOpenChange={(open) => !open && setPreencher(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {preencher && (
            <PreencherAvaliacaoForm
              empresaId={empresaId}
              avaliacao={preencher}
              onSuccess={() => setPreencher(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function montarNineBox(avaliacoes: Avaliacao[]) {
  const grid: Record<string, Record<string, { nome: string; nota: number }[]>> = {
    ALTO: { BAIXO: [], MEDIO: [], ALTO: [] },
    MEDIO: { BAIXO: [], MEDIO: [], ALTO: [] },
    BAIXO: { BAIXO: [], MEDIO: [], ALTO: [] },
  };
  let algumaCelulaPreenchida = false;

  for (const a of avaliacoes) {
    if (a.tipoAvaliador !== "GESTOR" || a.status !== "CONCLUIDA" || a.notaFinal === null || !a.potencial) continue;
    const desempenho = faixaDesempenho(a.notaFinal);
    grid[a.potencial]?.[desempenho]?.push({ nome: a.colaborador.nome, nota: a.notaFinal });
    algumaCelulaPreenchida = true;
  }

  return { grid, algumaCelulaPreenchida };
}

function NineBoxGrid({ nineBox }: { nineBox: ReturnType<typeof montarNineBox> }) {
  const linhas = ["ALTO", "MEDIO", "BAIXO"] as const;
  const colunas = ["BAIXO", "MEDIO", "ALTO"] as const;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[520px] grid-cols-[100px_repeat(3,1fr)] gap-2">
        <div />
        {colunas.map((c) => (
          <div key={c} className="text-center text-xs font-medium text-muted-foreground">
            Desempenho {potencialLabel(c).toLowerCase()}
          </div>
        ))}
        {linhas.map((linha) => (
          <Fragment key={linha}>
            <div className="flex items-center justify-end pr-2 text-xs font-medium text-muted-foreground">
              Potencial {potencialLabel(linha).toLowerCase()}
            </div>
            {colunas.map((coluna) => {
              const pessoas = nineBox.grid[linha][coluna];
              return (
                <div key={`${linha}-${coluna}`} className="min-h-20 rounded-md border bg-card p-2">
                  {pessoas.length === 0 ? (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  ) : (
                    <ul className="space-y-1">
                      {pessoas.map((p, i) => (
                        <li key={i} className="text-xs">
                          {p.nome}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function AdicionarAvaliadorForm({
  empresaId,
  cicloId,
  colaboradores,
  onSuccess,
}: {
  empresaId: string;
  cicloId: string;
  colaboradores: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [colaboradorId, setColaboradorId] = useState("");
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    if (!colaboradorId) return { ok: false, error: "Escolha quem vai ser avaliado." };
    const result = await adicionarAvaliadorExtra(empresaId, cicloId, colaboradorId, prev, fd);
    if (result.ok) {
      toast.success("Avaliador adicionado.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Adicionar avaliador extra</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label>Colaborador avaliado</Label>
        <select
          value={colaboradorId}
          onChange={(e) => setColaboradorId(e.target.value)}
          required
          className={classeSelect}
        >
          <option value="" disabled>
            Escolha quem vai ser avaliado
          </option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tipoAvaliador">Tipo</Label>
        <select id="tipoAvaliador" name="tipoAvaliador" required defaultValue="" className={classeSelect}>
          <option value="" disabled>
            Par ou subordinado?
          </option>
          <option value="PAR">Par</option>
          <option value="SUBORDINADO">Subordinado</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="avaliadorId">Quem avalia</Label>
        <select id="avaliadorId" name="avaliadorId" required defaultValue="" className={classeSelect}>
          <option value="" disabled>
            Escolha o avaliador
          </option>
          {colaboradores.filter((c) => c.id !== colaboradorId).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adicionando..." : "Adicionar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PreencherAvaliacaoForm({
  empresaId,
  avaliacao,
  onSuccess,
}: {
  empresaId: string;
  avaliacao: Avaliacao;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await salvarNotasAvaliacao(empresaId, avaliacao.id, prev, fd);
    if (result.ok) {
      toast.success("Avaliação salva.");
      onSuccess();
    }
    return result;
  }, initialState);

  const notaDe = (competencia: string) => avaliacao.notas.find((n) => n.competencia === competencia)?.nota ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {avaliacao.colaborador.nome} — {tipoAvaliadorLabel(avaliacao.tipoAvaliador)}
        </DialogTitle>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        {COMPETENCIAS.map((c) => (
          <div key={c.value} className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{c.label}</Label>
            <select name={`nota_${c.value}`} required defaultValue={notaDe(c.value)} className={classeSelect}>
              <option value="" disabled>
                Nota
              </option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {avaliacao.tipoAvaliador === "GESTOR" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Potencial (alimenta o nine-box)
          </Label>
          <select name="potencial" defaultValue={avaliacao.potencial ?? ""} className={classeSelect}>
            <option value="">Não informar</option>
            {NIVEIS_POTENCIAL.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Pontos fortes</Label>
        <Textarea name="pontosFortes" rows={2} defaultValue={avaliacao.pontosFortes ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Pontos de desenvolvimento</Label>
        <Textarea name="pontosDesenvolvimento" rows={2} defaultValue={avaliacao.pontosDesenvolvimento ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Comentários</Label>
        <Textarea name="comentarios" rows={2} defaultValue={avaliacao.comentarios ?? ""} />
      </div>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function BotaoExcluirAvaliacao({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <div className="flex gap-1">
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
            await onConfirm();
            setConfirmando(false);
          }}
        >
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
      Excluir
    </Button>
  );
}
