"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { registrarEntregas, registrarDevolucao, excluirEntrega } from "@/lib/actions/rh-entregas";
import {
  SITUACAO_ENTREGA_BADGE,
  situacaoDaEntrega,
  tipoEntregaLabel,
} from "@/lib/constants-entregas";
import type { OpcaoCatalogo } from "@/lib/catalogos";
import { formatarData, paraInputDate } from "@/lib/datas";
import { BotaoExcluir } from "./dependentes-card";

type Entrega = {
  id: string;
  tipo: string;
  descricao: string | null;
  dataEntrega: Date;
  confirmadoEm: Date | null;
  devolvidoEm: Date | null;
  entreguePorNome: string | null;
  observacoes: string | null;
};

/**
 * A aba "Entregas" da ficha: o RELATÓRIO POR PESSOA do que a tela
 * /rh/[empresaId]/entregas mostra por empresa.
 *
 * As duas telas leem a MESMA tabela e as MESMAS regras de
 * lib/constants-entregas.ts — aqui não existe conta própria. A da empresa
 * responde "quem ainda não confirmou o lote?"; esta responde "o que ESTA
 * pessoa tem?", que é a pergunta do desligamento e a que o próprio
 * colaborador faz ao RH.
 *
 * O registro individual daqui reusa registrarEntregas com uma lista de um:
 * o notebook do recém-chegado se registra da ficha dele, sem ir à tela de
 * lote escolher uma pessoa entre 171.
 */
export function EntregasCard({
  empresaId,
  colaboradorId,
  entregas,
  tiposEntregaDisponiveis,
}: {
  empresaId: string;
  colaboradorId: string;
  entregas: Entrega[];
  tiposEntregaDisponiveis: OpcaoCatalogo[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState(tiposEntregaDisponiveis[0]?.value ?? "");
  const [descricao, setDescricao] = useState("");
  const [dataEntrega, setDataEntrega] = useState(paraInputDate(new Date()));
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [agindo, setAgindo] = useState(false);

  const aguardando = entregas.filter((e) => situacaoDaEntrega(e) === "AGUARDANDO").length;

  async function salvar() {
    setSalvando(true);
    const r = await registrarEntregas({
      empresaId,
      colaboradorIds: [colaboradorId],
      tipo,
      descricao,
      dataEntrega,
      observacoes,
    });
    setSalvando(false);
    if (r.ok) {
      toast.success(
        (r.avisados ?? 0) > 0
          ? "Entrega registrada — a pessoa foi avisada pelo Telegram para confirmar."
          : "Entrega registrada. Sem Telegram vinculado ela não recebe aviso — cobre a confirmação pessoalmente.",
        { duration: (r.avisados ?? 0) > 0 ? 5000 : 10000 },
      );
      setAberto(false);
      setDescricao("");
      setObservacoes("");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function devolver(entrega: Entrega) {
    setAgindo(true);
    const r = await registrarDevolucao(empresaId, entrega.id);
    setAgindo(false);
    if (r.ok) {
      toast.success(`Devolução de ${tipoEntregaLabel(entrega.tipo)} registrada.`);
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="size-4" />
          Entregas
        </CardTitle>
        <CardDescription>
          O que a empresa entregou a esta pessoa — cartão, notebook, uniforme. A confirmação vem
          dela, pelo portal, nunca daqui.
          {aguardando > 0 && (
            <span className="mt-1 block text-muted-foreground">
              {aguardando} entrega(s) aguardando a confirmação do colaborador.
            </span>
          )}
        </CardDescription>
        <CardAction>
          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="size-4" />
              Registrar entrega
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar entrega para esta pessoa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label required>Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha o tipo…" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposEntregaDisponiveis.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Falta um tipo?{" "}
                      <Link
                        href={`/rh/${empresaId}/catalogos?categoria=TIPO_ENTREGA`}
                        className="underline hover:text-foreground"
                      >
                        Cadastre no catálogo
                      </Link>{" "}
                      ou use o botão de novo tipo da tela de Entregas.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entrega-data" required>
                      Data da entrega
                    </Label>
                    <Input
                      id="entrega-data"
                      type="date"
                      value={dataEntrega}
                      onChange={(e) => setDataEntrega(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entrega-descricao">Descrição</Label>
                  <Input
                    id="entrega-descricao"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex.: Dell i5 · patrimônio 118"
                    maxLength={200}
                  />
                  <p className="text-xs text-muted-foreground">
                    É o que a pessoa lê no portal na hora de confirmar. Aqui é o lugar do número de
                    série ou patrimônio — a entrega é só desta pessoa.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entrega-obs">Observações (internas)</Label>
                  <Textarea
                    id="entrega-obs"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={2}
                    maxLength={500}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
                <Button type="button" disabled={salvando || !tipo} onClick={salvar}>
                  {salvando ? "Registrando…" : "Registrar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {entregas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nada entregue a esta pessoa ainda.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Entregue</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entregas.map((e) => {
                  const situacao = situacaoDaEntrega(e);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {tipoEntregaLabel(e.tipo)}
                        {(e.descricao || e.observacoes) && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {[e.descricao, e.observacoes].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatarData(e.dataEntrega)}
                        {e.entreguePorNome && (
                          <span className="block text-xs text-muted-foreground">
                            por {e.entreguePorNome}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={situacao} map={SITUACAO_ENTREGA_BADGE} />
                        {(e.confirmadoEm || e.devolvidoEm) && (
                          <span className="block text-xs text-muted-foreground">
                            em {formatarData(e.devolvidoEm ?? e.confirmadoEm)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {situacao !== "DEVOLVIDA" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={agindo}
                              onClick={() => devolver(e)}
                              title="Marcar como devolvido"
                            >
                              <Undo2 className="size-3.5" />
                              Devolvido
                            </Button>
                          )}
                          {/* Só o que a pessoa ainda não confirmou pode ser
                              apagado — a action recusa o resto, e o botão não
                              promete o que ela não faz. */}
                          {situacao === "AGUARDANDO" && (
                            <BotaoExcluir
                              onConfirm={async () => {
                                const r = await excluirEntrega(empresaId, e.id);
                                if (r.ok) {
                                  toast.success("Entrega apagada.");
                                  router.refresh();
                                } else {
                                  toast.error(r.error);
                                }
                              }}
                            />
                          )}
                        </div>
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
  );
}
