"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { definirResponsavel, dispensarPendencia, sincronizarAgora } from "@/lib/actions/processos-pendencias";

export type PendenciaNaTela = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  severidade: string;
  diasRestantes: number;
  venceEmTexto: string;
  empresaNome: string;
  href: string | null;
  acaoRotulo: string;
};

type Usuario = { id: string; nome: string };

const CORES: Record<string, string> = {
  CRITICA: "text-destructive",
  ALTA: "text-amber-600 dark:text-amber-500",
  ATENCAO: "text-muted-foreground",
};

/**
 * A Central de Pendências.
 *
 * Três coisas fazem esta tela ser usada em vez de ignorada, e todas as três são
 * decisões, não detalhes:
 *
 * 1. Pendência SEM DONO aparece em bloco próprio, no topo, com aviso. Alerta
 *    sem dono é ruído que o time aprende a ignorar em um mês — e como o banco
 *    permite dono nulo (para o prazo nunca sumir por falta de configuração), é
 *    aqui que a regra é cobrada.
 * 2. Cada linha tem um botão que RESOLVE — "Indicar condutor", "Renovar" —, e
 *    não um link genérico de "ver". A tela existe para tirar trabalho, não para
 *    somar um clique antes do trabalho.
 * 3. Dispensar exige motivo escrito. Sem essa saída, um alarme falso fica
 *    eterno e a pessoa desiste da lista inteira; sem exigir o motivo,
 *    dispensar vira o jeito rápido de limpar a tela, o que dá no mesmo.
 *
 * `Linha` e `Bloco` são componentes de NÍVEL SUPERIOR, e não funções dentro
 * deste — definidos dentro, o React os trataria como componente novo a cada
 * render e remontaria a árvore: o texto do motivo sumiria enquanto a pessoa
 * digita. O eslint do projeto barra exatamente isso.
 */
export function PendenciasView({
  empresaId,
  vencidas,
  proximas,
  adiante,
  semDono,
  usuarios,
}: {
  empresaId: string;
  vencidas: PendenciaNaTela[];
  proximas: PendenciaNaTela[];
  adiante: PendenciaNaTela[];
  semDono: PendenciaNaTela[];
  usuarios: Usuario[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function atualizar() {
    setErro(null);
    iniciar(async () => {
      await sincronizarAgora({ empresaId });
      router.refresh();
    });
  }

  const comum = { empresaId, usuarios, setErro };

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" disabled={pendente} onClick={atualizar} className="gap-2">
          <RefreshCw className={cn("size-4", pendente && "animate-spin")} />
          Atualizar agora
        </Button>
      </div>

      {/* Sem dono vem PRIMEIRO, antes até das vencidas: uma pendência sem
          responsável não vai ser resolvida por ninguém, por mais urgente que
          seja. É o único bloco que cobra configuração em vez de trabalho. */}
      {semDono.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" />
              Sem responsável definido
              <Badge variant="destructive" className="tabular-nums">{semDono.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="pb-2 text-xs text-muted-foreground">
              Estas têm prazo correndo e ninguém para responder por elas. Defina o responsável —
              é a única coisa que faz uma lista de pendências virar trabalho feito.
            </p>
            {semDono.map((p) => (
              <Linha key={p.id} p={p} {...comum} />
            ))}
          </CardContent>
        </Card>
      )}

      <Bloco titulo="Vencidas" itens={vencidas} tom="critico" {...comum} />
      <Bloco titulo="Vencem em 7 dias" itens={proximas} tom="alerta" {...comum} />
      <Bloco titulo="Vencem em 30 dias" itens={adiante} {...comum} />
    </div>
  );
}

function Bloco({
  titulo,
  itens,
  tom,
  ...comum
}: {
  titulo: string;
  itens: PendenciaNaTela[];
  tom?: "critico" | "alerta";
  empresaId: string;
  usuarios: Usuario[];
  setErro: (e: string | null) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <Card className={cn(tom === "critico" && "border-destructive/40", tom === "alerta" && "border-amber-500/40")}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-base">
          {tom === "critico" && <AlertTriangle className="size-4 text-destructive" />}
          {titulo}
          <Badge variant="secondary" className="tabular-nums">{itens.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {itens.map((p) => (
          <Linha key={p.id} p={p} {...comum} />
        ))}
      </CardContent>
    </Card>
  );
}

function Linha({
  p,
  empresaId,
  usuarios,
  setErro,
}: {
  p: PendenciaNaTela;
  empresaId: string;
  usuarios: Usuario[];
  setErro: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  // Estado LOCAL da linha: só esta linha sabe se está dispensando ou
  // atribuindo. Subir isto para a view obrigaria a identificar a linha por id
  // em cada setState, e um re-render da lista inteira a cada tecla digitada.
  const [modo, setModo] = useState<"nenhum" | "dispensar" | "atribuir">("nenhum");
  const [motivo, setMotivo] = useState("");
  // Marcado por padrão: distribuir os domínios por pessoa foi decisão do CEO, e
  // o caso comum é "as multas são do fulano" — não "esta multa específica".
  const [tornarPadrao, setTornarPadrao] = useState(true);

  const atrasada = p.diasRestantes < 0;

  function fechar() {
    setModo("nenhum");
    setMotivo("");
  }

  function confirmarDispensa() {
    setErro(null);
    iniciar(async () => {
      const r = await dispensarPendencia({ empresaId, pendenciaId: p.id, motivo });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      fechar();
      router.refresh();
    });
  }

  function atribuir(responsavelId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await definirResponsavel({ empresaId, pendenciaId: p.id, responsavelId, tornarPadrao });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      fechar();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <div className={cn("w-16 shrink-0 text-sm font-semibold tabular-nums", CORES[p.severidade])}>
        {atrasada ? `${Math.abs(p.diasRestantes)}d` : `${p.diasRestantes}d`}
        <span className="block text-[10px] font-normal text-muted-foreground">
          {atrasada ? "atrasada" : p.venceEmTexto}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{p.titulo}</p>
        {p.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{p.descricao}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {p.empresaNome}
          {p.responsavelNome ? (
            <> · responsável: <span className="text-foreground">{p.responsavelNome}</span></>
          ) : (
            <> · <span className="font-medium text-destructive">sem responsável</span></>
          )}
        </p>

        {modo === "atribuir" && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {usuarios.map((u) => (
                <Button key={u.id} size="sm" variant="outline" disabled={pendente} onClick={() => atribuir(u.id)}>
                  {u.nome}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={fechar}>Cancelar</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={tornarPadrao}
                onChange={(e) => setTornarPadrao(e.target.checked)}
                className="size-3.5"
              />
              Tornar responsável padrão por todas as pendências deste tipo (inclusive futuras)
            </label>
          </div>
        )}

        {modo === "dispensar" && (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Por que isto não se aplica? (o motivo fica registrado)"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={pendente} onClick={confirmarDispensa}>Dispensar</Button>
              <Button size="sm" variant="ghost" onClick={fechar}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 gap-1.5">
        {/* Link e não Button: o Button deste projeto não aceita `asChild`, e
            envolver um Link num Button quebra a navegação do Next. */}
        {p.href && (
          <Link
            href={p.href}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors",
              atrasada
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border text-foreground hover:bg-muted",
            )}
          >
            {p.acaoRotulo}
          </Link>
        )}
        {!p.responsavelId && (
          <Button size="sm" variant="ghost" title="Definir responsável" onClick={() => setModo("atribuir")}>
            <UserPlus className="size-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" title="Dispensar com motivo" onClick={() => setModo("dispensar")}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
