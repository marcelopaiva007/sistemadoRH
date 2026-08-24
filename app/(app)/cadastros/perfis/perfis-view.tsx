"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SISTEMAS, algumGrantCobre } from "@/lib/permissoes/catalogo";
import { type EstadoMatriz, estadoParaGrants, grantsParaEstado } from "@/lib/permissoes/matriz";
import { atribuirPerfil, excluirPerfil, removerPerfilDoUsuario, salvarPerfil } from "@/lib/actions/perfis";

export type PerfilNaTela = {
  id: string;
  nome: string;
  descricao: string | null;
  grants: string[];
  sistema: boolean;
  usuarios: number;
};

export type UsuarioComPerfis = {
  id: string;
  nome: string;
  role: string;
  perfilIds: string[];
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function PerfisView({ perfis, usuarios }: { perfis: PerfilNaTela[]; usuarios: UsuarioComPerfis[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const nomePerfil = useMemo(() => new Map(perfis.map((p) => [p.id, p.nome])), [perfis]);

  function dar(userId: string, perfilId: string) {
    if (!perfilId) return;
    setErro(null);
    iniciar(async () => {
      const r = await atribuirPerfil({ userId, perfilId });
      if (!r.ok) { setErro(r.error); return; }
      router.refresh();
    });
  }
  function tirar(userId: string, perfilId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await removerPerfilDoUsuario({ userId, perfilId });
      if (!r.ok) { setErro(r.error); return; }
      router.refresh();
    });
  }
  const [editando, setEditando] = useState<PerfilNaTela | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [estado, setEstado] = useState<EstadoMatriz>(() => grantsParaEstado([]));

  function abrir(p: PerfilNaTela | "novo") {
    setErro(null);
    setEditando(p);
    if (p === "novo") {
      setNome("");
      setDescricao("");
      setEstado(grantsParaEstado([]));
    } else {
      setNome(p.nome);
      setDescricao(p.descricao ?? "");
      setEstado(grantsParaEstado(p.grants));
    }
  }

  // Uma permissão aparece marcada se um curinga mais largo a cobre OU está nas exatas.
  const marcada = (perm: string): boolean =>
    estado.total ||
    estado.sistemaTudo[perm.split(":")[0]] ||
    estado.exatas.has(perm);

  // Travada = coberta por um curinga: a caixa aparece marcada mas não é
  // clicável, porque quem manda é o curinga acima dela.
  const travada = (perm: string): boolean =>
    estado.total || estado.sistemaTudo[perm.split(":")[0]];

  function alternarExata(perm: string) {
    setEstado((e) => {
      const exatas = new Set(e.exatas);
      if (exatas.has(perm)) exatas.delete(perm);
      else exatas.add(perm);
      return { ...e, exatas };
    });
  }

  function alternarSistema(slug: string) {
    setEstado((e) => ({ ...e, sistemaTudo: { ...e.sistemaTudo, [slug]: !e.sistemaTudo[slug] } }));
  }

  function salvar() {
    if (!nome.trim()) {
      setErro("Dê um nome ao perfil.");
      return;
    }
    const grants = estadoParaGrants(estado);
    if (grants.length === 0) {
      setErro("Marque ao menos uma tela.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await salvarPerfil({
        id: editando === "novo" ? null : editando?.id,
        nome,
        descricao,
        grants,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setEditando(null);
      router.refresh();
    });
  }

  function excluir(p: PerfilNaTela) {
    if (!confirm(`Excluir o perfil "${p.nome}"?`)) return;
    setErro(null);
    iniciar(async () => {
      const r = await excluirPerfil({ id: p.id });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      router.refresh();
    });
  }

  // Quantas telas cada perfil alcança — número honesto para o cartão, contando
  // o que os grants realmente cobrem (curinga incluso).
  const totalPermissoes = useMemo(
    () => SISTEMAS.flatMap((s) => s.grupos.flatMap((g) => g.areas.map((a) => `${s.slug}:${a.slug}:ver`))).length,
    [],
  );

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      {editando ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editando === "novo" ? "Novo perfil" : `Editar "${editando.nome}"`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} placeholder="Ex.: Analista de Frota" />
              </label>
              <label className="text-xs text-muted-foreground">
                Descrição (opcional)
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={CAMPO} />
              </label>
            </div>

            <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <input type="checkbox" checked={estado.total} onChange={() => setEstado((e) => ({ ...e, total: !e.total }))} className="size-4" />
              <span className="font-medium">Acesso total</span>
              <span className="text-xs text-muted-foreground">— os dois sistemas, inclusive telas que vierem depois.</span>
            </label>

            <div className={cn("space-y-5", estado.total && "pointer-events-none opacity-50")}>
              {SISTEMAS.map((sistema) => (
                <div key={sistema.slug} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
                    <span className="text-sm font-semibold">{sistema.nome}</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={estado.total || estado.sistemaTudo[sistema.slug]}
                        onChange={() => alternarSistema(sistema.slug)}
                        className="size-4"
                      />
                      Sistema inteiro (inclui telas futuras)
                    </label>
                  </div>
                  <div className="divide-y divide-border/60">
                    {sistema.grupos.map((grupo) => (
                      <div key={grupo.titulo} className="px-3 py-2">
                        <p className="pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                          {grupo.titulo}
                        </p>
                        <div className="space-y-1">
                          {grupo.areas.map((area) => {
                            const permVer = `${sistema.slug}:${area.slug}:ver`;
                            const permEditar = `${sistema.slug}:${area.slug}:editar`;
                            return (
                              <div key={area.slug} className="flex items-center gap-4 text-sm">
                                <span className="min-w-40 flex-1 truncate">{area.label}</span>
                                <label className="flex w-16 items-center gap-1.5 text-xs text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={marcada(permVer)}
                                    disabled={travada(permVer)}
                                    onChange={() => alternarExata(permVer)}
                                    className="size-4"
                                  />
                                  ver
                                </label>
                                <label className="flex w-16 items-center gap-1.5 text-xs text-muted-foreground">
                                  {area.soLeitura ? (
                                    <span className="text-muted-foreground/40">—</span>
                                  ) : (
                                    <>
                                      <input
                                        type="checkbox"
                                        checked={marcada(permEditar)}
                                        disabled={travada(permEditar)}
                                        onChange={() => alternarExata(permEditar)}
                                        className="size-4"
                                      />
                                      editar
                                    </>
                                  )}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditando(null); setErro(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => abrir("novo")}>
            <Plus className="size-4" />
            Novo perfil
          </Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {perfis.map((p) => {
          const cobertas = SISTEMAS.flatMap((s) =>
            s.grupos.flatMap((g) => g.areas.map((a) => `${s.slug}:${a.slug}:ver`)),
          ).filter((perm) => algumGrantCobre(p.grants, perm)).length;
          return (
            <Card key={p.id} className={cn(editando && "opacity-60")}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {p.sistema && <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />}
                    {p.nome}
                    {p.sistema && <Badge variant="secondary">padrão</Badge>}
                  </p>
                  {p.descricao && <p className="mt-0.5 text-sm text-muted-foreground">{p.descricao}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{cobertas} de {totalPermissoes} telas</span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {p.usuarios} usuário(s)
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrir(p)} title="Editar">
                    <Pencil className="size-4" />
                  </Button>
                  {!p.sistema && (
                    <Button size="sm" variant="ghost" onClick={() => excluir(p)} title="Excluir" disabled={pendente}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quem tem cada perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <p className="pb-1 text-xs text-muted-foreground">
            O acesso da pessoa é a soma dos perfis dela. Uma pessoa pode ter mais de um.
          </p>
          {usuarios.map((u) => {
            const disponiveis = perfis.filter((p) => !u.perfilIds.includes(p.id));
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-2 border-b border-border/50 py-2 last:border-0">
                <span className="min-w-44 flex-1 text-sm font-medium">{u.nome}</span>
                <span className="flex flex-wrap items-center gap-1">
                  {u.perfilIds.length === 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-500">sem perfil</span>
                  )}
                  {u.perfilIds.map((pid) => (
                    <Badge key={pid} variant="secondary" className="gap-1 pr-1">
                      {nomePerfil.get(pid) ?? "—"}
                      <button
                        onClick={() => tirar(u.id, pid)}
                        disabled={pendente}
                        title="Tirar este perfil"
                        className="rounded-full p-0.5 hover:bg-foreground/10"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </span>
                {disponiveis.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => dar(u.id, e.target.value)}
                    disabled={pendente}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                  >
                    <option value="">+ dar perfil…</option>
                    {disponiveis.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
