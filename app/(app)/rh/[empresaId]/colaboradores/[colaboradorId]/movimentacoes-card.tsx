"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarMovimentacao, excluirMovimentacao } from "@/lib/actions/rh-movimentacoes";
import { TIPOS_MOVIMENTACAO, tipoMovimentacaoLabel } from "@/lib/constants-movimentacao";
import { formatarData } from "@/lib/datas";
import { Campo, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

const SEM_SUPERVISOR = "__sem_supervisor__";
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Movimentacao = {
  id: string;
  tipo: string;
  dataEfetiva: Date;
  setorAnteriorNome: string | null;
  setorNovoNome: string | null;
  posicaoAnteriorNome: string | null;
  posicaoNovaNome: string | null;
  supervisorAnteriorNome: string | null;
  supervisorNovoNome: string | null;
  motivo: string | null;
  registradoPorNome: string | null;
};

export function MovimentacoesCard({
  empresaId,
  colaboradorId,
  setorAtualNome,
  posicaoAtualNome,
  supervisorAtual,
  setores,
  posicoes,
  candidatosSupervisor,
  movimentacoes,
}: {
  empresaId: string;
  colaboradorId: string;
  setorAtualNome: string;
  posicaoAtualNome: string;
  supervisorAtual: { id: string; nome: string } | null;
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
  candidatosSupervisor: { id: string; nome: string }[];
  movimentacoes: Movimentacao[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Carreira</CardTitle>
          <CardDescription>Onde esta pessoa está hoje na estrutura.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Setor</div>
            <div className="text-sm font-medium">{setorAtualNome}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cargo</div>
            <div className="text-sm font-medium">{posicaoAtualNome}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Reporta a</div>
            <div className="text-sm font-medium">
              {supervisorAtual ? (
                <Link href={`/rh/${empresaId}/colaboradores/${supervisorAtual.id}`} className="hover:underline">
                  {supervisorAtual.nome}
                </Link>
              ) : (
                "—"
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentações</CardTitle>
          <CardDescription>Promoções, transferências e mudanças de líder registradas.</CardDescription>
          <CardAction>
            <Dialog open={aberto} onOpenChange={setAberto}>
              <DialogTrigger render={<Button size="sm" />}>
                <Plus className="size-4" />
                Registrar movimentação
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar movimentação</DialogTitle>
                </DialogHeader>
                <FormularioAction
                  action={registrarMovimentacao.bind(null, empresaId, colaboradorId)}
                  textoBotao="Registrar"
                  mensagemSucesso="Movimentação registrada."
                  onSuccess={() => setAberto(false)}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoSelect
                      name="tipo"
                      label="Tipo"
                      opcoes={TIPOS_MOVIMENTACAO.map((t) => ({ value: t.value, label: t.label }))}
                      required
                    />
                    <CampoData name="dataEfetiva" label="Data efetiva" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Preencha só o que mudou. O que ficar em &quot;não alterar&quot; continua igual.
                  </p>
                  <CampoSelect
                    name="novoSetorId"
                    label="Novo setor"
                    placeholder="Não alterar"
                    opcoes={setores.filter((s) => s.nome !== setorAtualNome).map((s) => ({ value: s.id, label: s.nome }))}
                  />
                  <CampoSelect
                    name="novaPosicaoId"
                    label="Novo cargo"
                    placeholder="Não alterar"
                    opcoes={posicoes.filter((p) => p.nome !== posicaoAtualNome).map((p) => ({ value: p.id, label: p.nome }))}
                  />
                  <Campo label="Novo líder">
                    <select name="novoSupervisorId" defaultValue="" className={classeSelect}>
                      <option value="">Não alterar</option>
                      <option value={SEM_SUPERVISOR}>Sem líder</option>
                      {candidatosSupervisor.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <CampoTexto name="motivo" label="Motivo (opcional)" placeholder="Ex: vaga aberta no setor comercial" />
                  <Campo label="Observações">
                    <Textarea name="observacoes" rows={2} />
                  </Campo>
                </FormularioAction>
              </DialogContent>
            </Dialog>
          </CardAction>
        </CardHeader>
        <CardContent>
          {movimentacoes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Mudança</TableHead>
                    <TableHead>Registrado por</TableHead>
                    <TableHead className="w-16 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentacoes.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="tabular-nums">{formatarData(m.dataEfetiva)}</TableCell>
                      <TableCell className="font-medium">{tipoMovimentacaoLabel(m.tipo)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.setorNovoNome && (
                          <div>
                            Setor: {m.setorAnteriorNome ?? "—"} → {m.setorNovoNome}
                          </div>
                        )}
                        {m.posicaoNovaNome && (
                          <div>
                            Cargo: {m.posicaoAnteriorNome ?? "—"} → {m.posicaoNovaNome}
                          </div>
                        )}
                        {(m.supervisorNovoNome || m.supervisorAnteriorNome) && (
                          <div>
                            Líder: {m.supervisorAnteriorNome ?? "—"} → {m.supervisorNovoNome ?? "—"}
                          </div>
                        )}
                        {m.motivo && <div className="italic">{m.motivo}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.registradoPorNome ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <BotaoExcluir
                          onConfirm={async () => {
                            const r = await excluirMovimentacao(empresaId, m.id);
                            if (r.ok) toast.success("Registro excluído.");
                            else toast.error(r.error);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
