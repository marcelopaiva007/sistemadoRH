"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, Plus, Pencil, Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salvarVeiculo, salvarDocumentoVeiculo, abrirAlocacao } from "@/lib/actions/processos-frota";
import {
  MOTORIZACAO_VEICULO,
  PROPRIEDADE_VEICULO,
  SITUACAO_VEICULO,
  TIPOS_DOCUMENTO_VEICULO,
  formatarPlaca,
  normalizarPlaca,
  rotulo,
} from "@/lib/processos/ctb";

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
  cidadeBase: string | null;
  setor: string | null;
  emplacado: boolean;
  motoristaInformado: string | null;
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
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function VeiculosView({
  empresaId,
  veiculos,
  condutores,
  empresas,
}: {
  empresaId: string;
  veiculos: VeiculoNaTela[];
  condutores: { id: string; nome: string }[];
  empresas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Busca pedida pelo RH em 27/08/2026 (Luana): com 64+ placas, achar uma no
  // olho não dá. A placa digitada passa pelo MESMO normalizador do cadastro
  // (maiúscula, sem hífen) — "klu-5g08" e "KLU5G08" acham o mesmo carro. O
  // campo também aceita modelo, empresa e motorista, minúsculas ou não.
  const [busca, setBusca] = useState("");
  const veiculosFiltrados = useMemo(() => {
    const consulta = busca.trim();
    if (!consulta) return veiculos;
    const placaConsulta = normalizarPlaca(consulta);
    const textoConsulta = consulta.toLowerCase();
    return veiculos.filter(
      (v) =>
        (placaConsulta !== "" && v.placa.includes(placaConsulta)) ||
        [v.marca, v.modelo, v.empresaNome, v.condutorAtual, v.motoristaInformado].some((campo) =>
          campo?.toLowerCase().includes(textoConsulta),
        ),
    );
  }, [veiculos, busca]);
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

  function salvarDoc(veiculoId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarDocumentoVeiculo({
        empresaId,
        veiculoId,
        tipo: form.tipo ?? "",
        exercicio: form.exercicio ? Number(form.exercicio) : null,
        dataVencimento: form.dataVencimento ?? null,
        valor: form.valor ? Number(form.valor) : null,
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
              Motorista (informado)
              <input {...campo("motoristaInformado")} className={CAMPO} placeholder="Nome (texto)" />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Só texto. Vincular ao condutor de verdade é na aba Condutores.
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
            <div className="px-4 pt-4 pb-1 sm:max-w-xs">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar placa, modelo ou motorista…"
                  className="pl-8"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Placa</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Com quem está</TableHead>
                  <TableHead>Próximo vencimento</TableHead>
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
                      {v.condutorAtual ?? (
                        <span className="text-xs text-amber-600 dark:text-amber-500">
                          ninguém — a multa não terá a quem indicar
                        </span>
                      )}
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {painel?.tipo === "documento" && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Novo documento do veículo</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Tipo
              <select {...campo("tipo")} className={CAMPO}>
                <option value="">Escolha…</option>
                {TIPOS_DOCUMENTO_VEICULO.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Exercício
              <input {...campo("exercicio")} className={CAMPO} inputMode="numeric" placeholder="2026" />
            </label>
            <label className="text-xs text-muted-foreground">
              Vence em
              <input {...campo("dataVencimento")} type="date" className={CAMPO} />
            </label>
            <div className="flex items-end gap-2">
              <Button size="sm" disabled={pendente} onClick={() => salvarDoc(painel.veiculoId)}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={fechar}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
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
