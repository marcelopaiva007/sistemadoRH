"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Copy, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { atualizarVaga, inscreverCandidato, moverEtapa, excluirCandidatura } from "@/lib/actions/rh-vagas";
import { admitirCandidato } from "@/lib/actions/rh-admissao";
import {
  ETAPAS_EM_ANDAMENTO,
  ETAPAS_FINAIS,
  ETAPAS_FUNIL,
  etapaFunilLabel,
  origemCandidatoLabel,
  STATUS_VAGA,
  STATUS_VAGA_BADGE,
} from "@/lib/constants-ats";
import { MIMES_ANEXO_ACEITOS, TIPOS_CONTRATO, tipoContratoLabel } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Candidatura = {
  id: string;
  etapa: string;
  motivo: string | null;
  colaboradorId: string | null;
  createdAt: Date;
  candidato: {
    id: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    cidade: string | null;
    origem: string;
    arquivo: { id: string; nome: string } | null;
  };
};

type Vaga = {
  id: string;
  titulo: string;
  status: string;
  publicada: boolean;
  slug: string;
  quantidade: number;
  descricao: string | null;
  requisitos: string | null;
  tipoContrato: string | null;
  faixaSalarial: string | null;
  abertaEm: Date;
  setor: { nome: string } | null;
  posicao: { nome: string } | null;
};

export function VagaDetalhe({
  empresaId,
  vaga,
  candidaturas,
  setores,
  posicoes,
}: {
  empresaId: string;
  vaga: Vaga;
  candidaturas: Candidatura[];
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
}) {
  const [inscreverAberto, setInscreverAberto] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);
  const [admitir, setAdmitir] = useState<Candidatura | null>(null);

  const porEtapa = (etapa: string) => candidaturas.filter((c) => c.etapa === etapa);
  const encerradas = candidaturas.filter((c) => (ETAPAS_FINAIS as readonly string[]).includes(c.etapa));

  return (
    <div className="space-y-6">
      <Link href={`/rh/${empresaId}/vagas`} className="text-sm text-muted-foreground hover:underline">
        ← Vagas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{vaga.titulo}</h2>
            <StatusBadge status={vaga.status} map={STATUS_VAGA_BADGE} />
            {vaga.publicada && vaga.status === "ABERTA" && <Badge variant="outline">Página pública no ar</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {vaga.setor?.nome ?? "sem setor"}
            {vaga.posicao?.nome && ` · ${vaga.posicao.nome}`}
            {vaga.tipoContrato && ` · ${tipoContratoLabel(vaga.tipoContrato)}`}
            {` · ${vaga.quantidade} posição(ões)`}
            {` · aberta em ${formatarData(vaga.abertaEm)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {vaga.publicada && vaga.status === "ABERTA" && (
            <Button
              variant="outline"
              onClick={() => {
                const url = `${window.location.origin}/vagas/${vaga.slug}`;
                navigator.clipboard.writeText(url).then(
                  () => toast.success("Link da vaga copiado."),
                  () => toast.error("Não foi possível copiar. O link é: " + url),
                );
              }}
            >
              <Copy className="size-4" />
              Copiar link público
            </Button>
          )}
          <Dialog open={editarAberto} onOpenChange={setEditarAberto}>
            <DialogTrigger render={<Button variant="outline" />}>Editar vaga</DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <EditarVagaForm empresaId={empresaId} vaga={vaga} onSuccess={() => setEditarAberto(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={inscreverAberto} onOpenChange={setInscreverAberto}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              Inscrever candidato
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <InscreverCandidatoForm
                empresaId={empresaId}
                vagaId={vaga.id}
                onSuccess={() => setInscreverAberto(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {(vaga.descricao || vaga.requisitos) && (
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            {vaga.descricao && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Descrição</div>
                <p className="whitespace-pre-line">{vaga.descricao}</p>
              </div>
            )}
            {vaga.requisitos && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Requisitos</div>
                <p className="whitespace-pre-line">{vaga.requisitos}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Funil</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPAS_EM_ANDAMENTO.map((etapa) => (
            <ColunaFunil
              key={etapa}
              empresaId={empresaId}
              etapa={etapa}
              candidaturas={porEtapa(etapa)}
              onAdmitir={setAdmitir}
            />
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Encerrados</CardTitle>
          <CardDescription>Contratados, reprovados e desistências desta vaga.</CardDescription>
        </CardHeader>
        <CardContent>
          {encerradas.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Ninguém encerrado ainda.</p>
          ) : (
            <ul className="divide-y">
              {encerradas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-medium">{c.candidato.nome}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {origemCandidatoLabel(c.candidato.origem)}
                    </span>
                    {c.motivo && <div className="text-xs text-muted-foreground">{c.motivo}</div>}
                    {c.colaboradorId && (
                      <Link
                        href={`/rh/${empresaId}/colaboradores/${c.colaboradorId}`}
                        className="text-xs hover:underline"
                      >
                        ver ficha do colaborador →
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.etapa === "CONTRATADO" ? "default" : "secondary"}>
                      {etapaFunilLabel(c.etapa)}
                    </Badge>
                    {c.etapa === "CONTRATADO" && !c.colaboradorId && (
                      <Button size="sm" variant="outline" onClick={() => setAdmitir(c)}>
                        Criar ficha
                      </Button>
                    )}
                    <SeletorEtapa empresaId={empresaId} candidatura={c} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!admitir} onOpenChange={(open) => !open && setAdmitir(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {admitir && (
            <AdmitirForm
              empresaId={empresaId}
              candidatura={admitir}
              setores={setores}
              posicoes={posicoes}
              onSuccess={() => setAdmitir(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdmitirForm({
  empresaId,
  candidatura,
  setores,
  posicoes,
  onSuccess,
}: {
  empresaId: string;
  candidatura: Candidatura;
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await admitirCandidato(empresaId, candidatura.id, prev, fd);
    if (result.ok) {
      toast.success("Colaborador admitido. A ficha já está em Colaboradores.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Admitir {candidatura.candidato.nome}</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">
        Cria a ficha do colaborador com o que o candidato já informou. Documentos que faltarem
        aparecem como aviso na ficha — não travam a admissão.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="setorId">Setor</Label>
          <select id="setorId" name="setorId" required defaultValue="" className={classeSelect}>
            <option value="" disabled>
              Escolha o setor
            </option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="posicaoId">Cargo</Label>
          <select id="posicaoId" name="posicaoId" required defaultValue="" className={classeSelect}>
            <option value="" disabled>
              Escolha o cargo
            </option>
            {posicoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dataAdmissao">Data de admissão</Label>
          <Input id="dataAdmissao" name="dataAdmissao" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tipoContrato">Tipo de contrato</Label>
          <select id="tipoContrato" name="tipoContrato" defaultValue="CLT" className={classeSelect}>
            <option value="">—</option>
            {TIPOS_CONTRATO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="salarioBase">Salário base</Label>
        <Input id="salarioBase" name="salarioBase" inputMode="decimal" placeholder="Ex.: 2200,00" />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Admitindo..." : "Admitir e criar ficha"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ColunaFunil({
  empresaId,
  etapa,
  candidaturas,
  onAdmitir,
}: {
  empresaId: string;
  etapa: string;
  candidaturas: Candidatura[];
  onAdmitir: (c: Candidatura) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{etapaFunilLabel(etapa)}</span>
        <Badge variant="secondary">{candidaturas.length}</Badge>
      </div>
      {candidaturas.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-2">
          {candidaturas.map((c) => (
            <li key={c.id} className="rounded-md border bg-background p-2 text-sm">
              <div className="font-medium">{c.candidato.nome}</div>
              <div className="text-xs text-muted-foreground">
                {c.candidato.cidade ?? "—"}
                {c.candidato.telefone && ` · ${c.candidato.telefone}`}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {c.candidato.arquivo && (
                  <a
                    href={`/api/rh/${empresaId}/arquivos/${c.candidato.arquivo.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    <FileText className="size-3" />
                    currículo
                  </a>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <SeletorEtapa empresaId={empresaId} candidatura={c} />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onAdmitir(c)}>
                  Admitir
                </Button>
                <BotaoRemover empresaId={empresaId} candidaturaId={c.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeletorEtapa({ empresaId, candidatura }: { empresaId: string; candidatura: Candidatura }) {
  const [salvando, setSalvando] = useState(false);

  return (
    <select
      disabled={salvando}
      value={candidatura.etapa}
      onChange={async (e) => {
        const etapaNova = e.target.value;
        setSalvando(true);
        const r = await moverEtapa(empresaId, candidatura.id, etapaNova);
        setSalvando(false);
        if (r.ok) toast.success(`Movido para ${etapaFunilLabel(etapaNova)}.`);
        else toast.error(r.error);
      }}
      className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring dark:bg-input/30"
    >
      {ETAPAS_FUNIL.map((e) => (
        <option key={e.value} value={e.value}>
          {e.label}
        </option>
      ))}
    </select>
  );
}

function BotaoRemover({ empresaId, candidaturaId }: { empresaId: string; candidaturaId: string }) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <div className="flex gap-1">
        <Button
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={async () => {
            const r = await excluirCandidatura(empresaId, candidaturaId);
            if (r.ok) toast.success("Candidatura removida.");
            else toast.error(r.error);
            setConfirmando(false);
          }}
        >
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirmando(false)}>
          Não
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirmando(true)}>
      Remover
    </Button>
  );
}

