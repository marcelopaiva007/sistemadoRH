"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Package,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { registrarEntregas, registrarDevolucao, excluirEntrega } from "@/lib/actions/rh-entregas";
import { createCatalogoItem } from "@/lib/actions/rh-catalogos";
import {
  SITUACAO_ENTREGA_BADGE,
  situacaoDaEntrega,
  tipoEntregaLabel,
  type SituacaoEntrega,
} from "@/lib/constants-entregas";
import { formatarData, paraInputDate } from "@/lib/datas";

export type EntregaDaTela = {
  id: string;
  tipo: string;
  descricao: string | null;
  dataEntrega: Date;
  confirmadoEm: Date | null;
  devolvidoEm: Date | null;
  entreguePorNome: string | null;
  observacoes: string | null;
  colaborador: { id: string; nome: string; setor: { nome: string } };
};

export type ColaboradorDaTela = { id: string; nome: string; setor: { nome: string } };

function KpiCard({
  rotulo,
  valor,
  icone: Icone,
  destaque,
}: {
  rotulo: string;
  valor: number;
  icone: React.ComponentType<{ className?: string }>;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 shadow-xs">
      <span
        className={
          destaque && valor > 0
            ? "flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive ring-1 ring-destructive/20"
            : "flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20"
        }
      >
        <Icone className="size-4.5" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-lg font-semibold tabular-nums">{valor}</p>
      </div>
    </div>
  );
}

/**
 * Acompanhamento de entregas — a tela existe para responder "quem ainda não
 * confirmou?".
 *
 * Por isso o filtro abre em "Aguardando confirmação" e não em "Todas": com 171
 * cartões entregues no mesmo dia, uma lista completa ordenada por data esconde
 * exatamente as 12 linhas que precisam de telefonema. A lista inteira continua
 * a um clique.
 */
