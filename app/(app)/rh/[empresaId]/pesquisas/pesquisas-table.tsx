"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AjudaDaTela } from "@/components/ajuda-da-tela";
import { Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useFiltroEmpresas } from "../filtro-empresas";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createPesquisa, criarPesquisaNR01, deletePesquisa, executarGestaoCicloAgora } from "@/lib/actions/pesquisas";
import { statusPesquisaLabel } from "@/lib/constants-rh";
import { participacaoPct } from "@/lib/pesquisa-numeros";
import type { ActionResult } from "@/lib/constants";

type Pesquisa = {
  id: string;
  titulo: string;
  status: string;
  anonima: boolean;
  modelo: string;
  createdAt: Date;
  empresaId: string;
  marcaId: string;
  marcaNome: string;
  _count: { perguntas: number; tokens: number; respostas: number };
};

const initialState: ActionResult = { ok: true };

export function PesquisasTable({
  empresaId,
  empresasDoUsuario,
  marcaDoCnpj,
  pesquisas,
  colaboradoresAtivos,
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  /** CNPJ -> marca. O filtro da lateral seleciona CNPJs; a pesquisa é da marca. */
  marcaDoCnpj: Record<string, string>;
  pesquisas: Pesquisa[];
  /** Colaboradores ativos hoje por MARCA — o universo que cada pesquisa cobre. */
  colaboradoresAtivos: Record<string, number>;
}) {
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);

  // O recorte é por MARCA: a pesquisa da LM Telecom mora no CNPJ da RSM, e
  // filtrar por ME TELECOM devolvia tabela vazia — como se a marca não
  // tivesse pesquisa nenhuma.
  const visiveis = useMemo(() => {
    const marcas = new Set(empresasSelecionadas.map((id) => marcaDoCnpj[id]).filter(Boolean));
    return pesquisas.filter((p) => marcas.has(p.marcaId));
  }, [pesquisas, empresasSelecionadas, marcaDoCnpj]);

  // A coluna de marca só aparece quando há mais de uma na lista. Filtrado numa
  // marca só, ela repetiria o mesmo nome em todas as linhas dizendo nada.
  const mostrarMarca = new Set(visiveis.map((p) => p.marcaId)).size > 1;

  const [createOpen, setCreateOpen] = useState(false);
  const [criandoNR01, setCriandoNR01] = useState(false);
  const [executandoCiclo, setExecutandoCiclo] = useState(false);

  return (
    <div className="space-y-4">
      {/* justify-between e nao justify-end: a ajuda fica na ponta esquerda, longe
          dos botoes que criam pesquisa — ninguem clica em "como usar" por engano
          querendo criar. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AjudaDaTela modulo="pesquisas" />
        <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={executandoCiclo}
          title="Cria o Pulso/Anual das marcas sem pesquisa ativa e encerra as vencidas — o mesmo que o cron diário faz. Use quando uma marca ficou de fora da janela automática (meses 1/4/7/10)."
          onClick={async () => {
            setExecutandoCiclo(true);
            const result = await executarGestaoCicloAgora();
            setExecutandoCiclo(false);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            const { criados, encerrados, erros } = result.resumo;
            if (criados === 0 && encerrados === 0) {
              toast.info("Nada para fazer — todas as marcas já têm pesquisa ativa em dia.");
            } else {
              toast.success(
                `${criados} pesquisa(s) criada(s), ${encerrados} encerrada(s)` +
                  (erros.length > 0 ? ` — ${erros.length} erro(s), veja o console` : ""),
              );
            }
          }}
        >
          <RefreshCw className="size-4" />
          {executandoCiclo ? "Executando..." : "Rodar gestão de ciclo"}
        </Button>
        <Button
          variant="outline"
          disabled={criandoNR01}
          onClick={async () => {
            setCriandoNR01(true);
            // Em caso de sucesso a action redireciona para a tela da pesquisa;
            // só voltamos aqui em erro.
            const result = await criarPesquisaNR01(empresaId);
            setCriandoNR01(false);
            if (result && !result.ok) toast.error(result.error);
          }}
        >
          <ShieldAlert className="size-4" />
          {criandoNR01 ? "Criando..." : "Nova Avaliação NR-01"}
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova Pesquisa
          </DialogTrigger>
          <DialogContent>
            <NovaPesquisaForm empresaId={empresaId} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              {mostrarMarca && <TableHead>Marca</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Anônima</TableHead>
              <TableHead>Perguntas</TableHead>
              <TableHead>Cadastrados</TableHead>
              <TableHead>Convites</TableHead>
              <TableHead>Respostas</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={mostrarMarca ? 9 : 8}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhuma pesquisa cadastrada ainda.
                </TableCell>
              </TableRow>
            )}
            {visiveis.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {/* O caminho leva o CNPJ da própria pesquisa, não o da URL:
                      a lista consolidada mistura empresas, e apontar para o
                      CNPJ da tela daria "pesquisa não encontrada". */}
                  <Link href={`/rh/${p.empresaId}/pesquisas/${p.id}`} className="hover:underline">
                    {p.titulo}
                  </Link>
                  {p.modelo === "NR01" && (
                    <Badge variant="outline" className="ml-2">
                      NR-01
                    </Badge>
                  )}
                </TableCell>
                {mostrarMarca && (
                  <TableCell className="text-muted-foreground">{p.marcaNome}</TableCell>
                )}
                <TableCell>
                  <Badge variant="secondary">{statusPesquisaLabel(p.status)}</Badge>
                </TableCell>
                <TableCell>{p.anonima ? "Sim" : "Não"}</TableCell>
                <TableCell>{p._count.perguntas}</TableCell>
                {/* Cadastrados é da MARCA, não da pesquisa: repete em toda
                    linha da mesma marca de propósito, porque é a referência
                    contra a qual os outros dois números se leem — e é o mesmo
                    universo que "Gerar convites" percorre. */}
                <TableCell className="text-muted-foreground">
                  {colaboradoresAtivos[p.marcaId] ?? 0}
                </TableCell>
                <TableCell>{p._count.tokens}</TableCell>
                <TableCell>
                  {p._count.respostas}
                  {p._count.tokens > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({participacaoPct(p._count.respostas, p._count.tokens)}%)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <ExcluirPesquisaButton
                    empresaId={p.empresaId}
                    pesquisaId={p.id}
                    titulo={p.titulo}
                    respostas={p._count.respostas}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Mesmo padrão de duas etapas da tela de detalhe (pesquisa-detalhe-view.tsx):
// primeiro clique arma, segundo executa. Aqui a confirmação nomeia a pesquisa e
// diz quantas respostas vão junto — numa lista o risco é clicar na linha errada,
// e a exclusão é irreversível.
function ExcluirPesquisaButton({
  empresaId,
  pesquisaId,
  titulo,
  respostas,
}: {
  empresaId: string;
  pesquisaId: string;
  titulo: string;
  respostas: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
        <span className="text-xs text-destructive">
          Excluir &ldquo;{titulo}&rdquo;
          {respostas > 0 && ` e ${respostas} resposta${respostas > 1 ? "s" : ""}`}?
        </span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={excluindo}
          onClick={async () => {
            setExcluindo(true);
            const result = await deletePesquisa(empresaId, pesquisaId);
            // só volta aqui em erro — no sucesso a action redireciona
            setExcluindo(false);
            if (result && !result.ok) toast.error(result.error);
          }}
        >
          {excluindo ? "Excluindo..." : "Confirmar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      onClick={() => setConfirming(true)}
      aria-label={`Excluir ${titulo}`}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function NovaPesquisaForm({ empresaId }: { empresaId: string }) {
  const [anonima, setAnonima] = useState(true);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    fd.set("anonima", anonima ? "true" : "false");
    // Em caso de sucesso, createPesquisa chama redirect() e nunca retorna —
    // a navegação para a tela de detalhe já fecha este diálogo. Só chegamos
    // aqui de volta em caso de erro de validação.
    return createPesquisa(empresaId, prev, fd);
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova Pesquisa</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          autoFocus
          // O exemplo mistura clima com uso de benefício DE PROPÓSITO: esta tela
          // serve para qualquer pergunta ao time, e um exemplo só de clima fazia
          // parecer que era a única coisa que ela faz.
          placeholder="Ex.: Clima 2026, Uso da Telemedicina, Pulso do trimestre"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Textarea id="descricao" name="descricao" rows={3} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="anonima" checked={anonima} onCheckedChange={(v) => setAnonima(v === true)} />
        <Label htmlFor="anonima" className="font-normal">
          Pesquisa anônima — respostas nunca identificam o colaborador
        </Label>
      </div>
      {/* A escolha do anonimato muda o que a pesquisa entrega, então a tela diz
          quando cada um serve. Antes o rótulo dizia só "recomendado", e isso
          empurra para anônima até quando ela destrói o objetivo: numa pesquisa
          de uso de benefício, o valor está em saber QUEM não usa. */}
      <p className="text-xs text-muted-foreground">
        {anonima
          ? "Boa para clima, eNPS e risco psicossocial, onde a sinceridade depende de ninguém se expor. Você verá os números do grupo, nunca quem respondeu o quê."
          : "Boa para uso de benefício, adesão e preferências — casos em que agir depende de saber quem respondeu o quê. Evite em pesquisa sobre chefia ou satisfação."}
      </p>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar e continuar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
