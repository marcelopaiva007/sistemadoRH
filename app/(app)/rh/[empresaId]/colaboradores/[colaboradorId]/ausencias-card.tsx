"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarAusencia, decidirAusencia, excluirAusencia } from "@/lib/actions/rh-ausencias";
import {
  MIMES_ANEXO_ACEITOS,
  TIPOS_AUSENCIA,
  statusSolicitacaoLabel,
  tipoAusenciaLabel,
} from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import { Campo, CampoCheckbox, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";
import { VariantePorStatus } from "./ferias-card";

type Ausencia = {
  id: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  abonada: boolean;
  cid: string | null;
  profissional: string | null;
  registroProfissional: string | null;
  observacoes: string | null;
  status: string;
  motivoDecisao: string | null;
  decididoPorNome: string | null;
  registradoPorNome: string | null;
  arquivo: { id: string; nome: string; mimeType: string; tamanhoBytes: number } | null;
};

export function AusenciasCard({
  empresaId,
  colaboradorId,
  ausencias,
}: {
  empresaId: string;
  colaboradorId: string;
  ausencias: Ausencia[];
}) {
  const [novoAberto, setNovoAberto] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ausências e atestados</CardTitle>
        <CardDescription>
          Atestados, faltas, licenças e afastamentos. Ausência abonada não conta como falta no
          absenteísmo do setor.
        </CardDescription>
        <CardAction>
          <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="size-4" />
              Registrar ausência
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar ausência</DialogTitle>
              </DialogHeader>
              <FormularioAction
                action={registrarAusencia.bind(null, empresaId, colaboradorId)}
                textoBotao="Registrar"
                mensagemSucesso="Ausência registrada."
                onSuccess={() => setNovoAberto(false)}
              >
                <CampoSelect
                  name="tipo"
                  label="Tipo"
                  opcoes={TIPOS_AUSENCIA.map((t) => ({ value: t.value, label: t.label }))}
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoData name="dataInicio" label="Início" />
                  <CampoData name="dataFim" label="Fim" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto name="profissional" label="Profissional emitente" placeholder="Ex: Dra. Ana Souza" />
                  <CampoTexto name="registroProfissional" label="CRM / CRO" />
                </div>
                <CampoTexto name="cid" label="CID (opcional)" placeholder="Ex: J06" />
                <Campo label="Atestado (PDF ou foto, até 4 MB)">
                  <Input type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
                </Campo>
                <CampoCheckbox name="abonada" label="Ausência abonada (não conta como falta)" defaultChecked />
                <Campo label="Observações">
                  <Textarea name="observacoes" rows={2} />
                </Campo>
              </FormularioAction>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {ausencias.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma ausência registrada.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>Atestado</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ausencias.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {tipoAusenciaLabel(a.tipo)}
                      {!a.abonada && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(não abonada)</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatarData(a.dataInicio)} — {formatarData(a.dataFim)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.dias}</TableCell>
                    <TableCell>
                      {a.arquivo ? (
                        <a
                          href={`/api/rh/${empresaId}/arquivos/${a.arquivo.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm hover:underline"
                        >
                          <FileText className="size-4" />
                          <span className="max-w-32 truncate">{a.arquivo.nome}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={VariantePorStatus(a.status)}>{statusSolicitacaoLabel(a.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {a.status === "PENDENTE" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const r = await decidirAusencia(empresaId, a.id, "APROVADA");
                                if (r.ok) toast.success("Ausência aprovada.");
                                else toast.error(r.error);
                              }}
                            >
                              <Check className="size-4" />
                              Aprovar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const r = await decidirAusencia(empresaId, a.id, "REPROVADA");
                                if (r.ok) toast.success("Ausência reprovada.");
                                else toast.error(r.error);
                              }}
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        )}
                        <BotaoExcluir
                          onConfirm={async () => {
                            const r = await excluirAusencia(empresaId, a.id);
                            if (r.ok) toast.success("Ausência excluída.");
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
  );
}
