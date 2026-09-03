"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, KeyRound, Send, User, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { perguntarAoAssistente } from "@/lib/actions/rh-assistente";
import { removerChaveAnthropic, salvarChaveAnthropic } from "@/lib/actions/rh-segredos";

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

export function AssistenteView({
  empresaId,
  ligado,
  origem,
  dica,
  atualizadoPor,
  podeConfigurar,
}: {
  empresaId: string;
  ligado: boolean;
  origem: "ambiente" | "sistema" | null;
  dica: string | null;
  atualizadoPor: string | null;
  podeConfigurar: boolean;
}) {
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
        <h1>Assistente de RH</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte em português sobre os dados desta empresa. O assistente só lê — não altera nada —
          e cada pergunta fica registrada na auditoria.
        </p>
      </div>

      {!ligado && !podeConfigurar && (
        <Alert>
          <Bot className="size-4" />
          <AlertDescription>
            <strong>Assistente desligado.</strong> Falta cadastrar a chave da API da Anthropic — peça
            a um administrador.
          </AlertDescription>
        </Alert>
      )}

      {podeConfigurar && (
        <ChaveDaApi
          empresaId={empresaId}
          ligado={ligado}
          origem={origem}
          dica={dica}
          atualizadoPor={atualizadoPor}
        />
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

/**
 * Cadastro da chave da API, na tela em vez da Vercel.
 *
 * A chave é escrita e nunca lida de volta: o campo sempre nasce vazio, e o que
 * a tela sabe da chave gravada são os quatro últimos dígitos. Trocar é
 * sobrescrever — não existe "ver a chave atual" em lugar nenhum do sistema.
 */
function ChaveDaApi({
  empresaId,
  ligado,
  origem,
  dica,
  atualizadoPor,
}: {
  empresaId: string;
  ligado: boolean;
  origem: "ambiente" | "sistema" | null;
  dica: string | null;
  atualizadoPor: string | null;
}) {
  const router = useRouter();
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [trocando, setTrocando] = useState(false);

  async function salvar() {
    if (!chave.trim() || salvando) return;
    setSalvando(true);
    try {
      const r = await salvarChaveAnthropic(empresaId, chave);
      if (r.ok) {
        // Limpa antes de sair: o valor não fica no estado do formulário depois
        // de gravado.
        setChave("");
        setTrocando(false);
        toast.success("Chave cadastrada. O assistente está ligado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível salvar — verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setSalvando(true);
    try {
      const r = await removerChaveAnthropic(empresaId);
      if (r.ok) {
        toast.success("Chave removida. O assistente ficou desligado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível remover — verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  // Ligado e sem intenção de trocar: uma linha de status, não um formulário. O
  // caminho do dia a dia é perguntar, não reconfigurar.
  if (ligado && !trocando) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground">
        <KeyRound className="size-4 shrink-0 text-muted-foreground" />
        <span>
          Chave da Anthropic ativa
          {origem === "ambiente" ? (
            <span className="text-muted-foreground"> — vinda das variáveis de ambiente</span>
          ) : (
            <span className="text-muted-foreground">
              {dica ? ` (final ${dica})` : ""}
              {atualizadoPor ? `, cadastrada por ${atualizadoPor}` : ""}
            </span>
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTrocando(true)}>
            Trocar
          </Button>
          {origem === "sistema" && (
            <Button size="sm" variant="ghost" disabled={salvando} onClick={remover}>
              Remover
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          {ligado ? "Trocar a chave da Anthropic" : "Ligar o assistente"}
        </CardTitle>
        <CardDescription>
          Crie uma chave em console.anthropic.com e cole aqui. Ela é gravada cifrada e não volta a
          aparecer na tela — para trocar, cole uma nova por cima. A partir daí cada pergunta passa a
          ter custo na sua conta da Anthropic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {origem === "ambiente" && (
          <Alert>
            <AlertDescription>
              Já existe uma chave nas variáveis de ambiente, e <strong>ela tem preferência</strong>.
              O que for cadastrado aqui fica guardado, mas só passa a valer quando a variável sair do
              projeto na Vercel.
            </AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
          className="flex flex-wrap gap-2"
        >
          <Input
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder="sk-ant-..."
            className="min-w-64 flex-1"
            disabled={salvando}
          />
          <Button type="submit" disabled={salvando || !chave.trim()}>
            {salvando ? "Conferindo..." : "Salvar chave"}
          </Button>
          {ligado && (
            <Button
              type="button"
              variant="ghost"
              disabled={salvando}
              onClick={() => setTrocando(false)}
            >
              Cancelar
            </Button>
          )}
        </form>
        <p className="text-xs text-muted-foreground">
          A chave é testada na Anthropic antes de ser gravada — se estiver errada ou revogada, você
          descobre agora e não na primeira pergunta.
        </p>
      </CardContent>
    </Card>
  );
}
