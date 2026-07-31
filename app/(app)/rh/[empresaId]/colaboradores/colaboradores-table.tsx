"use client";

import { useActionState, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFiltroEmpresas } from "../filtro-empresas";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Mail,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  createColaborador,
  updateColaborador,
  deleteColaborador,
} from "@/lib/actions/rh-colaboradores";
import { AtivarDesativarButton } from "./ativar-desativar-button";
import { AlertaDuplicados } from "./alerta-duplicados";
import { ConferirCpfs } from "./conferir-cpfs";
import { formatarCpf, mascararCpf } from "@/lib/cpf";
import type { ActionResult } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Rótulos das lacunas — os mesmos textos do bloco na tela inicial, para quem
// clica reconhecer onde chegou.
const ROTULO_LACUNA: Record<string, string> = {
  salario: "sem salário na ficha",
  admissao: "sem data de admissão",
  setor: "sem setor definido",
  cpf: "sem CPF",
  telegram: "sem Telegram vinculado",
};

function temLacuna(c: { salarioBase: unknown | null; dataAdmissao: unknown; cpf: string | null; telegramChatId: string | null; setor: { nome: string } }, chave: string): boolean {
  switch (chave) {
    case "salario": return c.salarioBase === null || c.salarioBase === undefined;
    case "admissao": return !c.dataAdmissao;
    case "cpf": return !c.cpf;
    case "telegram": return !c.telegramChatId;
    case "setor": return c.setor.nome.trim().toLowerCase() === "não definido";
    default: return true;
  }
}

type Empresa = { id: string; nome: string };
type Setor = { id: string; nome: string; empresaId: string };
type Posicao = { id: string; nome: string; empresaId: string };
type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  telegramChatId: string | null;
  supervisorId: string | null;
  // Usados pelo filtro ?lacuna=; vêm do include da página.
  salarioBase: unknown | null;
  dataAdmissao: Date | string | null;
  ativo: boolean;
  empresaId: string;
  empresa: Empresa;
  setorId: string;
  setor: Setor;
  posicaoId: string;
  posicao: Posicao;
};

const initialState: ActionResult = { ok: true };

// 50 linhas com a tabela compacta ocupam menos que as 25 antigas ocupavam no
// tamanho normal: 188 ativos passam de 8 páginas para 4. Menos troca de página
// para conferir a base inteira, que é o que o RH faz aqui.
const POR_PAGINA = 50;

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

/**
 * Bolinha com as iniciais — funciona como avatar quando não há foto.
 *
 * Usa as duas primeiras letras do primeiro nome (ex: "Adriano Almino de
 * Oliveira" → AD). Cor de fundo vem de um hash do id pra cada pessoa cair
 * numa cor consistente entre reloads sem precisar persistir nada.
 */
