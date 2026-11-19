"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Pencil, Plus, Search, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  alternarAcessoMobility,
  importarAcessosMobility,
  revelarSenhaMobility,
  salvarAcessoMobility,
} from "@/lib/actions/frota-mobility";

export type AcessoNaTela = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string;
  senhaDica: string | null;
  temSenha: boolean;
  placa: string | null;
  modelo: string | null;
  veiculoId: string | null;
  observacao: string | null;
  ativo: boolean;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

const cpfMascara = (c: string | null) =>
  c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c ?? "—";
const placaMascara = (p: string | null) => (p && p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p);

export function AcessosMobilityView({ empresaId, acessos }: { empresaId: string; acessos: AcessoNaTela[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [importando, setImportando] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // Senhas reveladas nesta sessão de tela, por id. Somem ao recarregar.
  const [reveladas, setReveladas] = useState<Record<string, string>>({});

  const filtrados = acessos.filter((a) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return [a.nome, a.email, a.placa ?? "", a.modelo ?? "", a.cpf ?? ""].some((t) =>
      t.toLowerCase().includes(q.replace(/[-.]/g, "")) || t.toLowerCase().includes(q),
    );
  });
  const ativos = acessos.filter((a) => a.ativo).length;

  function esquecer(id: string) {
    setReveladas((m) => {
      const resto = { ...m };
      delete resto[id];
      return resto;
    });
  }

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...(f ?? {}), [nome]: e.target.value })),
    };
  }

  function limparMensagens() {
    setErro(null);
    setAviso(null);
  }

  function salvar() {
    if (!form) return;
    limparMensagens();
    iniciar(async () => {
      const r = await salvarAcessoMobility({
        id: form.id || null,
        empresaId,
        nome: form.nome ?? "",
        cpf: form.cpf ?? null,
        email: form.email ?? "",
        senha: form.senha || null,
        placa: form.placa ?? null,
        modelo: form.modelo ?? null,
        observacao: form.observacao ?? null,
      });
      if (!r.ok) return setErro(r.error);
      setForm(null);
      if (form.id) esquecer(form.id);
      router.refresh();
    });
  }

  function mostrar(id: string) {
    if (reveladas[id] !== undefined) return esquecer(id);
    limparMensagens();
    iniciar(async () => {
      const r = await revelarSenhaMobility({ empresaId, id });
      if (!r.ok) return setErro(r.error);
      setReveladas((m) => ({ ...m, [id]: r.senha }));
    });
  }

  function copiar(texto: string, oQue: string) {
    navigator.clipboard?.writeText(texto).then(
      () => setAviso(`${oQue} copiado.`),
      () => setErro("Não foi possível copiar."),
    );
  }

  function copiarSenha(id: string) {
    if (reveladas[id] !== undefined) return copiar(reveladas[id], "Senha");
    limparMensagens();
    iniciar(async () => {
      const r = await revelarSenhaMobility({ empresaId, id });
      if (!r.ok) return setErro(r.error);
      copiar(r.senha, "Senha");
    });
  }

  function alternar(a: AcessoNaTela) {
    limparMensagens();
    iniciar(async () => {
      const r = await alternarAcessoMobility({ empresaId, id: a.id, ativo: !a.ativo });
      if (!r.ok) return setErro(r.error);
      router.refresh();
    });
  }

  async function lerArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    setImportando(await arq.text());
    e.target.value = "";
  }

  function importar() {
    if (!importando?.trim()) return setErro("Cole as linhas da planilha ou escolha o arquivo CSV.");
    limparMensagens();
    iniciar(async () => {
      const r = await importarAcessosMobility({ empresaId, texto: importando });
      if (!r.ok) return setErro(r.error);
      setImportando(null);
      setAviso(
        `Planilha importada: ${r.criados} novo(s), ${r.atualizados} atualizado(s)` +
          (r.ignorados.length ? `. Ignorados: ${r.ignorados.join("; ")}` : "."),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-success bg-card px-3 py-2 text-sm text-success">{aviso}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, e-mail, placa…"
              className={cn(CAMPO, "w-64 pl-8")}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {ativos} ativo(s) · {acessos.length} no total
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setImportando(importando ?? "")}>
            <Upload className="size-4" />
            Importar planilha
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setForm({})}>
            <Plus className="size-4" />
            Novo acesso
          </Button>
        </div>
      </div>

      {importando !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Importar planilha de acessos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Colunas: <strong>Nome, CPF, E-mail, Senha, Placa, Modelo</strong>. No Google Sheets, selecione
              tudo (com o cabeçalho) e cole abaixo — ou baixe em Arquivo › Fazer download › CSV e escolha o
              arquivo. E-mail que já existe é atualizado, não duplicado.
            </p>
            <input type="file" accept=".csv,text/csv,text/plain" onChange={lerArquivo} className="text-sm" />
            <textarea
              value={importando}
              onChange={(e) => setImportando(e.target.value)}
              rows={6}
              placeholder="Cole aqui as linhas da planilha…"
              className={cn(CAMPO, "font-mono text-xs")}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={pendente} onClick={importar}>Importar</Button>
              <Button size="sm" variant="ghost" onClick={() => setImportando(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {form && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{form.id ? "Editar acesso" : "Novo acesso"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Nome do motorista
              <input {...campo("nome")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              CPF
              <input {...campo("cpf")} className={CAMPO} placeholder="000.000.000-00" />
            </label>
            <label className="text-xs text-muted-foreground">
              E-mail (login do app)
              <input {...campo("email")} type="email" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Senha
              <input {...campo("senha")} type="text" autoComplete="off" className={CAMPO} />
              {form.id && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  Deixe em branco para manter a senha atual.
                </span>
              )}
            </label>
            <label className="text-xs text-muted-foreground">
              Placa
              <input {...campo("placa")} className={CAMPO} placeholder="ABC1D23" />
            </label>
            <label className="text-xs text-muted-foreground">
              Modelo
              <input {...campo("modelo")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Observação
              <textarea {...campo("observacao")} rows={2} className={CAMPO} />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setErro(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>E-mail (login)</TableHead>
                <TableHead>Senha</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {acessos.length === 0
                      ? "Nenhum acesso cadastrado. Use Importar planilha para trazer a lista de uma vez."
                      : "Nada encontrado nessa busca."}
                  </TableCell>
                </TableRow>
              )}
              {filtrados.map((a) => (
                <TableRow key={a.id} className={cn(!a.ativo && "opacity-50")}>
                  <TableCell>
                    <div className="font-medium">{a.nome}</div>
                    <div className="text-xs text-muted-foreground">CPF {cpfMascara(a.cpf)}</div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm hover:underline"
                      onClick={() => copiar(a.email, "E-mail")}
                      title="Copiar e-mail"
                    >
                      {a.email}
                      <Copy className="size-3.5 text-muted-foreground" />
                    </button>
                  </TableCell>
                  <TableCell>
                    {a.temSenha ? (
                      <div className="flex items-center gap-1">
                        <code className="min-w-20 rounded bg-muted px-1.5 py-0.5 text-xs">
                          {reveladas[a.id] ?? `••••${a.senhaDica ?? ""}`}
                        </code>
                        <Button size="icon" variant="ghost" className="size-7" disabled={pendente}
                          onClick={() => mostrar(a.id)} title={reveladas[a.id] ? "Ocultar" : "Mostrar"}>
                          {reveladas[a.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" disabled={pendente}
                          onClick={() => copiarSenha(a.id)} title="Copiar senha">
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">sem senha</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.placa ? (
                      <div>
                        <div className="font-mono text-sm">{placaMascara(a.placa)}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.modelo ?? "—"}
                          {!a.veiculoId && " · fora da frota"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">A definir</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.ativo ? <Badge variant="outline">Ativo</Badge> : <Badge variant="secondary">Desativado</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="gap-1.5"
                        onClick={() => setForm({
                          id: a.id,
                          nome: a.nome,
                          cpf: a.cpf ?? "",
                          email: a.email,
                          placa: a.placa ?? "",
                          modelo: a.modelo ?? "",
                          observacao: a.observacao ?? "",
                        })}>
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pendente} onClick={() => alternar(a)}>
                        {a.ativo ? "Desativar" : "Reativar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
