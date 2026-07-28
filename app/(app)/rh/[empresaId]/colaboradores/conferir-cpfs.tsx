"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatarCpf } from "@/lib/cpf";

type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  ativo: boolean;
  setor: { nome: string };
};

type Resultado = { cpf: string; colaborador: Colaborador | null };

// Os CPFs que já vieram de reclamação de colaborador não conseguindo vincular
// no Telegram — pré-preenchido para conferir de uma vez em vez de um por vez.
// Só um ponto de partida: qualquer lista colada aqui substitui isto.
const CPFS_RELATADOS = ["23504839830", "17881780410", "18076333490", "06593139440"].join("\n");

/**
 * Confere uma lista de CPFs contra a base inteira (ativos e inativos) de
 * uma vez — pergunta que a tela de Colaboradores não respondia sem abrir
 * CPF por CPF: "esse CPF existe aqui, e em que ficha?"
 *
 * Roda sobre a mesma lista que a tela já carregou (page.tsx busca sem
 * filtro de `ativo`) — nenhuma consulta a mais ao banco. Achar o CPF numa
 * ficha INATIVA é o resultado mais informativo: é a marca de ficha
 * duplicada — o cadastro de verdade existe, só não é o que está recebendo
 * convite nem respondendo ao bot.
 */
export function ConferirCpfs({ empresaId, colaboradores }: { empresaId: string; colaboradores: Colaborador[] }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(CPFS_RELATADOS);
  const [resultado, setResultado] = useState<Resultado[] | null>(null);

  function conferir() {
    const porCpf = new Map(colaboradores.filter((c) => c.cpf).map((c) => [c.cpf!, c]));
    const cpfs = [
      ...new Set(
        texto
          .split(/\r?\n/)
          .map((linha) => linha.replace(/\D/g, ""))
          .filter((digitos) => digitos.length === 11),
      ),
    ];
    setResultado(cpfs.map((cpf) => ({ cpf, colaborador: porCpf.get(cpf) ?? null })));
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="size-4 text-muted-foreground" />
            Conferir CPFs em lote
          </span>
          {aberto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {aberto && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cole um CPF por linha (com ou sem pontuação) — busca em toda a base, inclusive
              cadastros inativos. Achar num cadastro inativo costuma ser ficha duplicada: o
              cadastro certo existe, só não é o que está recebendo convite nem respondendo ao bot.
            </p>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              className="font-mono text-sm"
              placeholder={"235.048.398-30\n178.817.804-10"}
            />
            <Button type="button" size="sm" onClick={conferir}>
              Conferir
            </Button>

            {resultado && (
              <div className="space-y-1 pt-1">
                {resultado.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum CPF válido colado (precisa ter 11 dígitos).</p>
                )}
                {resultado.map((r) => (
                  <div
                    key={r.cpf}
                    className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-sm"
                  >
                    <span className="font-mono tabular-nums">{formatarCpf(r.cpf)}</span>
                    {!r.colaborador ? (
                      <Badge variant="destructive">Não encontrado</Badge>
                    ) : (
                      <>
                        <Badge variant={r.colaborador.ativo ? "secondary" : "outline"}>
                          {r.colaborador.ativo ? "Ativo" : "Inativo — provável ficha duplicada"}
                        </Badge>
                        <Link
                          href={`/rh/${empresaId}/colaboradores/${r.colaborador.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.colaborador.nome}
                        </Link>
                        <span className="text-xs text-muted-foreground">{r.colaborador.setor.nome}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
