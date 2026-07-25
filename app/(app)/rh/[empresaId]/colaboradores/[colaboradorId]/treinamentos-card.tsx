"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, GraduationCap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarParticipacao, excluirParticipacao } from "@/lib/actions/rh-treinamentos";
import { MIMES_ANEXO_ACEITOS } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import { Campo, CampoCheckbox, CampoData, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type Participacao = {
  id: string;
  dataRealizacao: Date;
  presente: boolean;
  notaAvaliacao: number | null;
  certificadoEmitido: boolean;
  observacoes: string | null;
  treinamento: { nome: string; categoria: string | null };
  arquivo: { id: string; nome: string } | null;
};

export function TreinamentosCard({
  empresaId,
  colaboradorId,
  participacoes,
  treinamentosAtivos,
}: {
  empresaId: string;
  colaboradorId: string;
  participacoes: Participacao[];
  treinamentosAtivos: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-4" />
          Treinamentos
        </CardTitle>
        <CardDescription>Capacitações realizadas, presença e certificados.</CardDescription>
        <CardAction>
          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger render={<Button size="sm" disabled={treinamentosAtivos.length === 0} />}>
              <Plus className="size-4" />
              Registrar participação
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar participação</DialogTitle>
              </DialogHeader>
              {treinamentosAtivos.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    Nenhum treinamento ativo no catálogo. Cadastre um em Treinamentos antes de registrar
                    participação.
                  </AlertDescription>
                </Alert>
              ) : (
                <FormularioAction
                  action={registrarParticipacao.bind(null, empresaId, colaboradorId)}
                  textoBotao="Registrar"
                  mensagemSucesso="Participação registrada."
                  onSuccess={() => setAberto(false)}
                >
                  <Campo label="Treinamento">
                    <select
                      name="treinamentoId"
                      required
                      defaultValue=""
                      className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="" disabled>
                        Escolha o treinamento
                      </option>
                      {treinamentosAtivos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoData name="dataRealizacao" label="Data de realização" />
                    <CampoTexto name="notaAvaliacao" label="Nota (1 a 5, opcional)" type="number" min={1} max={5} />
                  </div>
                  <Campo label="Certificado (PDF/foto, até 4 MB)">
                    <Input type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
                  </Campo>
                  <div className="flex gap-4">
                    <CampoCheckbox name="presente" label="Presente / concluiu" defaultChecked />
                    <CampoCheckbox name="certificadoEmitido" label="Certificado emitido" />
                  </div>
                  <Campo label="Observações">
                    <Textarea name="observacoes" rows={2} />
                  </Campo>
                </FormularioAction>
              )}
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {participacoes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma participação registrada ainda.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Treinamento</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Presença</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead>Certificado</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {participacoes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.treinamento.nome}
                      {p.treinamento.categoria && (
                        <span className="block text-xs text-muted-foreground">{p.treinamento.categoria}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatarData(p.dataRealizacao)}</TableCell>
                    <TableCell>
                      <Badge variant={p.presente ? "default" : "secondary"}>{p.presente ? "Presente" : "Ausente"}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{p.notaAvaliacao ?? "—"}</TableCell>
                    <TableCell>
                      {p.certificadoEmitido ? (
                        <Badge variant="default">Emitido</Badge>
                      ) : (
                        <Badge variant="outline">Não emitido</Badge>
                      )}
                      {p.arquivo && (
                        <a
                          href={`/api/rh/${empresaId}/arquivos/${p.arquivo.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          <FileText className="size-3.5" />
                          anexo
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      <BotaoExcluir
                        onConfirm={async () => {
                          const r = await excluirParticipacao(empresaId, colaboradorId, p.id);
                          if (r.ok) toast.success("Participação excluída.");
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
  );
}
