"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { criarDocumento, excluirDocumento } from "@/lib/actions/rh-documentos";
import { MIMES_ANEXO_ACEITOS, TIPOS_DOCUMENTO, tipoDocumentoLabel } from "@/lib/constants-dp";
import { formatarTamanho } from "@/lib/anexos";
import { formatarData, diferencaEmDiasUTC, hojeUTC } from "@/lib/datas";
import { Campo, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type Documento = {
  id: string;
  tipo: string;
  descricao: string | null;
  emitidoEm: Date | null;
  validoAte: Date | null;
  observacoes: string | null;
  criadoPorNome: string | null;
  createdAt: Date;
  arquivo: { id: string; nome: string; mimeType: string; tamanhoBytes: number } | null;
};

/** Etiqueta de validade: nada, vencendo (≤60 dias) ou vencido. */
export function SituacaoValidade({ validoAte }: { validoAte: Date | null }) {
  if (!validoAte) return <span className="text-muted-foreground">—</span>;
  const dias = diferencaEmDiasUTC(validoAte, hojeUTC());
  if (dias < 0) return <Badge variant="destructive">Vencido há {Math.abs(dias)} d</Badge>;
  if (dias <= 60) return <Badge variant="secondary">Vence em {dias} d</Badge>;
  return <span className="tabular-nums">{formatarData(validoAte)}</span>;
}

export function DocumentosCard({
  empresaId,
  colaboradorId,
  documentos,
}: {
  empresaId: string;
  colaboradorId: string;
  documentos: Documento[];
}) {
  const [novoAberto, setNovoAberto] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dossiê digital</CardTitle>
        <CardDescription>
          RG, CTPS, contrato, ASO e certificados de NR. O arquivo fica guardado no banco e só abre por
          link autenticado — todo download entra na trilha de auditoria.
        </CardDescription>
        <CardAction>
          <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="size-4" />
              Novo documento
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo documento</DialogTitle>
              </DialogHeader>
              <FormularioAction
                action={criarDocumento.bind(null, empresaId, colaboradorId)}
                mensagemSucesso="Documento salvo."
                onSuccess={() => setNovoAberto(false)}
              >
                <CampoSelect name="tipo" label="Tipo" opcoes={TIPOS_DOCUMENTO} required />
                <CampoTexto name="descricao" label="Descrição (opcional)" placeholder="Ex: NR-35 — trabalho em altura" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoData name="emitidoEm" label="Emitido em" />
                  <CampoData name="validoAte" label="Válido até" />
                </div>
                <Campo label="Arquivo (PDF ou foto, até 4 MB)">
                  <Input type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
                </Campo>
                <Campo label="Observações">
                  <Textarea name="observacoes" rows={2} />
                </Campo>
              </FormularioAction>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {documentos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum documento no dossiê ainda.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{tipoDocumentoLabel(d.tipo)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.descricao ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatarData(d.emitidoEm)}</TableCell>
                    <TableCell>
                      <SituacaoValidade validoAte={d.validoAte} />
                    </TableCell>
                    <TableCell>
                      {d.arquivo ? (
                        <a
                          href={`/api/rh/${empresaId}/arquivos/${d.arquivo.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm hover:underline"
                        >
                          <FileText className="size-4" />
                          <span className="max-w-40 truncate">{d.arquivo.nome}</span>
                          <span className="text-xs text-muted-foreground">
                            ({formatarTamanho(d.arquivo.tamanhoBytes)})
                          </span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Sem anexo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {d.arquivo && (
                          <Button
                            variant="ghost"
                            size="icon"
                            render={
                              <a
                                href={`/api/rh/${empresaId}/arquivos/${d.arquivo.id}?download=1`}
                                aria-label="Baixar arquivo"
                              />
                            }
                          >
                            <Download className="size-4" />
                          </Button>
                        )}
                        <BotaoExcluir
                          onConfirm={async () => {
                            const r = await excluirDocumento(empresaId, colaboradorId, d.id);
                            if (r.ok) toast.success("Documento excluído.");
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
