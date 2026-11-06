"use client";

import { Fragment, useActionState, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Link2,
  Link2Off,
  Power,
  PowerOff,
  Search,
  ChevronDown,
  TriangleAlert,
  Check,
  Loader2,
  ArrowLeftRight,
  Eye,
  EyeOff,
  Shuffle,
  Copy,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { cn } from "@/lib/utils";
import {
  createUsuario,
  updateUsuario,
  deleteUsuario,
  resetSenhaUsuario,
  enviarLinkSenhaPorEmail,
  vincularEmpresaUsuario,
  desativarVinculoUsuario,
  reativarVinculoUsuario,
  vincularMarcaUsuario,
  desativarVinculoMarca,
  reativarVinculoMarca,
  toggleStatusUsuario,
  definirMarcasQueVe,
} from "@/lib/actions/usuarios";
import { ROLES, ROLE_LABEL, type ActionResult } from "@/lib/constants";
import { PERFIS_SEMENTE } from "@/lib/permissoes/catalogo";
import { FichaVinculada } from "./ficha-vinculada";

type EmpresaResumo = { id: string; nome: string; ativo: boolean; marcaId: string };
type SetorResumo = { id: string; nome: string; empresaId: string; ativo: boolean };
type MarcaResumo = { id: string; nome: string };

/** Só a tela de admin (MASTER): os grupos e as marcas ativas de TODOS eles. */
export type PainelAdmin = {
  grupos: { id: string; nome: string }[];
  marcas: { id: string; nome: string; grupoId: string }[];
  /** O grupo aberto na tela — é o grupo das contas listadas. */
  grupoAtualId: string | null;
};

type Vinculo = {
  empresaId: string;
  empresaNome: string;
  empresaAtiva: boolean;
  role: string;
  setorId: string | null;
  setorNome: string | null;
  ativo: boolean;
  papelPrincipal: boolean;
  /** CNPJ de outro grupo de sociedade: o vínculo existe no banco, mas não dá acesso (lib/grupo.ts). */
  foraDoGrupo: boolean;
};

// Vínculo com a marca inteira: não tem setor nem papelPrincipal porque não
// aponta para um CNPJ — o papel é sempre RH e a empresa de entrada continua
// saindo dos vínculos por CNPJ.
type VinculoMarca = {
  marcaId: string;
  marcaNome: string;
  ativo: boolean;
  /** Marca de outro grupo de sociedade: o vínculo não dá acesso. */
  foraDoGrupo: boolean;
  /** Papel do vínculo. ADMIN/DIRETORIA = restrição posta pelo admin (lib/grupo.ts). */
  role: string;
};

/** Marca que o ADMIN pôs como restrição de uma Diretoria/Administrativo (lib/grupo.ts). */
function ehRestricao(v: VinculoMarca) {
  return v.ativo && !v.foraDoGrupo && (v.role === "ADMIN" || v.role === "DIRETORIA");
}

// A ficha de colaborador que este login representa, quando existe. `null` é o
// caso comum: ADMIN e RH em geral não têm ficha na empresa que administram.
export type FichaDoUsuario = {
  id: string;
  nome: string;
  empresaNome: string;
  setorNome: string;
};

export type PerfilOpcao = { id: string; nome: string; sistema: boolean; papelDeOrigem: string | null };

export type Usuario = {
  id: string;
  perfilIds: string[];
  nome: string;
  username: string;
  email: string | null;
  telefone: string | null;
  role: string;
  ativo: boolean;
  empresas: Vinculo[];
  marcasVinculadas: VinculoMarca[];
  ficha: FichaDoUsuario | null;
};

const initialState: ActionResult = { ok: true };

const PAPEL_LABEL: Record<string, string> = {
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Setor",
};

// O acesso vem por UM dos dois: a marca inteira (dinâmica, CNPJ novo entra
// sozinho) ou um CNPJ específico. É escolha exclusiva porque o servidor recusa
// os dois juntos — ver as validações em lib/actions/usuarios.ts.
type Escopo = "MARCA" | "CNPJ";

// Agrupa os CNPJs pela marca a que pertencem para o select ficar legível.
// Empresa ativa cuja marca foi desativada não pode sumir da lista, então cai
// num grupo sem rótulo de marca em vez de virar opção invisível.
function agruparPorMarca(empresas: EmpresaResumo[], marcas: MarcaResumo[]) {
  const grupos = marcas
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      empresas: empresas.filter((e) => e.marcaId === m.id),
    }))
    .filter((g) => g.empresas.length > 0);

  const semMarca = empresas.filter((e) => !marcas.some((m) => m.id === e.marcaId));
  if (semMarca.length > 0) {
    grupos.push({ id: "__sem_marca", nome: "Outras", empresas: semMarca });
  }
  return grupos;
}

