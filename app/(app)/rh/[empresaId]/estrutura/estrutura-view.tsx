"use client";

import { createContext, useActionState, useContext, useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { criarMarca, editarMarca, criarEmpresa, editarEmpresa, excluirEmpresa } from "@/lib/actions/rh-estrutura";
import { formatarCnpj, UFS } from "@/lib/cnpj";
import type { ActionResult } from "@/lib/constants";
import { Indicador } from "@/components/indicador";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Empresa = {
  id: string;
  nome: string;
  ativo: boolean;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnpj: string | null;
  inscricaoEstadual: string | null;
  cidade: string | null;
  uf: string | null;
  _count: { colaboradores: number };
};

type Marca = {
  id: string;
  nome: string;
  logoUrl: string | null;
  corPrimaria: string | null;
  ativo: boolean;
  empresas: Empresa[];
};

// Quem pode mexer em CNPJ, disponível em toda a árvore desta tela. Contexto e
// não prop encadeada porque os botões vivem dois níveis abaixo (marca > CNPJ),
// e passar a mesma flag por três componentes só para chegar lá é ruído.
const PodeMexerEmCnpj = createContext(false);

export function EstruturaView({
  marcas,
  empresaAtualId,
  podeMexerEmCnpj,
}: {
  marcas: Marca[];
  empresaAtualId: string;
  /** ADMIN. Vem do servidor — a guarda de verdade está na action. */
  podeMexerEmCnpj: boolean;
}) {
  const [novaMarca, setNovaMarca] = useState(false);

  const totalCnpjs = marcas.reduce((s, m) => s + m.empresas.length, 0);
  const semCnpj = marcas.flatMap((m) => m.empresas).filter((e) => !e.cnpj);
  const totalPessoas = marcas.reduce(
    (s, m) => s + m.empresas.reduce((t, e) => t + e._count.colaboradores, 0),
    0,
  );
  return (
    <PodeMexerEmCnpj.Provider value={podeMexerEmCnpj}>
      <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Marcas &amp; CNPJs</h1>
          <p className="medida-de-leitura text-sm text-muted-foreground">
            Uma marca é como o grupo se apresenta; o CNPJ é a pessoa jurídica de onde a folha sai.
            Uma marca pode ter vários CNPJs, e cada colaborador pertence a um deles.
          </p>
        </div>
        <Dialog open={novaMarca} onOpenChange={setNovaMarca}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova marca
          </DialogTrigger>
          <DialogContent>
            <MarcaForm onSuccess={() => setNovaMarca(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Marcas" valor={marcas.length} />
        <Indicador rotulo="CNPJs cadastrados" valor={totalCnpjs} />
        <Indicador rotulo="Colaboradores no grupo" valor={totalPessoas} />
      </div>

      {semCnpj.length > 0 && (
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertDescription>
            <span className="font-medium text-foreground">
              {semCnpj.length === 1
                ? "1 empresa ainda está sem o número do CNPJ"
                : `${semCnpj.length} empresas ainda estão sem o número do CNPJ`}
            </span>{" "}
            ({semCnpj.map((e) => e.nome).join(", ")}). O sistema funciona assim, mas a folha e a
            conciliação por empresa dependem desse número — vale preencher antes de fechar a
            primeira competência.
          </AlertDescription>
        </Alert>
      )}

      {marcas.map((marca) => (
        <BlocoMarca key={marca.id} marca={marca} marcas={marcas} empresaAtualId={empresaAtualId} />
      ))}
      </div>
    </PodeMexerEmCnpj.Provider>
  );
}

function BlocoMarca({
  marca,
  marcas,
  empresaAtualId,
}: {
  marca: Marca;
  marcas: Marca[];
  empresaAtualId: string;
}) {
  const [editando, setEditando] = useState(false);
  const [novoCnpj, setNovoCnpj] = useState(false);
  const podeCnpj = useContext(PodeMexerEmCnpj);
  const pessoas = marca.empresas.reduce((t, e) => t + e._count.colaboradores, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {/* A logo cadastrada aparece AQUI primeiro: é a prova de que o
                  upload funcionou, na mesma tela em que ele é feito. Sem
                  logo, o ícone genérico de sempre. */}
              {marca.logoUrl ? (
                <img
                  src={marca.logoUrl}
                  alt=""
                  className="h-6 w-auto max-w-28 shrink-0 object-contain"
                />
              ) : (
                <Building2 className="size-4 text-muted-foreground" />
              )}
              {marca.nome}
              {!marca.ativo && <Badge variant="secondary">inativa</Badge>}
            </CardTitle>
            <CardDescription>
              {marca.empresas.length === 1 ? "1 CNPJ" : `${marca.empresas.length} CNPJs`} ·{" "}
              {pessoas === 1 ? "1 colaborador" : `${pessoas} colaboradores`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={editando} onOpenChange={setEditando}>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                <Pencil className="size-3.5" />
                Editar marca
              </DialogTrigger>
              <DialogContent>
                <MarcaForm marca={marca} onSuccess={() => setEditando(false)} />
              </DialogContent>
            </Dialog>
            {podeCnpj && (
              <Dialog open={novoCnpj} onOpenChange={setNovoCnpj}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="size-3.5" />
                  Adicionar CNPJ
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <EmpresaForm marcaId={marca.id} marcas={marcas} onSuccess={() => setNovoCnpj(false)} />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Razão social</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead className="text-right">Colaboradores</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marca.empresas.map((e) => (
                <LinhaEmpresa
                  key={e.id}
                  empresa={e}
                  marcas={marcas}
                  marcaId={marca.id}
                  atual={e.id === empresaAtualId}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaEmpresa({
  empresa,
  marcas,
  marcaId,
  atual,
}: {
  empresa: Empresa;
  marcas: Marca[];
  marcaId: string;
  atual: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const podeCnpj = useContext(PodeMexerEmCnpj);

  return (
    <TableRow className={atual ? "bg-primary/5" : undefined}>
      <TableCell>
        <span className="font-medium">{empresa.nome}</span>
        {atual && <span className="ml-2 text-xs text-primary">você está aqui</span>}
        {!empresa.ativo && (
          <Badge variant="secondary" className="ml-2">
            inativa
          </Badge>
        )}
      </TableCell>
      <TableCell className="tabular-nums whitespace-nowrap">
        {empresa.cnpj ? (
          formatarCnpj(empresa.cnpj)
        ) : (
          <span className="text-muted-foreground">a preencher</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{empresa.razaoSocial ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {empresa.cidade ? `${empresa.cidade}${empresa.uf ? ` / ${empresa.uf}` : ""}` : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">{empresa._count.colaboradores}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {podeCnpj ? (
            <>
              <Dialog open={aberto} onOpenChange={setAberto}>
                <DialogTrigger render={<Button variant="ghost" size="sm" />}>
                  <Pencil className="size-3.5" />
                  Editar
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <EmpresaForm
                    marcaId={marcaId}
                    marcas={marcas}
                    empresa={empresa}
                    onSuccess={() => setAberto(false)}
                  />
                </DialogContent>
              </Dialog>
              <ExcluirEmpresaButton empresa={empresa} />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">somente Admin</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}


function ExcluirEmpresaButton({ empresa }: { empresa: Empresa }) {
  const [confirmando, setConfirmando] = useState(false);

  async function handleExcluir() {
    const result = await excluirEmpresa(empresa.id);
    if (result.ok) {
      toast.success("CNPJ excluído.");
    } else {
      toast.error(result.error);
    }
    setConfirmando(false);
  }

  if (confirmando) {
    return (
      <div className="flex gap-1">
        <Button variant="destructive" size="sm" onClick={handleExcluir}>
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
      <Trash2 className="size-3.5" />
    </Button>
  );
}

function MarcaForm({ marca, onSuccess }: { marca?: Marca; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = marca ? await editarMarca(marca.id, prev, fd) : await criarMarca(prev, fd);
    if (r.ok) {
      toast.success(marca ? "Marca alterada." : "Marca criada.");
      onSuccess();
    }
    return r;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{marca ? `Editar ${marca.nome}` : "Nova marca"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome da marca</Label>
        <Input id="nome" name="nome" defaultValue={marca?.nome} required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="logoArquivo">Logo (opcional)</Label>
        {marca?.logoUrl && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <img src={marca.logoUrl} alt="" className="h-8 w-auto max-w-40 object-contain" />
            <span className="text-xs text-muted-foreground">
              Logo atual — enviar um arquivo novo substitui esta.
            </span>
          </div>
        )}
        <Input
          id="logoArquivo"
          name="logoArquivo"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPG, SVG ou WebP até 2 MB. O arquivo enviado substitui o endereço abaixo.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="logoUrl">Ou endereço do logo</Label>
        <Input id="logoUrl" name="logoUrl" defaultValue={marca?.logoUrl ?? ""} placeholder="https://..." />
      </div>
      <div className="space-y-2">
        <Label htmlFor="corPrimaria">Cor da marca (opcional)</Label>
        <div className="flex items-center gap-2">
          <input
            id="corPrimariaSeletor"
            type="color"
            defaultValue={marca?.corPrimaria ?? "#2563eb"}
            onChange={e => {
              const campo = document.getElementById("corPrimaria") as HTMLInputElement | null;
              if (campo) campo.value = e.target.value.toUpperCase();
            }}
            className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
          />
          <Input
            id="corPrimaria"
            name="corPrimaria"
            defaultValue={marca?.corPrimaria ?? ""}
            placeholder="#2563EB — em branco usa o azul padrão"
            className="flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Substitui a cor de destaque (botões, links) só para quem está numa empresa desta marca.
        </p>
      </div>
      {marca && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="ativo"
            value="true"
            defaultChecked={marca.ativo}
            className="size-4 rounded border-input accent-primary"
          />
          Marca ativa
        </label>
      )}
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

function EmpresaForm({
  marcaId,
  marcas,
  empresa,
  onSuccess,
}: {
  marcaId: string;
  marcas: Marca[];
  empresa?: Empresa;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = empresa
      ? await editarEmpresa(empresa.id, prev, fd)
      : await criarEmpresa(marcaId, prev, fd);
    if (r.ok) {
      toast.success(empresa ? "Empresa alterada." : "Empresa criada.");
      onSuccess();
    }
    return r;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{empresa ? `Editar ${empresa.nome}` : "Adicionar CNPJ"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="nome">Nome de exibição</Label>
        <Input id="nome" name="nome" defaultValue={empresa?.nome} required autoFocus />
        <p className="text-xs text-muted-foreground">
          O rótulo curto que aparece no seletor e nos títulos. A razão social vai no campo próprio.
        </p>
      </div>

      {empresa && (
        <div className="space-y-2">
          <Label htmlFor="marcaId">Marca</Label>
          <select id="marcaId" name="marcaId" defaultValue={marcaId} className={classeSelect}>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="cnpj">CNPJ</Label>
        <Input
          id="cnpj"
          name="cnpj"
          defaultValue={empresa?.cnpj ? formatarCnpj(empresa.cnpj) : ""}
          placeholder="00.000.000/0001-00"
          inputMode="numeric"
        />
        <p className="text-xs text-muted-foreground">
          Pode digitar com ou sem pontuação. Os dígitos verificadores são conferidos.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="razaoSocial">Razão social</Label>
        <Input id="razaoSocial" name="razaoSocial" defaultValue={empresa?.razaoSocial ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nomeFantasia">Nome fantasia</Label>
        <Input id="nomeFantasia" name="nomeFantasia" defaultValue={empresa?.nomeFantasia ?? ""} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" name="cidade" defaultValue={empresa?.cidade ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="uf">UF</Label>
          <select id="uf" name="uf" defaultValue={empresa?.uf ?? ""} className={classeSelect}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>

      {empresa && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="ativo"
            value="true"
            defaultChecked={empresa.ativo}
            className="size-4 rounded border-input accent-primary"
          />
          Empresa ativa
        </label>
      )}

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
