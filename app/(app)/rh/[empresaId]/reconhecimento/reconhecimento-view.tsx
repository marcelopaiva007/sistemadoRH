"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Cake, Check, Send, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { enviarReconhecimento } from "@/lib/actions/rh-reconhecimento";

const NOMES_MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

type Aniversariante = {
  id: string;
  nome: string;
  setorNome: string;
  posicaoNome: string;
  dia: number;
  temTelegram: boolean;
  jaEnviado: boolean;
};

type Marco = Aniversariante & { anos: number; redondo: boolean };

export function ReconhecimentoView({
  empresaId,
  mes,
  aniversariantes,
  marcos,
}: {
  empresaId: string;
  mes: number;
  aniversariantes: Aniversariante[];
  marcos: Marco[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1>Reconhecimento</h1>
        <p className="text-sm text-muted-foreground">
          Aniversariantes e marcos de tempo de casa de {NOMES_MES[mes - 1]}. O parabéns sai pelo mesmo
          bot do Telegram já usado nas pesquisas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cake className="size-4" />
            Aniversariantes do mês ({aniversariantes.length})
          </CardTitle>
          <CardDescription>Data de nascimento, não de admissão.</CardDescription>
        </CardHeader>
        <CardContent>
          {aniversariantes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguém faz aniversário este mês (ou a data de nascimento não está preenchida).
            </p>
          ) : (
            <ul className="divide-y">
              {aniversariantes.map((c) => (
                <ItemLista key={c.id} empresaId={empresaId} pessoa={c} tipo="ANIVERSARIO" dia={c.dia} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4" />
            Tempo de casa ({marcos.length})
          </CardTitle>
          <CardDescription>Aniversário de admissão. Marcos redondos (1, 3, 5, 10...) em destaque.</CardDescription>
        </CardHeader>
        <CardContent>
          {marcos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguém completa aniversário de casa este mês.
            </p>
          ) : (
            <ul className="divide-y">
              {marcos.map((c) => (
                <ItemLista
                  key={c.id}
                  empresaId={empresaId}
                  pessoa={c}
                  tipo="TEMPO_CASA"
                  dia={c.dia}
                  complemento={
                    <Badge variant={c.redondo ? "default" : "outline"}>
                      {c.anos} ano{c.anos === 1 ? "" : "s"}
                      {c.redondo && " 🏅"}
                    </Badge>
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemLista({
  empresaId,
  pessoa,
  tipo,
  dia,
  complemento,
}: {
  empresaId: string;
  pessoa: Aniversariante;
  tipo: "ANIVERSARIO" | "TEMPO_CASA";
  dia: number;
  complemento?: React.ReactNode;
}) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(pessoa.jaEnviado);

  async function enviar() {
    setEnviando(true);
    const r = await enviarReconhecimento(empresaId, pessoa.id, tipo);
    setEnviando(false);
    if (r.ok) {
      toast.success("Parabéns enviado.");
      setEnviado(true);
    } else {
      toast.error(r.error);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
          {String(dia).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <Link href={`/rh/${empresaId}/colaboradores/${pessoa.id}`} className="font-medium hover:underline">
            {pessoa.nome}
          </Link>
          <div className="text-xs text-muted-foreground">
            {pessoa.setorNome} · {pessoa.posicaoNome}
          </div>
        </div>
        {complemento}
      </div>
      <div>
        {enviado ? (
          <Badge variant="secondary" className="gap-1">
            <Check className="size-3" />
            Enviado
          </Badge>
        ) : pessoa.temTelegram ? (
          <Button size="sm" variant="outline" disabled={enviando} onClick={enviar}>
            <Send className="size-3.5" />
            {enviando ? "Enviando..." : "Mandar parabéns"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Sem Telegram vinculado</span>
        )}
      </div>
    </li>
  );
}