export function EntregasView({
  empresaId,
  entregas,
  colaboradores,
  tipos,
}: {
  empresaId: string;
  entregas: EntregaDaTela[];
  colaboradores: ColaboradorDaTela[];
  tipos: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [registrarAberto, setRegistrarAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<SituacaoEntrega | "TODAS">("AGUARDANDO");
  const [filtroTipo, setFiltroTipo] = useState<string>("TODOS");
  const [agindo, setAgindo] = useState<string | null>(null);

  const totais = useMemo(() => {
    let aguardando = 0;
    let confirmadas = 0;
    let devolvidas = 0;
    for (const e of entregas) {
      const s = situacaoDaEntrega(e);
      if (s === "AGUARDANDO") aguardando++;
      else if (s === "CONFIRMADA") confirmadas++;
      else devolvidas++;
    }
    return { total: entregas.length, aguardando, confirmadas, devolvidas };
  }, [entregas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return entregas.filter((e) => {
      if (filtroSituacao !== "TODAS" && situacaoDaEntrega(e) !== filtroSituacao) return false;
      if (filtroTipo !== "TODOS" && e.tipo !== filtroTipo) return false;
      if (!termo) return true;
      return (
        e.colaborador.nome.toLowerCase().includes(termo) ||
        e.colaborador.setor.nome.toLowerCase().includes(termo) ||
        tipoEntregaLabel(e.tipo).toLowerCase().includes(termo) ||
        (e.descricao ?? "").toLowerCase().includes(termo)
      );
    });
  }, [entregas, busca, filtroSituacao, filtroTipo]);

  const { itensDaPagina, resetar, irPara, ...paginacao } = usePaginacao(filtradas);

  function mudarFiltro(fn: () => void) {
    fn();
    resetar();
  }

  async function devolver(entrega: EntregaDaTela) {
    setAgindo(entrega.id);
    const r = await registrarDevolucao(empresaId, entrega.id);
    setAgindo(null);
    if (r.ok) {
      toast.success(`Devolução de ${tipoEntregaLabel(entrega.tipo)} registrada.`);
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function excluir(entrega: EntregaDaTela) {
    setAgindo(entrega.id);
    const r = await excluirEntrega(empresaId, entrega.id);
    setAgindo(null);
    if (r.ok) {
      toast.success("Entrega apagada.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard rotulo="Entregas registradas" valor={totais.total} icone={Package} />
        <KpiCard
          rotulo="Aguardando confirmação"
          valor={totais.aguardando}
          icone={Clock}
          destaque
        />
        <KpiCard rotulo="Confirmadas" valor={totais.confirmadas} icone={CheckCircle2} />
        <KpiCard rotulo="Devolvidas" valor={totais.devolvidas} icone={RotateCcw} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Entregas</CardTitle>
            <CardDescription className="text-xs">
              O RH registra o que entregou; a confirmação vem do colaborador, pelo portal. Enquanto
              ele não confirmar, a linha fica em vermelho.
            </CardDescription>
          </div>
          <RegistrarEntregaDialog
            aberto={registrarAberto}
            aoMudarAberto={setRegistrarAberto}
            empresaId={empresaId}
            colaboradores={colaboradores}
            tipos={tipos}
            aoRegistrar={() => {
              setRegistrarAberto(false);
              router.refresh();
            }}
          />
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => mudarFiltro(() => setBusca(e.target.value))}
                placeholder="Buscar por nome, setor, tipo ou descrição…"
                className="pl-8"
              />
            </div>
            <Select
              value={filtroSituacao}
              onValueChange={(v) =>
                mudarFiltro(() => setFiltroSituacao((v as SituacaoEntrega | "TODAS") ?? "TODAS"))
              }
            >
              <SelectTrigger className="w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AGUARDANDO">Aguardando confirmação</SelectItem>
                <SelectItem value="CONFIRMADA">Confirmadas</SelectItem>
                <SelectItem value="DEVOLVIDA">Devolvidas</SelectItem>
                <SelectItem value="TODAS">Todas</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filtroTipo}
              onValueChange={(v) => mudarFiltro(() => setFiltroTipo(v ?? "TODOS"))}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os tipos</SelectItem>
                {tipos.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Entregue em</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensDaPagina.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {entregas.length === 0
                        ? "Nenhuma entrega registrada ainda. Use “Registrar entrega” para lançar o primeiro lote."
                        : "Nenhuma entrega com esses filtros."}
                    </TableCell>
                  </TableRow>
                )}
                {itensDaPagina.map((e) => {
                  const situacao = situacaoDaEntrega(e);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="align-top">
                        <p className="text-sm font-medium">{e.colaborador.nome}</p>
                        <p className="text-xs text-muted-foreground">{e.colaborador.setor.nome}</p>
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="text-sm">{tipoEntregaLabel(e.tipo)}</p>
                        {e.descricao && (
                          <p className="text-xs text-muted-foreground">{e.descricao}</p>
                        )}
                        {e.observacoes && (
                          <p className="text-xs text-muted-foreground italic">{e.observacoes}</p>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-sm whitespace-nowrap">
                        {formatarData(e.dataEntrega)}
                        {e.entreguePorNome && (
                          <p className="text-xs text-muted-foreground">por {e.entreguePorNome}</p>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusBadge status={situacao} map={SITUACAO_ENTREGA_BADGE} />
                        {e.confirmadoEm && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            em {formatarData(e.confirmadoEm)}
                          </p>
                        )}
                        {e.devolvidoEm && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            em {formatarData(e.devolvidoEm)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-right whitespace-nowrap">
                        {situacao !== "DEVOLVIDA" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={agindo !== null}
                            onClick={() => devolver(e)}
                            title="Marcar como devolvido"
                          >
                            <Undo2 className="size-3.5" />
                            Devolvido
                          </Button>
                        )}
                        {/* Confirmada não some da tela por um clique do RH: a
                            confirmação é declaração do colaborador, e apagá-la
                            apagaria a prova. A action recusa — o botão nem
                            aparece para não prometer o que não faz. */}
                        {situacao === "AGUARDANDO" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={agindo !== null}
                            onClick={() => excluir(e)}
                            title="Apagar (registrado por engano)"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Paginacao {...paginacao} onMudarPagina={irPara} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Registro em lote — o caso real é "171 cartões no mesmo dia", não um por vez.
 *
 * A busca filtra a lista, e "Selecionar os N visíveis" age sobre o que está
 * filtrado: é assim que se marca um setor inteiro sem 40 cliques.
 */
function RegistrarEntregaDialog({
  aberto,
  aoMudarAberto,
  empresaId,
  colaboradores,
  tipos,
  aoRegistrar,
}: {
  aberto: boolean;
  aoMudarAberto: (v: boolean) => void;
  empresaId: string;
  colaboradores: ColaboradorDaTela[];
  tipos: { value: string; label: string }[];
  aoRegistrar: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState(tipos[0]?.value ?? "");
  const [descricao, setDescricao] = useState("");
  const [dataEntrega, setDataEntrega] = useState(paraInputDate(new Date()));
  const [observacoes, setObservacoes] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [buscaPessoa, setBuscaPessoa] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Cadastro de tipo SEM SAIR DO FORMULÁRIO. Mandar a pessoa para
  // Configuração → Catálogos no meio de um lote de 171 seleções descartaria
  // tudo que ela já marcou — então o catálogo vem até aqui. `tiposExtras`
  // espelha na hora o que a action gravou; o router.refresh() por trás
  // realinha com o servidor.
  const [criandoTipo, setCriandoTipo] = useState(false);
  const [nomeNovoTipo, setNomeNovoTipo] = useState("");
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const [tiposExtras, setTiposExtras] = useState<{ value: string; label: string }[]>([]);
  const todosOsTipos = useMemo(
    () => [...tipos, ...tiposExtras.filter((e) => !tipos.some((t) => t.value === e.value))],
    [tipos, tiposExtras],
  );

  async function criarTipo() {
    const nome = nomeNovoTipo.trim();
    if (nome.length < 2) {
      toast.error("Dê um nome ao tipo (ao menos 2 letras).");
      return;
    }
    setSalvandoTipo(true);
    const fd = new FormData();
    fd.set("nome", nome);
    // Mesma action da tela de Catálogos — categoria TIPO_ENTREGA. O item nasce
    // no catálogo da empresa, não numa lista paralela só desta tela.
    const r = await createCatalogoItem(empresaId, "TIPO_ENTREGA", { ok: true }, fd);
    setSalvandoTipo(false);
    if (r.ok) {
      setTiposExtras((atual) => [...atual, { value: nome, label: nome }]);
      setTipo(nome);
      setCriandoTipo(false);
      setNomeNovoTipo("");
      toast.success(`Tipo "${nome}" cadastrado no catálogo da empresa.`);
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  const visiveis = useMemo(() => {
    const termo = buscaPessoa.trim().toLowerCase();
    if (!termo) return colaboradores;
    return colaboradores.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) || c.setor.nome.toLowerCase().includes(termo),
    );
  }, [colaboradores, buscaPessoa]);

  const todosVisiveisMarcados =
    visiveis.length > 0 && visiveis.every((c) => selecionados.includes(c.id));

  function alternar(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  function alternarVisiveis() {
    const ids = visiveis.map((c) => c.id);
    setSelecionados((atual) =>
      todosVisiveisMarcados
        ? atual.filter((x) => !ids.includes(x))
        : [...new Set([...atual, ...ids])],
    );
  }

  function limpar() {
    setDescricao("");
    setObservacoes("");
    setSelecionados([]);
    setBuscaPessoa("");
  }

  async function salvar() {
    setSalvando(true);
    const r = await registrarEntregas({
      empresaId,
      colaboradorIds: selecionados,
      tipo,
      descricao,
      dataEntrega,
      observacoes,
    });
    setSalvando(false);
    if (r.ok) {
      const semCanal = r.semCanal ?? 0;
      toast.success(
        `${r.criadas} entrega(s) registrada(s) · ${r.avisados ?? 0} avisado(s) pelo Telegram.` +
          (semCanal > 0
            ? ` ${semCanal} pessoa(s) sem Telegram não receberam aviso — cobre a confirmação pessoalmente.`
            : ""),
        { duration: semCanal > 0 ? 10000 : 5000 },
      );
      limpar();
      aoRegistrar();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        Registrar entrega
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="size-4" />
            Registrar entrega
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label required>Tipo</Label>
                <button
                  type="button"
                  onClick={() => setCriandoTipo((v) => !v)}
                  className="text-xs text-primary hover:underline"
                >
                  {criandoTipo ? "cancelar" : "+ novo tipo"}
                </button>
              </div>
              {criandoTipo ? (
                <div className="flex gap-1.5">
                  <Input
                    value={nomeNovoTipo}
                    onChange={(e) => setNomeNovoTipo(e.target.value)}
                    placeholder="Ex.: Cadeira ergonômica"
                    maxLength={60}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        criarTipo();
                      }
                    }}
                  />
                  <Button type="button" size="sm" disabled={salvandoTipo} onClick={criarTipo}>
                    {salvandoTipo ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              ) : (
                <Select value={tipo} onValueChange={(v) => setTipo(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha o tipo…" />
                  </SelectTrigger>
                  <SelectContent>
                    {todosOsTipos.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                O tipo novo vale para a empresa toda. Para renomear ou pausar um,{" "}
                <Link
                  href={`/rh/${empresaId}/catalogos?categoria=TIPO_ENTREGA`}
                  className="underline hover:text-foreground"
                >
                  abra o catálogo
                </Link>
                .
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataEntrega" required>
                Data da entrega
              </Label>
              <Input
                id="dataEntrega"
                type="date"
                value={dataEntrega}
                onChange={(e) => setDataEntrega(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Cartão Flash · lote de agosto/2026"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              É o que a pessoa lê no portal na hora de confirmar. Vale para todas as selecionadas —
              número de série individual vai nas observações da ficha, não aqui.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label required>
                Colaboradores{" "}
                <span className="font-normal text-muted-foreground">
                  ({selecionados.length} selecionado{selecionados.length === 1 ? "" : "s"})
                </span>
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={alternarVisiveis}>
                {todosVisiveisMarcados
                  ? `Desmarcar os ${visiveis.length} visíveis`
                  : `Selecionar os ${visiveis.length} visíveis`}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscaPessoa}
                onChange={(e) => setBuscaPessoa(e.target.value)}
                placeholder="Filtrar por nome ou setor…"
                className="pl-8"
              />
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {visiveis.length === 0 && (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  Ninguém encontrado com esse filtro.
                </p>
              )}
              {visiveis.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <Checkbox
                    checked={selecionados.includes(c.id)}
                    onCheckedChange={() => alternar(c.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.setor.nome}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações (internas)</Label>
            <Textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => aoMudarAberto(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={salvando || selecionados.length === 0 || !tipo}
            onClick={salvar}
          >
            {salvando
              ? "Registrando…"
              : `Registrar para ${selecionados.length} pessoa${selecionados.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
