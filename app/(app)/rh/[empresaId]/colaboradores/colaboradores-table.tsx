"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  createColaborador,
  updateColaborador,
  deleteColaborador,
  toggleColaboradorAtivo,
} from "@/lib/actions/rh-colaboradores";
import { AtivarDesativarButton } from "./ativar-desativar-button";
import { formatarCpf, mascararCpf } from "@/lib/cpf";
import type { ActionResult } from "@/lib/constants";

type Setor = { id: string; nome: string };
type Posicao = { id: string; nome: string };
type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telegramChatId: string | null;
  ativo: boolean;
  setorId: string;
  setor: Setor;
  posicaoId: string;
  posicao: Posicao;
};

const initialState: ActionResult = { ok: true };

// 25 linhas cabem numa tela sem rolar demais e mantêm a paginação curta:
// 188 ativos dão 8 páginas. Muito menos criaria uma navegação longa; muito
// mais recriaria o problema de rolar procurando alguém.
const POR_PAGINA = 25;

const classeFiltro =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type CampoOrdenavel = "nome" | "setor" | "posicao";

/** Cabeçalho que ordena ao ser clicado, com a seta indicando o sentido. */
function ColunaOrdenavel({
  campo,
  rotulo,
  ordem,
  aoOrdenar,
}: {
  campo: CampoOrdenavel;
  rotulo: string;
  ordem: { campo: CampoOrdenavel; desc: boolean };
  aoOrdenar: (c: CampoOrdenavel) => void;
}) {
  const ativa = ordem.campo === campo;
  return (
    // aria-sort vai no CABEÇALHO, não no botão: quem carrega o papel de
    // columnheader é o <th>. No botão o atributo é ignorado — o leitor de
    // tela anunciaria a coluna sem dizer que ela ordena.
    <TableHead aria-sort={ativa ? (ordem.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => aoOrdenar(campo)}
        className="inline-flex items-center gap-1 transition-colors hover:text-primary"
      >
        {rotulo}
        {ativa ? (
          ordem.desc ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <ArrowUp className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

/**
 * CPF mascarado por padrão, revelado por gesto.
 *
 * O portal do colaborador já mascarava; esta listagem mostrava o número
 * inteiro — e é ela que abre com 208 pessoas de uma vez. Quem procura uma
 * pessoa não precisa ver o CPF de todas as outras no caminho.
 *
 * O estado é POR LINHA de propósito: revelar uma não revela as demais, então
 * a tela nunca volta a exibir a lista completa de números.
 */
function CelulaCpf({ cpf }: { cpf: string | null }) {
  const [revelado, setRevelado] = useState(false);

  if (!cpf) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{revelado ? formatarCpf(cpf) : mascararCpf(cpf)}</span>
      <button
        type="button"
        onClick={() => setRevelado((v) => !v)}
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label={revelado ? "Ocultar CPF" : "Revelar CPF"}
        title={revelado ? "Ocultar" : "Revelar para conferir com o documento"}
      >
        {revelado ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </span>
  );
}

// A importação do Elleven trouxe setor literalmente chamado "Não definido".
// Ele não é um setor — é a ausência de um. Exibir como texto normal faz
// parecer cadastro completo; como etiqueta, fica claro que falta preencher.
const SETOR_AUSENTE = "não definido";

function CelulaSetor({ nome }: { nome: string }) {
  if (nome.trim().toLowerCase() === SETOR_AUSENTE) {
    return (
      <Badge variant="outline" className="text-muted-foreground font-normal">
        Setor pendente
      </Badge>
    );
  }
  return <>{nome}</>;
}

export function ColaboradoresTable({
  empresaId,
  colaboradores,
  setores,
  posicoes,
}: {
  empresaId: string;
  colaboradores: Colaborador[];
  setores: Setor[];
  posicoes: Posicao[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editColaborador, setEditColaborador] = useState<Colaborador | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroPosicao, setFiltroPosicao] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("ativos");
  const [ordem, setOrdem] = useState<{ campo: CampoOrdenavel; desc: boolean }>({
    campo: "nome",
    desc: false,
  });
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");

    const lista = colaboradores.filter((c) => {
      if (filtroStatus === "ativos" && !c.ativo) return false;
      if (filtroStatus === "inativos" && c.ativo) return false;
      if (filtroSetor !== "todos" && c.setorId !== filtroSetor) return false;
      if (filtroPosicao !== "todos" && c.posicaoId !== filtroPosicao) return false;
      if (!termo) return true;
      return (
        c.nome.toLowerCase().includes(termo) ||
        Boolean(termoDigitos && c.cpf?.includes(termoDigitos)) ||
        Boolean(c.email?.toLowerCase().includes(termo)) ||
        c.setor.nome.toLowerCase().includes(termo) ||
        c.posicao.nome.toLowerCase().includes(termo)
      );
    });

    // localeCompare com "pt-BR": sem isso, "Ávila" cairia depois de "Zuza",
    // porque a ordenação padrão compara o código do caractere acentuado.
    const valor = (c: Colaborador) =>
      ordem.campo === "nome" ? c.nome : ordem.campo === "setor" ? c.setor.nome : c.posicao.nome;
    return [...lista].sort((a, b) => {
      const r = valor(a).localeCompare(valor(b), "pt-BR", { sensitivity: "base" });
      return ordem.desc ? -r : r;
    });
  }, [colaboradores, busca, filtroSetor, filtroPosicao, filtroStatus, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  // Mudar filtro pode encolher a lista para menos páginas do que a atual;
  // sem isso a tela ficaria vazia sem explicação.
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const aoOrdenar = (campo: CampoOrdenavel) => {
    setOrdem((o) => (o.campo === campo ? { campo, desc: !o.desc } : { campo, desc: false }));
    setPagina(1);
  };
  const aoFiltrar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nome, CPF, e-mail, setor ou posição..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            className="w-full max-w-xs"
          />
          <select
            value={filtroSetor}
            onChange={(e) => aoFiltrar(setFiltroSetor)(e.target.value)}
            className={classeFiltro}
            aria-label="Filtrar por setor"
          >
            <option value="todos">Todos os setores</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <select
            value={filtroPosicao}
            onChange={(e) => aoFiltrar(setFiltroPosicao)(e.target.value)}
            className={classeFiltro}
            aria-label="Filtrar por cargo"
          >
            <option value="todos">Todos os cargos</option>
            {posicoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => aoFiltrar(setFiltroStatus)(e.target.value)}
            className={classeFiltro}
            aria-label="Filtrar por situação"
          >
            {/* "Ativos" é o padrão porque quem abre a tela quer o time de
                hoje; desligado só interessa quando se procura por ele. */}
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
            <option value="todos">Ativos e inativos</option>
          </select>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo Colaborador
          </DialogTrigger>
          <DialogContent>
            <ColaboradorForm
              action={createColaborador.bind(null, empresaId)}
              title="Novo Colaborador"
              setores={setores}
              posicoes={posicoes}
              onSuccess={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel campo="nome" rotulo="Nome" ordem={ordem} aoOrdenar={aoOrdenar} />
              <TableHead>CPF</TableHead>
              <TableHead>E-mail</TableHead>
              <ColunaOrdenavel campo="setor" rotulo="Setor" ordem={ordem} aoOrdenar={aoOrdenar} />
              <ColunaOrdenavel campo="posicao" rotulo="Posição" ordem={ordem} aoOrdenar={aoOrdenar} />
              <TableHead>Telegram</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <Users className="mx-auto mb-2 size-7 text-muted-foreground" />
                  <p className="font-medium">Nenhum colaborador encontrado</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {colaboradores.length === 0
                      ? "Cadastre o primeiro, ou suba a planilha em Configuração → Importações."
                      : "Nenhum resultado com esses filtros. Tente limpar a busca ou trocar setor e cargo."}
                  </p>
                </TableCell>
              </TableRow>
            )}
            {visiveis.map((c) => (
              <TableRow key={c.id} className={c.ativo ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  <Link href={`/rh/${empresaId}/colaboradores/${c.id}`} className="hover:underline">
                    {c.nome}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <CelulaCpf cpf={c.cpf} />
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground" title={c.email ?? undefined}>
                  {c.email ?? "—"}
                </TableCell>
                <TableCell>
                  <CelulaSetor nome={c.setor.nome} />
                </TableCell>
                <TableCell>{c.posicao.nome}</TableCell>
                <TableCell>
                  {c.telegramChatId ? (
                    <Badge variant="secondary">Vinculado</Badge>
                  ) : (
                    <span className="text-muted-foreground">Não vinculado</span>
                  )}
                </TableCell>
                <TableCell>
                  {/* Só rótulo. Até 28/07/2026 este badge era um botão que
                      ativava/desativava a pessoa no primeiro clique, sem dizer
                      que era clicável e sem confirmar — quem passava por aqui
                      não achava a ação, e quem achava por acidente desativava
                      alguém sem querer. A ação foi para a coluna de ações. */}
                  <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditColaborador(c)}>
                      <Pencil className="size-4" />
                    </Button>
                    <AtivarDesativarButton empresaId={empresaId} id={c.id} ativo={c.ativo} />
                    <DeleteColaboradorButton empresaId={empresaId} colaborador={c} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* A contagem aparece SEMPRE, mesmo numa página só: é ela que responde
          "quantas pessoas esse filtro achou?" — a pergunta que a tela existe
          para responder. Os botões só aparecem quando há mais de uma página. */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground tabular-nums">
          {filtrados.length === 0
            ? "Nenhum resultado"
            : filtrados.length === 1
              ? "1 colaborador"
              : `${filtrados.length} colaboradores`}
          {filtrados.length !== colaboradores.length && ` de ${colaboradores.length}`}
        </p>

        {totalPaginas > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina(paginaAtual - 1)}
              disabled={paginaAtual === 1}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="text-muted-foreground tabular-nums">
              {paginaAtual} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina(paginaAtual + 1)}
              disabled={paginaAtual === totalPaginas}
            >
              Próxima
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!editColaborador} onOpenChange={(open) => !open && setEditColaborador(null)}>
        <DialogContent>
          {editColaborador && (
            <ColaboradorForm
              action={updateColaborador.bind(null, empresaId, editColaborador.id)}
              title="Editar Colaborador"
              setores={setores}
              posicoes={posicoes}
              defaultValues={editColaborador}
              onSuccess={() => setEditColaborador(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ColaboradorForm({
  action,
  title,
  setores,
  posicoes,
  defaultValues,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  setores: Setor[];
  posicoes: Posicao[];
  defaultValues?: Colaborador;
  onSuccess: () => void;
}) {
  const [setorId, setSetorId] = useState(defaultValues?.setorId ?? "");
  const [posicaoId, setPosicaoId] = useState(defaultValues?.posicaoId ?? "");
  const [ativo, setAtivo] = useState(defaultValues?.ativo ?? true);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    fd.set("ativo", ativo ? "true" : "false");
    const result = await action(prev, fd);
    if (result.ok) {
      toast.success("Colaborador salvo com sucesso.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={defaultValues?.nome ?? ""} required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cpf">CPF (opcional)</Label>
        <Input id="cpf" name="cpf" defaultValue={defaultValues?.cpf ?? ""} placeholder="Somente números" maxLength={14} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail (opcional)</Label>
        <Input id="email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} />
      </div>
      <div className="space-y-2">
        <Label>Setor</Label>
        <Select
          value={setorId}
          onValueChange={(v) => setSetorId(v ?? "")}
          name="setorId"
          items={Object.fromEntries(setores.map((s) => [s.id, s.nome]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o setor" />
          </SelectTrigger>
          <SelectContent>
            {setores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Posição</Label>
        <Select
          value={posicaoId}
          onValueChange={(v) => setPosicaoId(v ?? "")}
          name="posicaoId"
          items={Object.fromEntries(posicoes.map((p) => [p.id, p.nome]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione a posição" />
          </SelectTrigger>
          <SelectContent>
            {posicoes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="telegramChatId">Chat ID do Telegram (opcional)</Label>
        <Input
          id="telegramChatId"
          name="telegramChatId"
          defaultValue={defaultValues?.telegramChatId ?? ""}
          placeholder="Ex: 123456789"
        />
        <p className="text-xs text-muted-foreground">
          Necessário para enviar o convite da pesquisa pelo Telegram. Preenchido
          automaticamente quando o colaborador dá /start no bot e compartilha o número —
          só edite aqui em caso de exceção.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="ativo" checked={ativo} onCheckedChange={(v) => setAtivo(v === true)} />
        <Label htmlFor="ativo" className="font-normal">
          Colaborador ativo
        </Label>
      </div>
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

function DeleteColaboradorButton({ empresaId, colaborador }: { empresaId: string; colaborador: Colaborador }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteColaborador(empresaId, colaborador.id);
    if (result.ok) {
      toast.success("Colaborador excluído.");
    } else {
      toast.error(result.error);
    }
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs text-destructive">Apagar a ficha?</span>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <Button variant="ghost" size="icon" onClick={() => setConfirming(true)}>
      <Trash2 className="size-4" />
    </Button>
  );
}