export function UsuariosTable({
  usuarios,
  empresas,
  setores,
  marcas,
  perfis,
  currentUserId,
  grupoId,
  painelAdmin,
}: {
  usuarios: Usuario[];
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  marcas: MarcaResumo[];
  perfis: PerfilOpcao[];
  currentUserId: string;
  /** Só para o MASTER: o grupo em que a conta nova nasce (o que está aberto na tela). */
  grupoId?: string;
  /** Só para o MASTER: liga a ação "Marcas que vê" (tela de admin). */
  painelAdmin?: PainelAdmin;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUsuario, setEditUsuario] = useState<Usuario | null>(null);
  const [resetUsuario, setResetUsuario] = useState<Usuario | null>(null);
  const [vincularUsuario, setVincularUsuario] = useState<Usuario | null>(null);
  const [excluirUsuario, setExcluirUsuario] = useState<Usuario | null>(null);
  const [marcasUsuario, setMarcasUsuario] = useState<Usuario | null>(null);
  const [aba, setAba] = useState<AbaStatus>("ATIVOS");
  const [busca, setBusca] = useState("");
  const [filtroPapel, setFiltroPapel] = useState<string>("TODOS");
  const [filtroMarca, setFiltroMarca] = useState<string>("TODAS");
  const [inativosAbertos, setInativosAbertos] = useState(true);

  const pendencias = calcularPendencias(usuarios);
  const totalAtivos = usuarios.filter((u) => u.ativo).length;
  const totalInativos = usuarios.length - totalAtivos;

  // Busca e filtros valem para as duas seções (ativos e inativos). A aba só
  // decide QUAIS seções aparecem — assim os contadores das abas mostram o
  // total real, e não o recorte da busca.
  const termo = normalizar(busca.trim());
  const marcaDaEmpresa = new Map(empresas.map((e) => [e.id, e.marcaId]));
  const filtrados = usuarios.filter((u) => {
    if (filtroPapel !== "TODOS" && u.role !== filtroPapel) return false;
    if (filtroMarca !== "TODAS") {
      const ehDirecao = u.role === "ADMIN" || u.role === "DIRETORIA";
      const restricoes = u.marcasVinculadas.filter(ehRestricao);
      const temMarca = ehDirecao
        ? // Diretoria/Administrativo: sem marca marcada pelo admin, o grupo
          // todo; com marca marcada, só ela.
          restricoes.length === 0 || restricoes.some((m) => m.marcaId === filtroMarca)
        : u.marcasVinculadas.some((m) => m.marcaId === filtroMarca) ||
          u.empresas.some((e) => marcaDaEmpresa.get(e.empresaId) === filtroMarca);
      if (!temMarca) return false;
    }
    if (termo) {
      const alvo = normalizar(`${u.nome} ${u.username} ${u.email ?? ""}`);
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
  const ativosFiltrados = filtrados.filter((u) => u.ativo);
  const inativosFiltrados = filtrados.filter((u) => !u.ativo);
  const filtrando = Boolean(termo) || filtroPapel !== "TODOS" || filtroMarca !== "TODAS";
  const mostraAtivos = aba !== "INATIVOS";
  // A aba Ativos mostra SÓ ativos (com um aviso no rodapé que leva aos
  // inativos); a seção própria dos inativos aparece embaixo apenas em Todos.
  const mostraSecaoInativos = aba === "TODOS";

  const acoesDaLinha = {
    currentUserId,
    pendencias,
    onEditar: setEditUsuario,
    onVincular: setVincularUsuario,
    onSenha: setResetUsuario,
    onExcluir: setExcluirUsuario,
    onTrocarGrupo: painelAdmin ? setMarcasUsuario : undefined,
    painel: painelAdmin,
  };

  return (
    <div className="space-y-4">
      <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoResumo rotulo="Total de contas" valor={usuarios.length} />
        <CartaoResumo rotulo="Ativas" valor={totalAtivos} tom="ok" />
        <CartaoResumo rotulo="Inativas" valor={totalInativos} tom="neutro" />
        <CartaoResumo rotulo="Cadastros com pendência" valor={pendencias.total} tom={pendencias.total > 0 ? "alerta" : "neutro"} />
      </section>

      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div role="tablist" aria-label="Status das contas" className="inline-flex rounded-lg bg-muted p-1">
            {(
              [
                ["ATIVOS", "Ativos", totalAtivos],
                ["INATIVOS", "Inativos", totalInativos],
                ["TODOS", "Todos", usuarios.length],
              ] as const
            ).map(([valor, rotulo, qtd]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={aba === valor}
                onClick={() => setAba(valor)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
                  aba === valor
                    ? "bg-background font-semibold text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {rotulo}
                <span className="rounded-full bg-muted-foreground/10 px-2 text-xs font-semibold tabular-nums">{qtd}</span>
              </button>
            ))}
          </div>

          <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-md border px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">Buscar usuário</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, login ou e-mail"
              className="h-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Papel
            <select
              value={filtroPapel}
              onChange={(e) => setFiltroPapel(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="TODOS">Todos os papéis</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          {marcas.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Marca
              <select
                value={filtroMarca}
                onChange={(e) => setFiltroMarca(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
              >
                <option value="TODAS">Todas as marcas</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </label>
          )}

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button className="ml-auto" />}>
              <Plus className="size-4" />
              Novo usuário
            </DialogTrigger>
            <DialogContent>
              <UsuarioForm
                action={createUsuario}
                title="Novo usuário"
                empresas={empresas}
                setores={setores}
                marcas={marcas}
                perfis={perfis}
                grupoId={grupoId}
                onSuccess={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {pendencias.total > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <strong className="font-semibold">
              {pendencias.total === 1 ? "1 cadastro precisa" : `${pendencias.total} cadastros precisam`} de atenção:
            </strong>
            <span>{pendencias.resumo.join(" · ")}</span>
          </div>
        )}

        {mostraAtivos && (
          <TabelaUsuarios
            usuarios={ativosFiltrados}
            agruparPorPapel
            vazio={filtrando ? "Nenhum usuário ativo com esses filtros." : "Nenhum usuário ativo."}
            {...acoesDaLinha}
          />
        )}
        {aba === "ATIVOS" && inativosFiltrados.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>{avisoInativos(inativosFiltrados.length, filtrando)}</span>
            <button
              type="button"
              onClick={() => setAba("INATIVOS")}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Ver inativos
            </button>
          </div>
        )}
        {!mostraAtivos && (
          <TabelaUsuarios
            usuarios={inativosFiltrados}
            agruparPorPapel={false}
            inativos
            vazio={filtrando ? "Nenhum usuário inativo com esses filtros." : "Nenhum usuário inativo."}
            {...acoesDaLinha}
          />
        )}
      </section>

      {/* Na aba Todos, os inativos ficam numa seção própria embaixo — fora da
          lista de quem opera o sistema, mas à vista. */}
      {mostraSecaoInativos && (
        <section className="overflow-hidden rounded-xl border border-dashed bg-muted/30">
          <button
            type="button"
            aria-expanded={inativosAbertos}
            onClick={() => setInativosAbertos((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
          >
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !inativosAbertos && "-rotate-90")} aria-hidden />
            <h2 className="text-sm font-semibold text-foreground/80">Usuários inativos</h2>
            <span className="rounded-full bg-muted px-2 text-xs font-semibold tabular-nums">{inativosFiltrados.length}</span>
            <span className="text-sm text-muted-foreground">— sem acesso aos sistemas; ficam aqui para histórico.</span>
          </button>
          {inativosAbertos && (
            <div className="border-t">
              <TabelaUsuarios
                usuarios={inativosFiltrados}
                agruparPorPapel={false}
                inativos
                vazio="Nenhum usuário inativo com esses filtros."
                {...acoesDaLinha}
              />
            </div>
          )}
        </section>
      )}

      <Dialog open={!!marcasUsuario} onOpenChange={(open) => !open && setMarcasUsuario(null)}>
        <DialogContent className="max-w-lg">
          {marcasUsuario && painelAdmin && (
            <MarcasQueVeForm
              usuario={marcasUsuario}
              painel={painelAdmin}
              onFim={() => setMarcasUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!excluirUsuario} onOpenChange={(open) => !open && setExcluirUsuario(null)}>
        <DialogContent>
          {excluirUsuario && (
            <ExcluirUsuarioConfirmacao usuario={excluirUsuario} onFim={() => setExcluirUsuario(null)} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editUsuario} onOpenChange={(open) => !open && setEditUsuario(null)}>
        <DialogContent>
          {editUsuario && (
            <UsuarioForm
              action={updateUsuario.bind(null, editUsuario.id)}
              title="Editar usuário"
              empresas={empresas}
              setores={setores}
              marcas={marcas}
              perfis={perfis}
              defaultValues={editUsuario}
              onSuccess={() => setEditUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUsuario} onOpenChange={(open) => !open && setResetUsuario(null)}>
        <DialogContent>
          {resetUsuario && (
            <ResetSenhaForm
              usuario={resetUsuario}
              onSuccess={() => setResetUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!vincularUsuario} onOpenChange={(open) => !open && setVincularUsuario(null)}>
        <DialogContent className="max-w-2xl">
          {vincularUsuario && (
            <VincularForm
              usuario={vincularUsuario}
              empresas={empresas}
              setores={setores}
              marcas={marcas}
              onSuccess={() => setVincularUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Senha fácil de ditar: sem letras que se confundem (l/1, O/0). 10 caracteres
// do crypto do navegador — a pessoa troca depois em Minha conta.
function gerarSenha(): string {
  const alfabeto = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

function UsuarioForm({
  action,
  title,
  defaultValues,
  empresas,
  setores,
  marcas,
  perfis,
  grupoId,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  defaultValues?: Usuario;
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  marcas: MarcaResumo[];
  perfis: PerfilOpcao[];
  grupoId?: string;
  onSuccess: () => void;
}) {
  const isEdit = !!defaultValues;
  const [role, setRole] = useState<string>(defaultValues?.role ?? "DIRETORIA");
  // O perfil-semente correspondente a um papel — o default sensato ao criar.
  const perfilDoPapel = (papel: string) => PERFIS_SEMENTE.find((p) => p.papelDeOrigem === papel)?.id;
  const [perfilIds, setPerfilIds] = useState<string[]>(
    defaultValues?.perfilIds ?? [perfilDoPapel("DIRETORIA")].filter((x): x is string => Boolean(x)),
  );
  function alternarPerfil(id: string) {
    setPerfilIds((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }
  const [escopo, setEscopo] = useState<Escopo>(
    defaultValues?.marcasVinculadas.some((m) => m.ativo) ? "MARCA" : "CNPJ",
  );
  const [marcaId, setMarcaId] = useState<string>(
    defaultValues?.marcasVinculadas.find((m) => m.ativo)?.marcaId ?? "",
  );
  const [empresaId, setEmpresaId] = useState<string>(
    defaultValues?.empresas.find((v) => v.papelPrincipal)?.empresaId ?? "",
  );
  const [setorId, setSetorId] = useState<string>("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);

  // Só na criação. `updateUsuario` não lê marca/empresa/setor — quem altera
  // acesso de quem já existe é o diálogo "Vincular". Mostrar os campos aqui na
  // edição seria oferecer um controle que não faz nada.
  const precisaEmpresa = !isEdit && (role === "RH_MANAGER" || role === "GESTOR_SETOR");
  const precisaSetor = role === "GESTOR_SETOR";

  // Gestor de setor não tem escopo de marca — setor pertence a um CNPJ. Forçar
  // aqui evita mandar o formulário para o servidor só para ele recusar.
  const escopoEfetivo: Escopo = precisaSetor ? "CNPJ" : escopo;

  const empresasAtivas = empresas.filter((e) => e.ativo);
  const setoresFiltrados = setores.filter((s) => s.empresaId === empresaId);

  const [, iniciarEnvio] = useTransition();
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      if (isEdit) toast.success("Usuário atualizado.");
      else
        toast.success("Usuário criado.", {
          description: `Passe para a pessoa o usuário “${String(fd.get("username") ?? "").trim().toLowerCase()}” e a senha. Ela entra em rh.assinelm.com.`,
          duration: 10000,
        });
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    // Sem `action={formAction}`: o React 19 limpa o formulário depois de TODA
    // ação, inclusive a que volta com erro — e o admin perdia nome, usuário,
    // e-mail e senha justamente quando a tela recusava o usuário e sugeria
    // outro (v1.191.0). Pelo `onSubmit` o que foi digitado fica.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciarEnvio(() => formAction(fd));
      }}
      className="space-y-4"
    >
      {grupoId && <input type="hidden" name="grupoId" value={grupoId} />}
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {/* Pedido do CEO (v1.193.0): deixar claro que para entrar bastam usuário
          e senha, sem e-mail e sem conta Google. O resto vem depois e é
          opcional ou define o que a pessoa vê. */}
      {!isEdit && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Para entrar, a pessoa só precisa de usuário e senha.</p>
          <p className="mt-1 text-muted-foreground">
            Não precisa de e-mail nem de conta Google. Crie os dois aqui, passe para a pessoa e ela
            entra em rh.assinelm.com. Depois ela pode trocar a senha em Minha conta.
          </p>
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">1. Acesso</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              name="username"
              defaultValue={defaultValues?.username ?? ""}
              placeholder="ex.: joao.silva"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="username-dica"
              required
              autoFocus={!isEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">{isEdit ? "Nova senha (opcional)" : "Senha"}</Label>
            <div className="flex gap-1">
              <Input
                id="senha"
                name="senha"
                type={verSenha ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                placeholder={isEdit ? "Em branco mantém a atual" : "Mínimo 8 caracteres"}
                required={!isEdit}
                minLength={isEdit ? 0 : 8}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setVerSenha((v) => !v)}
                aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
                title={verSenha ? "Esconder senha" : "Mostrar senha"}
              >
                {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setSenha(gerarSenha());
                  setVerSenha(true);
                }}
                aria-label="Gerar uma senha"
                title="Gerar uma senha"
              >
                <Shuffle className="size-4" />
              </Button>
            </div>
          </div>
        </div>
        <p id="username-dica" className="text-xs text-muted-foreground">
          O usuário é o nome que a pessoa digita para entrar: letras sem acento, números, ponto,
          hífen ou sublinhado, sem “@” e sem espaço. Ele não se repete no sistema. Quem trabalha na
          LM e nas outras empresas tem um usuário em cada cliente (ex.: “joao.silva” e
          “joao.silva.lm”) e pode usar a mesma senha nos dois.
        </p>
        <div className="space-y-2">
          <Label htmlFor="nome">
            Nome da pessoa
            {!isEdit && <span className="font-normal text-muted-foreground"> (opcional)</span>}
          </Label>
          <Input
            id="nome"
            name="nome"
            defaultValue={defaultValues?.nome ?? ""}
            required={isEdit}
            autoFocus={isEdit}
            placeholder={isEdit ? undefined : "Só para reconhecer na lista. Sem nome, aparece o usuário."}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">2. O que a pessoa pode fazer</legend>
        <div className="space-y-2">
          <Label>Papel</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              const novo = v ?? "DIRETORIA";
              // Ao criar, troca a sugestão de perfil junto com o papel: sai o
              // perfil-semente do papel anterior, entra o do novo. Na edição não
              // mexe — lá os perfis já vêm da ficha e são escolha do admin.
              if (!isEdit) {
                const antigo = perfilDoPapel(role);
                const proposto = perfilDoPapel(novo);
                setPerfilIds((atual) => {
                  const semAntigo = antigo ? atual.filter((x) => x !== antigo) : atual;
                  return proposto && !semAntigo.includes(proposto) ? [...semAntigo, proposto] : semAntigo;
                });
              }
              setRole(novo);
              if (novo !== "GESTOR_SETOR") setSetorId("");
            }}
            name="role"
            items={Object.fromEntries(ROLES.map((r) => [r.value, r.label]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o papel" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            O papel já define o que a pessoa vê. Os perfis abaixo servem só para ajustes finos.
          </p>
        </div>

        {/* Campos dentro de <details> fechado continuam indo no envio. */}
        <details className="rounded-md border border-border p-2 [&_summary]:cursor-pointer">
          <summary className="text-sm">
            Ajustar perfis de acesso{" "}
            <span className="text-muted-foreground">
              (opcional · {perfilIds.length} marcado{perfilIds.length === 1 ? "" : "s"})
            </span>
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            O que a pessoa vê e edita, por sistema. O papel decide a sugestão. Sem perfil, o acesso
            segue o papel.
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {perfis.map((pf) => (
              <label key={pf.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="perfilId"
                  value={pf.id}
                  checked={perfilIds.includes(pf.id)}
                  onChange={() => alternarPerfil(pf.id)}
                  className="size-4"
                />
                {pf.nome}
                {pf.sistema && <span className="text-[11px] text-muted-foreground">(padrão)</span>}
              </label>
            ))}
            {perfis.length === 0 && (
              <span className="text-xs text-muted-foreground">Nenhum perfil cadastrado ainda.</span>
            )}
          </div>
        </details>
      {precisaEmpresa && (
        <div className="space-y-2">
          <Label>Escopo do acesso</Label>
          <RadioGroup
            value={escopoEfetivo}
            onValueChange={(v) => setEscopo((v ?? "CNPJ") as Escopo)}
            className="gap-2"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem
                value="MARCA"
                id="escopo-marca"
                disabled={precisaSetor}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="escopo-marca" className="font-normal">
                  Marca inteira
                </Label>
                <p className="text-xs text-muted-foreground">
                  Dá acesso a todos os CNPJs da marca, inclusive os cadastrados depois.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="CNPJ" id="escopo-cnpj" className="mt-0.5" />
              <div>
                <Label htmlFor="escopo-cnpj" className="font-normal">
                  CNPJ específico
                </Label>
                <p className="text-xs text-muted-foreground">
                  Acesso só à empresa escolhida.
                </p>
              </div>
            </div>
          </RadioGroup>
          {precisaSetor && (
            <p className="text-xs text-muted-foreground">
              Gestor(a) de Setor é sempre por CNPJ: o setor pertence a um CNPJ, não à marca.
            </p>
          )}
        </div>
      )}
      {/* Marca e empresa são montadas uma OU outra — esconder por CSS deixaria
          o campo escondido no FormData e cairia no "escolha marca ou CNPJ". */}
      {precisaEmpresa && escopoEfetivo === "MARCA" && (
        <div className="space-y-2">
          <Label>Marca</Label>
          <Select
            value={marcaId}
            onValueChange={(v) => setMarcaId(v ?? "")}
            name="marcaId"
            items={Object.fromEntries(marcas.map((m) => [m.id, m.nome]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a marca" />
            </SelectTrigger>
            <SelectContent>
              {marcas.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {precisaEmpresa && escopoEfetivo === "CNPJ" && (
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select
            value={empresaId}
            onValueChange={(v) => {
              setEmpresaId(v ?? "");
              setSetorId("");
            }}
            name="empresaId"
            items={Object.fromEntries(empresasAtivas.map((e) => [e.id, e.nome]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {agruparPorMarca(empresasAtivas, marcas).map((g) => (
                <SelectGroup key={g.id}>
                  <SelectLabel>{g.nome}</SelectLabel>
                  {g.empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {precisaSetor && escopoEfetivo === "CNPJ" && empresaId && (
        <div className="space-y-2">
          <Label>Setor</Label>
          <Select
            value={setorId}
            onValueChange={(v) => setSetorId(v ?? "")}
            name="setorId"
            items={Object.fromEntries(
              setoresFiltrados.filter((s) => s.ativo).map((s) => [s.id, s.nome]),
            )}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o setor" />
            </SelectTrigger>
            <SelectContent>
              {setoresFiltrados
                .filter((s) => s.ativo)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {isEdit && (role === "RH_MANAGER" || role === "GESTOR_SETOR") && (
        <p className="text-xs text-muted-foreground">
          Marca e CNPJs não se alteram por aqui — use &ldquo;Vincular&rdquo; na linha do usuário.
        </p>
      )}
      </fieldset>

      <details
        className="rounded-md border border-border p-2 [&_summary]:cursor-pointer"
        open={Boolean(defaultValues?.email || defaultValues?.telefone)}
      >
        <summary className="text-sm">
          3. Contato <span className="text-muted-foreground">(opcional)</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
              autoComplete="off"
              aria-describedby="email-dica"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input
              id="telefone"
              name="telefone"
              defaultValue={defaultValues?.telefone ?? ""}
              autoComplete="off"
            />
          </div>
          <p id="email-dica" className="col-span-2 -mt-1 text-xs text-muted-foreground">
            O e-mail não serve para entrar. Ele só recebe os avisos e os links de “Esqueci minha
            senha” e “Esqueci meu usuário”. Sem e-mail, quem esquecer a senha pede ao administrador
            para trocar.
          </p>
        </div>
      </details>
      {isEdit && (
        <div className="flex items-center gap-2">
          <Checkbox id="ativo" name="ativo" defaultChecked={defaultValues?.ativo ?? true} />
          <Label htmlFor="ativo">Usuário ativo (desmarque para bloquear o login)</Label>
        </div>
      )}
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : isEdit ? "Salvar" : "Criar usuário"}
        </Button>
      </DialogFooter>
    </form>
  );
}

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
  }
}

// A SENHA ATUAL NÃO TEM COMO APARECER: o banco guarda só o hash dela
// (bcrypt), que não volta a ser a senha. O que o administrador faz aqui é
// definir uma senha nova — visível e copiável, para passar à pessoa — ou
// mandar para o e-mail cadastrado um link para ela mesma criar a senha.
function ResetSenhaForm({
  usuario,
  onSuccess,
}: {
  usuario: Usuario;
  onSuccess: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const result = await resetSenhaUsuario(usuario.id, prev, fd);
      if (result.ok) {
        const valor = String(fd.get("senha") ?? "");
        try {
          await navigator.clipboard.writeText(`Usuário: ${usuario.username}\nSenha: ${valor}`);
          toast.success("Senha redefinida. Usuário e senha copiados — é só colar para a pessoa.");
        } catch {
          toast.success("Senha redefinida.");
        }
        onSuccess();
      }
      return result;
    },
    initialState,
  );

  async function enviarPorEmail() {
    setEnviando(true);
    const result = await enviarLinkSenhaPorEmail(usuario.id);
    setEnviando(false);
    if (result.ok) {
      toast.success(`Link enviado para ${usuario.email}.`);
      onSuccess();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <DialogHeader>
          <DialogTitle>Senha de {usuario.nome}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Usuário de login</p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-medium">{usuario.username}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Copiar usuário"
              aria-label="Copiar usuário"
              onClick={() => copiar(usuario.username, "Usuário copiado.")}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A senha atual não pode ser vista: o sistema guarda só uma versão embaralhada dela. Defina uma nova
            abaixo ou mande o link por e-mail.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="senha">Nova senha</Label>
          <div className="flex gap-2">
            <Input
              id="senha"
              name="senha"
              type="text"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoFocus
            />
            <Button type="button" variant="outline" onClick={() => setSenha(gerarSenha())} title="Gerar senha">
              <Shuffle className="size-4" />
              Gerar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!senha}
              title="Copiar senha"
              aria-label="Copiar senha"
              onClick={() => copiar(senha, "Senha copiada.")}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres. Ao salvar, usuário e senha já vão para a área de transferência.</p>
        </div>
        {!state.ok && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="submit" disabled={isPending || senha.length < 8}>
            {isPending ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </DialogFooter>
      </form>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium">Ou enviar por e-mail</p>
        {usuario.email ? (
          <>
            <p className="text-xs text-muted-foreground">
              A pessoa recebe em <b>{usuario.email}</b> um link para criar a senha dela (vale 24 horas). A senha
              atual continua funcionando até ela trocar.
            </p>
            <Button type="button" variant="secondary" onClick={enviarPorEmail} disabled={enviando || !usuario.ativo}>
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {enviando ? "Enviando..." : "Enviar nova senha por e-mail"}
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Este usuário não tem e-mail cadastrado. Use Editar para colocar o e-mail e poder enviar.
          </p>
        )}
      </div>
    </div>
  );
}

function VincularForm({
  usuario,
  empresas,
  setores,
  marcas,
  onSuccess,
}: {
  usuario: Usuario;
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  marcas: MarcaResumo[];
  onSuccess: () => void;
}) {
  // Empresa com vínculo ATIVO não some da lista: selecioná-la vira EDIÇÃO do
  // vínculo (a action já faz upsert de papel/setor). O filtro que as excluía
  // criava um beco sem saída — o estado que a tela Meu Setor manda consertar
  // aqui (vínculo ativo sem setor) era justamente o que este formulário se
  // recusava a mostrar, e desativar-para-revincular é barrado quando o vínculo
  // é o único ativo.
  const vinculoAtivoPorEmpresa = new Map(
    usuario.empresas.filter((v) => v.ativo).map((v) => [v.empresaId, v]),
  );
  const empresasDisponiveis = empresas.filter((e) => e.ativo);
  // Marca já vinculada e ativa sai da lista: revincular a mesma marca não
  // acrescenta acesso nenhum (vínculo de marca não tem papel nem setor a editar).
  const marcasDisponiveis = marcas.filter(
    (m) => !usuario.marcasVinculadas.some((v) => v.marcaId === m.id && v.ativo),
  );

  // Começa na primeira empresa SEM vínculo (o caso comum: dar acesso novo);
  // quando todas já têm, começa na primeira mesmo — aí o form abre em edição.
  const empresaInicial = (
    empresasDisponiveis.find((e) => !vinculoAtivoPorEmpresa.has(e.id)) ?? empresasDisponiveis[0]
  )?.id ?? "";
  const vinculoInicial = vinculoAtivoPorEmpresa.get(empresaInicial);

  const [escopo, setEscopo] = useState<Escopo>("CNPJ");
  const [marcaId, setMarcaId] = useState<string>(marcasDisponiveis[0]?.id ?? "");
  const [empresaId, setEmpresaId] = useState<string>(empresaInicial);
  // Editar começa do que está salvo. Sem este prefill, salvar uma empresa já
  // vinculada com o papel default (RH) apagaria o setor de um gestor sem
  // ninguém perceber.
  const [role, setRole] = useState<"RH_MANAGER" | "GESTOR_SETOR">(
    vinculoInicial?.role === "GESTOR_SETOR" ? "GESTOR_SETOR" : "RH_MANAGER",
  );
  const [setorId, setSetorId] = useState<string>(vinculoInicial?.setorId ?? "");
  const [papelPrincipal, setPapelPrincipal] = useState<boolean>(
    vinculoInicial?.papelPrincipal ?? false,
  );

  const vinculoSelecionado = vinculoAtivoPorEmpresa.get(empresaId);

  const setoresFiltrados = setores.filter((s) => s.empresaId === empresaId && s.ativo);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await vincularEmpresaUsuario(prev, fd);
    if (result.ok) {
      toast.success("Vínculo salvo.");
      onSuccess();
    }
    return result;
  }, initialState);

  // Form próprio para a marca em vez de trocar a action: cada `useActionState`
  // amarra um form a uma action, e o payload da marca é outro (sem setor, sem
  // empresa principal).
  const [stateMarca, formActionMarca, isPendingMarca] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const result = await vincularMarcaUsuario(prev, fd);
      if (result.ok) {
        toast.success("Vínculo salvo.");
        onSuccess();
      }
      return result;
    },
    initialState,
  );

  // Vínculos desativados (reativar inline)
  const desativados = usuario.empresas.filter((v) => !v.ativo);

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>Vincular {usuario.nome}</DialogTitle>
      </DialogHeader>

      {/* Primeiro QUEM a pessoa é, depois ONDE ela mexe. Nesta ordem porque o
          vínculo com a ficha é o que decide se ela enxerga o próprio time —
          o acesso por empresa/marca já existia e não responde essa pergunta. */}
      <FichaVinculada usuario={usuario} onSuccess={onSuccess} />

      <div className="border-t" />

      {/* O seletor fica fora dos dois forms — ele escolhe qual form aparece,
          não é campo enviado. */}
      {(usuario.role === "ADMIN" || usuario.role === "DIRETORIA") && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Diretoria e Administrativo veem todas as marcas do cliente. Para limitar a
          algumas marcas, o admin usa o botão Marcas na tela de usuários.
        </p>
      )}
      <div className={cn("space-y-2", (usuario.role === "ADMIN" || usuario.role === "DIRETORIA") && "hidden")}>
        <Label>Escopo do acesso</Label>
        <RadioGroup
          value={escopo}
          onValueChange={(v) => setEscopo((v ?? "CNPJ") as Escopo)}
          className="gap-2"
        >
          <div className="flex items-start gap-2">
            <RadioGroupItem value="MARCA" id="vincular-escopo-marca" className="mt-0.5" />
            <div>
              <Label htmlFor="vincular-escopo-marca" className="font-normal">
                Marca inteira
              </Label>
              <p className="text-xs text-muted-foreground">
                Dá acesso a todos os CNPJs da marca, inclusive os cadastrados depois.
                Sempre como Gestor(a) de RH.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem value="CNPJ" id="vincular-escopo-cnpj" className="mt-0.5" />
            <div>
              <Label htmlFor="vincular-escopo-cnpj" className="font-normal">
                CNPJ específico
              </Label>
              <p className="text-xs text-muted-foreground">
                Acesso só à empresa escolhida — é o único escopo que comporta gestor de setor.
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {escopo === "MARCA" ? (
        <form action={formActionMarca} className="space-y-4">
          <input type="hidden" name="userId" value={usuario.id} />
          {/* Vínculo por marca é sempre RH — setor pertence a um CNPJ. */}
          <input type="hidden" name="role" value="RH_MANAGER" />
          {marcasDisponiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este usuário já tem acesso a todas as marcas ativas do cliente.
              {usuario.marcasVinculadas.some((v) => !v.ativo) &&
                " Use a lista abaixo para reativar um vínculo desativado."}
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Marca</Label>
              <Select
                value={marcaId}
                onValueChange={(v) => setMarcaId(v ?? "")}
                name="marcaId"
                items={Object.fromEntries(marcasDisponiveis.map((m) => [m.id, m.nome]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {marcasDisponiveis.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!stateMarca.ok && (
            <Alert variant="destructive">
              <AlertDescription>{stateMarca.error}</AlertDescription>
            </Alert>
          )}
          {marcasDisponiveis.length > 0 && (
            <DialogFooter>
              <Button type="submit" disabled={isPendingMarca}>
                {isPendingMarca ? "Salvando..." : "Vincular"}
              </Button>
            </DialogFooter>
          )}
        </form>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={usuario.id} />
          {empresasDisponiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma empresa ativa no cliente para vincular.
              {desativados.length > 0 && " Use a lista abaixo para reativar um vínculo desativado."}
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select
                  value={empresaId}
                  onValueChange={(v) => {
                    const id = v ?? "";
                    setEmpresaId(id);
                    // Trocar de empresa recarrega papel/setor do vínculo dela
                    // (edição) ou zera (vínculo novo) — nunca carrega o setor
                    // de uma empresa para dentro de outra.
                    const atual = vinculoAtivoPorEmpresa.get(id);
                    setRole(atual?.role === "GESTOR_SETOR" ? "GESTOR_SETOR" : "RH_MANAGER");
                    setSetorId(atual?.setorId ?? "");
                    setPapelPrincipal(atual?.papelPrincipal ?? false);
                  }}
                  name="empresaId"
                  items={Object.fromEntries(
                    empresasDisponiveis.map((e) => [
                      e.id,
                      vinculoAtivoPorEmpresa.has(e.id) ? `${e.nome} · já vinculado` : e.nome,
                    ]),
                  )}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {agruparPorMarca(empresasDisponiveis, marcas).map((g) => (
                      <SelectGroup key={g.id}>
                        <SelectLabel>{g.nome}</SelectLabel>
                        {g.empresas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {vinculoAtivoPorEmpresa.has(e.id) ? `${e.nome} · já vinculado` : e.nome}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {vinculoSelecionado && (
                  <p className="text-xs text-muted-foreground">
                    Já vinculado como{" "}
                    {vinculoSelecionado.role === "GESTOR_SETOR"
                      ? `Gestor(a) de Setor${
                          vinculoSelecionado.setorNome
                            ? ` — ${vinculoSelecionado.setorNome}`
                            : " (sem setor)"
                        }`
                      : "Gestor(a) de RH"}
                    . Salvar atualiza este vínculo.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Papel</Label>
                <Select
                  value={role}
                  onValueChange={(v) => {
                    setRole((v ?? "RH_MANAGER") as "RH_MANAGER" | "GESTOR_SETOR");
                    if (v !== "GESTOR_SETOR") setSetorId("");
                  }}
                  name="role"
                  items={{
                    RH_MANAGER: "Gestor(a) de RH",
                    GESTOR_SETOR: "Gestor(a) de Setor",
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RH_MANAGER">Gestor(a) de RH</SelectItem>
                    <SelectItem value="GESTOR_SETOR">Gestor(a) de Setor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role === "GESTOR_SETOR" && (
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <Select
                    value={setorId}
                    onValueChange={(v) => setSetorId(v ?? "")}
                    name="setorId"
                    items={Object.fromEntries(setoresFiltrados.map((s) => [s.id, s.nome]))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {setoresFiltrados.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="papelPrincipal"
                  name="papelPrincipal"
                  checked={papelPrincipal}
                  onCheckedChange={(v) => setPapelPrincipal(!!v)}
                />
                <Label htmlFor="papelPrincipal">
                  Marcar como empresa principal (será a aberta por padrão após login)
                </Label>
              </div>
            </>
          )}
          {!state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {empresasDisponiveis.length > 0 && (
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : vinculoSelecionado ? "Atualizar vínculo" : "Vincular"}
              </Button>
            </DialogFooter>
          )}
        </form>
      )}

      {/* Lista de vínculos existentes — permite desativar/reativar. */}
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Vínculos atuais</h3>
        {usuario.empresas.length === 0 && usuario.marcasVinculadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vínculo ainda.</p>
        ) : (
          <ul className="divide-y">
            {/* Marca vem primeiro e rotulada: sem isso, quem lê a lista acha
                que o acesso é só o dos CNPJs listados logo abaixo. */}
            {usuario.marcasVinculadas.map((v) => (
              <li
                key={`marca-${v.marcaId}`}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Badge variant="secondary">marca</Badge>
                    {v.marcaNome}
                    {!v.ativo && (
                      <span className="text-xs font-normal text-muted-foreground">(desativado)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Todos os CNPJs da marca · {PAPEL_LABEL.RH_MANAGER}
                  </div>
                </div>
                <div className="flex gap-1">
                  {v.ativo ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await desativarVinculoMarca(usuario.id, v.marcaId);
                        if (r.ok) toast.success("Vínculo desativado.");
                        else toast.error(r.error);
                      }}
                      title="Desativar vínculo com a marca"
                    >
                      <Link2Off className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await reativarVinculoMarca(usuario.id, v.marcaId);
                        if (r.ok) toast.success("Vínculo reativado.");
                        else toast.error(r.error);
                      }}
                      title="Reativar vínculo com a marca"
                    >
                      <Link2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {usuario.empresas.map((v) => (
              <li
                key={v.empresaId}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {v.empresaNome}{" "}
                    {v.papelPrincipal && <span className="text-xs text-muted-foreground">(principal)</span>}
                    {!v.ativo && <span className="ml-2 text-xs text-muted-foreground">(desativado)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {PAPEL_LABEL[v.role] ?? v.role}
                    {v.setorNome && ` · ${v.setorNome}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {v.ativo ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await desativarVinculoUsuario(usuario.id, v.empresaId);
                        if (r.ok) toast.success("Vínculo desativado.");
                        else toast.error(r.error);
                      }}
                      title="Desativar vínculo"
                    >
                      <Link2Off className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await reativarVinculoUsuario(usuario.id, v.empresaId);
                        if (r.ok) toast.success("Vínculo reativado.");
                        else toast.error(r.error);
                      }}
                      title="Reativar vínculo"
                    >
                      <Link2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Organização da lista ──────────────────────────────────────────────────

type AbaStatus = "ATIVOS" | "INATIVOS" | "TODOS";

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Só para exibir: nomes cadastrados TODOS EM MAIÚSCULAS aparecem como os
// demais. O cadastro não muda — editar o usuário mostra o nome como foi gravado.
const PARTICULAS = new Set(["da", "das", "de", "do", "dos", "e"]);
function nomeExibicao(nome: string) {
  if (nome !== nome.toUpperCase()) return nome;
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

function iniciais(nome: string) {
  const partes = nome.split(/\s+/).filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

type Pendencia = "SEM_EMAIL" | "EMAIL_DUPLICADO" | "LOGIN_EMAIL" | "SEM_ACESSO";
const PENDENCIA_ROTULO: Record<Pendencia, string> = {
  SEM_EMAIL: "Sem e-mail",
  EMAIL_DUPLICADO: "Possível duplicado",
  LOGIN_EMAIL: "Usuário com @",
  SEM_ACESSO: "Sem empresa",
};
const PENDENCIA_DICA: Record<Pendencia, string> = {
  SEM_EMAIL: "Sem e-mail a pessoa não recupera a senha nem o usuário sozinha.",
  // A lista é de UM cliente: o mesmo e-mail no usuário deste cliente e no do
  // outro é o normal (um usuário por cliente) e não aparece aqui.
  EMAIL_DUPLICADO:
    "Outra conta DESTE cliente usa o mesmo e-mail — provavelmente a mesma pessoa com dois usuários no mesmo cliente. Um usuário em cada cliente é o normal.",
  LOGIN_EMAIL:
    "O usuário tem “@”. O acesso é pelo nome de usuário: troque por um sem “@” (ex.: marcelo ou marcelo.lm) e avise a pessoa.",
  SEM_ACESSO: "Gestor sem marca nem CNPJ ativo neste cliente: entra no sistema mas não enxerga nenhuma empresa.",
};

function calcularPendencias(usuarios: Usuario[]) {
  const porEmail = new Map<string, number>();
  for (const u of usuarios) {
    const e = u.email?.trim().toLowerCase();
    if (e) porEmail.set(e, (porEmail.get(e) ?? 0) + 1);
  }

  const porUsuario = new Map<string, Pendencia[]>();
  const contagem: Record<Pendencia, number> = { SEM_EMAIL: 0, EMAIL_DUPLICADO: 0, LOGIN_EMAIL: 0, SEM_ACESSO: 0 };
  for (const u of usuarios) {
    const lista: Pendencia[] = [];
    const email = u.email?.trim().toLowerCase();
    if (!email) lista.push("SEM_EMAIL");
    else if ((porEmail.get(email) ?? 0) > 1) lista.push("EMAIL_DUPLICADO");
    if (u.username.includes("@")) lista.push("LOGIN_EMAIL");
    const precisaVinculo = u.role === "RH_MANAGER" || u.role === "GESTOR_SETOR";
    // Vínculo de outro grupo não conta: ele não dá acesso (lib/grupo.ts).
    const temAcessoNoGrupo =
      u.empresas.some((e) => e.ativo && !e.foraDoGrupo) || u.marcasVinculadas.some((m) => m.ativo && !m.foraDoGrupo);
    if (precisaVinculo && u.ativo && !temAcessoNoGrupo) {
      lista.push("SEM_ACESSO");
    }
    if (lista.length > 0) porUsuario.set(u.id, lista);
    for (const p of lista) contagem[p]++;
  }

  const resumo: string[] = [];
  if (contagem.SEM_EMAIL) resumo.push(`${contagem.SEM_EMAIL} sem e-mail`);
  if (contagem.EMAIL_DUPLICADO) resumo.push(`${contagem.EMAIL_DUPLICADO} contas com e-mail repetido`);
  if (contagem.LOGIN_EMAIL) resumo.push(`${contagem.LOGIN_EMAIL} com “@” no usuário`);
  if (contagem.SEM_ACESSO) resumo.push(`${contagem.SEM_ACESSO} gestor(es) sem empresa`);

  return { porUsuario, total: porUsuario.size, resumo };
}

function CartaoResumo({
  rotulo,
  valor,
  tom = "padrao",
}: {
  rotulo: string;
  valor: number;
  tom?: "padrao" | "ok" | "neutro" | "alerta";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-2.5",
        tom === "alerta" && "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40",
      )}
    >
      <p className={cn("text-xs font-medium text-muted-foreground", tom === "alerta" && "text-amber-900 dark:text-amber-200")}>
        {rotulo}
      </p>
      <p
        className={cn(
          "text-xl font-bold tabular-nums",
          tom === "ok" && "text-emerald-700 dark:text-emerald-400",
          tom === "neutro" && "text-muted-foreground",
          tom === "alerta" && "text-amber-900 dark:text-amber-200",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

type AcoesDaLinha = {
  currentUserId: string;
  pendencias: ReturnType<typeof calcularPendencias>;
  onEditar: (u: Usuario) => void;
  onVincular: (u: Usuario) => void;
  onSenha: (u: Usuario) => void;
  onExcluir: (u: Usuario) => void;
  /** Só na tela de admin (MASTER): abre "Cliente e marcas" para mudar a conta de cliente. */
  onTrocarGrupo?: (u: Usuario) => void;
  /** Só na tela de admin (MASTER): liga os botões de marca direto na linha. */
  painel?: PainelAdmin;
};

function TabelaUsuarios({
  usuarios,
  agruparPorPapel,
  inativos = false,
  vazio,
  ...acoes
}: AcoesDaLinha & {
  usuarios: Usuario[];
  agruparPorPapel: boolean;
  inativos?: boolean;
  vazio: string;
}) {
  // Diretoria primeiro: é quem manda na tela. Papel fora da lista vai ao fim.
  const ordemPapel = ["DIRETORIA", "ADMIN", "RH_MANAGER", "GESTOR_SETOR"];
  const grupos = agruparPorPapel
    ? [...new Set(usuarios.map((u) => u.role))]
        .sort((a, b) => (ordemPapel.indexOf(a) + 1 || 99) - (ordemPapel.indexOf(b) + 1 || 99))
        .map((papel) => ({ papel, lista: usuarios.filter((u) => u.role === papel) }))
    : [{ papel: null as string | null, lista: usuarios }];

  const colunas = agruparPorPapel ? 8 : 9;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Nome</TableHead>
            <TableHead>Login</TableHead>
            <TableHead>Senha</TableHead>
            <TableHead>E-mail</TableHead>
            {!agruparPorPapel && <TableHead>Papel</TableHead>}
            {/* "Acesso" e não "Empresas": a coluna mistura marca e CNPJ. */}
            <TableHead title="Clique numa marca para ligar ou desligar o acesso da pessoa. Salva na hora.">
              Acesso
            </TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.length === 0 && (
            <TableRow>
              <TableCell colSpan={colunas} className="py-8 text-center text-muted-foreground">
                {vazio}
              </TableCell>
            </TableRow>
          )}
          {grupos.map(({ papel, lista }) => (
            <Fragment key={papel ?? "todos"}>
              {papel && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={colunas} className="py-1.5 text-xs font-semibold text-foreground/80">
                    {ROLE_LABEL[papel] ?? papel}
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 tabular-nums">{lista.length}</span>
                  </TableCell>
                </TableRow>
              )}
              {lista.map((u) => (
                <LinhaUsuario key={u.id} usuario={u} mostrarPapel={!agruparPorPapel} inativo={inativos} {...acoes} />
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LinhaUsuario({
  usuario: u,
  mostrarPapel,
  inativo,
  currentUserId,
  pendencias,
  painel,
  ...acoes
}: AcoesDaLinha & { usuario: Usuario; mostrarPapel: boolean; inativo: boolean }) {
  const nome = nomeExibicao(u.nome);
  const minhas = pendencias.porUsuario.get(u.id) ?? [];
  const veTudo = u.role === "ADMIN" || u.role === "DIRETORIA";
  // ADMIN/DIRETORIA com marca marcada pela tela de admin fica só nela(s)
  // (lib/grupo.ts, `direcaoRestrita`); sem marca marcada, o grupo inteiro.
  const direcaoGlobal = veTudo && !u.marcasVinculadas.some(ehRestricao);
  // Para Diretoria/Administrativo, só a marca marcada pelo admin muda o que a
  // pessoa vê; vínculo antigo de gestor ou de CNPJ que ficou na conta não muda
  // nada — aparece apagado, para ninguém achar que ele restringe ou amplia.
  const semEfeito = (v: { ativo: boolean; foraDoGrupo: boolean; role?: string }) =>
    veTudo && v.ativo && !v.foraDoGrupo && !(v.role === "ADMIN" || v.role === "DIRETORIA");

  return (
    <TableRow className={cn(inativo && "text-muted-foreground")}>
      <TableCell>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              inativo ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
            )}
          >
            {iniciais(nome)}
          </span>
          <div className="min-w-0">
            <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 font-medium", inativo ? "text-foreground/70" : "text-foreground")}>
              {nome}
              {u.id === currentUserId && <span className="text-xs font-normal text-muted-foreground">(você)</span>}
              {minhas
                .filter((p) => p !== "SEM_EMAIL")
                .map((p) => (
                  <SeloPendencia key={p} pendencia={p} />
                ))}
            </p>
            {/* Mostrado só quando a ficha tem outro nome: repetir o mesmo
                nome duas vezes na célula não informa nada. */}
            {u.ficha && (
              <p className="text-xs text-muted-foreground">
                ficha: {u.ficha.nome === u.nome ? u.ficha.setorNome : u.ficha.nome}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium">{u.username}</span>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Copiar login"
            aria-label={`Copiar login de ${nome}`}
            onClick={() => copiar(u.username, "Login copiado.")}
          >
            <Copy className="size-3.5" />
          </button>
        </span>
      </TableCell>
      <TableCell>
        <CelulaSenha usuario={u} onSenha={acoes.onSenha} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {u.email ?? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="italic">Sem e-mail</span>
            <SeloPendencia pendencia="SEM_EMAIL" rotulo="Completar" />
          </span>
        )}
      </TableCell>
      {mostrarPapel && (
        <TableCell>
          <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
        </TableCell>
      )}
      <TableCell>
        {painel && u.ativo && (veTudo || u.role === "RH_MANAGER") ? (
          <MarcasNaLinha usuario={u} painel={painel} />
        ) : (
        <div className="flex flex-wrap items-center gap-1">
          {/* Administrativo e Diretoria enxergam o grupo de sociedade inteiro,
              com ou sem vínculo (lib/rh-auth-guard.ts, empresasVisiveis). */}
          {direcaoGlobal && (
            <span
              className="mr-1 text-xs text-muted-foreground"
              title="Administrativo e Diretoria enxergam todas as empresas do cliente."
            >
              Todas do cliente
            </span>
          )}
          {veTudo && !direcaoGlobal && (
            <span
              className="mr-1 text-xs font-medium text-muted-foreground"
              title="Restrito pela tela de admin: vê só as marcas ao lado e não administra contas."
            >
              Só:
            </span>
          )}
          {!veTudo && u.empresas.length === 0 && u.marcasVinculadas.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {/* Marca primeiro, com variante própria: esse vínculo cobre
              CNPJs que nem aparecem nos badges ao lado. */}
          {u.marcasVinculadas.map((v) => (
            <span key={`marca-${v.marcaId}`} className="inline-flex items-center gap-1">
              <Badge
                variant="secondary"
                className={
                  !v.ativo || v.foraDoGrupo
                    ? "opacity-50 line-through"
                    : semEfeito(v)
                      ? "opacity-50"
                      : undefined
                }
                title={
                  v.foraDoGrupo
                    ? `${v.marcaNome} · marca — ${DICA_FORA_DO_GRUPO}`
                    : semEfeito(v)
                      ? `${v.marcaNome} · marca — ${DICA_SEM_EFEITO}`
                      : `${v.marcaNome} · marca — todos os CNPJs, inclusive os cadastrados depois`
                }
              >
                {v.marcaNome} · marca
              </Badge>
              {v.foraDoGrupo && <AvisoForaDoGrupo />}
            </span>
          ))}
          {u.empresas.map((v) => (
            <span key={v.empresaId} className="inline-flex items-center gap-1">
              <Badge
                variant="outline"
                className={
                  !v.ativo || v.foraDoGrupo
                    ? "opacity-50 line-through"
                    : semEfeito(v)
                      ? "opacity-50"
                      : undefined
                }
                title={
                  v.foraDoGrupo
                    ? `${v.empresaNome} — ${DICA_FORA_DO_GRUPO}`
                    : semEfeito(v)
                      ? `${v.empresaNome} — ${DICA_SEM_EFEITO}`
                    : v.setorNome
                      ? `${v.empresaNome} · ${PAPEL_LABEL[v.role] ?? v.role} · ${v.setorNome}${v.papelPrincipal ? " (principal)" : ""}`
                      : `${v.empresaNome} · ${PAPEL_LABEL[v.role] ?? v.role}${v.papelPrincipal ? " (principal)" : ""}`
                }
              >
                {v.empresaNome}
                {v.papelPrincipal ? " ★" : ""}
              </Badge>
              {v.foraDoGrupo && <AvisoForaDoGrupo />}
            </span>
          ))}
        </div>
        )}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium",
            u.ativo ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          <span aria-hidden className={cn("size-2 rounded-full", u.ativo ? "bg-emerald-500" : "bg-muted-foreground/50")} />
          {u.ativo ? "Ativo" : "Inativo"}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <AcoesUsuario usuario={u} currentUserId={currentUserId} {...acoes} />
      </TableCell>
    </TableRow>
  );
}

function avisoInativos(n: number, filtrando: boolean) {
  const um = n === 1;
  if (filtrando) {
    return um ? "1 conta inativa também atende a esses filtros." : `${n} contas inativas também atendem a esses filtros.`;
  }
  return um ? "1 conta inativa está na aba Inativos." : `${n} contas inativas estão na aba Inativos.`;
}

// Vínculo com marca ou CNPJ de outro grupo de sociedade: continua no banco,
// mas não dá acesso — empresasVisiveis só devolve empresas do grupo do login.
// A regra do grupo é um login por grupo, então a tela avisa em vez de fingir
// que o acesso existe.
const DICA_FORA_DO_GRUPO =
  "de outro cliente: este vínculo não dá acesso. Para trabalhar lá, a pessoa precisa de um usuário no outro cliente.";

const DICA_SEM_EFEITO =
  "vínculo antigo: para Diretoria e Administrativo não muda o que a pessoa vê. Quem limita as marcas é o admin, nos botões de marca da linha.";

function AvisoForaDoGrupo() {
  return <span className="text-[11px] font-medium text-muted-foreground">fora do cliente</span>;
}

function SeloPendencia({ pendencia, rotulo }: { pendencia: Pendencia; rotulo?: string }) {
  return (
    <span
      title={PENDENCIA_DICA[pendencia]}
      className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {rotulo ?? PENDENCIA_ROTULO[pendencia]}
    </span>
  );
}

function AcoesUsuario({
  usuario,
  currentUserId,
  onEditar,
  onVincular,
  onExcluir,
  onTrocarGrupo,
}: Omit<AcoesDaLinha, "pendencias" | "painel" | "onSenha"> & { usuario: Usuario }) {
  const [alternando, setAlternando] = useState(false);

  async function alternarStatus() {
    setAlternando(true);
    const result = await toggleStatusUsuario(usuario.id);
    setAlternando(false);
    if (result.ok) {
      toast.success(usuario.ativo ? "Usuário desativado." : "Usuário reativado.");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {!usuario.ativo && (
        <Button variant="outline" size="sm" className="mr-1" onClick={alternarStatus} disabled={alternando}>
          <Power className="size-4" />
          Reativar
        </Button>
      )}
      <BotaoAcao rotulo="Editar" onClick={() => onEditar(usuario)}>
        <Pencil className="size-4" />
      </BotaoAcao>
      <BotaoAcao rotulo="Vincular empresa ou marca" onClick={() => onVincular(usuario)}>
        <Link2 className="size-4" />
      </BotaoAcao>
      {/* Mudar de cliente é mudar o conjunto de marcas que a pessoa pode ver
          (ex.: da LM Telecom para o multimarcas). Gestor de setor fica de
          fora — o acesso dele é o setor de um CNPJ. */}
      {onTrocarGrupo && usuario.role !== "GESTOR_SETOR" && (
        <BotaoAcao rotulo="Trocar de cliente" onClick={() => onTrocarGrupo(usuario)}>
          <ArrowLeftRight className="size-4" />
        </BotaoAcao>
      )}
      {usuario.ativo && (
        <BotaoAcao rotulo="Desativar acesso" onClick={alternarStatus} disabled={alternando}>
          <PowerOff className="size-4" />
        </BotaoAcao>
      )}
      {usuario.id !== currentUserId && (
        <BotaoAcao rotulo="Excluir" perigo onClick={() => onExcluir(usuario)}>
          <Trash2 className="size-4" />
        </BotaoAcao>
      )}
    </div>
  );
}

function BotaoAcao({
  rotulo,
  onClick,
  disabled,
  perigo,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={rotulo}
      aria-label={rotulo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "size-8 text-muted-foreground hover:text-foreground",
        perigo && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </Button>
  );
}

// A senha em si não existe para mostrar (o banco guarda só o hash): a célula
// mostra que há senha e dá os dois caminhos — definir uma nova, ou mandar o
// link por e-mail para a pessoa criar a dela.
function CelulaSenha({ usuario, onSenha }: { usuario: Usuario; onSenha: (u: Usuario) => void }) {
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    const result = await enviarLinkSenhaPorEmail(usuario.id);
    setEnviando(false);
    if (result.ok) toast.success(`Link de nova senha enviado para ${usuario.email}.`);
    else toast.error(result.error);
  }

  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <span aria-label="Senha protegida" className="mr-1 font-mono text-sm tracking-widest text-muted-foreground">
        ••••••
      </span>
      <BotaoAcao rotulo="Definir nova senha" onClick={() => onSenha(usuario)}>
        <KeyRound className="size-4" />
      </BotaoAcao>
      <BotaoAcao
        rotulo={
          !usuario.email
            ? "Sem e-mail cadastrado"
            : !usuario.ativo
              ? "Conta desativada"
              : `Enviar nova senha por e-mail (${usuario.email})`
        }
        onClick={enviar}
        disabled={enviando || !usuario.email || !usuario.ativo}
      >
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
      </BotaoAcao>
    </span>
  );
}

/**
 * As marcas que a conta vê, como botões liga/desliga direto na linha (área de
 * admin, v1.189.0 — antes era um diálogo por conta). Um clique salva, pela
 * mesma action do diálogo (`definirMarcasQueVe`), com as mesmas travas no
 * servidor (lib/marcas-que-ve.ts).
 *
 * Os botões são só as marcas do GRUPO da conta: a regra de quais marcas podem
 * ser vistas juntas é o grupo — o CLIENTE, na Gestão (a LM Telecom num cliente
 * só dela; as demais juntas no multimarcas). Mudar de cliente é o
 * botão "Trocar de cliente" da linha.
 *
 * Diretoria/Administrativo: todas ligadas = vê o grupo inteiro, inclusive
 * marca que entrar depois — por isso ligar a última manda a lista VAZIA, que é
 * como o servidor guarda "sem restrição". Desligar a última não existe: quem é
 * da direção vê pelo menos uma marca (para tirar tudo, desativa-se a conta).
 *
 * Gestor de RH: cada marca ligada é um vínculo com a marca inteira. Os CNPJs
 * avulsos (Vincular) aparecem ao lado, porque também dão acesso.
 */
function MarcasNaLinha({ usuario, painel }: { usuario: Usuario; painel: PainelAdmin }) {
  const ehDirecao = usuario.role === "ADMIN" || usuario.role === "DIRETORIA";
  const grupoAtual = painel.grupoAtualId ?? "";
  const marcasDoGrupo = painel.marcas.filter((m) => m.grupoId === grupoAtual);
  // A mesma leitura do diálogo "Cliente e marcas": só marca ATIVA do cliente
  // atual conta, e para a direção só a restrição posta pelo admin.
  const marcadasHoje = usuario.marcasVinculadas
    .filter((v) => v.ativo && !v.foraDoGrupo)
    .filter((v) => !ehDirecao || ehRestricao(v))
    .filter((v) => marcasDoGrupo.some((m) => m.id === v.marcaId))
    .map((v) => v.marcaId);
  const ligadasNoServidor = ehDirecao && marcadasHoje.length === 0 ? marcasDoGrupo.map((m) => m.id) : marcadasHoje;
  const [ligadas, setLigadas] = useOptimistic(ligadasNoServidor);
  const [salvando, startTransition] = useTransition();
  const nome = nomeExibicao(usuario.nome);
  const nomeDaMarca = (id: string) => marcasDoGrupo.find((m) => m.id === id)?.nome ?? "";
  // Direção num grupo de uma marca só (a LM Telecom): não há o que escolher.
  const soUmaParaDirecao = ehDirecao && marcasDoGrupo.length === 1;
  const todasLigadas = marcasDoGrupo.length > 0 && marcasDoGrupo.every((m) => ligadas.includes(m.id));
  const cnpjs = usuario.empresas.filter((e) => e.ativo && !e.foraDoGrupo);
  const foraDoGrupo = [
    ...usuario.marcasVinculadas.filter((v) => v.ativo && v.foraDoGrupo).map((v) => v.marcaNome),
    ...usuario.empresas.filter((e) => e.ativo && e.foraDoGrupo).map((e) => e.empresaNome),
  ];

  function alternar(marcaId: string) {
    const nova = ligadas.includes(marcaId) ? ligadas.filter((x) => x !== marcaId) : [...ligadas, marcaId];
    if (ehDirecao && nova.length === 0) {
      toast.error("Diretoria e Administrativo veem pelo menos uma marca. Para tirar todo o acesso, desative a conta.");
      return;
    }
    const todas = marcasDoGrupo.every((m) => nova.includes(m.id));
    const enviar = ehDirecao && todas ? [] : nova;
    const nomes = nova.map(nomeDaMarca).filter(Boolean).join(", ");
    const descricao = ehDirecao
      ? todas
        ? "vê todas as marcas do cliente"
        : `vê só ${nomes}`
      : nova.length === 0
        ? cnpjs.length > 0
          ? "nenhuma marca inteira (continua com os CNPJs vinculados)"
          : "nenhuma marca"
        : `atende ${nomes}`;
    startTransition(async () => {
      setLigadas(nova);
      const result = await definirMarcasQueVe(usuario.id, grupoAtual, enviar);
      if (result.ok) toast.success(`Acesso atualizado — ${nome}: ${descricao}.`);
      else toast.error(result.error);
    });
  }

  if (marcasDoGrupo.length === 0) {
    return <span className="text-xs text-muted-foreground">Cliente sem marca ativa.</span>;
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1" aria-busy={salvando}>
        {marcasDoGrupo.map((m) => {
          const ligada = ligadas.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={ligada}
              disabled={salvando || soUmaParaDirecao}
              onClick={() => alternar(m.id)}
              title={
                soUmaParaDirecao
                  ? `Neste cliente há só ${m.nome}: a pessoa vê só ela.`
                  : ligada
                    ? `${nome} vê ${m.nome}. Clique para tirar.`
                    : `${nome} não vê ${m.nome}. Clique para liberar.`
              }
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                "disabled:cursor-not-allowed",
                ligada
                  ? "border-primary/50 bg-primary/10 text-foreground enabled:hover:bg-primary/15"
                  : "border-dashed border-border bg-transparent text-muted-foreground enabled:hover:border-foreground/40 enabled:hover:text-foreground",
                salvando && "opacity-60",
              )}
            >
              {ligada ? (
                <Check aria-hidden className="size-3.5 text-primary" />
              ) : (
                <Plus aria-hidden className="size-3.5" />
              )}
              {m.nome}
            </button>
          );
        })}
        {salvando ? (
          <Loader2 aria-label="Salvando" className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          ehDirecao &&
          marcasDoGrupo.length > 1 &&
          todasLigadas && <span className="text-[11px] text-muted-foreground">vê todas</span>
        )}
      </div>
      {!ehDirecao && cnpjs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">+ CNPJ:</span>
          {cnpjs.map((v) => (
            <Badge
              key={v.empresaId}
              variant="outline"
              title={`${v.empresaNome} · ${PAPEL_LABEL[v.role] ?? v.role}${v.setorNome ? ` · ${v.setorNome}` : ""}${v.papelPrincipal ? " (principal)" : ""}`}
            >
              {v.empresaNome}
              {v.papelPrincipal ? " ★" : ""}
            </Badge>
          ))}
        </div>
      )}
      {foraDoGrupo.length > 0 && (
        <p className="text-[11px] text-muted-foreground" title={DICA_FORA_DO_GRUPO}>
          <span className="line-through">{foraDoGrupo.join(", ")}</span> — fora do cliente, sem efeito
        </p>
      )}
    </div>
  );
}

function MarcasQueVeForm({
  usuario,
  painel,
  onFim,
}: {
  usuario: Usuario;
  painel: PainelAdmin;
  onFim: () => void;
}) {
  const ehDirecao = usuario.role === "ADMIN" || usuario.role === "DIRETORIA";
  const grupoAtual = painel.grupoAtualId ?? painel.grupos[0]?.id ?? "";
  // Só o que a tela consegue mostrar: marca ATIVA do grupo atual (vínculo com
  // marca desativada não tem checkbox, e o servidor o preserva). Para
  // Diretoria/Administrativo, só a restrição posta pelo admin conta.
  const marcadasHoje = usuario.marcasVinculadas
    .filter((v) => v.ativo && !v.foraDoGrupo)
    .filter((v) => !ehDirecao || ehRestricao(v))
    .filter((v) => painel.marcas.some((m) => m.id === v.marcaId && m.grupoId === grupoAtual))
    .map((v) => v.marcaId);
  const [grupoId, setGrupoId] = useState(grupoAtual);
  const [escolhidas, setEscolhidas] = useState<string[]>(marcadasHoje);
  const [salvando, setSalvando] = useState(false);

  const marcasDoGrupo = painel.marcas.filter((m) => m.grupoId === grupoId);
  const mudaGrupo = grupoId !== grupoAtual;
  const cnpjsNoGrupo = usuario.empresas.filter((e) => e.ativo && !e.foraDoGrupo);

  function trocarGrupo(id: string) {
    setGrupoId(id);
    // Marca é sempre de UM grupo: trocar de grupo zera a escolha.
    setEscolhidas(id === grupoAtual ? marcadasHoje : []);
  }

  function alternar(marcaId: string) {
    setEscolhidas((atual) =>
      atual.includes(marcaId) ? atual.filter((x) => x !== marcaId) : [...atual, marcaId],
    );
  }

  async function salvar() {
    setSalvando(true);
    const result = await definirMarcasQueVe(usuario.id, grupoId, escolhidas);
    setSalvando(false);
    if (result.ok) {
      toast.success(mudaGrupo ? "Cliente e marcas salvos." : "Marcas salvas.");
      onFim();
    } else {
      toast.error(result.error);
    }
  }

  const resumo = ehDirecao
    ? escolhidas.length === 0
      ? "Vê todas as marcas do cliente, inclusive as que entrarem depois."
      : "Vê só as marcas marcadas."
    : escolhidas.length === 0 && (mudaGrupo || cnpjsNoGrupo.length === 0)
      ? "Sem marca marcada, não vê nada."
      : "Vê todos os CNPJs das marcas marcadas, inclusive os cadastrados depois.";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cliente e marcas de {nomeExibicao(usuario.nome)}</DialogTitle>
      </DialogHeader>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="marcas-grupo">Cliente</Label>
          <select
            id="marcas-grupo"
            value={grupoId}
            onChange={(e) => trocarGrupo(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {painel.grupos.map((g) => {
              const marcasDele = painel.marcas.filter((m) => m.grupoId === g.id);
              return (
                <option key={g.id} value={g.id}>
                  {marcasDele.length === 1
                    ? `${g.nome} — só ${marcasDele[0].nome}`
                    : marcasDele.length > 1
                      ? `${g.nome} — ${marcasDele.map((m) => m.nome).join(", ")}`
                      : g.nome}
                </option>
              );
            })}
          </select>
          {mudaGrupo && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Ao mudar de cliente, a pessoa perde os vínculos de CNPJ do cliente atual.
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Marcas</legend>
          {marcasDoGrupo.length === 0 && (
            <p className="text-sm text-muted-foreground">Este cliente ainda não tem marca ativa.</p>
          )}
          {marcasDoGrupo.map((m) => (
            <label key={m.id} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={escolhidas.includes(m.id)} onCheckedChange={() => alternar(m.id)} />
              {m.nome}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            {ehDirecao
              ? "Diretoria e Administrativo: nenhuma marcada = todas as marcas do cliente."
              : "Gestor de RH: marque as marcas que a pessoa atende. CNPJ avulso continua em Vincular."}
          </p>
          {!ehDirecao && !mudaGrupo && cnpjsNoGrupo.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Também vê os CNPJs vinculados: {cnpjsNoGrupo.map((e) => e.empresaNome).join(", ")}.
            </p>
          )}
        </fieldset>

        <p className="rounded-md bg-muted px-3 py-2 text-sm">{resumo}</p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onFim} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          Salvar
        </Button>
      </DialogFooter>
    </>
  );
}

function ExcluirUsuarioConfirmacao({ usuario, onFim }: { usuario: Usuario; onFim: () => void }) {
  const [excluindo, setExcluindo] = useState(false);

  async function handleDelete() {
    setExcluindo(true);
    const result = await deleteUsuario(usuario.id);
    setExcluindo(false);
    if (result.ok) {
      toast.success("Usuário excluído (ou desativado, se há registros vinculados).");
      onFim();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluir {nomeExibicao(usuario.nome)}?</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Se a conta tiver registros ligados a ela, o sistema só desativa — o histórico não se perde. Para tirar o
        acesso sem apagar nada, prefira <strong>Desativar acesso</strong>.
      </p>
      <DialogFooter>
        <Button variant="ghost" onClick={onFim} disabled={excluindo}>
          Cancelar
        </Button>
        <Button variant="destructive" onClick={handleDelete} disabled={excluindo}>
          Excluir
        </Button>
      </DialogFooter>
    </>
  );
}
