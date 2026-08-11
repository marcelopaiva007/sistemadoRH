"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, HardHat, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarEntregaEpi, confirmarAssinaturaEpi, excluirEntregaEpi } from "@/lib/actions/rh-epi";
import { MIMES_ANEXO_ACEITOS } from "@/lib/constants-dp";
import { motivoEntregaEpiLabel, tipoEpiLabel } from "@/lib/constants-epi";
import type { OpcaoCatalogo } from "@/lib/catalogos";
import { formatarData, diferencaEmDiasUTC, hojeUTC } from "@/lib/datas";
import { Campo, CampoCheckbox, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type EntregaEpi = {
  id: string;
  tipo: string;
  ca: string | null;
  fabricante: string | null;
  quantidade: number;
  dataEntrega: Date;
  validoAte: Date | null;
  motivo: string;
  assinado: boolean;
  arquivo: { id: string; nome: string } | null;
};

function SituacaoValidadeEpi({ validoAte }: { validoAte: Date | null }) {
  if (!validoAte) return <span className="text-muted-foreground">—</span>;
  const dias = diferencaEmDiasUTC(validoAte, hojeUTC());
  if (dias < 0) return <Badge variant="destructive">Vencido há {Math.abs(dias)} d</Badge>;
  if (dias <= 60) return <Badge variant="secondary">Vence em {dias} d</Badge>;
  return <span className="tabular-nums">{formatarData(validoAte)}</span>;
}

export function EpisCard({
  empresaId,
  colaboradorId,
  entregas,
  tiposEpiDisponiveis,
  motivosEntregaDisponiveis,
}: {
  empresaId: string;
  colaboradorId: string;
  entregas: EntregaEpi[];
  tiposEpiDisponiveis: OpcaoCatalogo[];
  motivosEntregaDisponiveis: OpcaoCatalogo[];
}) {
  const [aberto, setAberto] = useState(false);
  const pendentesDeAssinatura = entregas.filter((e) => !e.assinado).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardHat className="size-4" />
          EPIs
        </CardTitle>
        <CardDescription>
          Ficha de entrega de equipamento de proteção (NR-06).
          {pendentesDeAssinatura > 0 && (
            <span className="mt-1 block text-warning">
              {pendentesDeAssinatura} entrega(s) aguardando assinatura do colaborador.
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
                <DialogTitle>Registrar entrega de EPI</DialogTitle>
              </DialogHeader>
              <FormularioAction
                action={registrarEntregaEpi.bind(null, empresaId, colaboradorId)}
                textoBotao="Registrar"
                mensagemSucesso="Entrega registrada."
                onSuccess={() => setAberto(false)}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoSelect
                    name="tipo"
                    label="Tipo de EPI"
                    opcoes={tiposEpiDisponiveis.map((t) => ({ value: t.value, label: t.label }))}
                    required
                  />
                  <CampoSelect
                    name="motivo"
                    label="Motivo"
                    opcoes={motivosEntregaDisponiveis.map((m) => ({ value: m.value, label: m.label }))}
                    defaultValue="PRIMEIRA_ENTREGA"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto name="ca" label="CA (Certificado de Aprovação)" placeholder="Ex: 12345" />
                  <CampoTexto name="fabricante" label="Fabricante" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto name="quantidade" label="Quantidade" type="number" min={1} defaultValue="1" />
                  <CampoData name="dataEntrega" label="Data da entrega" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto name="validadeMeses" label="Troca a cada (meses)" type="number" min={1} placeholder="sugestão automática" />
                  <CampoData name="validoAte" label="Válido até (opcional)" />
                </div>
                <Campo label="Ficha assinada (foto/scan, até 4 MB)">
                  <Input type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
                </Campo>
                <CampoCheckbox name="assinado" label="Colaborador já assinou o recebimento" />
                <Campo label="Observações">
                  <Textarea name="observacoes" rows={2} />
                </Campo>
              </FormularioAction>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {entregas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum EPI entregue ainda.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>EPI</TableHead>
                  <TableHead>CA</TableHead>
                  <TableHead>Entregue</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Ficha</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entregas.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {tipoEpiLabel(e.tipo)}
                      <span className="block text-xs text-muted-foreground">
                        {motivoEntregaEpiLabel(e.motivo)} · qtd {e.quantidade}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.ca ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatarData(e.dataEntrega)}</TableCell>
                    <TableCell>
                      <SituacaoValidadeEpi validoAte={e.validoAte} />
                    </TableCell>
                    <TableCell>
                      {e.assinado ? (
                        <Badge variant="default">Assinada</Badge>
                      ) : (
                        <Badge variant="secondary">Pendente</Badge>
                      )}
                      {e.arquivo && (
                        <a
                          href={`/api/rh/${empresaId}/arquivos/${e.arquivo.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          <FileText className="size-3.5" />
                          anexo
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!e.assinado && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const r = await confirmarAssinaturaEpi(empresaId, colaboradorId, e.id);
                              if (r.ok) toast.success("Marcada como assinada.");
                              else toast.error(r.error);
                            }}
                          >
                            Assinar
                          </Button>
                        )}
                        <BotaoExcluir
                          onConfirm={async () => {
                            const r = await excluirEntregaEpi(empresaId, colaboradorId, e.id);
                            if (r.ok) toast.success("Entrega excluída.");
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
