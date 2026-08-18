"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Search, ShieldCheck, Lock, Unlock, KeyRound, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { alterarPontoLiberado, gerarPinPonto } from "@/app/actions/rh-ponto";

export type ColaboradorPontoItem = {
  id: string;
  nome: string;
  setor: string;
  cargo: string;
  pontoLiberado: boolean;
  /** Já tem PIN do app /ponto definido (só o booleano chega ao cliente). */
  temPin: boolean;
};

/**
 * Liberação individual do ponto eletrônico. Todo colaborador ativo nasce
 * BLOQUEADO (Colaborador.pontoLiberado = false) — é aqui que o RH liga cada
 * um manualmente, em vez de abrir para todo mundo de uma vez. É aqui também
 * que se gera o PIN do app /ponto (CPF + PIN, sem Telegram).
 */
export function ColaboradoresPontoView({
  empresaId,
  colaboradores,
}: {
  empresaId: string;
  colaboradores: ColaboradorPontoItem[];
}) {
  const [busca, setBusca] = useState("");
  // Estado local otimista por linha, para o toggle responder na hora sem
  // esperar o revalidatePath do servidor — mesma ideia do salvando/loading de
  // ativar-desativar-button.tsx.
  const [liberados, setLiberados] = useState<Record<string, boolean>>(
    Object.fromEntries(colaboradores.map((c) => [c.id, c.pontoLiberado])),
  );
  const [comPin, setComPin] = useState<Record<string, boolean>>(
    Object.fromEntries(colaboradores.map((c) => [c.id, c.temPin])),
  );
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  // O PIN recém-gerado, mostrado UMA vez no diálogo — nunca mais recuperável
  // (o banco só tem o hash). Fechar o diálogo descarta o valor da memória.
  const [pinGerado, setPinGerado] = useState<{ nome: string; pin: string } | null>(null);

  const filtrados = colaboradores.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.setor.toLowerCase().includes(busca.toLowerCase()) ||
      c.cargo.toLowerCase().includes(busca.toLowerCase()),
  );

  const totalLiberados = colaboradores.filter((c) => liberados[c.id]).length;

  async function alternar(id: string, nome: string, liberadoAtual: boolean) {
    setSalvandoId(id);
    const proximo = !liberadoAtual;
    const result = await alterarPontoLiberado(empresaId, id, proximo);
    setSalvandoId(null);
    if (result.ok) {
      setLiberados((prev) => ({ ...prev, [id]: proximo }));
      toast.success(proximo ? `Ponto liberado para ${nome}.` : `Ponto bloqueado para ${nome}.`);
    } else {
      toast.error(result.error);
    }
  }

  async function gerarPin(id: string, nome: string) {
    setSalvandoId(id);
    const result = await gerarPinPonto(empresaId, id);
    setSalvandoId(null);
    if (result.ok) {
      setComPin((prev) => ({ ...prev, [id]: true }));
      setPinGerado({ nome, pin: result.pin });
    } else {
      toast.error(result.error);
    }
  }

  async function copiarPin() {
    if (!pinGerado) return;
    await navigator.clipboard.writeText(pinGerado.pin);
    toast.success("PIN copiado.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Liberação por colaborador
              <Badge variant="outline" className="ml-1 font-mono">
                {totalLiberados}/{colaboradores.length} liberados
              </Badge>
            </CardTitle>
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar colaborador ou setor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Liberar permite bater ponto; o PIN é a senha do app de ponto (/ponto) — CPF + PIN,
            sem Telegram. Gere e entregue o PIN pessoalmente a cada colaborador.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtrados.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum colaborador localizado.</p>
            ) : (
              filtrados.map((item) => {
                const liberado = liberados[item.id] ?? item.pontoLiberado;
                const temPin = comPin[item.id] ?? item.temPin;
                return (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-foreground block">{item.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.setor} · {item.cargo}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {liberado ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                          Liberado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Bloqueado
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={salvandoId === item.id}
                        onClick={() => gerarPin(item.id, item.nome)}
                        title={
                          temPin
                            ? "Redefinir o PIN do app de ponto (o atual deixa de valer)"
                            : "Gerar o PIN do app de ponto"
                        }
                      >
                        <KeyRound className="size-4" />
                        {temPin ? "Redefinir PIN" : "Gerar PIN"}
                      </Button>
                      <Button
                        size="sm"
                        variant={liberado ? "outline" : "default"}
                        disabled={salvandoId === item.id}
                        onClick={() => alternar(item.id, item.nome, liberado)}
                      >
                        {liberado ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                        {salvandoId === item.id ? "..." : liberado ? "Bloquear" : "Liberar"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={pinGerado !== null} onOpenChange={(aberto) => !aberto && setPinGerado(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>PIN de {pinGerado?.nome}</DialogTitle>
            <DialogDescription>
              Anote ou copie agora e entregue pessoalmente: por segurança o PIN não aparece de
              novo. Perdeu? Gere outro — este deixa de valer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-2">
            <span className="font-mono text-3xl font-extrabold tracking-[0.35em]">
              {pinGerado?.pin}
            </span>
            <Button size="icon" variant="outline" onClick={copiarPin} title="Copiar PIN">
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O colaborador entra em <span className="font-mono">/ponto</span> com o CPF e este
            PIN.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
