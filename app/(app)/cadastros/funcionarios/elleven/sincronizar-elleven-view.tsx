"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  sincronizarVendedoresElleven,
  type VendedorEllevenPreview,
} from "@/lib/actions/elleven";

const CRIAR_NOVO = "__criar__";

type Funcionario = { id: string; nome: string };

type LinhaEstado = {
  aplicar: boolean;
  funcionarioId: string; // CRIAR_NOVO ou id de funcionário
};

export function SincronizarEllevenView({
  vendedores,
  funcionarios,
  totalContratos,
}: {
  vendedores: VendedorEllevenPreview[];
  funcionarios: Funcionario[];
  totalContratos: number;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<Record<string, LinhaEstado>>(() =>
    Object.fromEntries(
      vendedores.map((v) => [
        v.nomeElleven,
        {
          // OK sem cidade pendente não tem nada a aplicar.
          aplicar:
            v.situacao !== "OK" || (v.funcionarioSemCidade && !!v.cidadeElleven),
          funcionarioId: v.funcionarioSugeridoId ?? CRIAR_NOVO,
        },
      ])
    )
  );

  const itensSelect = useMemo(
    () =>
      Object.fromEntries([
        [CRIAR_NOVO, "— Criar novo funcionário —"],
        ...funcionarios.map((f) => [f.id, f.nome]),
      ]),
    [funcionarios]
  );

  const nomePorId = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f.nome])),
    [funcionarios]
  );

  function atualizar(nomeElleven: string, patch: Partial<LinhaEstado>) {
    setEstado((prev) => ({
      ...prev,
      [nomeElleven]: { ...prev[nomeElleven], ...patch },
    }));
  }

  const selecionados = vendedores.filter((v) => estado[v.nomeElleven]?.aplicar);

  // O mesmo funcionário apontado por dois vendedores diferentes renomearia a
  // mesma pessoa duas vezes — é ambiguidade que só o admin resolve.
  const duplicados = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const v of selecionados) {
      const id = estado[v.nomeElleven].funcionarioId;
      if (id !== CRIAR_NOVO) contagem.set(id, (contagem.get(id) ?? 0) + 1);
    }
    return new Set([...contagem.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [selecionados, estado]);

  async function handleAplicar() {
    setEnviando(true);
    const result = await sincronizarVendedoresElleven(
      selecionados.map((v) => {
        const e = estado[v.nomeElleven];
        return {
          nomeElleven: v.nomeElleven,
          funcionarioId: e.funcionarioId === CRIAR_NOVO ? null : e.funcionarioId,
          cidadeElleven: v.cidadeElleven,
        };
      })
    );
    setEnviando(false);
    if (result.ok) {
      const partes = [
        result.criados > 0 && `${result.criados} criado(s)`,
        result.renomeados > 0 && `${result.renomeados} renomeado(s)`,
        result.cidadesDefinidas > 0 && `${result.cidadesDefinidas} cidade(s) definida(s)`,
      ].filter(Boolean);
      toast.success(
        partes.length > 0
          ? `Cadastro atualizado: ${partes.join(", ")}.`
          : "Nada a atualizar — cadastro já estava em dia."
      );
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  if (vendedores.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Nenhum vendedor encontrado nos contratos sincronizados do elleven
          ainda. Aguarde a próxima sincronização automática.
        </AlertDescription>
      </Alert>
    );
  }

  const totalNovos = vendedores.filter((v) => v.situacao === "NOVO").length;
  const totalRenomear = vendedores.filter((v) => v.situacao === "RENOMEAR").length;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          {vendedores.length} vendedor(es) distintos em {totalContratos}{" "}
          contrato(s) sincronizados: {totalNovos} novo(s), {totalRenomear} com
          nome divergente do cadastro e{" "}
          {vendedores.length - totalNovos - totalRenomear} já cadastrado(s).
        </AlertDescription>
      </Alert>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Aplicar</TableHead>
              <TableHead>Vendedor no elleven</TableHead>
              <TableHead className="text-right">Contratos</TableHead>
              <TableHead>Última venda</TableHead>
              <TableHead>Cidade (elleven)</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Funcionário correspondente</TableHead>
              <TableHead>O que será feito</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendedores.map((v) => {
              const e = estado[v.nomeElleven];
              const criarNovo = e.funcionarioId === CRIAR_NOVO;
              const nomeAtual = criarNovo ? null : nomePorId.get(e.funcionarioId);
              const vaiRenomear = !criarNovo && nomeAtual !== v.nomeElleven;
              const duplicado = !criarNovo && e.aplicar && duplicados.has(e.funcionarioId);
              return (
                <TableRow key={v.nomeElleven}>
                  <TableCell>
                    <Checkbox
                      checked={e.aplicar}
                      onCheckedChange={(checked) =>
                        atualizar(v.nomeElleven, { aplicar: checked === true })
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{v.nomeElleven}</TableCell>
                  <TableCell className="text-right">{v.contratos}</TableCell>
                  <TableCell>{v.ultimaAtividade ?? "—"}</TableCell>
                  <TableCell>{v.cidadeElleven ?? "—"}</TableCell>
                  <TableCell>
                    {v.situacao === "NOVO" && <Badge>Novo</Badge>}
                    {v.situacao === "RENOMEAR" && (
                      <Badge variant="outline">Nome divergente</Badge>
                    )}
                    {v.situacao === "OK" && (
                      <Badge variant="secondary">Já cadastrado</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={e.funcionarioId}
                      onValueChange={(valor) =>
                        atualizar(v.nomeElleven, {
                          funcionarioId: valor ?? CRIAR_NOVO,
                        })
                      }
                      items={itensSelect}
                    >
                      <SelectTrigger
                        className={duplicado ? "w-64 border-destructive" : "w-64"}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CRIAR_NOVO}>
                          — Criar novo funcionário —
                        </SelectItem>
                        {funcionarios.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {!e.aplicar
                      ? "Nada (ignorado)"
                      : criarNovo
                        ? `Criar Vendedor Externo${v.cidadeElleven ? ` em ${v.cidadeElleven}` : ""}`
                        : vaiRenomear
                          ? `Renomear "${nomeAtual}" para o nome do elleven`
                          : v.funcionarioSemCidade && v.cidadeElleven
                            ? `Definir cidade ${v.cidadeElleven}`
                            : "Nada a mudar"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {duplicados.size > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            O mesmo funcionário está selecionado para mais de um vendedor do
            elleven. Ajuste as linhas marcadas (escolha outro funcionário ou
            &quot;Criar novo&quot;) antes de aplicar.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleAplicar}
          disabled={enviando || selecionados.length === 0 || duplicados.size > 0}
        >
          {enviando ? (
            "Aplicando..."
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Aplicar atualização em {selecionados.length} vendedor(es)
            </>
          )}
        </Button>
      </div>

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <UserPlus className="size-3.5" />
        Cidades do elleven que não existirem no cadastro serão criadas
        automaticamente. Cargos e equipes não são alterados.
      </p>
    </div>
  );
}
