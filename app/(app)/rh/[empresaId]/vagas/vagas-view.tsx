"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { criarVaga } from "@/lib/actions/rh-vagas";
import { STATUS_VAGA_BADGE } from "@/lib/constants-ats";
import { TIPOS_CONTRATO } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";
import { Indicador } from "@/components/indicador";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Vaga = {
  id: string;
  titulo: string;
  status: string;
  publicada: boolean;
  slug: string;
  quantidade: number;
  abertaEm: Date;
  setorNome: string | null;
  posicaoNome: string | null;
  totalCandidatos: number;
  emAndamento: number;
  contratados: number;
};

export function VagasView({
  empresaId,
  vagas,
  setores,
  posicoes,
}: {
  empresaId: string;
  vagas: Vaga[];
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
}) {
  const [criarAberto, setCriarAberto] = useState(false);
  const { itensDaPagina: vagasNaPagina, ...paginacao } = usePaginacao(vagas);

  const abertas = vagas.filter((v) => v.status === "ABERTA").length;
  const candidatosAtivos = vagas.reduce((s, v) => s + v.emAndamento, 0);
  const posicoesEmAberto = vagas.filter((v) => v.status === "ABERTA").reduce((s, v) => s + v.quantidade, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Vagas &amp; recrutamento</h2>
          <p className="text-sm text-muted-foreground">
            Funil de candidatos por vaga. Vaga publicada ganha uma página pública de inscrição.
          </p>
        </div>
        <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova vaga
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <NovaVagaForm
              empresaId={empresaId}
              setores={setores}
              posicoes={posicoes}
              onSuccess={() => setCriarAberto(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Vagas abertas" valor={abertas} />
        <Indicador rotulo="Posições em aberto" valor={posicoesEmAberto} />
        <Indicador rotulo="Candidatos em processo" valor={candidatosAtivos} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Página de carreiras</span> — um endereço só,
          com as vagas publicadas de todo o grupo. É este que se divulga.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href="/carreiras" target="_blank" rel="noreferrer" />}>
            Abrir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${window.location.origin}/carreiras`;
              navigator.clipboard.writeText(url).then(
                () => toast.success("Link de carreiras copiado."),
                () => toast.error("Não foi possível copiar. O link é: " + url),
              );
            }}
          >
            <Copy className="size-3.5" />
            Copiar link
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vagas</CardTitle>
          <CardDescription>Abertas primeiro. Clique para ver o funil de candidatos.</CardDescription>
        </CardHeader>
        <CardContent>
          {vagas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma vaga cadastrada ainda.</p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vaga</TableHead>
                    <TableHead>Setor / cargo</TableHead>
                    <TableHead>Aberta em</TableHead>
                    <TableHead>Candidatos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Página pública</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vagasNaPagina.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <Link href={`/rh/${empresaId}/vagas/${v.id}`} className="font-medium hover:underline">
                          {v.titulo}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {v.quantidade} posição(ões)
                          {v.contratados > 0 && ` · ${v.contratados} contratado(s)`}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {v.setorNome ?? "—"}
                        {v.posicaoNome && <span className="block text-xs">{v.posicaoNome}</span>}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{formatarData(v.abertaEm)}</TableCell>
                      <TableCell className="tabular-nums">
                        {v.emAndamento} <span className="text-xs text-muted-foreground">de {v.totalCandidatos}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={v.status} map={STATUS_VAGA_BADGE} />
                      </TableCell>
                      <TableCell>
                        {v.publicada && v.status === "ABERTA" ? (
                          <BotaoCopiarLink slug={v.slug} />
                        ) : (
                          <span className="text-xs text-muted-foreground">não publicada</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4">
            <Paginacao
              total={paginacao.total}
              porPagina={paginacao.porPagina}
              paginaAtual={paginacao.paginaAtual}
              totalPaginas={paginacao.totalPaginas}
              onMudarPagina={paginacao.irPara}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BotaoCopiarLink({ slug }: { slug: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        const url = `${window.location.origin}/vagas/${slug}`;
        navigator.clipboard.writeText(url).then(
          () => toast.success("Link da vaga copiado."),
          () => toast.error("Não foi possível copiar. O link é: " + url),
        );
      }}
    >
      <Copy className="size-3.5" />
      Copiar link
    </Button>
  );
}


function gerarModeloDescricao(cargoNome: string): { descricao: string; requisitos: string } {
  const nomeLower = cargoNome.toLowerCase();
  if (nomeLower.includes("técnico") || nomeLower.includes("tecnico") || nomeLower.includes("instalador") || nomeLower.includes("infra")) {
    return {
      descricao: `Atuação em rotinas operacionais e técnicas da área de ${cargoNome}. Responsável por instalação, manutenção e suporte a equipamentos e atendimento a chamados com agilidade e qualidade.`,
      requisitos: `• Ensino Médio Completo ou Curso Técnico na área.\n• Experiência prévia em rotinas operacionais/campo.\n• Habilitação CNH B válida.\n• Disponibilidade para deslocamentos e horários flexíveis.`,
    };
  }
  if (nomeLower.includes("analista") || nomeLower.includes("especialista") || nomeLower.includes("assistente")) {
    return {
      descricao: `Responsável por acompanhar e executar processos administrativos, análise de indicadores e suporte às decisões do setor. Interface com equipes internas e acompanhamento de metas.`,
      requisitos: `• Ensino Superior cursando ou completo.\n• Domínio de ferramentas de produtividade e planilhas.\n• Boa comunicação verbal e escrita.\n• Capacidade de organização e foco em resultados.`,
    };
  }
  if (nomeLower.includes("gerente") || nomeLower.includes("coordenador") || nomeLower.includes("supervisor") || nomeLower.includes("líder") || nomeLower.includes("lider")) {
    return {
      descricao: `Liderança da equipe de ${cargoNome}, gestão de rotinas, acompanhamento de indicadores e desenvolvimento contínuo dos liderados. Garantia dos padrões de qualidade e prazos.`,
      requisitos: `• Ensino Superior Completo em área correlata.\n• Experiência comprovada em Gestão de Pessoas e Processos.\n• Visão estratégica e capacidade de tomada de decisão.\n• Conhecimento em metodologias de gestão e metas.`,
    };
  }
  return {
    descricao: `Oportunidade para atuar como ${cargoNome}, desempenhando atividades operacionais e de suporte com foco na qualidade do atendimento e cumprimento dos procedimentos internos da empresa.`,
    requisitos: `• Ensino Médio Completo.\n• Vontade de aprender e comprometimento.\n• Boa pontualidade e trabalho em equipe.`,
  };
}

function NovaVagaForm({
  empresaId,
  setores,
  posicoes,
  onSuccess,
}: {
  empresaId: string;
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [posicaoSelecionada, setPosicaoSelecionada] = useState("");
  const [descricao, setDescricao] = useState("");
  const [requisitos, setRequisitos] = useState("");

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarVaga(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Vaga criada.");
      onSuccess();
    }
    return result;
  }, initialState);

  const handleCargoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const posId = e.target.value;
    setPosicaoSelecionada(posId);
    const cargo = posicoes.find((p) => p.id === posId);
    if (cargo) {
      const modelo = gerarModeloDescricao(cargo.nome);
      setDescricao(modelo.descricao);
      setRequisitos(modelo.requisitos);
      toast.info(`Descrição e requisitos preenchidos para ${cargo.nome}.`);
    }
  };

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova vaga</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" placeholder="Ex.: Técnico de instalação" required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="setorId">Setor</Label>
          <select id="setorId" name="setorId" defaultValue="" className={classeSelect}>
            <option value="">—</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="posicaoId">Cargo (preenche descrição e requisitos automaticamente)</Label>
          <select
            id="posicaoId"
            name="posicaoId"
            value={posicaoSelecionada}
            onChange={handleCargoChange}
            className={classeSelect}
          >
            <option value="">—</option>
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
          <Label htmlFor="quantidade">Posições</Label>
          <Input id="quantidade" name="quantidade" type="number" min={1} defaultValue={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tipoContrato">Tipo de contrato</Label>
          <select id="tipoContrato" name="tipoContrato" defaultValue="" className={classeSelect}>
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
        <Label htmlFor="faixaSalarial">Faixa salarial (aparece na página pública)</Label>
        <Input id="faixaSalarial" name="faixaSalarial" placeholder="Ex.: A combinar" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição (editável)</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="requisitos">Requisitos (editável)</Label>
        <Textarea
          id="requisitos"
          name="requisitos"
          rows={3}
          value={requisitos}
          onChange={(e) => setRequisitos(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="publicada" value="true" className="size-4 rounded border-input accent-primary" />
        Publicar a página de inscrição agora
      </label>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar vaga"}
        </Button>
      </DialogFooter>
    </form>
  );
}
