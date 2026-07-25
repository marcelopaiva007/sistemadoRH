"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { criarDependente, atualizarDependente, excluirDependente } from "@/lib/actions/rh-dependentes";
import { PARENTESCOS, parentescoLabel } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import { CampoCheckbox, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";

type Dependente = {
  id: string;
  nome: string;
  parentesco: string;
  dataNascimento: Date | null;
  cpf: string | null;
  irrf: boolean;
  salarioFamilia: boolean;
  planoSaude: boolean;
};

export function DependentesCard({
  empresaId,
  colaboradorId,
  dependentes,
}: {
  empresaId: string;
  colaboradorId: string;
  dependentes: Dependente[];
}) {
  const [novoAberto, setNovoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Dependente | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dependentes</CardTitle>
        <CardDescription>
          Quem entra em IRRF, salário-família e plano de saúde — a base do bloco de benefícios.
        </CardDescription>
        <CardAction>
          <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="size-4" />
              Adicionar
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo dependente</DialogTitle>
              </DialogHeader>
              <FormularioDependente
                action={criarDependente.bind(null, empresaId, colaboradorId)}
                onSuccess={() => setNovoAberto(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {dependentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum dependente cadastrado.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Parentesco</TableHead>
                  <TableHead>Nascimento</TableHead>
                  <TableHead>Conta para</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dependentes.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell>{parentescoLabel(d.parentesco)}</TableCell>
                    <TableCell className="tabular-nums">{formatarData(d.dataNascimento)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {d.irrf && <Badge variant="secondary">IRRF</Badge>}
                        {d.salarioFamilia && <Badge variant="secondary">Salário-família</Badge>}
                        {d.planoSaude && <Badge variant="secondary">Plano de saúde</Badge>}
                        {!d.irrf && !d.salarioFamilia && !d.planoSaude && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEmEdicao(d)}>
                          <Pencil className="size-4" />
                        </Button>
                        <BotaoExcluir
                          onConfirm={async () => {
                            const r = await excluirDependente(empresaId, colaboradorId, d.id);
                            if (r.ok) toast.success("Dependente excluído.");
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

      <Dialog open={!!emEdicao} onOpenChange={(aberto) => !aberto && setEmEdicao(null)}>
        <DialogContent>
          {emEdicao && (
            <>
              <DialogHeader>
                <DialogTitle>Editar dependente</DialogTitle>
              </DialogHeader>
              <FormularioDependente
                action={atualizarDependente.bind(null, empresaId, colaboradorId, emEdicao.id)}
                dependente={emEdicao}
                onSuccess={() => setEmEdicao(null)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FormularioDependente({
  action,
  dependente,
  onSuccess,
}: {
  action: (
    prev: import("@/lib/constants").ActionResult,
    fd: FormData,
  ) => Promise<import("@/lib/constants").ActionResult>;
  dependente?: Dependente;
  onSuccess: () => void;
}) {
  return (
    <FormularioAction action={action} mensagemSucesso="Dependente salvo." onSuccess={onSuccess}>
      <CampoTexto name="nome" label="Nome" defaultValue={dependente?.nome} required autoFocus />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSelect
          name="parentesco"
          label="Parentesco"
          opcoes={PARENTESCOS}
          defaultValue={dependente?.parentesco}
          required
        />
        <CampoData name="dataNascimento" label="Nascimento" defaultValue={dependente?.dataNascimento} />
      </div>
      <CampoTexto name="cpf" label="CPF (opcional)" defaultValue={dependente?.cpf} maxLength={14} />
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Conta para:</p>
        <CampoCheckbox name="irrf" label="Dedução de IRRF" defaultChecked={dependente?.irrf} />
        <CampoCheckbox name="salarioFamilia" label="Salário-família" defaultChecked={dependente?.salarioFamilia} />
        <CampoCheckbox name="planoSaude" label="Plano de saúde" defaultChecked={dependente?.planoSaude} />
      </div>
    </FormularioAction>
  );
}

export function BotaoExcluir({ onConfirm }: { onConfirm: () => Promise<void> }) {
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
    <Button variant="ghost" size="icon" onClick={() => setConfirmando(true)}>
      <Trash2 className="size-4" />
    </Button>
  );
}
