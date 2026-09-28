"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, FileText, Download, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { criarDocumento, excluirDocumento } from "@/lib/actions/rh-documentos";
import { MIMES_ANEXO_ACEITOS, TIPOS_DOCUMENTO, tipoDocumentoLabel } from "@/lib/constants-dp";
import { formatarTamanho } from "@/lib/anexos";
import { formatarData, diferencaEmDiasUTC, hojeUTC } from "@/lib/datas";
import { Campo, CampoData, CampoTexto, FormularioAction, classeSelect } from "./campos";
import { BotaoExcluir } from "./dependentes-card";
import { RegistrarExameDialog, type DocumentoAsoNoDossie } from "./registrar-exame-dialog";

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
  const [tipoNovo, setTipoNovo] = useState("");
  // O ASO não se guarda aqui. Pedido do RH em 28/09/2026: o Dossiê aceitava
  // "ASO (exame ocupacional)" como documento genérico, mas o Relatório de ASO,
  // Vencimentos e Conformidade só leem o EXAME — o arquivo ficava salvo e a
  // pessoa continuava vencida, sem nada na tela dizendo por quê. Escolher ASO
  // aqui leva ao formulário do exame; o ASO que já estava no Dossiê ganha o
  // botão "Registrar como exame", que leva o arquivo junto.
  const [exameAberto, setExameAberto] = useState(false);
  const [convertendo, setConvertendo] = useState<DocumentoAsoNoDossie | null>(null);

  const seletorTipo = (
    <Campo label="Tipo" required>
      <select
        name="tipo"
        required
        value={tipoNovo}
        onChange={(e) => setTipoNovo(e.target.value)}
        className={classeSelect}
      >
        <option value="">—</option>
        {TIPOS_DOCUMENTO.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </Campo>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dossiê digital</CardTitle>
        <CardDescription>
          RG, CTPS, contrato e demais documentos. O arquivo fica guardado no banco e só abre por link
          autenticado — todo download entra na trilha de auditoria. O ASO tem formulário próprio, em
          SST (ASO, NR): é lá que ele conta no Relatório de ASO.
        </CardDescription>
        <CardAction>
          <Dialog
            open={novoAberto}
            onOpenChange={(aberto) => {
              setNovoAberto(aberto);
              if (!aberto) setTipoNovo("");
            }}
          >
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="size-4" />
              Novo documento
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo documento</DialogTitle>
              </DialogHeader>
              {tipoNovo === "ASO" ? (
                <div className="space-y-4">
                  {seletorTipo}
                  <Alert>
                    <AlertDescription>
                      O ASO não fica no Dossiê: ele é registrado como <b>exame ocupacional</b>, com data,
                      resultado e o arquivo do médico. É assim que ele conta no Relatório de ASO e tira a
                      pessoa da lista de vencidos.
                    </AlertDescription>
                  </Alert>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => {
                        setNovoAberto(false);
                        setTipoNovo("");
                        setConvertendo(null);
                        setExameAberto(true);
                      }}
                    >
                      <Stethoscope className="size-4" aria-hidden />
                      Abrir formulário do exame
                    </Button>
                  </div>
                </div>
              ) : (
                <FormularioAction
                  action={criarDocumento.bind(null, empresaId, colaboradorId)}
                  mensagemSucesso="Documento salvo."
                  onSuccess={() => {
                    setNovoAberto(false);
                    setTipoNovo("");
                  }}
                >
                  {seletorTipo}
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
              )}
            </DialogContent>
          </Dialog>
          <RegistrarExameDialog
            empresaId={empresaId}
            colaboradorId={colaboradorId}
            aberto={exameAberto}
            aoMudarAberto={(aberto) => {
              setExameAberto(aberto);
              if (!aberto) setConvertendo(null);
            }}
            documentoOrigem={convertendo ?? undefined}
          />
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
                    <TableCell className="font-medium">
                      {tipoDocumentoLabel(d.tipo)}
                      {d.tipo === "ASO" && (
                        // Na célula do tipo, não na coluna de ações: é o aviso
                        // e a saída dele no mesmo lugar — e a coluna de ações
                        // estreita cortava o botão na ficha.
                        <span className="mt-1 block text-xs font-normal">
                          <span className="text-destructive">Não conta no Relatório de ASO.</span>{" "}
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
                            onClick={() => {
                              setConvertendo({
                                id: d.id,
                                arquivoNome: d.arquivo?.nome ?? null,
                                emitidoEm: d.emitidoEm,
                                validoAte: d.validoAte,
                              });
                              setExameAberto(true);
                            }}
                          >
                            <Stethoscope className="size-3.5" aria-hidden />
                            Registrar como exame
                          </button>
                        </span>
                      )}
                    </TableCell>
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
