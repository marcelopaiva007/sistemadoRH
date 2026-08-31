"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, Download, FileText, Paperclip, Plus, Pencil, Search, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  salvarVeiculo,
  salvarDocumentoVeiculo,
  excluirDocumentoVeiculo,
  excluirVeiculo,
  abrirAlocacao,
} from "@/lib/actions/processos-frota";
import { formatarTamanho } from "@/lib/anexos";
import { MIMES_ANEXO_ACEITOS, TAMANHO_MAXIMO_ANEXO } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";
import {
  MOTORIZACAO_VEICULO,
  PROPRIEDADE_VEICULO,
  SITUACAO_VEICULO,
  TIPOS_DOCUMENTO_VEICULO,
  formatarPlaca,
  normalizarPlaca,
  rotulo,
} from "@/lib/processos/ctb";

export type DocumentoNaTela = {
  id: string;
  tipo: string;
  exercicio: number | null;
  /** Formato do <input type="date"> — prefill da edição. */
  dataEmissaoInput: string;
  dataVencimentoInput: string;
  /** "dd/mm/aaaa" pronto; null quando o tipo não tem vencimento (nota fiscal). */
  vencimentoTexto: string | null;
  vencido: boolean;
  valor: number | null;
  observacoes: string | null;
  /** null = documento cadastrado sem anexo (só os metadados). */
  arquivo: { id: string; nome: string; mimeType: string; tamanhoBytes: number } | null;
};

