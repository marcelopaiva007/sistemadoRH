"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, User, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { perguntarAoAssistente } from "@/lib/actions/rh-assistente";

type Turno =
  | { de: "pessoa"; texto: string }
  | { de: "assistente"; texto: string; ferramentas: string[]; erro?: boolean };

const SUGESTOES = [
  "Quantos colaboradores ativos temos por setor?",
  "Quem está de férias em agosto?",
  "Quem está irregular em NR ou ASO?",
  "Quais vagas estão abertas e quantos candidatos em processo?",
  "Quem faz aniversário de empresa neste mês?",
];

export function AssistenteView({ empresaId, ligado }: { empresaId: string; ligado: boolean }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnos, pensando]);

  async function perguntar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || pensando) return;
    setTexto("");
    setTurnos((t) => [...t, { de: "pessoa", texto: p }]);
    setPensando(true);

    const r = await perguntarAoAssistente(empresaId, p);
    setPensando(false);
    setTurnos((t) => [
      ...t,
      r.ok
        ? { de: "assistente", texto: r.resposta, ferramentas: r.ferramentasUsadas }
        : { de: "assistente", texto: r.erro, ferramentas: [], erro: true },
    ]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Assistente de RH</h2>
        <p className="text-sm text-muted-foreground">
          Pergunte em português sobre os dados desta empresa. O assistente só lê — não altera nada —
          e cada pergunta fica registrada na auditoria.
        </p>
      </div>

      {!ligado && (
        <Alert>
          <Bot className="size-4" />
          <AlertDescription>
            <strong>Assistente desligado.</strong> Falta a variável <code>ANTHROPIC_API_KEY</code> no
            ambiente. Crie uma chave em console.anthropic.com, adicione nas variáveis do projeto na
            Vercel e faça um novo deploy — nada mais precisa mudar no código.
          </AlertDescription>
        </Alert>
      )}

      {turnos.length === 0 && ligado && (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => perguntar(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}

      {turnos.length > 0 && (
        <div className="space-y-3">
          {turnos.map((t, i) => (
            <Card key={i} className={t.de === "pessoa" ? "bg-muted/40" : ""}>
              <CardContent className="flex gap-3 py-3">
                <div className="mt-0.5 shrink-0">
                  {t.de === "pessoa" ? (
                    <User className="size-4 text-muted-foreground" />
                  ) : (
                    <Bot className={`size-4 ${t.erro ? "text-destructive" : "text-primary"}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm whitespace-pre-wrap ${t.de === "assistente" && t.erro ? "text-destructive" : ""}`}
                  >
                    {t.texto}
                  </p>
                  {t.de === "assistente" && t.ferramentas.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Wrench className="size-3 text-muted-foreground" />
                      {t.ferramentas.map((f) => (
                        <Badge key={f} variant="secondary" className="text-[10px]">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {pensando && (
            <Card>
              <CardContent className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
                <Bot className="size-4 animate-pulse text-primary" />
                consultando os dados...
              </CardContent>
            </Card>
          )}
          <div ref={fim} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(texto);
        }}
        className="flex gap-2"
      >
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={ligado ? "Ex.: quantas pessoas temos na Área Técnica?" : "Assistente desligado"}
          disabled={!ligado || pensando}
        />
        <Button type="submit" disabled={!ligado || pensando || !texto.trim()}>
          <Send className="size-4" />
          Perguntar
        </Button>
      </form>
    </div>
  );
}
