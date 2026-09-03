"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronUp, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  encontrarDuplicados,
  type Gravidade,
  type MotivoDuplicado,
  type PessoaParaComparar,
} from "@/lib/duplicados";
import { mascararCpf } from "@/lib/cpf";

type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  telegramChatId: string | null;
  ativo: boolean;
  empresaId: string;
  setor: { nome: string };
};

/**
 * Varredura de prováveis fichas duplicadas — mesmo CPF, mesmo telefone ou nome
 * quase igual, entre TODOS os colaboradores, inclusive desligados.
 *
 * Só sinaliza; não mexe em nada sozinho. Decidir qual ficha é a certa e qual é
 * a sobra é julgamento do RH (data de admissão, CPF preenchido, o que já tem
 * histórico) — a varredura só evita que a duplicata continue invisível.
 */

/** O que o RH resolve ao abrir este grupo. Muda com a gravidade, não só com o motivo. */
function oQueFazer(motivo: MotivoDuplicado, gravidade: Gravidade, comTelegramPreso: boolean): string {
  if (comTelegramPreso) {
    return "A ficha desligada está segurando o Telegram. É isto que faz o bot responder \"já está vinculado a outro colaborador\" para quem está na ativa: abra a ficha desligada e clique em Desvincular.";
  }
  if (gravidade === "alta" && motivo === "Mesmo CPF") {
    return "Duas fichas ATIVAS com o mesmo CPF — é a mesma pessoa cadastrada duas vezes. Convite de pesquisa e cobrança saem em dobro, e o bot pode escolher a ficha errada. Encerre a que não tem histórico.";
  }
  if (gravidade === "alta") {
    return "Duas fichas ativas dividindo o telefone. Se for a mesma pessoa, encerre a sobra; se forem duas pessoas de verdade (aparelho da família), corrija um dos números — senão o bot casa o contato com quem chegar primeiro.";
  }
  if (gravidade === "baixa") {
    return "Uma ativa e uma desligada: quase sempre recontratação, e aí está certo. Vale conferir só se a pessoa reclamar que não recebe nada.";
  }
  return "Nomes parecidos entre ativos — pode ser grafia diferente da mesma pessoa, ou duas pessoas mesmo. Confira o CPF antes de encerrar qualquer ficha.";
}

const ESTILO_GRAVIDADE: Record<Gravidade, { card: string; rotulo: string; variante: "destructive" | "secondary" | "outline" }> = {
  alta: { card: "border-destructive/50 bg-destructive/5", rotulo: "Resolver agora", variante: "destructive" },
  media: { card: "border-border bg-card", rotulo: "Conferir", variante: "secondary" },
  baixa: { card: "", rotulo: "Provável recontratação", variante: "outline" },
};

export function AlertaDuplicados({ empresaId, colaboradores }: { empresaId: string; colaboradores: Colaborador[] }) {
  const [aberto, setAberto] = useState(false);

  const grupos = useMemo(() => {
    // Sem filtrar por `ativo`: a ficha duplicada é quase sempre a encerrada.
    const todos: PessoaParaComparar[] = colaboradores.map((c) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      cpf: c.cpf,
      setorNome: c.setor.nome,
      ativo: c.ativo,
      temTelegram: Boolean(c.telegramChatId),
    }));
    return encontrarDuplicados(todos);
  }, [colaboradores]);

  // A ficha é escopada à empresa da rota, e a lista mistura marcas: o link tem
  // de apontar para a empresa do próprio colaborador, senão dá 404. O mapa
  // existe porque PessoaParaComparar não carrega empresaId.
  const empresaDoColaborador = useMemo(
    () => new Map(colaboradores.map((c) => [c.id, c.empresaId])),
    [colaboradores],
  );

  if (grupos.length === 0) return null;

  const urgentes = grupos.filter((g) => g.gravidade === "alta").length;
  const totalPessoas = grupos.reduce((acc, g) => acc + g.pessoas.length, 0);

  return (
    <Card className={urgentes > 0 ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"}>
      <CardContent className="space-y-3 py-4">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className={`size-4 ${urgentes > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            {grupos.length} prováve{grupos.length > 1 ? "is" : "l"} duplicata
            {grupos.length > 1 ? "s" : ""} ({totalPessoas} fichas)
            {urgentes > 0 && (
              <span className="font-normal text-destructive">
                · {urgentes} para resolver agora
              </span>
            )}
          </span>
          {aberto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {aberto && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Mesmo CPF, mesmo telefone ou nome muito parecido — entre todos os colaboradores,
              inclusive desligados. A ficha duplicada quase sempre é a encerrada, e é ela que fica
              segurando o Telegram da pessoa. A pesquisa de clima é anônima, então encerrar a ficha
              errada não perde nenhuma resposta.
            </p>
            {grupos.map((g, i) => {
              const comTelegramPreso = g.pessoas.some((p) => !p.ativo && p.temTelegram);
              const estilo = ESTILO_GRAVIDADE[g.gravidade];
              return (
                <div key={i} className={`rounded-md border bg-background p-3 text-sm ${estilo.card}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{g.motivo}</Badge>
                    <Badge variant={estilo.variante}>{estilo.rotulo}</Badge>
                  </div>
                  <ul className="space-y-1">
                    {g.pessoas.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/rh/${empresaDoColaborador.get(p.id) ?? empresaId}/colaboradores/${p.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.nome}
                        </Link>
                        {!p.ativo && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Desligado
                          </Badge>
                        )}
                        {p.temTelegram && (
                          <Badge variant={p.ativo ? "secondary" : "destructive"} className="gap-1">
                            <Send className="size-3" />
                            Telegram
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {p.setorNome} · CPF {mascararCpf(p.cpf)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {oQueFazer(g.motivo, g.gravidade, comTelegramPreso)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