export type VeiculoNaTela = {
  id: string;
  placa: string;
  renavam: string | null;
  marca: string | null;
  modelo: string | null;
  anoModelo: number | null;
  anoFab: number | null;
  chassi: string | null;
  hodometroAtual: number | null;
  valorFipe: number | null;
  cidadeBase: string | null;
  setor: string | null;
  emplacado: boolean;
  motoristaInformado: string | null;
  motoristaColaboradorId: string | null;
  /** Nome do motorista VINCULADO ao cadastro de colaboradores. */
  motoristaNome: string | null;
  empresaId: string;
  ufEmplacamento: string | null;
  propriedade: string;
  motorizacao: string;
  situacao: string;
  aderidoSne: boolean;
  /** Formato do <input type="date"> — prefill da edição. */
  dataAdesaoSneInput: string;
  empresaNome: string;
  condutorAtual: string | null;
  vencimentoMaisProximo: { tipo: string; texto: string; dias: number } | null;
  /** Semáforo do Financeiro da Frota, derivado no servidor (spec §4/§6). */
  financeiro: {
    status: string;
    rotulo: string;
    vencimentoTexto: string | null;
    vencimentoTs: number | null;
    dias: number | null;
  };
  /** Quantos registros o Cascade levaria junto se o veículo fosse excluído. */
  historico: {
    infracoes: number;
    alocacoes: number;
    documentos: number;
    manutencoes: number;
    consumos: number;
    transferencias: number;
  };
  documentos: DocumentoNaTela[];
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function VeiculosView({
  empresaId,
  veiculos,
  condutores,
  empresas,
  colaboradores,
  empresasParam,
}: {
  empresaId: string;
  veiculos: VeiculoNaTela[];
  condutores: { id: string; nome: string }[];
  empresas: { id: string; nome: string }[];
  /** Colaboradores ativos — o select de motorista busca daqui (31/08/2026). */
  colaboradores: { id: string; nome: string }[];
  /** O `?empresas=` da URL — o CSV herda quando nenhum CNPJ é escolhido aqui. */
  empresasParam?: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Busca pedida pelo RH em 27/08/2026 (Luana): com 64+ placas, achar uma no
  // olho não dá. A placa digitada passa pelo MESMO normalizador do cadastro
  // (maiúscula, sem hífen) — "klu-5g08" e "KLU5G08" acham o mesmo carro. O
  // campo também aceita modelo, empresa e motorista, minúsculas ou não.
  const [busca, setBusca] = useState("");
  // Filtro por CNPJ na PRÓPRIA tela + contagem — pedido do RH em 31/08/2026,
  // para tirar o relatório por empresa sem depender do seletor do topo.
  const [empresaFiltro, setEmpresaFiltro] = useState("");
  const [financeiroFiltro, setFinanceiroFiltro] = useState("");
  // Clique no cabeçalho "Financeiro" liga a ordenação por vencimento (§6.2):
  // vencidos no topo, sem registro no fim. Novo clique volta à ordem padrão.
  const [ordenarPorVencimento, setOrdenarPorVencimento] = useState(false);
  const veiculosFiltrados = useMemo(() => {
    const consulta = busca.trim();
    const placaConsulta = normalizarPlaca(consulta);
    const textoConsulta = consulta.toLowerCase();
    const filtrados = veiculos.filter((v) => {
      if (empresaFiltro && v.empresaId !== empresaFiltro) return false;
      if (financeiroFiltro && v.financeiro.status !== financeiroFiltro) return false;
      if (!consulta) return true;
      return (
        (placaConsulta !== "" && v.placa.includes(placaConsulta)) ||
        [v.marca, v.modelo, v.empresaNome, v.condutorAtual, v.motoristaNome, v.motoristaInformado].some(
          (campo) => campo?.toLowerCase().includes(textoConsulta),
        )
      );
    });
    if (!ordenarPorVencimento) return filtrados;
    return [...filtrados].sort((a, b) => {
      const ta = a.financeiro.vencimentoTs;
      const tb = b.financeiro.vencimentoTs;
      if (ta != null && tb != null) return ta - tb;
      if (ta != null) return -1;
      if (tb != null) return 1;
      return a.placa.localeCompare(b.placa);
    });
  }, [veiculos, busca, empresaFiltro, financeiroFiltro, ordenarPorVencimento]);
  // UM painel por vez, discriminado pelo tipo — não três estados soltos. Com
  // `form` + duas flags, abrir "Novo veículo" com o painel de documento aberto
  // deixava a flag antiga de pé: o formulário de veículo não aparecia (a
  // condição de render exigia as flags limpas) e o botão parecia morto.
  const [painel, setPainel] = useState<
    | { tipo: "veiculo" }
    | { tipo: "documento"; veiculoId: string }
    | { tipo: "entrega"; veiculoId: string }
    | null
  >(null);
  const [form, setForm] = useState<Record<string, string>>({});
  // A exclusão NÃO entra no `painel`. Painel é formulário: abre embaixo da
  // tabela, e com 64 placas na tela a confirmação nasceria fora da dobra —
  // confirmação que não se vê é confirmação que não confirma nada. Vai de
  // diálogo, como toda exclusão do resto do sistema.
  const [aExcluir, setAExcluir] = useState<VeiculoNaTela | null>(null);

  // O veículo do painel aberto — resolvido do id, para o painel de documentos
  // receber a lista já pronta em vez de buscar de novo.
  const veiculoDoPainel = useMemo(
    () => (painel && "veiculoId" in painel ? veiculos.find((v) => v.id === painel.veiculoId) : undefined),
    [painel, veiculos],
  );

  function campo(nome: string) {
    return {
      value: form[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [nome]: e.target.value })),
    };
  }

  function abrir(p: NonNullable<typeof painel>, valores: Record<string, string>) {
    setPainel(p);
    setForm(valores);
    setErro(null);
  }

  function fechar() {
    setPainel(null);
    setForm({});
    setErro(null);
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await salvarVeiculo({
        id: form.id || null,
        empresaId,
        placa: form.placa ?? "",
        renavam: form.renavam ?? null,
        marca: form.marca ?? null,
        modelo: form.modelo ?? null,
        anoModelo: form.anoModelo ? Number(form.anoModelo) : null,
        anoFab: form.anoFab ? Number(form.anoFab) : null,
        chassi: form.chassi ?? null,
        hodometroAtual: form.hodometroAtual ? Number(form.hodometroAtual) : null,
        // Com vírgula é escrita pt-BR ("45.900,00": ponto de milhar); sem
        // vírgula, o ponto é decimal ("45900.50"). Cobrir os dois evita que
        // 45900.50 vire 4590050 por remoção cega de pontos.
        valorFipe: form.valorFipe
          ? (form.valorFipe.includes(",")
              ? Number(form.valorFipe.replace(/\./g, "").replace(",", "."))
              : Number(form.valorFipe)) || null
          : null,
        ufEmplacamento: form.ufEmplacamento ?? null,
        propriedade: form.propriedade || "PROPRIO",
        motorizacao: form.motorizacao || "COMBUSTAO",
        situacao: form.situacao || "ATIVO",
        aderidoSne: form.aderidoSne === "sim",
        dataAdesaoSne: form.dataAdesaoSne ?? null,
        cidadeBase: form.cidadeBase ?? null,
        setor: form.setor ?? null,
        emplacado: form.emplacado === "sim",
        motoristaInformado: form.motoristaInformado ?? null,
        motoristaColaboradorId: form.motoristaColaboradorId || null,
        observacoes: form.observacoes ?? null,
        empresaDestinoId: form.empresaDestino || null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      fechar();
      router.refresh();
    });
  }

  function entregar(veiculoId: string) {
    if (!form.condutorId || !form.dataInicio) {
      setErro("Escolha o condutor e a data de entrega.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await abrirAlocacao({
        empresaId,
        veiculoId,
        condutorId: form.condutorId,
        dataInicio: form.dataInicio,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      fechar();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => abrir({ tipo: "veiculo" }, { propriedade: "PROPRIO", situacao: "ATIVO" })}>
          <Plus className="size-4" />
          Novo veículo
        </Button>
      </div>

      {painel?.tipo === "veiculo" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{form.id ? "Editar veículo" : "Novo veículo"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Placa
              <input {...campo("placa")} className={CAMPO} placeholder="ABC1D23" />
            </label>
            <label className="text-xs text-muted-foreground">
              Marca
              <input {...campo("marca")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Modelo
              <input {...campo("modelo")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Ano do modelo
              <input {...campo("anoModelo")} className={CAMPO} inputMode="numeric" />
            </label>
            <label className="text-xs text-muted-foreground">
              Ano de fabricação
              <input {...campo("anoFab")} className={CAMPO} inputMode="numeric" />
            </label>
            <label className="text-xs text-muted-foreground">
              Renavam
              <input {...campo("renavam")} className={CAMPO} inputMode="numeric" />
            </label>
            <label className="text-xs text-muted-foreground">
              Chassi
              <input {...campo("chassi")} className={CAMPO} maxLength={17} />
            </label>
            <label className="text-xs text-muted-foreground">
              Quilometragem (km)
              <input {...campo("hodometroAtual")} className={CAMPO} inputMode="numeric" />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor tabela FIPE (R$)
              <input {...campo("valorFipe")} className={CAMPO} inputMode="decimal" placeholder="45.900,00" />
            </label>
            <label className="text-xs text-muted-foreground">
              Cidade-base
              <input {...campo("cidadeBase")} className={CAMPO} placeholder="Guarabira" />
            </label>
            <label className="text-xs text-muted-foreground">
              Setor
              <input {...campo("setor")} className={CAMPO} placeholder="TECNICA" />
            </label>
            <label className="text-xs text-muted-foreground">
              Emplacado?
              <select {...campo("emplacado")} className={CAMPO}>
                <option value="">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Motorista (do cadastro de colaboradores)
              <select {...campo("motoristaColaboradorId")} className={CAMPO}>
                <option value="">— sem motorista definido —</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                {form.motoristaInformado
                  ? `Texto legado da planilha: ${form.motoristaInformado} — escolher aqui substitui.`
                  : "Quem dirige o carro. O termo formal de alocação é na aba Condutores."}
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              UF de emplacamento
              <input {...campo("ufEmplacamento")} className={CAMPO} maxLength={2} placeholder="SP" />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Decide o calendário de licenciamento e de IPVA, que é estadual.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Propriedade
              <select {...campo("propriedade")} className={CAMPO}>
                {PROPRIEDADE_VEICULO.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Motorização
              <select {...campo("motorizacao")} className={CAMPO}>
                {MOTORIZACAO_VEICULO.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Decide se o consumo pede litros ou kWh.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Situação
              <select {...campo("situacao")} className={CAMPO}>
                {SITUACAO_VEICULO.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Aderido ao SNE?
              <select {...campo("aderidoSne")} className={CAMPO}>
                <option value="">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>
            {form.aderidoSne === "sim" && (
              <label className="text-xs text-muted-foreground">
                Data da adesão
                <input {...campo("dataAdesaoSne")} type="date" className={CAMPO} />
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  O desconto de 40% só vale se a adesão for anterior à notificação.
                </span>
              </label>
            )}
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Observações
              <textarea {...campo("observacoes")} rows={2} className={CAMPO} />
            </label>
            {form.id && (
              <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
                Empresa (CNPJ dono)
                <select {...campo("empresaDestino")} className={CAMPO}>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  Troque para tirar o veículo da empresa provisória &ldquo;A definir&rdquo; da importação.
                </span>
              </label>
            )}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={fechar}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {veiculos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Car className="mx-auto mb-2 size-5 opacity-50" />
            Nenhum veículo cadastrado ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0 pt-0">
            <div className="flex flex-wrap items-end gap-2 px-4 pt-4 pb-1">
              <div className="relative sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar placa, modelo ou motorista…"
                  className="pl-8"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <label className="text-xs text-muted-foreground">
                Empresa
                <select
                  className={CAMPO}
                  value={empresaFiltro}
                  onChange={(e) => setEmpresaFiltro(e.target.value)}
                >
                  <option value="">Todas</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Financeiro
                <select
                  className={CAMPO}
                  value={financeiroFiltro}
                  onChange={(e) => setFinanceiroFiltro(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="VENCIDO">🚨 Vencido</option>
                  <option value="PROXIMO">🟠 Próximo do vencimento</option>
                  <option value="EM_DIA">🟢 Em dia</option>
                  <option value="QUITADO">⚪ Quitado</option>
                  <option value="SEM_DADOS">➖ Não informado</option>
                </select>
              </label>
              {/* Contagem pedida em 31/08/2026 — acompanha os filtros. */}
              <span className="pb-2 text-xs text-muted-foreground">
                {veiculosFiltrados.length === veiculos.length
                  ? `${veiculos.length} veículo(s)`
                  : `${veiculosFiltrados.length} de ${veiculos.length} veículo(s)`}
              </span>
              {/* O CSV respeita o CNPJ escolhido AQUI; sem escolha, o filtro
                  do topo (`?empresas=`) — relatório por empresa, como pedido. */}
              <a
                className="mb-1 ml-auto inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
                href={`/api/processos/${empresaId}/frota/relatorio/csv${
                  empresaFiltro
                    ? `?empresas=${empresaFiltro}`
                    : empresasParam
                      ? `?empresas=${encodeURIComponent(empresasParam)}`
                      : ""
                }`}
                download
              >
                Relatório (CSV)
              </a>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Com quem está</TableHead>
                  <TableHead>Próximo vencimento</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      title="Ordenar pelo vencimento financeiro (vencidos primeiro, sem registro no fim)"
                      onClick={() => setOrdenarPorVencimento((o) => !o)}
                    >
                      Financeiro{ordenarPorVencimento ? " ↑" : ""}
                    </button>
                  </TableHead>
                  <TableHead>SNE</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {veiculosFiltrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum veículo encontrado para &ldquo;{busca}&rdquo;.
                    </TableCell>
                  </TableRow>
                )}
                {veiculosFiltrados.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium tabular-nums">{formatarPlaca(v.placa)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                      {v.anoModelo ? ` · ${v.anoModelo}` : ""}
                      {v.situacao !== "ATIVO" && (
                        <Badge variant="outline" className="ml-2 font-normal">
                          {rotulo(SITUACAO_VEICULO, v.situacao)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.empresaNome}</TableCell>
                    <TableCell>
                      {/* Três degraus — pedido do RH em 31/08/2026: quem tem
                          motorista no CADASTRO não pode aparecer como "ninguém".
                          A alocação formal (com termo) continua sendo o que vale
                          para a indicação de multa; o nome do cadastro entra
                          como resposta de "com quem está", com o aviso do que
                          falta formalizar. */}
                      {v.condutorAtual ??
                        (v.motoristaNome ? (
                          <span>
                            {v.motoristaNome}
                            <span className="block text-[11px] text-muted-foreground">
                              do cadastro — formalize a alocação para a indicação de multa
                            </span>
                          </span>
                        ) : v.motoristaInformado ? (
                          <span>
                            {v.motoristaInformado}
                            <span className="block text-[11px] text-muted-foreground">
                              texto legado — vincule ao cadastro na edição do veículo
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-500">
                            sem motorista definido — a multa não terá a quem indicar
                          </span>
                        ))}
                    </TableCell>
                    <TableCell>
                      {v.vencimentoMaisProximo ? (
                        <span
                          className={cn(
                            "text-sm tabular-nums",
                            v.vencimentoMaisProximo.dias < 0 && "font-semibold text-destructive",
                            v.vencimentoMaisProximo.dias >= 0 &&
                              v.vencimentoMaisProximo.dias <= 30 &&
                              "text-amber-600 dark:text-amber-500",
                          )}
                        >
                          {rotulo(TIPOS_DOCUMENTO_VEICULO, v.vencimentoMaisProximo.tipo)} ·{" "}
                          {v.vencimentoMaisProximo.texto}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem documento registrado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.financeiro.status === "SEM_DADOS" ? (
                        <Link
                          href={`/processos/${empresaId}/frota/financeiro`}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          ➖ Não informado — cadastrar
                        </Link>
                      ) : (
                        <span
                          className={cn(
                            "text-xs",
                            v.financeiro.status === "VENCIDO" && "font-semibold text-destructive",
                            v.financeiro.status === "PROXIMO" && "text-amber-600 dark:text-amber-500",
                            v.financeiro.status === "EM_DIA" && "text-emerald-700 dark:text-emerald-500",
                            (v.financeiro.status === "QUITADO" ||
                              v.financeiro.status === "SUSPENSO" ||
                              v.financeiro.status === "SEM_COBRANCA") &&
                              "text-muted-foreground",
                          )}
                        >
                          {v.financeiro.rotulo}
                          {v.financeiro.vencimentoTexto && (
                            <span className="block tabular-nums text-muted-foreground">
                              {v.financeiro.vencimentoTexto}
                              {v.financeiro.dias != null &&
                                (v.financeiro.dias < 0
                                  ? ` · vencido há ${Math.abs(v.financeiro.dias)} dia(s)`
                                  : ` · vence em ${v.financeiro.dias} dia(s)`)}
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.aderidoSne ? (
                        <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-500" />
                      ) : (
                        <ShieldAlert className="size-4 text-amber-600 dark:text-amber-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Editar"
                          onClick={() =>
                            abrir({ tipo: "veiculo" }, {
                              id: v.id,
                              placa: v.placa,
                              renavam: v.renavam ?? "",
                              marca: v.marca ?? "",
                              modelo: v.modelo ?? "",
                              anoModelo: v.anoModelo ? String(v.anoModelo) : "",
                              anoFab: v.anoFab ? String(v.anoFab) : "",
                              chassi: v.chassi ?? "",
                              hodometroAtual: v.hodometroAtual ? String(v.hodometroAtual) : "",
                              valorFipe: v.valorFipe
                                ? v.valorFipe.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                                : "",
                              ufEmplacamento: v.ufEmplacamento ?? "",
                              propriedade: v.propriedade,
                              motorizacao: v.motorizacao,
                              situacao: v.situacao,
                              aderidoSne: v.aderidoSne ? "sim" : "",
                              dataAdesaoSne: v.dataAdesaoSneInput,
                              cidadeBase: v.cidadeBase ?? "",
                              setor: v.setor ?? "",
                              emplacado: v.emplacado ? "sim" : "",
                              motoristaInformado: v.motoristaInformado ?? "",
                              motoristaColaboradorId: v.motoristaColaboradorId ?? "",
                              empresaDestino: v.empresaId,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => abrir({ tipo: "documento", veiculoId: v.id }, {})}>
                          Documento
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => abrir({ tipo: "entrega", veiculoId: v.id }, {})}>
                          Entregar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Excluir veículo"
                          onClick={() => setAExcluir(v)}
                        >
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {aExcluir && (
        <DialogoExcluirVeiculo
          empresaId={empresaId}
          veiculo={aExcluir}
          onFechar={() => setAExcluir(null)}
          onExcluido={() => {
            setAExcluir(null);
            router.refresh();
          }}
        />
      )}

      {painel?.tipo === "documento" && veiculoDoPainel && (
        <PainelDocumentos
          empresaId={empresaId}
          veiculo={veiculoDoPainel}
          onFechar={fechar}
          onSalvo={() => router.refresh()}
        />
      )}

      {painel?.tipo === "entrega" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Entregar o veículo a um condutor</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Condutor
              <select {...campo("condutorId")} className={CAMPO}>
                <option value="">Escolha…</option>
                {condutores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              A partir de
              <input {...campo("dataInicio")} type="date" className={CAMPO} />
            </label>
            <div className="flex items-end gap-2">
              <Button size="sm" disabled={pendente} onClick={() => entregar(painel.veiculoId)}>Entregar</Button>
              <Button size="sm" variant="ghost" onClick={fechar}>Cancelar</Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              É este registro que, meses depois, responde quem estava com a placa no dia da
              infração — e permite indicar o condutor sem a assinatura dele. A entrega anterior é
              encerrada automaticamente: dois condutores em posse ao mesmo tempo tornaria a
              resposta ambígua justamente quando ela precisa ser inequívoca.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Confirmação de exclusão de veículo — um clique, em todos os casos.
 *
 * A versão anterior pedia a placa redigitada quando o veículo tinha histórico.
 * O CEO decidiu em 27/08/2026 que o "tem certeza?" basta sempre. Não repor o
 * campo sem falar com ele.
 *
 * O que o diálogo mantém é a LISTA do que some antes do clique. "Isto apagará
 * dados relacionados" não informa nada; "3 infrações, 2 entregas a condutor"
 * informa — e informar era a metade útil da tela, não o campo de digitação.
 */
function DialogoExcluirVeiculo({
  empresaId,
  veiculo,
  onFechar,
  onExcluido,
}: {
  empresaId: string;
  veiculo: VeiculoNaTela;
  onFechar: () => void;
  onExcluido: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const vinculos = useMemo(
    () =>
      [
        { n: veiculo.historico.infracoes, um: "infração", varios: "infrações" },
        { n: veiculo.historico.alocacoes, um: "entrega a condutor", varios: "entregas a condutor" },
        { n: veiculo.historico.documentos, um: "documento", varios: "documentos" },
        { n: veiculo.historico.manutencoes, um: "manutenção", varios: "manutenções" },
        { n: veiculo.historico.consumos, um: "abastecimento", varios: "abastecimentos" },
        { n: veiculo.historico.transferencias, um: "transferência", varios: "transferências" },
      ].filter((v) => v.n > 0),
    [veiculo],
  );
  const temHistorico = vinculos.length > 0;

  function excluir() {
    setErro(null);
    iniciar(async () => {
      const r = await excluirVeiculo({ empresaId, id: veiculo.id });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      onExcluido();
    });
  }

  const descricao = [veiculo.marca, veiculo.modelo].filter(Boolean).join(" ");

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tem certeza que deseja excluir este veículo?</DialogTitle>
          <DialogDescription>
            A exclusão é definitiva — o cadastro não volta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">{formatarPlaca(veiculo.placa)}</p>
            <p className="text-muted-foreground">
              {descricao || "sem marca/modelo"} · {veiculo.empresaNome}
            </p>
          </div>

          {temHistorico ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <p className="font-medium">Este veículo tem histórico, e ele será apagado junto:</p>
              <ul className="list-inside list-disc">
                {vinculos.map((v) => (
                  <li key={v.um}>
                    {v.n} {v.n === 1 ? v.um : v.varios}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este cadastro não tem infração, entrega, documento, manutenção, abastecimento nem
              transferência — nada mais é apagado junto.
            </p>
          )}

          {erro && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={pendente} onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={pendente} onClick={excluir}>
            {pendente ? "Excluindo…" : "Excluir veículo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O painel "Documento" do veículo — a papelada do carro num lugar só.
 *
 * Pedido do RH em 27/08/2026: além da data de vencimento (que já existia e é
 * quem alimenta o alerta), poder ANEXAR o arquivo — CRLV, licenciamento,
 * apólice, laudo — e depois ver, substituir ou excluir.
 *
 * Componente próprio, e não mais um bloco no formulário de cima, por um motivo
 * concreto: `<input type="file">` não vive em estado controlado do React (o
 * `campo()` da tela é controlled), então este painel é um `<form>` de verdade
 * com `useActionState` — o mesmo padrão do dossiê do colaborador.
 */
function PainelDocumentos({
  empresaId,
  veiculo,
  onFechar,
  onSalvo,
}: {
  empresaId: string;
  veiculo: VeiculoNaTela;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  // null = formulário em modo "adicionar"; documento = modo "editar/substituir".
  const [editando, setEditando] = useState<DocumentoNaTela | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [excluindo, iniciarExclusao] = useTransition();

  const [estado, enviar, enviando] = useActionState(
    async (_prev: ActionResult, fd: FormData) => {
      const r = await salvarDocumentoVeiculo(_prev, fd);
      if (r.ok) {
        setEditando(null);
        onSalvo();
      }
      return r;
    },
    { ok: true } as ActionResult,
  );

  function excluir(doc: DocumentoNaTela) {
    setErroExclusao(null);
    iniciarExclusao(async () => {
      const r = await excluirDocumentoVeiculo({ empresaId, id: doc.id });
      if (!r.ok) {
        setErroExclusao(r.error);
        return;
      }
      if (editando?.id === doc.id) setEditando(null);
      onSalvo();
    });
  }

  const maximoMb = (TAMANHO_MAXIMO_ANEXO / 1024 / 1024).toFixed(0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Documentos de {formatarPlaca(veiculo.placa)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {veiculo.documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum documento cadastrado ainda. Anexe o CRLV-e ou o licenciamento com a data de
            vencimento — é ela que faz o sistema cobrar a renovação na Central de Pendências.
          </p>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {veiculo.documentos.map((d) => (
                  <TableRow key={d.id} className={cn(editando?.id === d.id && "bg-primary/5")}>
                    <TableCell className="font-medium">
                      {rotulo(TIPOS_DOCUMENTO_VEICULO, d.tipo)}
                      {d.exercicio && (
                        <span className="ml-1 font-normal text-muted-foreground">{d.exercicio}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.vencimentoTexto ? (
                        <span className={cn(d.vencido && "font-semibold text-destructive")}>
                          {d.vencimentoTexto}
                          {d.vencido && " · vencido"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem vencimento</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.arquivo ? (
                        <div className="flex items-center gap-1.5">
                          {/* Abre na aba (inline); o ?download=1 força salvar. A
                              rota valida sessão, empresa e módulo, e registra
                              na auditoria quem baixou. */}
                          <a
                            href={`/api/processos/${empresaId}/arquivos/${d.arquivo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm underline underline-offset-2 hover:text-foreground"
                          >
                            <FileText className="size-3.5 shrink-0" />
                            <span className="max-w-40 truncate">{d.arquivo.nome}</span>
                          </a>
                          <span className="text-[11px] text-muted-foreground">
                            {formatarTamanho(d.arquivo.tamanhoBytes)}
                          </span>
                          <a
                            href={`/api/processos/${empresaId}/arquivos/${d.arquivo.id}?download=1`}
                            title="Baixar"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Download className="size-3.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem anexo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title={d.arquivo ? "Editar / substituir o arquivo" : "Editar / anexar arquivo"}
                          onClick={() => setEditando(d)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Excluir documento (e o anexo)"
                          disabled={excluindo}
                          onClick={() => excluir(d)}
                        >
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {erroExclusao && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {erroExclusao}
          </p>
        )}

        {/* `key` no form: trocar de documento (ou voltar para "adicionar")
            remonta os campos com os defaultValue certos — sem isso o React
            reaproveita os inputs e mantém o valor do documento anterior. */}
        <form key={editando?.id ?? "novo"} action={enviar} className="space-y-3 border-t border-border/70 pt-4">
          <p className="text-sm font-medium">
            {editando
              ? `Editar ${rotulo(TIPOS_DOCUMENTO_VEICULO, editando.tipo)}`
              : "Adicionar documento"}
          </p>

          <input type="hidden" name="empresaId" value={empresaId} />
          <input type="hidden" name="veiculoId" value={veiculo.id} />
          {editando && <input type="hidden" name="id" value={editando.id} />}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Tipo
              <select name="tipo" defaultValue={editando?.tipo ?? ""} required className={CAMPO}>
                <option value="">Escolha…</option>
                {TIPOS_DOCUMENTO_VEICULO.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Exercício
              <input
                name="exercicio"
                defaultValue={editando?.exercicio ?? ""}
                className={CAMPO}
                inputMode="numeric"
                placeholder="2026"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Emitido em
              <input
                name="dataEmissao"
                type="date"
                defaultValue={editando?.dataEmissaoInput ?? ""}
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Vence em
              <input
                name="dataVencimento"
                type="date"
                defaultValue={editando?.dataVencimentoInput ?? ""}
                className={CAMPO}
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                É esta data que vira alerta.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Valor (R$)
              <input
                name="valor"
                type="number"
                step="0.01"
                defaultValue={editando?.valor ?? ""}
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Arquivo (PDF ou foto, até {maximoMb} MB)
              <input
                name="arquivo"
                type="file"
                accept={MIMES_ANEXO_ACEITOS.join(",")}
                className={cn(CAMPO, "file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-xs")}
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                {editando?.arquivo
                  ? `Já tem "${editando.arquivo.nome}" — escolher um arquivo aqui SUBSTITUI o atual; deixar em branco mantém.`
                  : "Opcional: dá para cadastrar só a data agora e anexar o arquivo depois."}
              </span>
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Observações
              <input
                name="observacoes"
                defaultValue={editando?.observacoes ?? ""}
                className={CAMPO}
                maxLength={500}
              />
            </label>
          </div>

          {!estado.ok && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {estado.error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enviando} className="gap-1.5">
              <Paperclip className="size-4" />
              {enviando ? "Salvando..." : editando ? "Salvar alterações" : "Adicionar documento"}
            </Button>
            {editando && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(null)}>
                Cancelar edição
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
