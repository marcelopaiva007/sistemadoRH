"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  AlertOctagon,
  FileSignature,
  FileText,
  Plus,
  Printer,
  ShieldAlert,
  CheckCircle2,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatarData } from "@/lib/datas";
import {
  TIPOS_OCORRENCIA_DISCIPLINAR,
  STATUS_ASSINATURA_DISCIPLINAR,
  type StatusAssinaturaDisciplinar,
} from "@/lib/constants-disciplinar";
import {
  criarOcorrenciaDisciplinar,
  registrarAssinaturaOcorrencia,
  type ResultadoOcorrencia,
} from "@/lib/actions/rh-disciplinar";

const initialState: ResultadoOcorrencia = { ok: true };

/**
 * Rota que devolve o documento formal (advertência, suspensão, termo…) pronto
 * para imprimir, assinar e arquivar no dossiê. É o papel que a medida
 * disciplinar exige — a tela só registrava o status da assinatura até aqui.
 */
function urlDocumento(empresaId: string, ocorrenciaId: string): string {
  return `/api/rh/${empresaId}/disciplinar/${ocorrenciaId}/documento`;
}

type Ocorrencia = {
  id: string;
  tipo: string;
  motivo: string;
  detalhes: string | null;
  dataFato: Date;
  diasSuspensao: number | null;
  valorDesconto: number | null;
  statusAssinatura: string;
  dataAssinatura: Date | null;
  emitidoPorNome: string | null;
  testemunha1Nome: string | null;
  testemunha1Cpf: string | null;
  testemunha2Nome: string | null;
  testemunha2Cpf: string | null;
  createdAt: Date;
};

