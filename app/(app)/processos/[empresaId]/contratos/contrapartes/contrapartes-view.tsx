"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salvarContraparte } from "@/lib/actions/processos-contratos";
import { PAPEIS_CONTRAPARTE, TIPOS_PESSOA, papeisDaContraparte, rotulo } from "@/lib/processos/contratos";

export type ContraparteNaTela = {
  id: string;
  tipoPessoa: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpjCpf: string;
  papeis: string;
  criticidade: string;
  emailNotificacaoFormal: string | null;
  telefone: string | null;
  endereco: string | null;
  observacoes: string | null;
  contratosNoEscopo: number;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

/** 14 dígitos vira CNPJ, 11 vira CPF, o resto sai como veio. */
function formatarDocumento(d: string): string {
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

export function ContrapartesView({
  empresaId,
  contrapartes,
}: {
  empresaId: string;
  contrapartes: ContraparteNaTela[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [papeis, setPapeis] = useState<string[]>([]);

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...(f ?? {}), [nome]: e.target.value })),
    };
  }

  function novo() {
    setErro(null);
    setPapeis([]);
    setForm({ tipoPessoa: "JURIDICA", criticidade: "NORMAL" });
  }

  function editar(c: ContraparteNaTela) {
    setErro(null);
    setPapeis(papeisDaContraparte(c.papeis));
    setForm({
      id: c.id,
      tipoPessoa: c.tipoPessoa,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia ?? "",
      cnpjCpf: c.cnpjCpf,
      criticidade: c.criticidade,
      emailNotificacaoFormal: c.emailNotificacaoFormal ?? "",
      telefone: c.telefone ?? "",
      endereco: c.endereco ?? "",
      observacoes: c.observacoes ?? "",
    });
  }

  function alternarPapel(valor: string) {
    setPapeis((p) => (p.includes(valor) ? p.filter((x) => x !== valor) : [...p, valor]));
  }

  function salvar() {
    if (!form) return;
    if (papeis.length === 0) {
      setErro("Marque ao menos um papel — é ele que diz o que esta contraparte é para o grupo.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await salvarContraparte({
        id: form.id || null,
        empresaId,
        tipoPessoa: form.tipoPessoa || "JURIDICA",
        razaoSocial: form.razaoSocial ?? "",
        nomeFantasia: form.nomeFantasia ?? null,
        cnpjCpf: form.cnpjCpf ?? "",
        papeis,
        criticidade: form.criticidade || "NORMAL",
        emailNotificacaoFormal: form.emailNotificacaoFormal ?? null,
        telefone: form.telefone ?? null,
        endereco: form.endereco ?? null,
        observacoes: form.observacoes ?? null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setForm(null);
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

      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={novo}>
          <Plus className="size-4" />
          Cadastrar contraparte
        </Button>
      </div>

      {form && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {form.id ? "Editar contraparte" : "Cadastrar contraparte"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Tipo
              <select {...campo("tipoPessoa")} className={CAMPO}>
                {TIPOS_PESSOA.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              CNPJ / CPF
              <input {...campo("cnpjCpf")} className={CAMPO} placeholder="Só os números" />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Razão social / nome
              <input {...campo("razaoSocial")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Nome fantasia
              <input {...campo("nomeFantasia")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Criticidade
              <select {...campo("criticidade")} className={CAMPO}>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
              </select>
            </label>
            <div className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Papéis
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                {PAPEIS_CONTRAPARTE.map((p) => (
                  <label key={p.value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={papeis.includes(p.value)}
                      onChange={() => alternarPapel(p.value)}
                      className="size-4"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              E-mail para notificação formal
              <input {...campo("emailNotificacaoFormal")} type="email" className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                É para cá que vai o aviso de não-renovação. Endereço errado aqui é prazo cumprido
                que não vale.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Telefone
              <input {...campo("telefone")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Endereço
              <input {...campo("endereco")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Observações
              <textarea {...campo("observacoes")} rows={2} className={CAMPO} />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setErro(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contraparte</TableHead>
                <TableHead>CNPJ / CPF</TableHead>
                <TableHead>Papéis</TableHead>
                <TableHead>Notificação formal</TableHead>
                <TableHead className="text-center">Contratos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contrapartes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma contraparte cadastrada. Todo contrato precisa de uma.
                  </TableCell>
                </TableRow>
              )}
              {contrapartes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="font-medium">{c.razaoSocial}</span>
                    {c.nomeFantasia && (
                      <span className="block text-xs text-muted-foreground">{c.nomeFantasia}</span>
                    )}
                    {c.criticidade === "ALTA" && (
                      <Badge variant="destructive" className="mt-0.5">Criticidade alta</Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatarDocumento(c.cnpjCpf)}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {papeisDaContraparte(c.papeis).map((p) => (
                        <Badge key={p} variant="secondary">{rotulo(PAPEIS_CONTRAPARTE, p)}</Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.emailNotificacaoFormal ?? (
                      <span className="text-muted-foreground">sem e-mail</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{c.contratosNoEscopo}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => editar(c)}>
                      <Pencil className="size-4" />
                    </Button>
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
