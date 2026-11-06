"use client";

import Link from "next/link";
import { useActionState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, FileText, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  criarGrupo,
  moverMarcaDeGrupo,
  moverUsuarioDeGrupo,
  renomearGrupo,
  salvarDadosCliente,
} from "@/lib/actions/grupos";
import { formatarCnpj } from "@/lib/cnpj";
import { ROLE_LABEL, type ActionResult } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Os CARTÕES DE CLIENTE da Gestão FASTMAI (v1.192.0). Cliente é o grupo de
// sociedade do banco (lib/grupo.ts): cada um tem as suas marcas e as suas
// contas, e nada de um aparece para o outro.
//
// O cartão responde de relance o que a FASTMAI pergunta sobre o cliente — que
// tipo ele é, que marcas tem, quantas contas — e leva aos usuários dele, que é
// onde o dia a dia da Gestão acontece. Renomear e mover marca/conta à mão
// ficam recolhidos em "Ajustes": o caminho de todo dia para mudar uma marca de
// cliente é a tabela "Marcas e clientes", que mostra antes quem vai junto.

type Grupo = {
  id: string;
  nome: string;
  ativo: boolean;
  razaoSocial: string | null;
  cnpj: string | null;
  responsavelNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  plano: string | null;
  limiteUsuarios: number | null;
  inicioContrato: Date | null;
  observacoes: string | null;
};
type Marca = {
  id: string;
  nome: string;
  ativo: boolean;
  grupoId: string;
  _count: { empresas: number };
  empresas: { id: string; nome: string; cnpj: string | null; razaoSocial: string | null; ativo: boolean }[];
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

/** Marca única, multimarcas ou ainda sem marca — pelas marcas ATIVAS. */
export function tipoDoCliente(marcasAtivas: number): string {
  if (marcasAtivas === 0) return "Sem marca";
  return marcasAtivas === 1 ? "Marca única" : "Multimarcas";
}

function contagem(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export function ClientesView({
  grupos,
  marcas,
  usuarios,
}: {
  grupos: Grupo[];
  marcas: Marca[];
  usuarios: Usuario[];
}) {
  const [, acaoCriar, criando] = useAcao(criarGrupo, "Cliente criado.");
  const semCliente = usuarios.filter((u) => !u.grupoId);
  const ativos = grupos.filter((g) => g.ativo);
  // Cliente encerrado (sobra de uma marca que mudou de cliente) só ganha
  // cartão se ainda tiver marca ou conta — senão é só um nome na lista.
  const encerrados = grupos.filter((g) => !g.ativo);
  const temAlgo = (id: string) =>
    marcas.some((m) => m.grupoId === id) || usuarios.some((u) => u.grupoId === id);
  const encerradosComAlgo = encerrados.filter((g) => temAlgo(g.id));
  const encerradosVazios = encerrados.filter((g) => !temAlgo(g.id));
  const totalAtivas = usuarios.filter((u) => u.ativo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {contagem(ativos.length, "cliente", "clientes")} ·{" "}
          {contagem(usuarios.length, "conta", "contas")} ({contagem(totalAtivas, "ativa", "ativas")}),
          fora a conta de administrador e os acessos de portal dos colaboradores.
        </p>
        <form action={acaoCriar} className="flex w-full max-w-md items-end gap-2">
          <div className="flex-1 space-y-1">
            <label htmlFor="novo-cliente" className="text-sm font-medium">
              Novo cliente
            </label>
            <Input id="novo-cliente" name="nome" placeholder="Nome do cliente" required minLength={2} />
          </div>
          <Button type="submit" disabled={criando}>
            Criar cliente
          </Button>
        </form>
      </div>

      {semCliente.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="text-base">Contas sem cliente ({semCliente.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Conta sem cliente não enxerga nada no sistema. Escolha o cliente de cada uma.
            </p>
            {semCliente.map((u) => (
              <LinhaUsuario key={u.id} usuario={u} grupos={ativos} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {[...ativos, ...encerradosComAlgo].map((g) => (
          <CartaoCliente
            key={g.id}
            grupo={g}
            grupos={ativos}
            marcas={marcas.filter((m) => m.grupoId === g.id)}
            usuarios={usuarios.filter((u) => u.grupoId === g.id)}
          />
        ))}
      </div>

      {encerradosVazios.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Clientes encerrados, sem marca e sem conta: {encerradosVazios.map((g) => g.nome).join(", ")}.
        </p>
      )}
    </div>
  );
}

function CartaoCliente({
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
  const [, acaoRenomear, renomeando] = useAcao(renomearGrupo.bind(null, grupo.id), "Cliente renomeado.");
  const ativas = marcas.filter((m) => m.ativo);
  const ativos = usuarios.filter((u) => u.ativo);
  const admins = ativos.filter((u) => u.role === "ADMIN").length;
  const cnpjs = ativas.reduce((soma, m) => soma + m._count.empresas, 0);
  const tipo = grupo.ativo ? tipoDoCliente(ativas.length) : "Encerrado";

  return (
    <Card className={cn(!grupo.ativo && "border-dashed")}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p
              className={cn(
                "text-[11px] font-extrabold tracking-[0.08em] uppercase",
                tipo === "Multimarcas" ? "text-primary" : "text-muted-foreground",
              )}
            >
              {tipo}
            </p>
            <h2 className="text-lg leading-tight font-semibold">{grupo.nome}</h2>
            <p className="text-sm text-muted-foreground">
              {ativas.length === 0
                ? "Nenhuma marca ativa ainda."
                : ativas.map((m) => m.nome).join(" · ")}
            </p>
          </div>
          {/* O caminho de todo dia: os usuários deste cliente. */}
          <Link
            href={`/admin/usuarios?grupo=${grupo.id}`}
            className={cn(buttonVariants({ size: "lg" }))}
            aria-label={`Usuários do cliente ${grupo.nome}`}
          >
            Usuários
            <span className="tabular-nums">({ativos.length})</span>
            <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
        <p className="text-sm">
          {contagem(usuarios.length, "conta", "contas")} ({contagem(ativos.length, "ativa", "ativas")}) ·{" "}
          {contagem(cnpjs, "CNPJ", "CNPJs")}
        </p>
        <ResumoCadastro grupo={grupo} contasAtivas={ativos.length} />
        {grupo.ativo && admins === 0 && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-300">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            Este cliente não tem ADMIN ativo — ninguém dele consegue cadastrar marca ou CNPJ no sistema.
            Crie um em Usuários.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <DadosDoCliente grupo={grupo} />
        <EmpresasDoCliente marcas={marcas} />
        <details className="group rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none group-open:text-foreground">
            Ajustes: renomear, mover marca ou conta
          </summary>
          <div className="mt-3 space-y-5">
            <form action={acaoRenomear} className="flex items-center gap-2">
              <Input
                name="nome"
                defaultValue={grupo.nome}
                aria-label={`Nome do cliente ${grupo.nome}`}
                className="font-semibold"
              />
              <Button type="submit" variant="outline" size="sm" disabled={renomeando}>
                Renomear
              </Button>
            </form>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Marcas ({marcas.length})</h3>
              <p className="text-xs text-muted-foreground">
                Para mudar uma marca de cliente vendo antes quem vai junto, use a tabela{" "}
                <a href="#marcas" className="underline underline-offset-2">Marcas e clientes</a>. Aqui
                é o ajuste direto, que desliga os acessos antigos à marca.
              </p>
              {marcas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma marca neste cliente.</p>
              )}
              {marcas.map((m) => (
                <LinhaMarca key={m.id} marca={m} grupos={grupos} />
              ))}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Contas ({usuarios.length})</h3>
              {usuarios.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma conta neste cliente.</p>
              )}
              {usuarios.map((u) => (
                <LinhaUsuario key={u.id} usuario={u} grupos={grupos} />
              ))}
            </section>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function LinhaMarca({ marca, grupos }: { marca: Marca; grupos: Grupo[] }) {
  const [, acao, movendo] = useAcao(moverMarcaDeGrupo, `Marca ${marca.nome} mudou de cliente.`);
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Mudar ${marca.nome} (${marca._count.empresas} CNPJ) de cliente? Quem é do cliente atual deixa de ver a marca, e os acessos de usuário a ela são desativados.`,
        );
        if (!ok) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <input type="hidden" name="marcaId" value={marca.id} />
      <span className="min-w-36 flex-1">
        {marca.nome} <span className="text-muted-foreground">· {marca._count.empresas} CNPJ</span>
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
        aria-label={`Mover ${marca.nome} para o cliente`}
      >
        {!grupos.some((g) => g.id === marca.grupoId) && (
          <option value={marca.grupoId} disabled>
            (cliente encerrado)
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

function LinhaUsuario({ usuario, grupos }: { usuario: Usuario; grupos: Grupo[] }) {
  const [, acao, movendo] = useAcao(moverUsuarioDeGrupo, `${usuario.nome} mudou de cliente.`);
  const noCliente = grupos.some((g) => g.id === usuario.grupoId);
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!usuario.grupoId) return;
        const ok = window.confirm(
          `Mudar ${usuario.nome} de cliente? Os acessos dela a CNPJs e marcas do cliente atual são desativados.`,
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
        defaultValue={noCliente ? (usuario.grupoId ?? "") : ""}
        className={classeSelect}
        aria-label={`Mover ${usuario.nome} para o cliente`}
      >
        {!noCliente && (
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

function dataIso(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

function dataBr(d: Date | null): string {
  if (!d) return "";
  const [a, m, dia] = new Date(d).toISOString().slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

/** O que a FASTMAI precisa ver do contrato sem abrir o formulário. */
function ResumoCadastro({ grupo, contasAtivas }: { grupo: Grupo; contasAtivas: number }) {
  const itens = [
    grupo.cnpj ? `CNPJ ${formatarCnpj(grupo.cnpj)}` : null,
    grupo.responsavelNome ? `Responsável: ${grupo.responsavelNome}` : null,
    grupo.plano ? `Plano ${grupo.plano}` : null,
    grupo.inicioContrato ? `Desde ${dataBr(grupo.inicioContrato)}` : null,
  ].filter(Boolean);
  const faltando = !grupo.cnpj || !grupo.responsavelNome || !grupo.contatoEmail;
  const passouLimite = grupo.limiteUsuarios != null && contasAtivas > grupo.limiteUsuarios;

  return (
    <div className="space-y-1 text-sm">
      {itens.length > 0 && <p className="text-muted-foreground">{itens.join(" · ")}</p>}
      {grupo.limiteUsuarios != null && (
        <p className={cn("tabular-nums", passouLimite ? "font-medium text-destructive" : "text-muted-foreground")}>
          {contasAtivas} de {grupo.limiteUsuarios} usuários do contrato
          {passouLimite && " — acima do limite"}
        </p>
      )}
      {grupo.ativo && faltando && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Cadastro incompleto: falta {[
            !grupo.cnpj && "CNPJ",
            !grupo.responsavelNome && "responsável",
            !grupo.contatoEmail && "e-mail de contato",
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}

function Campo({
  id,
  rotulo,
  children,
  largo,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
}) {
  return (
    <div className={cn("space-y-1", largo && "sm:col-span-2")}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

/** Formulário dos dados cadastrais do cliente (v1.197.0). */
function DadosDoCliente({ grupo }: { grupo: Grupo }) {
  const [, acao, salvando] = useAcao(salvarDadosCliente.bind(null, grupo.id), "Dados do cliente salvos.");
  const p = `cli-${grupo.id}`;
  return (
    <details className="group rounded-md border border-border px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground select-none group-open:text-foreground">
        <FileText aria-hidden className="size-4" />
        Contratante — quem assina e paga
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        A empresa que contrata o sistema. As empresas do grupo que usam o sistema (cada CNPJ com os seus
        dados) ficam em &quot;Empresas deste cliente&quot;, logo abaixo.
      </p>
      <form action={acao} className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo id={`${p}-razao`} rotulo="Razão social" largo>
          <Input id={`${p}-razao`} name="razaoSocial" defaultValue={grupo.razaoSocial ?? ""} />
        </Campo>
        <Campo id={`${p}-cnpj`} rotulo="CNPJ">
          <Input
            id={`${p}-cnpj`}
            name="cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            defaultValue={grupo.cnpj ? formatarCnpj(grupo.cnpj) : ""}
          />
        </Campo>
        <Campo id={`${p}-resp`} rotulo="Responsável no cliente">
          <Input id={`${p}-resp`} name="responsavelNome" defaultValue={grupo.responsavelNome ?? ""} />
        </Campo>
        <Campo id={`${p}-email`} rotulo="E-mail de contato">
          <Input id={`${p}-email`} name="contatoEmail" type="email" defaultValue={grupo.contatoEmail ?? ""} />
        </Campo>
        <Campo id={`${p}-tel`} rotulo="Telefone / WhatsApp">
          <Input id={`${p}-tel`} name="contatoTelefone" inputMode="tel" defaultValue={grupo.contatoTelefone ?? ""} />
        </Campo>
        <Campo id={`${p}-plano`} rotulo="Plano">
          <Input id={`${p}-plano`} name="plano" placeholder="ex.: Básico, Completo" defaultValue={grupo.plano ?? ""} />
        </Campo>
        <Campo id={`${p}-limite`} rotulo="Limite de usuários (vazio = sem limite)">
          <Input
            id={`${p}-limite`}
            name="limiteUsuarios"
            type="number"
            min={1}
            step={1}
            defaultValue={grupo.limiteUsuarios ?? ""}
          />
        </Campo>
        <Campo id={`${p}-inicio`} rotulo="Início do contrato">
          <Input id={`${p}-inicio`} name="inicioContrato" type="date" defaultValue={dataIso(grupo.inicioContrato)} />
        </Campo>
        <Campo id={`${p}-obs`} rotulo="Observações" largo>
          <textarea
            id={`${p}-obs`}
            name="observacoes"
            rows={2}
            defaultValue={grupo.observacoes ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Campo>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar dados"}
          </Button>
        </div>
      </form>
    </details>
  );
}

/**
 * As EMPRESAS do cliente (v1.197.0, pedido do CEO): um contratante pode ter
 * várias empresas — o grupo empresarial de um dono ou de sócios —, cada uma com
 * o seu CNPJ e os seus dados, organizadas por marca. Por ora só mostra; o
 * cadastro de empresa nova pela Gestão vem no PR seguinte.
 */
function EmpresasDoCliente({ marcas }: { marcas: Marca[] }) {
  const total = marcas.reduce((s, m) => s + m.empresas.length, 0);
  return (
    <details className="group rounded-md border border-border px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground select-none group-open:text-foreground">
        <Building2 aria-hidden className="size-4" />
        Empresas deste cliente <span className="tabular-nums">({total})</span>
      </summary>
      <div className="mt-3 space-y-3">
        {total === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>}
        {marcas
          .filter((m) => m.empresas.length > 0)
          .map((m) => (
            <section key={m.id} className="space-y-1">
              <h3 className="text-xs font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
                Marca {m.nome}
              </h3>
              <ul className="divide-y rounded-md border">
                {m.empresas.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-1.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{e.razaoSocial || e.nome}</span>
                      {e.razaoSocial && e.razaoSocial !== e.nome && (
                        <span className="text-muted-foreground"> · {e.nome}</span>
                      )}
                      {!e.ativo && (
                        <Badge variant="secondary" className="ml-2">
                          inativa
                        </Badge>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {e.cnpj ? formatarCnpj(e.cnpj) : "sem CNPJ"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </details>
  );
}
