"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarMovimentacao, excluirMovimentacao } from "@/lib/actions/rh-movimentacoes";
import { transferirColaboradorEntreEmpresas } from "@/lib/actions/rh-transferencia-empresa";
import { tipoMovimentacaoLabel } from "@/lib/constants-movimentacao";
import type { OpcaoCatalogo } from "@/lib/catalogos";
import { formatarData } from "@/lib/datas";
import { Campo, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

const SEM_SUPERVISOR = "__sem_supervisor__";
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

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
  empresaAnteriorNome?: string | null;
  empresaNovaNome?: string | null;
  motivo: string | null;
  registradoPorNome: string | null;
};

/** Opções de "Transferir para outra empresa do grupo" (OS 11/11/2026, item 6). */
export type OpcoesTransferencia = {
  empresaAtualNome: string;
  empresas: { id: string; nome: string; marca: string; marcaId: string }[];
  setores: { id: string; nome: string; marcaId: string }[];
  posicoes: { id: string; nome: string; marcaId: string }[];
} | null;

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
  tiposMovimentacaoDisponiveis,
  transferencia = null,
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
  tiposMovimentacaoDisponiveis: OpcaoCatalogo[];
  /** Nulo para ficha encerrada ou grupo de uma empresa só. */
  transferencia?: OpcoesTransferencia;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Carreira</CardTitle>
          <CardDescription>Onde esta pessoa está hoje na estrutura.</CardDescription>
          {transferencia && (
            <CardAction>
              <DialogoTransferencia empresaId={empresaId} colaboradorId={colaboradorId} opcoes={transferencia} />
            </CardAction>
          )}
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
                      opcoes={tiposMovimentacaoDisponiveis.map((t) => ({ value: t.value, label: t.label }))}
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
                        {m.empresaNovaNome && (
                          <div>
                            Empresa: {m.empresaAnteriorNome ?? "—"} → {m.empresaNovaNome}
                          </div>
                        )}
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

// Transferência entre empresas do grupo — OS 11/11/2026, item 6. A ficha
// MUDA de CNPJ e leva o histórico pessoal (lib/transferencia-empresa.ts diz o
// que vai e o que fica). Setor e cargo são escolhidos no catálogo da marca de
// destino, porque o da marca atual não existe lá.
function DialogoTransferencia({
  empresaId,
  colaboradorId,
  opcoes,
}: {
  empresaId: string;
  colaboradorId: string;
  opcoes: NonNullable<OpcoesTransferencia>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [destino, setDestino] = useState("");
  const [setorId, setSetorId] = useState("");
  const [posicaoId, setPosicaoId] = useState("");
  const [dataEfetiva, setDataEfetiva] = useState("");
  const [motivo, setMotivo] = useState("");

  const marcaId = opcoes.empresas.find((e) => e.id === destino)?.marcaId ?? null;
  const setores = marcaId ? opcoes.setores.filter((s) => s.marcaId === marcaId) : [];
  const posicoes = marcaId ? opcoes.posicoes.filter((p) => p.marcaId === marcaId) : [];
  const nomeDestino = opcoes.empresas.find((e) => e.id === destino)?.nome ?? "";

  function confirmar() {
    if (!destino || !setorId || !posicaoId || !dataEfetiva) {
      toast.error("Preencha empresa, setor, cargo e data efetiva.");
      return;
    }
    if (
      !confirm(
        `Transferir esta pessoa de ${opcoes.empresaAtualNome} para ${nomeDestino}? ` +
          "A ficha e o histórico pessoal (dossiê, contracheques, férias, atestados…) passam para a nova empresa.",
      )
    )
      return;
    iniciar(async () => {
      const r = await transferirColaboradorEntreEmpresas(empresaId, colaboradorId, {
        empresaDestinoId: destino,
        setorId,
        posicaoId,
        dataEfetiva,
        motivo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Transferido. ${r.registros} registro(s) e ${r.anexos} anexo(s) foram junto.`);
      setAberto(false);
      router.push(r.destinoUrl);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <ArrowRightLeft className="size-4" />
        Transferir para outra empresa
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir para outra empresa do grupo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Para transferência com o MESMO contrato. Se a pessoa foi demitida e recontratada pela outra empresa,
            use o desligamento com motivo &quot;Transferido&quot; e cadastre a ficha nova.
          </p>
          <Campo label="Empresa de destino">
            <select
              value={destino}
              onChange={(e) => {
                setDestino(e.target.value);
                setSetorId("");
                setPosicaoId("");
              }}
              className={classeSelect}
            >
              <option value="">Escolha…</option>
              {opcoes.empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.marca} · {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Setor no destino">
              <select value={setorId} onChange={(e) => setSetorId(e.target.value)} className={classeSelect} disabled={!destino}>
                <option value="">Escolha…</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cargo no destino">
              <select value={posicaoId} onChange={(e) => setPosicaoId(e.target.value)} className={classeSelect} disabled={!destino}>
                <option value="">Escolha…</option>
                {posicoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo label="Data efetiva">
            <input type="date" value={dataEfetiva} onChange={(e) => setDataEfetiva(e.target.value)} className={classeSelect} />
          </Campo>
          <Campo label="Motivo (opcional)">
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
          </Campo>
          <p className="text-xs text-muted-foreground">
            Ficam na empresa atual (e continuam visíveis nesta ficha): avaliações, treinamentos, ponto, benefícios e
            eventos de folha — são registros daquele empregador. Os benefícios precisam ser lançados de novo no destino.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={pendente} onClick={confirmar}>
              {pendente ? "Transferindo…" : "Transferir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
