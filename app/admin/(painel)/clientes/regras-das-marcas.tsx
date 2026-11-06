"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_LABEL } from "@/lib/constants";
import { definirRegraDaMarca } from "@/lib/actions/regras-marcas";
import { cn } from "@/lib/utils";

// MARCAS E CLIENTES (tela Clientes da Gestão FASTMAI, v1.192.0): em qual
// cliente fica cada marca. É a regra "só ela" / "junto com" da v1.190.0 dita
// do jeito da Gestão — "só ela" é a marca virar um cliente de marca única, e
// "junto com" é ela passar para um cliente multimarcas. A mecânica (quem vai
// junto, quem deixa de ver) é a mesma, em lib/regras-marcas.ts.

type Grupo = { id: string; nome: string; ativo: boolean };
type MarcaNaRegra = { id: string; nome: string; ativo: boolean; grupoId: string; cnpjs: number };

/** A conta com os vínculos que dizem que marcas ela vê (sem dado de RH). */
export type ContaNaRegra = {
  id: string;
  nome: string;
  username: string;
  role: string;
  ativo: boolean;
  grupoId: string | null;
  /** Marcas a que o admin restringiu esta Diretoria/Administrativo. */
  restricoes: string[];
  /** Vínculos ativos com marca inteira (qualquer papel). */
  marcas: string[];
  /** Marcas dos CNPJs a que a conta tem vínculo ativo. */
  marcasDosCnpjs: string[];
};

type Escolha = { tipo: "SO_ELA" } | { tipo: "JUNTO"; grupoId: string };

const DIRECAO = new Set(["ADMIN", "DIRETORIA"]);

/** A conta vê a marca hoje? Mesma conta de lib/rh-auth-guard.ts, pelos vínculos. */
function veAMarca(c: ContaNaRegra, marcaId: string, marcasDoGrupo: string[]): boolean {
  if (DIRECAO.has(c.role)) {
    const r = c.restricoes.filter((id) => marcasDoGrupo.includes(id));
    return r.length === 0 || r.includes(marcaId);
  }
  return c.marcas.includes(marcaId) || c.marcasDosCnpjs.includes(marcaId);
}

/** A conta vê SÓ esta marca do grupo? É quem, por padrão, vai junto com ela. */
function veSoAMarca(c: ContaNaRegra, marcaId: string, marcasDoGrupo: string[]): boolean {
  if (!veAMarca(c, marcaId, marcasDoGrupo)) return false;
  if (marcasDoGrupo.length === 1) return true;
  if (DIRECAO.has(c.role)) {
    const r = c.restricoes.filter((id) => marcasDoGrupo.includes(id));
    return r.length === 1 && r[0] === marcaId;
  }
  const todas = new Set([...c.marcas, ...c.marcasDosCnpjs].filter((id) => marcasDoGrupo.includes(id)));
  return todas.size === 1 && todas.has(marcaId);
}

function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

