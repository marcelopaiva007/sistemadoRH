"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertOctagon, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarAcidente, marcarCatEmitida, concluirAcidente, excluirAcidente } from "@/lib/actions/rh-cat";
import { MIMES_ANEXO_ACEITOS } from "@/lib/constants-dp";
import { TIPOS_ACIDENTE, situacaoAcidenteLabel, tipoAcidenteLabel } from "@/lib/constants-cat";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import { Campo, CampoCheckbox, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type Acidente = {
  id: string;
  dataHora: Date;
  tipo: string;
  local: string | null;
  descricao: string;
  parteCorpoAtingida: string | null;
  houveAfastamento: boolean;
  catEmitida: boolean;
  catNumero: string | null;
  situacao: string;
  arquivo: { id: string; nome: string } | null;
};

type AusenciaElegivel = { id: string; dataInicio: Date; dataFim: Date };

export function AcidentesCard({
  empresaId,
  colaboradorId,
  acidentes,
  ausenciasElegiveis,
}: {
  empresaId: string;
  colaboradorId: string;
  acidentes: Acidente[];
  ausenciasElegiveis: AusenciaElegivel[];
}) {
  const [aberto, setAberto] = useState(false);
  const abertos = acidentes.filter((a) => a.situacao !== "CONCLUIDO");
  const catPendente = acidentes.filter((a) => !a.catEmitida).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertOctagon className="size-4" />
          Acidentes de trabalho / CAT
        </CardTitle>
        <CardDescription>
          {catPendente > 0 ? (
            <span className="text-destructive">
              {catPendente} CAT pendente de emissão — prazo legal é 1 dia útil (imediato se fatal).
            </span>
          ) : (
            "Nenhuma CAT pendente."
          )}
        </CardDescription>
        <CardAction>
          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="size-4" />
              Registrar acidente
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar acidente de trabalho</DialogTitle>
              </DialogHeader>
              <FormularioAction
                action={registrarAcidente.bind(null, empresaId, colaboradorId)}
                textoBotao="Registrar"
                mensagemSucesso="Acidente registrado."
                onSuccess={() => setAberto(false)}
              >
                <CampoSelect
                  name="tipo"
                  label="Tipo"
                  opcoes={TIPOS_ACIDENTE.map((t) => ({ value: t.value, label: t.label }))}
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoData name="data" label="Data" />
                  <Campo label="Hora (opcional)">
                    <Input type="time" name="hora" />
                  </Campo>
                </div>
                <CampoTexto name="local" label="Local" placeholder="Ex: poste rua X, base da empresa" />
                <Campo label="O que aconteceu">
                  <Textarea name="descricao" rows={3} required />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto name="parteCorpoAtingida" label="Parte do corpo atingida" />
                  <CampoTexto name="natureza" label="Natureza da lesão" placeholder="Ex: corte, queda, choque" />
                </div>
                <CampoTexto name="testemunhas" label="Testemunhas (opcional)" />
                {ausenciasElegiveis.length > 0 ? (
                  <Campo label="Vincular ao afastamento (opcional)">
                    <select
                      name="ausenciaId"
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="">Nenhum / registrar depois</option>
                      {ausenciasElegiveis.map((a) => (
                        <option key={a.id} value={a.id}>
                          {formatarDataHoraBrasilia(a.dataInicio).split(",")[0]} a{" "}
                          {formatarDataHoraBrasilia(a.dataFim).split(",")[0]}
                        </option>
                      ))}
                    </select>
                  </Campo>
                ) : (
                  <CampoCheckbox name="houveAfastamento" label="Houve afastamento do trabalho" />
                )}
                <Campo label="Anexo (foto do local, laudo, até 4 MB)">
                  <Input type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
                </Campo>
              </FormularioAction>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {acidentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum acidente registrado.</p>
        ) : (
          <div className="space-y-3">
            {abertos.length > 0 && (
              <p className="text-xs text-muted-foreground">{abertos.length} em investigação</p>
            )}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>CAT</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-40 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acidentes.map((a) => (
                    <AcidenteLinha
                      key={a.id}
                      empresaId={empresaId}
                      colaboradorId={colaboradorId}
                      acidente={a}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AcidenteLinha({
  empresaId,
  colaboradorId,
  acidente,
}: {
  empresaId: string;
  colaboradorId: string;
  acidente: Acidente;
}) {
  const [emitindoCat, setEmitindoCat] = useState(false);
  const [concluindo, setConcluindo] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell className="tabular-nums whitespace-nowrap">{formatarDataHoraBrasilia(acidente.dataHora)}</TableCell>
        <TableCell className="font-medium">{tipoAcidenteLabel(acidente.tipo)}</TableCell>
        <TableCell className="max-w-64 truncate text-muted-foreground" title={acidente.descricao}>
          {acidente.descricao}
          {acidente.houveAfastamento && <span className="ml-1.5 text-xs">(com afastamento)</span>}
        </TableCell>
        <TableCell>
          {acidente.catEmitida ? (
            <Badge variant="default">nº {acidente.catNumero}</Badge>
          ) : (
            <Badge variant="destructive">Pendente</Badge>
          )}
          {acidente.arquivo && (
            <a
              href={`/api/rh/${empresaId}/arquivos/${acidente.arquivo.id}`}
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
          <Badge variant={acidente.situacao === "CONCLUIDO" ? "secondary" : "outline"}>
            {situacaoAcidenteLabel(acidente.situacao)}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {!acidente.catEmitida && (
              <Button variant="ghost" size="sm" onClick={() => setEmitindoCat((v) => !v)}>
                Emitir CAT
              </Button>
            )}
            {acidente.situacao !== "CONCLUIDO" && (
              <Button variant="ghost" size="sm" onClick={() => setConcluindo((v) => !v)}>
                Concluir
              </Button>
            )}
            <BotaoExcluir
              onConfirm={async () => {
                const r = await excluirAcidente(empresaId, colaboradorId, acidente.id);
                if (r.ok) toast.success("Registro excluído.");
                else toast.error(r.error);
              }}
            />
          </div>
        </TableCell>
      </TableRow>
      {emitindoCat && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <FormularioAction
              action={marcarCatEmitida.bind(null, empresaId, colaboradorId, acidente.id)}
              textoBotao="Confirmar emissão"
              mensagemSucesso="CAT registrada."
              onSuccess={() => setEmitindoCat(false)}
              className="max-w-md"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoTexto name="catNumero" label="Número da CAT" required />
                <CampoData name="catEmitidaEm" label="Emitida em" />
              </div>
            </FormularioAction>
          </TableCell>
        </TableRow>
      )}
      {concluindo && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <FormularioAction
              action={concluirAcidente.bind(null, empresaId, colaboradorId, acidente.id)}
              textoBotao="Concluir investigação"
              mensagemSucesso="Investigação concluída."
              onSuccess={() => setConcluindo(false)}
              className="max-w-md"
            >
              <Campo label="Medidas corretivas tomadas">
                <Textarea name="medidasCorretivas" rows={2} />
              </Campo>
            </FormularioAction>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
