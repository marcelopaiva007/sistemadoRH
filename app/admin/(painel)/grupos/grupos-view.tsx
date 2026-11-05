"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  criarGrupo,
  moverMarcaDeGrupo,
  moverUsuarioDeGrupo,
  renomearGrupo,
} from "@/lib/actions/grupos";
import { ROLE_LABEL, type ActionResult } from "@/lib/constants";

type Grupo = { id: string; nome: string; ativo: boolean };
type Marca = {
  id: string;
  nome: string;
  ativo: boolean;
  grupoId: string;
  _count: { empresas: number };
};
type Usuario = {
  id: string;
  nome: string;
  username: string;
  role: string;
  ativo: boolean;
  grupoId: string | null;
};

const inicial: ActionResult = { ok: true };

/** `useActionState` com o aviso de sucesso/erro que as outras telas de cadastro dão. */
function useAcao(
  acao: (prev: ActionResult, fd: FormData) => Promise<ActionResult>,
  sucesso: string,
) {
  return useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await acao(prev, fd);
    if (r.ok) toast.success(sucesso);
    else toast.error(r.error);
    return r;
  }, inicial);
}

const classeSelect =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function GruposView({
  grupos,
  marcas,
  usuarios,
}: {
  grupos: Grupo[];
  marcas: Marca[];
  usuarios: Usuario[];
}) {
  const [, acaoCriar, criando] = useAcao(criarGrupo, "Grupo criado.");
  const semGrupo = usuarios.filter((u) => !u.grupoId);

  return (
    <div className="space-y-6">
      <form action={acaoCriar} className="flex max-w-md items-end gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="novo-grupo" className="text-sm font-medium">
            Novo grupo
          </label>
          <Input
            id="novo-grupo"
            name="nome"
            placeholder="Nome do grupo"
            required
            minLength={2}
          />
        </div>
        <Button type="submit" disabled={criando}>
          Criar grupo
        </Button>
      </form>

      {semGrupo.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="text-base">
              Contas sem grupo ({semGrupo.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Conta sem grupo não enxerga nada no sistema. Escolha o grupo de
              cada uma.
            </p>
            {semGrupo.map((u) => (
              <LinhaUsuario key={u.id} usuario={u} grupos={grupos} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {grupos.map((g) => (
          <CartaoGrupo
            key={g.id}
            grupo={g}
            grupos={grupos}
            marcas={marcas.filter((m) => m.grupoId === g.id)}
            usuarios={usuarios.filter((u) => u.grupoId === g.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CartaoGrupo({
  grupo,
  grupos,
  marcas,
  usuarios,
}: {
  grupo: Grupo;
  grupos: Grupo[];
  marcas: Marca[];
  usuarios: Usuario[];
}) {
  const [, acaoRenomear, renomeando] = useAcao(
    renomearGrupo.bind(null, grupo.id),
    "Grupo renomeado.",
  );
  const admins = usuarios.filter((u) => u.role === "ADMIN" && u.ativo).length;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <form action={acaoRenomear} className="flex items-center gap-2">
          <Input
            name="nome"
            defaultValue={grupo.nome}
            aria-label="Nome do grupo"
            className="font-semibold"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={renomeando}
          >
            Renomear
          </Button>
        </form>
        {admins === 0 && (
          <p className="text-sm text-amber-700">
            Este grupo não tem ADMIN ativo — ninguém dele consegue cadastrar
            marca ou CNPJ. Crie um em Usuários.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Marcas ({marcas.length})</h3>
          {marcas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma marca neste grupo.
            </p>
          )}
          {marcas.map((m) => (
            <LinhaMarca key={m.id} marca={m} grupos={grupos} />
          ))}
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Contas ({usuarios.length})</h3>
          {usuarios.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma conta neste grupo.
            </p>
          )}
          {usuarios.map((u) => (
            <LinhaUsuario key={u.id} usuario={u} grupos={grupos} />
          ))}
        </section>
      </CardContent>
    </Card>
  );
}

function LinhaMarca({ marca, grupos }: { marca: Marca; grupos: Grupo[] }) {
  const [, acao, movendo] = useAcao(
    moverMarcaDeGrupo,
    `Marca ${marca.nome} mudou de grupo.`,
  );
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Mudar ${marca.nome} (${marca._count.empresas} CNPJ) de grupo? Quem é do grupo atual deixa de ver a marca, e os acessos de usuário a ela são desativados.`,
        );
        if (!ok) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <input type="hidden" name="marcaId" value={marca.id} />
      <span className="min-w-36 flex-1">
        {marca.nome}{" "}
        <span className="text-muted-foreground">
          · {marca._count.empresas} CNPJ
        </span>
        {!marca.ativo && (
          <Badge variant="secondary" className="ml-2">
            inativa
          </Badge>
        )}
      </span>
      <select
        name="grupoId"
        defaultValue={marca.grupoId}
        className={classeSelect}
        aria-label={`Grupo de ${marca.nome}`}
      >
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nome}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={movendo}>
        Mover
      </Button>
    </form>
  );
}

function LinhaUsuario({
  usuario,
  grupos,
}: {
  usuario: Usuario;
  grupos: Grupo[];
}) {
  const [, acao, movendo] = useAcao(
    moverUsuarioDeGrupo,
    `${usuario.nome} mudou de grupo.`,
  );
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!usuario.grupoId) return;
        const ok = window.confirm(
          `Mudar ${usuario.nome} de grupo? Os acessos dela a CNPJs e marcas do grupo atual são desativados.`,
        );
        if (!ok) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <input type="hidden" name="userId" value={usuario.id} />
      <span className="min-w-36 flex-1">
        {usuario.nome}{" "}
        <span className="text-muted-foreground">
          · {usuario.username} · {ROLE_LABEL[usuario.role] ?? usuario.role}
        </span>
        {!usuario.ativo && (
          <Badge variant="secondary" className="ml-2">
            inativo
          </Badge>
        )}
      </span>
      <select
        name="grupoId"
        defaultValue={usuario.grupoId ?? ""}
        className={classeSelect}
        aria-label={`Grupo de ${usuario.nome}`}
      >
        {!usuario.grupoId && (
          <option value="" disabled>
            Escolha…
          </option>
        )}
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nome}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm" disabled={movendo}>
        Mover
      </Button>
    </form>
  );
}