export function DisciplinarCard({
  empresaId,
  colaboradorId,
  ocorrencias,
}: {
  empresaId: string;
  colaboradorId: string;
  ocorrencias: Ocorrencia[];
}) {
  const [modalAberto, setModalAberto] = useState(false);
  const [modalAssinatura, setModalAssinatura] = useState<Ocorrencia | null>(null);

  const totalAdvertencias = ocorrencias.filter((o) =>
    o.tipo.includes("ADVERTENCIA"),
  ).length;
  const totalSuspensoes = ocorrencias.filter((o) => o.tipo === "SUSPENSAO").length;
  const totalNotificacoes = ocorrencias.length - totalAdvertencias - totalSuspensoes;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldAlert className="size-5 text-destructive" />
          Medidas Disciplinares &amp; Notificações
        </CardTitle>
        <CardDescription>
          Histórico formal de advertências, suspensões, termos de recusa e avarias.
        </CardDescription>
        <CardAction>
          <Dialog open={modalAberto} onOpenChange={setModalAberto}>
            <DialogTrigger render={<Button size="sm" variant="outline" />}>
              <Plus className="size-4" />
              Nova Ocorrência
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <NovaOcorrenciaForm
                empresaId={empresaId}
                colaboradorId={colaboradorId}
                onSuccess={() => setModalAberto(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumo de Respeito à Gradação de Penas */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 text-center text-xs">
          <div>
            <span className="text-muted-foreground">Advertências</span>
            <p className="text-lg font-bold text-foreground">{totalAdvertencias}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Suspensões</span>
            <p className="text-lg font-bold text-amber-600">{totalSuspensoes}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Notificações / Termos</span>
            <p className="text-lg font-bold text-foreground">{totalNotificacoes}</p>
          </div>
        </div>

        {totalAdvertencias >= 2 && (
          <Alert variant="destructive" className="py-2 text-xs">
            <AlertOctagon className="size-4" />
            <AlertDescription>
              Atenção: Este colaborador possui {totalAdvertencias} advertências registradas.
              Conforme a gradação de penas (Art. 482 CLT), a próxima reincidência pode ensejar
              Suspensão Disciplinar.
            </AlertDescription>
          </Alert>
        )}

        {ocorrencias.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma medida disciplinar ou notificação cadastrada para este colaborador.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo / Gravidade</TableHead>
                  <TableHead>Data do Fato</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Status Assinatura</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ocorrencias.map((o) => {
                  const metaTipo = TIPOS_OCORRENCIA_DISCIPLINAR.find(
                    (t) => t.value === o.tipo,
                  );
                  const st =
                    STATUS_ASSINATURA_DISCIPLINAR[
                      o.statusAssinatura as StatusAssinaturaDisciplinar
                    ] ?? STATUS_ASSINATURA_DISCIPLINAR.PENDENTE;

                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <span className="font-semibold text-xs block">
                          {metaTipo?.label ?? o.tipo}
                        </span>
                        {o.diasSuspensao && (
                          <span className="text-[11px] text-amber-600 font-medium block">
                            {o.diasSuspensao} dia(s) de suspensão
                          </span>
                        )}
                        {o.valorDesconto && (
                          <span className="text-[11px] text-destructive font-medium block">
                            Desconto: R$ {o.valorDesconto.toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        {formatarData(o.dataFato)}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={o.motivo}>
                        {o.motivo}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant} className="text-[10px]">
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            render={
                              <a
                                href={urlDocumento(empresaId, o.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            }
                          >
                            <FileText className="size-3.5 mr-1" />
                            Documento
                          </Button>
                          {o.statusAssinatura === "PENDENTE" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setModalAssinatura(o)}
                              className="h-7 text-xs"
                            >
                              <FileSignature className="size-3.5 mr-1" />
                              Assinar / Recusa
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {o.dataAssinatura ? formatarData(o.dataAssinatura) : "Concluído"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Modal de Assinatura ou Registro de Recusa */}
      {modalAssinatura && (
        <Dialog open={!!modalAssinatura} onOpenChange={() => setModalAssinatura(null)}>
          <DialogContent className="max-w-md">
            <AssinaturaOuRecusaForm
              empresaId={empresaId}
              ocorrencia={modalAssinatura}
              onSuccess={() => setModalAssinatura(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function NovaOcorrenciaForm({
  empresaId,
  colaboradorId,
  onSuccess,
}: {
  empresaId: string;
  colaboradorId: string;
  onSuccess: () => void;
}) {
  const [tipoSel, setTipoSel] = useState<string>("ADVERTENCIA_ESCRITA");
  // Guardado para oferecer o documento logo depois de gravar: registrar a
  // medida sem entregar o papel a ser assinado deixa o RH sem o que imprimir.
  const [criadaId, setCriadaId] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    async (prev: ResultadoOcorrencia, fd: FormData) => {
      const res = await criarOcorrenciaDisciplinar(empresaId, prev, fd);
      if (res.ok) {
        toast.success("Ocorrência registrada. Gere o documento para assinatura.");
        setCriadaId(res.ocorrenciaId ?? null);
      }
      return res;
    },
    initialState,
  );

  if (criadaId) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>Documento pronto para assinatura</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A medida foi registrada no histórico do colaborador. Abra o documento formal, imprima em
          duas vias (colaborador e empresa), colha a assinatura e depois registre o resultado em
          &quot;Assinar / Recusa&quot;.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onSuccess}>
            Fechar
          </Button>
          <Button
            render={
              <a
                href={urlDocumento(empresaId, criadaId)}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <Printer className="size-4 mr-1.5" />
            Abrir documento
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Registrar Medida Disciplinar / Notificação</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="colaboradorId" value={colaboradorId} />

      <div className="space-y-1.5">
        <Label htmlFor="tipo">Tipo de Medida / Ocorrência</Label>
        <select
          id="tipo"
          name="tipo"
          value={tipoSel}
          onChange={(e) => setTipoSel(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {TIPOS_OCORRENCIA_DISCIPLINAR.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {TIPOS_OCORRENCIA_DISCIPLINAR.find((t) => t.value === tipoSel)?.descricao}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dataFato">Data do Fato Ocorrido</Label>
        <Input
          type="date"
          id="dataFato"
          name="dataFato"
          defaultValue={new Date().toISOString().split("T")[0]}
          required
        />
      </div>

      {tipoSel === "SUSPENSAO" && (
        <div className="space-y-1.5">
          <Label htmlFor="diasSuspensao">Dias de Suspensão (máx. 30 dias)</Label>
          <Input
            type="number"
            id="diasSuspensao"
            name="diasSuspensao"
            min={1}
            max={30}
            defaultValue={1}
            required
          />
        </div>
      )}

      {tipoSel === "DANO_PATRIMONIAL" && (
        <div className="space-y-1.5">
          <Label htmlFor="valorDesconto">Valor Estimado do Prejuízo/Avaria (R$)</Label>
          <Input
            type="number"
            step="0.01"
            id="valorDesconto"
            name="valorDesconto"
            placeholder="Ex: 250.00"
            required
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="motivo">Motivo / Resumo do Fato</Label>
        <Input
          id="motivo"
          name="motivo"
          placeholder="Ex: Descumprimento reiterado do horário de trabalho"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="detalhes">Detalhamento das Circunstâncias</Label>
        <Textarea
          id="detalhes"
          name="detalhes"
          rows={3}
          placeholder="Descreva o local, horário, testemunhas e histórico que motivaram esta emissão..."
        />
      </div>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Gravando..." : "Emitir Medida Disciplinar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AssinaturaOuRecusaForm({
  empresaId,
  ocorrencia,
  onSuccess,
}: {
  empresaId: string;
  ocorrencia: Ocorrencia;
  onSuccess: () => void;
}) {
  const [modoRecusa, setModoRecusa] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const [t1Nome, setT1Nome] = useState("");
  const [t1Cpf, setT1Cpf] = useState("");
  const [t2Nome, setT2Nome] = useState("");
  const [t2Cpf, setT2Cpf] = useState("");

  const handleConfirmar = async () => {
    setCarregando(true);
    try {
      const res = await registrarAssinaturaOcorrencia(
        empresaId,
        ocorrencia.id,
        modoRecusa,
        modoRecusa ? { nome: t1Nome, cpf: t1Cpf } : undefined,
        modoRecusa ? { nome: t2Nome, cpf: t2Cpf } : undefined,
      );

      if (res.ok) {
        toast.success(
          modoRecusa
            ? "Recusa registrada com 2 testemunhas."
            : "Assinatura registrada com sucesso.",
        );
        onSuccess();
      } else {
        toast.error(res.error);
      }
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {modoRecusa ? "Registrar Recusa de Assinatura" : "Confirmar Assinatura"}
        </DialogTitle>
      </DialogHeader>

      <div className="rounded-md border p-3 text-xs space-y-2 bg-muted/30">
        <div>
          <p className="font-semibold">
            {TIPOS_OCORRENCIA_DISCIPLINAR.find((t) => t.value === ocorrencia.tipo)?.label ??
              ocorrencia.tipo}
          </p>
          <p className="text-muted-foreground">{ocorrencia.motivo}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          render={
            <a
              href={urlDocumento(empresaId, ocorrencia.id)}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <Printer className="size-3.5 mr-1" />
          Abrir documento para imprimir
        </Button>
      </div>

      {!modoRecusa ? (
        <div className="space-y-3 pt-2 text-center">
          <p className="text-sm text-muted-foreground">
            O colaborador tomou ciência e assinou o documento impresso/digital?
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setModoRecusa(true)}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <UserX className="size-4 mr-1.5" />
              Recusou-se a Assinar
            </Button>
            <Button onClick={handleConfirmar} disabled={carregando}>
              <CheckCircle2 className="size-4 mr-1.5" />
              Confirmar Assinatura
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">
              Conforme preceitua a Justiça do Trabalho, em caso de recusa do colaborador em
              assinar a notificação, a presença e assinatura de 2 testemunhas valida a medida.
            </AlertDescription>
          </Alert>

          <div className="space-y-2 border-t pt-2">
            <p className="font-semibold text-foreground">Testemunha 1</p>
            <Input
              placeholder="Nome da Testemunha 1"
              value={t1Nome}
              onChange={(e) => setT1Nome(e.target.value)}
            />
            <Input
              placeholder="CPF da Testemunha 1"
              value={t1Cpf}
              onChange={(e) => setT1Cpf(e.target.value)}
            />
          </div>

          <div className="space-y-2 border-t pt-2">
            <p className="font-semibold text-foreground">Testemunha 2</p>
            <Input
              placeholder="Nome da Testemunha 2"
              value={t2Nome}
              onChange={(e) => setT2Nome(e.target.value)}
            />
            <Input
              placeholder="CPF da Testemunha 2"
              value={t2Cpf}
              onChange={(e) => setT2Cpf(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" size="sm" onClick={() => setModoRecusa(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={carregando || !t1Nome || !t2Nome}
              onClick={handleConfirmar}
            >
              Registrar Certidão de Recusa
            </Button>
          </DialogFooter>
        </div>
      )}
    </div>
  );
}