function InscreverCandidatoForm({
  empresaId,
  vagaId,
  onSuccess,
}: {
  empresaId: string;
  vagaId: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await inscreverCandidato(empresaId, vagaId, prev, fd);
    if (result.ok) {
      toast.success("Candidato inscrito.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Inscrever candidato</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">
        Se o CPF já estiver no banco de talentos, o cadastro existente é reaproveitado em vez de duplicar.
      </p>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input id="cpf" name="cpf" placeholder="só números" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" name="telefone" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" name="cidade" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="linkedin">LinkedIn / portfólio</Label>
        <Input id="linkedin" name="linkedin" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="arquivo">Currículo (PDF/foto, até 4 MB)</Label>
        <Input id="arquivo" type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" name="observacoes" rows={2} />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Inscrevendo..." : "Inscrever"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditarVagaForm({ empresaId, vaga, onSuccess }: { empresaId: string; vaga: Vaga; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await atualizarVaga(empresaId, vaga.id, prev, fd);
    if (result.ok) {
      toast.success("Vaga atualizada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Editar vaga</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={vaga.status} className={classeSelect}>
            {STATUS_VAGA.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantidade">Posições</Label>
          <Input id="quantidade" name="quantidade" type="number" min={1} defaultValue={vaga.quantidade} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="faixaSalarial">Faixa salarial</Label>
        <Input id="faixaSalarial" name="faixaSalarial" defaultValue={vaga.faixaSalarial ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={3} defaultValue={vaga.descricao ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="requisitos">Requisitos</Label>
        <Textarea id="requisitos" name="requisitos" rows={3} defaultValue={vaga.requisitos ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="publicada"
          value="true"
          defaultChecked={vaga.publicada}
          className="size-4 rounded border-input accent-primary"
        />
        Página pública de inscrição publicada
      </label>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