const classeSelect =
  "h-9 w-full max-w-sm rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RegrasDasMarcas({
  grupos,
  marcas,
  contas,
}: {
  grupos: Grupo[];
  marcas: MarcaNaRegra[];
  contas: ContaNaRegra[];
}) {
  const [pedido, setPedido] = useState<{ marca: MarcaNaRegra; escolha: Escolha } | null>(null);
  const ativas = marcas.filter((m) => m.ativo);
  const grupoAtivo = (id: string) => grupos.find((g) => g.id === id && g.ativo);
  const ativasDo = (grupoId: string) => ativas.filter((m) => m.grupoId === grupoId);

  if (ativas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma marca ativa.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2.5">Marca</th>
            <th className="px-4 py-2.5">Cliente</th>
            <th className="px-4 py-2.5">Quem trabalha nela</th>
          </tr>
        </thead>
        <tbody>
          {ativas.map((m) => {
            const doGrupo = ativasDo(m.grupoId).map((x) => x.id);
            const outras = ativasDo(m.grupoId).filter((x) => x.id !== m.id);
            const sozinha = outras.length === 0;
            const destinos = grupos.filter(
              (g) => g.ativo && g.id !== m.grupoId && ativasDo(g.id).length > 0,
            );
            const quem = contas.filter(
              (c) => c.ativo && c.grupoId === m.grupoId && veAMarca(c, m.id, doGrupo),
            );
            return (
              <tr key={m.id} className="border-t align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.cnpjs} {m.cnpjs === 1 ? "CNPJ" : "CNPJs"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <label className="sr-only" htmlFor={`regra-${m.id}`}>
                    Cliente de {m.nome}
                  </label>
                  <select
                    id={`regra-${m.id}`}
                    value="ATUAL"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "SO_ELA") setPedido({ marca: m, escolha: { tipo: "SO_ELA" } });
                      else if (v.startsWith("JUNTO:"))
                        setPedido({ marca: m, escolha: { tipo: "JUNTO", grupoId: v.slice(6) } });
                    }}
                    className={classeSelect}
                  >
                    <option value="ATUAL">
                      {sozinha
                        ? `${grupoAtivo(m.grupoId)?.nome ?? "—"} — marca única`
                        : `${grupoAtivo(m.grupoId)?.nome ?? "—"} — multimarcas, com ${juntar(outras.map((x) => x.nome))}`}
                    </option>
                    {!sozinha && <option value="SO_ELA">Mudar para: cliente só dela (marca única)</option>}
                    {destinos.map((g) => (
                      <option key={g.id} value={`JUNTO:${g.id}`}>
                        Mudar para: cliente {g.nome}, com {juntar(ativasDo(g.id).map((x) => x.nome))}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sozinha
                      ? "Quem tem acesso a ela vê só ela."
                      : "Cada pessoa pode ver esta marca sozinha ou junto com as outras do cliente."}
                  </p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {quem.length === 0
                    ? "Ninguém ainda"
                    : `${quem.length} ${quem.length === 1 ? "conta" : "contas"}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Dialog open={!!pedido} onOpenChange={(aberto) => !aberto && setPedido(null)}>
        <DialogContent className="max-w-xl">
          {pedido && (
            <ConfirmarRegra
              marca={pedido.marca}
              escolha={pedido.escolha}
              grupos={grupos}
              marcas={ativas}
              contas={contas}
              onFim={() => setPedido(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfirmarRegra({
  marca,
  escolha,
  grupos,
  marcas,
  contas,
  onFim,
}: {
  marca: MarcaNaRegra;
  escolha: Escolha;
  grupos: Grupo[];
  marcas: MarcaNaRegra[];
  contas: ContaNaRegra[];
  onFim: () => void;
}) {
  const origem = grupos.find((g) => g.id === marca.grupoId);
  const doGrupo = marcas.filter((m) => m.grupoId === marca.grupoId).map((m) => m.id);
  const destino = escolha.tipo === "JUNTO" ? grupos.find((g) => g.id === escolha.grupoId) : null;
  const marcasDoDestino = destino ? marcas.filter((m) => m.grupoId === destino.id) : [];
  // A marca é a única do grupo e vai se juntar a outro: todas as contas vão.
  const esvazia = escolha.tipo === "JUNTO" && doGrupo.length === 1;

  const daOrigem = contas.filter((c) => c.grupoId === marca.grupoId);
  const veem = daOrigem.filter((c) => veAMarca(c, marca.id, doGrupo));
  const [escolhidas, setEscolhidas] = useState<Set<string>>(
    () => new Set(veem.filter((c) => c.ativo && veSoAMarca(c, marca.id, doGrupo)).map((c) => c.id)),
  );
  const [salvando, startTransition] = useTransition();

  const vao = esvazia ? daOrigem : veem.filter((c) => escolhidas.has(c.id));
  const ficamSemAMarca = esvazia ? [] : veem.filter((c) => !escolhidas.has(c.id) && c.ativo);
  const ganham = destino
    ? contas.filter(
        (c) =>
          c.ativo &&
          c.grupoId === destino.id &&
          DIRECAO.has(c.role) &&
          c.restricoes.filter((id) => marcasDoDestino.some((m) => m.id === id)).length === 0,
      )
    : [];
  const adminsDaOrigem = daOrigem.filter((c) => c.role === "ADMIN" && c.ativo);
  const origemSemAdmin =
    !esvazia && adminsDaOrigem.length > 0 && adminsDaOrigem.every((c) => vao.some((v) => v.id === c.id));

  function alternar(id: string) {
    setEscolhidas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  function confirmar() {
    startTransition(async () => {
      const r = await definirRegraDaMarca({
        marcaId: marca.id,
        destino: escolha,
        contasQueVaoJunto: vao.map((c) => c.id),
      });
      if (r.ok) {
        toast.success(r.resumo ?? "Regra atualizada.");
        onFim();
      } else {
        toast.error(r.error);
      }
    });
  }

  const nomeDestino = juntar(marcasDoDestino.map((m) => m.nome));
  const papel = (c: ContaNaRegra) => ROLE_LABEL[c.role] ?? c.role;
  const comCnpjs =
    marca.cnpjs === 0 ? "" : marca.cnpjs === 1 ? ", com o CNPJ dela," : `, com os ${marca.cnpjs} CNPJs dela,`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {escolha.tipo === "SO_ELA"
            ? `${marca.nome} vira um cliente só dela`
            : `${marca.nome} passa para o cliente ${destino?.nome ?? ""}`}
        </DialogTitle>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto text-sm">
        <p className="text-muted-foreground">
          {escolha.tipo === "SO_ELA"
            ? `${marca.nome} sai do cliente "${origem?.nome}"${comCnpjs} e vira um cliente de marca única, com o nome dela. Quem tiver acesso a ${marca.nome} vê só ela.`
            : `${marca.nome} sai do cliente "${origem?.nome}"${comCnpjs} e entra no cliente "${destino?.nome}", com ${nomeDestino}. Lá, cada pessoa pode ver uma marca ou várias juntas.`}
        </p>

        {esvazia ? (
          <div className="space-y-2 rounded-md bg-muted px-3 py-2">
            <p className="font-medium">
              {daOrigem.length === 0
                ? `"${origem?.nome}" não tem contas.`
                : daOrigem.length === 1
                  ? `A única conta de "${origem?.nome}" vai junto e continua vendo só ${marca.nome}.`
                  : `As ${daOrigem.length} contas de "${origem?.nome}" vão junto e continuam vendo só ${marca.nome}.`}
            </p>
            {daOrigem.length > 0 && (
              <p className="text-muted-foreground">
                {juntar(daOrigem.map((c) => c.nome))}. Diretoria e Administrativo entram restritos a{" "}
                {marca.nome}; as outras marcas você libera pessoa a pessoa em Usuários.
              </p>
            )}
            <p className="text-muted-foreground">O cliente &quot;{origem?.nome}&quot; fica sem marca e é encerrado.</p>
          </div>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">Quem vai junto com {marca.nome}?</legend>
            <p className="text-xs text-muted-foreground">
              {escolha.tipo === "SO_ELA"
                ? `Quem vai junto passa a ver só ${marca.nome}. Já vêm marcadas as contas que hoje veem só ela.`
                : `Quem vai junto passa para o cliente "${destino?.nome}" vendo só ${marca.nome} (Diretoria e Administrativo entram restritos a ela). Já vêm marcadas as contas que hoje veem só ${marca.nome}.`}
            </p>
            {veem.length === 0 && (
              <p className="text-muted-foreground">Nenhuma conta trabalha com {marca.nome} hoje.</p>
            )}
            {veem.map((c) => (
              <label key={c.id} className="flex min-h-9 cursor-pointer items-center gap-2">
                <Checkbox checked={escolhidas.has(c.id)} onCheckedChange={() => alternar(c.id)} />
                <span className={cn(!c.ativo && "text-muted-foreground")}>
                  {c.nome}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {papel(c)} · {veSoAMarca(c, marca.id, doGrupo) ? `vê só ${marca.nome}` : "vê também outras marcas"}
                    {!c.ativo && " · inativa"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {ficamSemAMarca.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Ficam em &quot;{origem?.nome}&quot; e <strong>deixam de ver {marca.nome}</strong>:{" "}
            {juntar(ficamSemAMarca.map((c) => c.nome))}.
          </p>
        )}

        {destino && (
          <p className="text-muted-foreground">
            {ganham.length > 0
              ? `Passam a ver também ${marca.nome} (Diretoria e Administrativo de "${destino.nome}" que veem todas as marcas): ${juntar(ganham.map((c) => c.nome))}.`
              : `Ninguém de "${destino.nome}" passa a ver ${marca.nome} sozinho: quem deve ver, você liga em Usuários.`}
          </p>
        )}

        {origemSemAdmin && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
            &quot;{origem?.nome}&quot; ficaria sem ADMIN ativo. Deixe pelo menos um ADMIN no cliente.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onFim} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={confirmar} disabled={salvando || origemSemAdmin}>
          {salvando ? "Aplicando..." : "Confirmar mudança"}
        </Button>
      </DialogFooter>
    </>
  );
}
