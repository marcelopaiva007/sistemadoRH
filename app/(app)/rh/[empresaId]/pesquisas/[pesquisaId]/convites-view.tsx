"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  gerarConvites,
  enviarConvites,
  enviarConviteToken,
  excluirDaPesquisa,
  reincluirNaPesquisa,
  apagarConviteExcluido,
  limparExcluidosDaPesquisa,
} from "@/lib/actions/pesquisas";
import { LIMITE_DIARIO_ENVIOS, statusTokenLabel } from "@/lib/constants-rh";
import { participacaoPct } from "@/lib/pesquisa-numeros";
import type { PesquisaBase, Token } from "./tipos";

// 50 por página, como na lista de colaboradores: com a tabela compacta os 205
// convites cabem em 5 páginas, e a tela nunca renderiza a lista inteira.
const POR_PAGINA = 50;

type Filtro = "todos" | "nao_enviados" | "sem_resposta" | "responderam" | "fora";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "nao_enviados", rotulo: "Convite não enviado" },
  { valor: "sem_resposta", rotulo: "Enviado, sem resposta" },
  { valor: "responderam", rotulo: "Já responderam" },
  { valor: "fora", rotulo: "Fora da pesquisa" },
];

export function ConvitesView({
  empresaId,
  pesquisa,
  tokens,
  semConvite,
}: {
  empresaId: string;
  pesquisa: PesquisaBase;
  tokens: Token[];
  /** Colaboradores ativos ainda sem convite nesta pesquisa. */
  semConvite: number;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  // O painel que o analista usa para cobrar: quem está na pesquisa, quem ainda
  // não recebeu o convite, quem recebeu e não respondeu, quem já respondeu.
  //
  // "Enviado" se apoia em enviadoEm, não no status: o status vira RESPONDED
  // assim que a pessoa responde, e contar por status faria os respondentes
  // sumirem da conta de enviados.
  const numeros = useMemo(() => {
    const naPesquisa = tokens.filter((t) => t.status !== "EXCLUIDO");
    const enviados = naPesquisa.filter((t) => t.enviadoEm !== null).length;
    const responderam = naPesquisa.filter((t) => t.status === "RESPONDED").length;
    return {
      naPesquisa: naPesquisa.length,
      enviados,
      naoEnviados: naPesquisa.length - enviados,
      responderam,
      naoResponderam: naPesquisa.length - responderam,
      fora: tokens.length - naPesquisa.length,
    };
  }, [tokens]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tokens.filter((t) => {
      const naPesquisa = t.status !== "EXCLUIDO";
      const respondeu = t.status === "RESPONDED";
      const enviado = t.enviadoEm !== null;

      const passaFiltro =
        filtro === "todos"
          ? naPesquisa
          : filtro === "nao_enviados"
            ? naPesquisa && !enviado
            : filtro === "sem_resposta"
              ? naPesquisa && enviado && !respondeu
              : filtro === "responderam"
                ? respondeu
                : !naPesquisa;

      if (!passaFiltro) return false;
      return !termo || t.colaborador.nome.toLowerCase().includes(termo);
    });
  }, [tokens, filtro, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function trocarFiltro(novo: Filtro) {
    setFiltro(novo);
    setPagina(1);
  }

  async function handleGerarConvites() {
    setPendingAction("gerar");
    const result = await gerarConvites(empresaId, pesquisa.id);
    if (result.ok) toast.success(result.message ?? "Convites gerados.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  async function handleExcluir(tokenId: string) {
    setPendingAction(tokenId);
    const result = await excluirDaPesquisa(empresaId, tokenId);
    if (result.ok) toast.success(result.message ?? "Retirado da pesquisa.");
    else toast.error(result.error, { duration: 8000 });
    setPendingAction(null);
  }

  async function handleReincluir(tokenId: string) {
    setPendingAction(tokenId);
    const result = await reincluirNaPesquisa(empresaId, tokenId);
    if (result.ok) toast.success(result.message ?? "Voltou para a lista.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  async function handleApagar(tokenId: string) {
    setPendingAction(tokenId);
    const result = await apagarConviteExcluido(empresaId, tokenId);
    if (result.ok) toast.success(result.message ?? "Apagado da lista.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  async function handleLimparExcluidos() {
    setPendingAction("limpar");
    const result = await limparExcluidosDaPesquisa(empresaId, pesquisa.id);
    if (result.ok) toast.success(result.message ?? "Lista limpa.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  // Envia em lotes (limite de tempo de server action na Vercel), repetindo até
  // não restar pendente — com progresso via toast. Para se um lote inteiro
  // falhar (ex.: SMTP fora ou limite diário do provedor atingido).
  async function handleEnviarTodos() {
    setPendingAction("enviar-todos");
    let totalEnviados = 0;
    let totalFalhas = 0;
    const progresso = toast.loading("Enviando convites...");
    try {
      for (let i = 0; i < 30; i++) {
        const lote = await enviarConvites(empresaId, pesquisa.id);
        totalEnviados += lote.enviados;
        totalFalhas += lote.falhas;
        toast.loading(
          `Enviando... ${totalEnviados} enviado(s), ${lote.restantes} restante(s)` +
            (totalFalhas > 0 ? `, ${totalFalhas} falha(s)` : ""),
          { id: progresso }
        );
        if (lote.restantes === 0) break;
        if (lote.enviados === 0) {
          toast.error(
            `Envio interrompido: ${lote.restantes} convite(s) não puderam ser enviados` +
              (lote.error ? ` — ${lote.error}` : "") +
              ". Corrija o problema e clique de novo para retomar.",
            { id: progresso, duration: 10000 }
          );
          setPendingAction(null);
          return;
        }
      }
      if (totalFalhas === 0) {
        toast.success(`${totalEnviados} convite(s) enviado(s) com sucesso.`, { id: progresso });
      } else {
        toast.warning(
          `${totalEnviados} enviado(s), ${totalFalhas} falha(s) — veja a coluna Erro e clique de novo para reenviar as falhas.`,
          { id: progresso, duration: 10000 }
        );
      }
    } finally {
      setPendingAction(null);
    }
  }

  async function handleEnviarUm(tokenId: string) {
    setPendingAction(tokenId);
    const result = await enviarConviteToken(empresaId, tokenId);
    if (result.ok) toast.success("Convite enviado.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  return (
    <div className="space-y-4">
      <ResumoDosConvites numeros={numeros} aoFiltrar={trocarFiltro} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            Lista de convites
            {numeros.fora > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                + {numeros.fora} fora da pesquisa
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {numeros.fora > 0 && (
              <ConfirmarAcao
                rotulo={`Apagar os ${numeros.fora} de fora`}
                pergunta={`Apagar ${numeros.fora} convite(s) de quem está fora da pesquisa? Os cadastros continuam desativados em Colaboradores.`}
                disabled={pendingAction === "limpar"}
                onConfirmar={handleLimparExcluidos}
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pesquisa.status !== "ACTIVE" || pendingAction === "gerar"}
              onClick={handleGerarConvites}
            >
              <RefreshCw className="size-4" />
              {semConvite > 0
                ? `Gerar convites (${semConvite} sem convite)`
                : "Gerar convites (lista completa)"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={numeros.naPesquisa === 0 || pendingAction === "enviar-todos"}
              onClick={handleEnviarTodos}
            >
              <Send className="size-4" />
              Enviar pendentes/falhos
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {pesquisa.status !== "ACTIVE" && (
            <p className="text-sm text-muted-foreground">
              Ative a pesquisa para gerar e enviar convites.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Envio automático: todo dia às 10h o sistema envia até {LIMITE_DIARIO_ENVIOS} convites
            pendentes, completando setor por setor, e marca aqui o canal e a data de cada envio. O
            botão acima envia agora, dentro do mesmo limite diário.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              placeholder="Buscar por nome..."
              className="h-9 w-full sm:w-64"
            />
            <div className="flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <Button
                  key={f.valor}
                  type="button"
                  size="sm"
                  variant={filtro === f.valor ? "default" : "outline"}
                  onClick={() => trocarFiltro(f.valor)}
                >
                  {f.rotulo}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      {tokens.length === 0
                        ? "Nenhum convite gerado ainda."
                        : "Nenhum convite nesse filtro."}
                    </TableCell>
                  </TableRow>
                )}
                {visiveis.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.colaborador.nome}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.status === "RESPONDED"
                            ? "default"
                            : t.status === "EXCLUIDO"
                              ? "outline"
                              : "secondary"
                        }
                        className={t.status === "EXCLUIDO" ? "text-muted-foreground" : undefined}
                      >
                        {statusTokenLabel(t.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.status === "SENT" || t.status === "RESPONDED" || t.status === "FAILED"
                        ? t.canal === "EMAIL"
                          ? "E-mail"
                          : "Telegram"
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.enviadoEm
                        ? new Date(t.enviadoEm).toLocaleString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.erro ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {t.status === "EXCLUIDO" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Colocar de volta na pesquisa"
                            disabled={pendingAction === t.id}
                            onClick={() => handleReincluir(t.id)}
                          >
                            <UserPlus className="size-4" />
                          </Button>
                          <ConfirmarAcao
                            pergunta="Apagar?"
                            titulo="Apagar da lista (o cadastro continua desativado)"
                            variant="ghost"
                            disabled={pendingAction === t.id}
                            onConfirmar={() => handleApagar(t.id)}
                          />
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Enviar convite"
                            disabled={t.status === "RESPONDED" || pendingAction === t.id}
                            onClick={() => handleEnviarUm(t.id)}
                          >
                            <Send className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title={
                              t.status === "RESPONDED"
                                ? "Já respondeu — a resposta é anônima e não pode ser retirada"
                                : "Tirar da pesquisa (não é funcionário)"
                            }
                            disabled={t.status === "RESPONDED" || pendingAction === t.id}
                            onClick={() => handleExcluir(t.id)}
                          >
                            <UserMinus className="size-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>
              {filtrados.length} pessoa(s) neste filtro
              {filtrados.length > POR_PAGINA && ` · página ${paginaAtual} de ${totalPaginas}`}
            </span>
            {totalPaginas > 1 && (
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaAtual === 1}
                  onClick={() => setPagina(paginaAtual - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaAtual === totalPaginas}
                  onClick={() => setPagina(paginaAtual + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * O placar da campanha. Cada número é clicável e filtra a lista abaixo —
 * "quantos faltam responder" só serve para cobrar se der para ver QUEM são.
 */
function ResumoDosConvites({
  numeros,
  aoFiltrar,
}: {
  numeros: {
    naPesquisa: number;
    enviados: number;
    naoEnviados: number;
    responderam: number;
    naoResponderam: number;
    fora: number;
  };
  aoFiltrar: (f: Filtro) => void;
}) {
  const itens: { rotulo: string; valor: number; apoio?: string; filtro: Filtro }[] = [
    { rotulo: "Na pesquisa", valor: numeros.naPesquisa, filtro: "todos" },
    { rotulo: "Convite enviado", valor: numeros.enviados, filtro: "sem_resposta" },
    { rotulo: "Convite não enviado", valor: numeros.naoEnviados, filtro: "nao_enviados" },
    {
      rotulo: "Responderam",
      valor: numeros.responderam,
      apoio: `${participacaoPct(numeros.responderam, numeros.naPesquisa)}% de quem está na pesquisa`,
      filtro: "responderam",
    },
    { rotulo: "Não responderam", valor: numeros.naoResponderam, filtro: "sem_resposta" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {itens.map((i) => (
        <button key={i.rotulo} type="button" onClick={() => aoFiltrar(i.filtro)} className="text-left">
          <Card className="h-full transition-colors hover:border-primary">
            <CardContent className="space-y-1 py-4">
              <p className="text-xs text-muted-foreground">{i.rotulo}</p>
              <p className="text-2xl font-semibold tabular-nums">{i.valor}</p>
              {i.apoio && <p className="text-xs text-muted-foreground">{i.apoio}</p>}
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

/**
 * Botão de apagar com confirmação no lugar, sem modal: a pergunta troca o
 * próprio botão. Apagar convite não tem desfazer, e o mesmo componente serve
 * para a linha (só ícone) e para o cabeçalho (com rótulo).
 */
function ConfirmarAcao({
  pergunta,
  onConfirmar,
  rotulo,
  titulo,
  disabled,
  variant = "destructive",
}: {
  pergunta: string;
  onConfirmar: () => Promise<void>;
  rotulo?: string;
  titulo?: string;
  disabled?: boolean;
  variant?: "destructive" | "ghost";
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);

  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs text-destructive">{pergunta}</span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={rodando}
          onClick={async () => {
            setRodando(true);
            await onConfirmar();
            setRodando(false);
            setConfirmando(false);
          }}
        >
          {rodando ? "Apagando..." : "Confirmar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      title={titulo}
      disabled={disabled}
      onClick={() => setConfirmando(true)}
    >
      <Trash2 className="size-4" />
      {rotulo}
    </Button>
  );
}