function AvatarIniciais({ nome, id, ativo }: { nome: string; id: string; ativo: boolean }) {
  const partes = nome.trim().split(/\s+/);
  const iniciais = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  const codigo = [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const cores = [
    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  ];
  const cor = cores[codigo % cores.length];
  return (
    <Avatar size="sm" className={cn(ativo ? "" : "grayscale opacity-60", "")}>
      <AvatarFallback className={cn("text-[10px] font-semibold", cor)}>
        {iniciais.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Chip de status com bolinha colorida — mais legível que badge sólido. */
function ChipStatus({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ativo
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800"
          : "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:ring-zinc-700",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          ativo ? "bg-emerald-500 dark:bg-emerald-400" : "bg-zinc-400 dark:bg-zinc-500",
        )}
      />
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

/** KPI compacto pro cabeçalho — número grande, rótulo discreto. */
function Kpi({
  rotulo,
  valor,
  icone: Icone,
  tom,
}: {
  rotulo: string;
  valor: number | string;
  icone: React.ComponentType<{ className?: string }>;
  tom?: "primary" | "warning" | "muted";
}) {
  const cores =
    tom === "warning"
      ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800"
      : tom === "muted"
        ? "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-300 dark:ring-zinc-700"
        : "bg-primary/10 text-primary ring-primary/20";
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-xs">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
          cores,
        )}
      >
        <Icone className="size-4" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-lg font-semibold tabular-nums">{valor}</p>
      </div>
    </div>
  );
}

export function ColaboradoresTable({
  empresaId,
  empresasDoUsuario,
  colaboradores,
  setores,
  posicoes,
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  colaboradores: Colaborador[];
  setores: Setor[];
  posicoes: Posicao[];
}) {
  // Aplicar filtro de marcas/empresas selecionadas
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);
  const [colaboradoresFiltrados, setColaboradoresFiltrados] = useState(colaboradores);
  const [setoresFiltrados, setSetoresFiltrados] = useState(setores);
  const [posicoesFiltradas, setPosicoesFiltradas] = useState(posicoes);

  useEffect(() => {
    setColaboradoresFiltrados(
      colaboradores.filter((c) => empresasSelecionadas.includes(c.empresaId))
    );
    setSetoresFiltrados(
      setores.filter((s) => empresasSelecionadas.includes(s.empresaId))
    );
    setPosicoesFiltradas(
      posicoes.filter((p) => empresasSelecionadas.includes(p.empresaId))
    );
  }, [colaboradores, setores, posicoes, empresasSelecionadas]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editColaborador, setEditColaborador] = useState<Colaborador | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroPosicao, setFiltroPosicao] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("ativos");

  // ?lacuna= vem do bloco "Preenchimento da base" da tela inicial: o número
  // ali vira esta lista, já isolada em quem tem o campo vazio. Sem isto o
  // bloco apontava o problema e escondia quem era.
  const lacuna = useSearchParams().get("lacuna");
  const [ordem, setOrdem] = useState<{ campo: CampoOrdenavel; desc: boolean }>({
    campo: "nome",
    desc: false,
  });
  const [pagina, setPagina] = useState(1);

  const totais = useMemo(() => {
    const ativos = colaboradoresFiltrados.filter((c) => c.ativo).length;
    const telegram = colaboradoresFiltrados.filter((c) => c.ativo && c.telegramChatId).length;
    const semSetor = colaboradoresFiltrados.filter(
      (c) => c.ativo && c.setor.nome.trim().toLowerCase() === SETOR_AUSENTE,
    ).length;
    return { total: colaboradoresFiltrados.length, ativos, telegram, semSetor };
  }, [colaboradoresFiltrados]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");

    const lista = colaboradoresFiltrados.filter((c) => {
      if (filtroStatus === "ativos" && !c.ativo) return false;
      if (filtroStatus === "inativos" && c.ativo) return false;
      if (filtroSetor !== "todos" && c.setorId !== filtroSetor) return false;
      if (filtroPosicao !== "todos" && c.posicaoId !== filtroPosicao) return false;
      if (lacuna && !temLacuna(c, lacuna)) return false;
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
  }, [colaboradoresFiltrados, busca, filtroSetor, filtroPosicao, filtroStatus, ordem, lacuna]);

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

  const temFiltro =
    busca.trim() !== "" ||
    filtroSetor !== "todos" ||
    filtroPosicao !== "todos" ||
    filtroStatus !== "ativos";

  function limparFiltros() {
    setBusca("");
    setFiltroSetor("todos");
    setFiltroPosicao("todos");
    setFiltroStatus("ativos");
    setPagina(1);
  }

  return (
    <div className="space-y-4">
      <AlertaDuplicados empresaId={empresaId} colaboradores={colaboradores} />
      <ConferirCpfs empresaId={empresaId} colaboradores={colaboradores} />

      {/* Cabeçalho com identidade visual e KPIs — responde "quantos são" e
          "tem pendência grave" sem precisar entrar na tabela. */}
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="size-5 text-primary" />
              Equipe
            </h2>
            <p className="text-sm text-muted-foreground">
              {totais.ativos} ativo{totais.ativos === 1 ? "" : "s"} de {totais.total} cadastrado
              {totais.total === 1 ? "" : "s"} na empresa atual.
            </p>
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
                setores={setoresFiltrados}
                posicoes={posicoesFiltradas}
                candidatosSupervisor={colaboradores}
                onSuccess={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi rotulo="Total cadastrados" valor={totais.total} icone={Users} />
          <Kpi rotulo="Ativos" valor={totais.ativos} icone={Briefcase} />
          <Kpi
            rotulo="Telegram vinculado"
            valor={`${totais.telegram}/${totais.ativos}`}
            icone={Send}
          />
          <Kpi
            rotulo="Setor pendente"
            valor={totais.semSetor}
            icone={Building2}
            tom={totais.semSetor > 0 ? "warning" : "muted"}
          />
        </div>
      </div>

      {/* Filtros numa faixa separada — barra de busca em destaque, secundários
          em selects compactos; tudo num bloco que se lê como "filtre aqui". */}
      {/* Chegou pelo bloco "Preenchimento da base": diz em que lista a pessoa
          caiu e como sair dela — sem isso o filtro fica invisível e a lista
          parece só estar faltando gente. */}
      {lacuna && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            Mostrando apenas quem está{" "}
            <strong>{ROTULO_LACUNA[lacuna] ?? lacuna}</strong> —{" "}
            <span className="tabular-nums">{filtrados.length}</span>{" "}
            {filtrados.length === 1 ? "pessoa" : "pessoas"}.
          </span>
          <Link
            href={`/rh/${empresaId}/colaboradores`}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ver todos
          </Link>
        </div>
      )}

      <div className="rounded-xl border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF, e-mail, setor ou cargo..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              className="h-9 w-full pl-8"
            />
          </div>
          <select
            value={filtroSetor}
            onChange={(e) => aoFiltrar(setFiltroSetor)(e.target.value)}
            className={classeFiltro}
            aria-label="Filtrar por setor"
          >
            <option value="todos">Todos os setores</option>
            {setoresFiltrados.map((s) => (
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
            {posicoesFiltradas.map((p) => (
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
          {temFiltro && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limparFiltros}
              className="text-muted-foreground"
            >
              <XCircle className="size-3.5" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-xs">
        <Table compacta>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <ColunaOrdenavel campo="nome" rotulo="Colaborador" ordem={ordem} aoOrdenar={aoOrdenar} />
              <TableHead>CPF</TableHead>
              <TableHead>E-mail</TableHead>
              <ColunaOrdenavel campo="setor" rotulo="Setor" ordem={ordem} aoOrdenar={aoOrdenar} />
              <ColunaOrdenavel campo="posicao" rotulo="Cargo" ordem={ordem} aoOrdenar={aoOrdenar} />
              <TableHead className="text-center">Telegram</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <Users className="size-6 text-muted-foreground" />
                    </span>
                    <p className="font-medium">Nenhum colaborador encontrado</p>
                    <p className="text-sm text-muted-foreground">
                      {colaboradores.length === 0
                        ? "Cadastre o primeiro, ou suba a planilha em Configuração → Importações."
                        : "Nenhum resultado com esses filtros. Tente limpar a busca ou trocar setor e cargo."}
                    </p>
                    {temFiltro && (
                      <Button type="button" variant="outline" size="sm" onClick={limparFiltros}>
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {visiveis.map((c) => (
              <TableRow key={c.id} className="group">
                <TableCell className="py-2">
                  <Link
                    // A lista traz colaboradores de TODAS as marcas visíveis ao
                    // usuário, mas a ficha é escopada à empresa da rota. Usar o
                    // empresaId da URL aqui dava 404 em quem é de outra empresa.
                    href={`/rh/${c.empresaId}/colaboradores/${c.id}`}
                    className="flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md"
                  >
                    <AvatarIniciais nome={c.nome} id={c.id} ativo={c.ativo} />
                    <div className="min-w-0 leading-tight">
                      <p
                        className={cn(
                          "truncate font-medium group-hover:text-primary",
                          !c.ativo && "text-muted-foreground",
                        )}
                      >
                        {c.nome}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.posicao.nome}
                      </p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <CelulaCpf cpf={c.cpf} />
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground" title={c.email ?? undefined}>
                  {c.email ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="size-3 shrink-0 opacity-60" />
                      <span className="truncate">{c.email}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <CelulaSetor nome={c.setor.nome} />
                </TableCell>
                <TableCell className="text-muted-foreground">{c.posicao.nome}</TableCell>
                <TableCell className="text-center">
                  {c.telegramChatId ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800"
                      title="Vinculará ao Telegram"
                    >
                      <Send className="size-3" />
                      Sim
                    </span>
                  ) : (
                    <span className="text-muted-foreground" title="Sem chat do Telegram">
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {/* Só rótulo. Até 28/07/2026 este badge era um botão que
                      ativava/desativava a pessoa no primeiro clique, sem dizer
                      que era clicável e sem confirmar — quem passava por aqui
                      não achava a ação, e quem achava por acidente desativava
                      alguém sem querer. A ação foi para a coluna de ações. */}
                  <ChipStatus ativo={c.ativo} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-0.5">
                    <Button variant="ghost" size="icon" onClick={() => setEditColaborador(c)} title="Editar">
                      <Pencil className="size-4" />
                    </Button>
                    {/* Mesma razão do link acima: a ação tem de ir para a
                        empresa do colaborador, não para a da rota. */}
                    <AtivarDesativarButton empresaId={c.empresaId} id={c.id} ativo={c.ativo} />
                    <DeleteColaboradorButton empresaId={c.empresaId} colaborador={c} />
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
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
              action={updateColaborador.bind(null, editColaborador.empresaId, editColaborador.id)}
              title="Editar Colaborador"
              setores={setoresFiltrados}
              posicoes={posicoesFiltradas}
              candidatosSupervisor={colaboradores}
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
  candidatosSupervisor,
  defaultValues,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  setores: Setor[];
  posicoes: Posicao[];
  candidatosSupervisor: Colaborador[];
  defaultValues?: Colaborador;
  onSuccess: () => void;
}) {
  const [setorId, setSetorId] = useState(defaultValues?.setorId ?? "");
  const [posicaoId, setPosicaoId] = useState(defaultValues?.posicaoId ?? "");
  const [supervisorId, setSupervisorId] = useState(defaultValues?.supervisorId ?? "");
  const [ativo, setAtivo] = useState(defaultValues?.ativo ?? true);

  // Ativos, sem a própria pessoa (na edição) e sem quem já reporta a ela —
  // reportar ao próprio subordinado criaria um ciclo de dois na hora; o resto
  // dos ciclos mais longos a action pega no servidor (criariCiclo).
  const opcoesLider = candidatosSupervisor.filter(
    (c) => c.ativo && c.id !== defaultValues?.id && c.supervisorId !== defaultValues?.id,
  );

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
        <Label>Reporta a (opcional)</Label>
        <Select
          value={supervisorId}
          onValueChange={(v) => setSupervisorId(v ?? "")}
          name="supervisorId"
          items={Object.fromEntries(opcoesLider.map((c) => [c.id, c.nome]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sem líder" />
          </SelectTrigger>
          <SelectContent>
            {opcoesLider.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">É o que monta o Organograma — some sozinho quando o líder muda.</p>
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
    <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} title="Excluir">
      <Trash2 className="size-4" />
    </Button>
  );
}