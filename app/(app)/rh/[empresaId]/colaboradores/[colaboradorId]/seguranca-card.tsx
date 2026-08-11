"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, FileText, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarCertificado, excluirCertificado, registrarExame, excluirExame } from "@/lib/actions/rh-sst";
import { MIMES_ANEXO_ACEITOS } from "@/lib/constants-dp";
import { NORMAS_REGULAMENTADORAS, RESULTADOS_EXAME, TIPOS_EXAME, normaLabel, resultadoExameLabel, tipoExameLabel } from "@/lib/constants-sst";
import { SITUACAO_BADGE, type ConformidadeColaborador, type SituacaoExame, type SituacaoItem } from "@/lib/conformidade";
import { formatarData } from "@/lib/datas";
import { Campo, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type Certificado = {
  id: string;
  norma: string;
  realizadoEm: Date;
  validoAte: Date | null;
  cargaHoraria: number | null;
  instrutor: string | null;
  arquivo: { id: string; nome: string } | null;
};

type Exame = {
  id: string;
  tipo: string;
  realizadoEm: Date;
  validoAte: Date | null;
  resultado: string;
  restricoes: string | null;
  medico: string | null;
  clinica: string | null;
  arquivo: { id: string; nome: string } | null;
};

export function SelodeSituacao({ situacao, dias }: { situacao: SituacaoItem; dias?: number | null }) {
  return (
    <StatusBadge status={situacao} map={SITUACAO_BADGE}>
      {situacao === "VENCENDO" && dias != null && ` · ${dias} d`}
      {situacao === "VENCIDO" && dias != null && ` há ${Math.abs(dias)} d`}
    </StatusBadge>
  );
}

export function SegurancaCard({
  empresaId,
  colaboradorId,
  posicaoNome,
  conformidade,
  certificados,
  exames,
  situacaoExame,
}: {
  empresaId: string;
  colaboradorId: string;
  posicaoNome: string;
  conformidade: ConformidadeColaborador;
  certificados: Certificado[];
  exames: Exame[];
  situacaoExame: SituacaoExame;
}) {
  const [novoCert, setNovoCert] = useState(false);
  const [novoExame, setNovoExame] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Exigências da função {posicaoNome}
          </CardTitle>
          <CardDescription>
            Cruzamento entre o que a função exige e o que esta pessoa comprovou. Os requisitos são
            cadastrados em Conformidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {conformidade.itens.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma NR exigida para esta função ainda.
            </p>
          ) : (
            <>
              {conformidade.pendencias.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <strong>Irregular para a função:</strong>{" "}
                    {conformidade.pendencias.map((p) => p.norma).join(", ")}. Não deve executar a
                    atividade até regularizar.
                  </AlertDescription>
                </Alert>
              )}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Norma</TableHead>
                      <TableHead>Último treinamento</TableHead>
                      <TableHead>Válido até</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conformidade.itens.map((item) => (
                      <TableRow key={item.norma}>
                        <TableCell className="font-medium">{item.norma}</TableCell>
                        <TableCell className="tabular-nums">{formatarData(item.realizadoEm)}</TableCell>
                        <TableCell className="tabular-nums">{formatarData(item.validoAte)}</TableCell>
                        <TableCell>
                          <SelodeSituacao situacao={item.situacao} dias={item.diasAteVencer} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Treinamentos registrados</CardTitle>
          <CardDescription>
            Todos os certificados desta pessoa, inclusive de normas que a função atual não exige.
          </CardDescription>
          <CardAction>
            <Dialog open={novoCert} onOpenChange={setNovoCert}>
              <DialogTrigger render={<Button size="sm" />}>
                <Plus className="size-4" />
                Registrar treinamento
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar treinamento</DialogTitle>
                </DialogHeader>
                <FormularioAction
                  action={registrarCertificado.bind(null, empresaId, colaboradorId)}
                  textoBotao="Registrar"
                  mensagemSucesso="Treinamento registrado."
                  onSuccess={() => setNovoCert(false)}
                >
                  <CampoSelect
                    name="norma"
                    label="Norma"
                    opcoes={NORMAS_REGULAMENTADORAS.map((n) => ({ value: n.value, label: n.label }))}
                    required
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoData name="realizadoEm" label="Realizado em" />
                    <CampoData name="validoAte" label="Válido até (opcional)" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deixando a validade em branco, ela é calculada pela periodicidade cadastrada para
                    a função.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoTexto name="cargaHoraria" label="Carga horária (h)" type="number" min={1} />
                    <CampoTexto name="instrutor" label="Instrutor / empresa" />
                  </div>
                  <Campo label="Certificado (PDF ou foto, até 4 MB)">
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
          {certificados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum treinamento registrado.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Norma</TableHead>
                    <TableHead>Realizado</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Carga</TableHead>
                    <TableHead>Certificado</TableHead>
                    <TableHead className="w-16 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificados.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium" title={normaLabel(c.norma)}>
                        {c.norma}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatarData(c.realizadoEm)}</TableCell>
                      <TableCell className="tabular-nums">{formatarData(c.validoAte)}</TableCell>
                      <TableCell className="tabular-nums">{c.cargaHoraria ? `${c.cargaHoraria} h` : "—"}</TableCell>
                      <TableCell>
                        {c.arquivo ? (
                          <a
                            href={`/api/rh/${empresaId}/arquivos/${c.arquivo.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm hover:underline"
                          >
                            <FileText className="size-4" />
                            <span className="max-w-32 truncate">{c.arquivo.nome}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground">Sem anexo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <BotaoExcluir
                          onConfirm={async () => {
                            const r = await excluirCertificado(empresaId, colaboradorId, c.id);
                            if (r.ok) toast.success("Treinamento excluído.");
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="size-4" />
            Exames ocupacionais (ASO / PCMSO)
          </CardTitle>
          <CardDescription>
            Situação atual:{" "}
            <SelodeSituacao situacao={situacaoExame.situacao} dias={situacaoExame.diasAteVencer} />
            {situacaoExame.restricoes && (
              <span className="mt-1 block">
                <strong>Restrição em vigor:</strong> {situacaoExame.restricoes}
              </span>
            )}
          </CardDescription>
          <CardAction>
            <Dialog open={novoExame} onOpenChange={setNovoExame}>
              <DialogTrigger render={<Button size="sm" />}>
                <Plus className="size-4" />
                Registrar exame
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar exame ocupacional</DialogTitle>
                </DialogHeader>
                <FormularioAction
                  action={registrarExame.bind(null, empresaId, colaboradorId)}
                  textoBotao="Registrar"
                  mensagemSucesso="Exame registrado."
                  onSuccess={() => setNovoExame(false)}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoSelect
                      name="tipo"
                      label="Tipo"
                      opcoes={TIPOS_EXAME.map((t) => ({ value: t.value, label: t.label }))}
                      required
                    />
                    <CampoSelect
                      name="resultado"
                      label="Resultado"
                      opcoes={RESULTADOS_EXAME}
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoData name="realizadoEm" label="Realizado em" />
                    <CampoData name="validoAte" label="Válido até (opcional)" />
                  </div>
                  <Campo label="Restrições (obrigatório se apto com restrição)">
                    <Textarea name="restricoes" rows={2} placeholder="Ex: não pode trabalhar em altura" />
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoTexto name="medico" label="Médico" />
                    <CampoTexto name="crm" label="CRM" />
                  </div>
                  <CampoTexto name="clinica" label="Clínica" />
                  <Campo label="ASO (PDF ou foto, até 4 MB)">
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
          {exames.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum exame registrado.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Realizado</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>ASO</TableHead>
                    <TableHead className="w-16 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exames.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{tipoExameLabel(e.tipo)}</TableCell>
                      <TableCell className="tabular-nums">{formatarData(e.realizadoEm)}</TableCell>
                      <TableCell className="tabular-nums">{formatarData(e.validoAte)}</TableCell>
                      <TableCell>
                        <Badge variant={e.resultado === "INAPTO" ? "destructive" : e.resultado === "APTO" ? "default" : "secondary"}>
                          {resultadoExameLabel(e.resultado)}
                        </Badge>
                        {e.restricoes && (
                          <span className="block text-xs text-muted-foreground">{e.restricoes}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.arquivo ? (
                          <a
                            href={`/api/rh/${empresaId}/arquivos/${e.arquivo.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm hover:underline"
                          >
                            <FileText className="size-4" />
                            <span className="max-w-32 truncate">{e.arquivo.nome}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground">Sem anexo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <BotaoExcluir
                          onConfirm={async () => {
                            const r = await excluirExame(empresaId, colaboradorId, e.id);
                            if (r.ok) toast.success("Exame excluído.");
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
