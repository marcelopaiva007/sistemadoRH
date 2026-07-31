"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { encontrarDuplicados, type PessoaParaComparar } from "@/lib/duplicados";
import { mascararCpf } from "@/lib/cpf";

type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  ativo: boolean;
  empresaId: string;
  setor: { nome: string };
};

/**
 * Aviso de prováveis fichas duplicadas — mesmo telefone ou nome quase igual
 * entre colaboradores ativos.
 *
 * Só sinaliza; não mexe em nada sozinho. Decidir qual ficha é a certa e qual
 * é a sobra é julgamento do RH (data de admissão, CPF preenchido, o que já
 * tem histórico) — o alerta só evita que a duplicata continue invisível.
 */
export function AlertaDuplicados({ empresaId, colaboradores }: { empresaId: string; colaboradores: Colaborador[] }) {
  const [aberto, setAberto] = useState(false);

  const grupos = useMemo(() => {
    const ativos: PessoaParaComparar[] = colaboradores
      .filter((c) => c.ativo)
      .map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, cpf: c.cpf, setorNome: c.setor.nome }));
    return encontrarDuplicados(ativos);
  }, [colaboradores]);

  // A ficha é escopada à empresa da rota, e a lista mistura marcas: o link tem
  // de apontar para a empresa do próprio colaborador, senão dá 404. O mapa
  // existe porque PessoaParaComparar não carrega empresaId.
  const empresaDoColaborador = useMemo(
    () => new Map(colaboradores.map((c) => [c.id, c.empresaId])),
    [colaboradores],
  );

  if (grupos.length === 0) return null;

  const totalPessoas = grupos.reduce((acc, g) => acc + g.pessoas.length, 0);

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardContent className="space-y-3 py-4">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-warning" />
            {grupos.length} prováve{grupos.length > 1 ? "is" : "l"} duplicata
            {grupos.length > 1 ? "s" : ""} ({totalPessoas} fichas)
          </span>
          {aberto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {aberto && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Mesmo telefone ou nome muito parecido entre colaboradores ativos — geralmente é a
              mesma pessoa cadastrada duas vezes com o nome grafado diferente. Confira CPF e
              telefone antes de decidir qual ficha manter; a pesquisa de clima é anônima, então
              apagar a ficha errada não perde nenhuma resposta.
            </p>
            {grupos.map((g, i) => (
              <div key={i} className="rounded-md border bg-background p-3 text-sm">
                <Badge variant="outline" className="mb-2">
                  {g.motivo}
                </Badge>
                <ul className="space-y-1">
                  {g.pessoas.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/rh/${empresaDoColaborador.get(p.id) ?? empresaId}/colaboradores/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.nome}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {p.setorNome} · CPF {mascararCpf(p.cpf)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
