"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle2, Pencil, PowerOff, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  alternarJornadaAtiva,
  criarJornadaTrabalho,
  editarJornadaTrabalho,
} from "@/app/actions/rh-ponto";

export type JornadaItem = {
  id: string;
  nome: string;
  entrada1: string;
  saida1: string;
  entrada2?: string | null;
  saida2?: string | null;
  cargaDiariaMin: number;
  toleranciaMin: number;
  sabadoUtil: boolean;
  domingoUtil: boolean;
  ativo: boolean;
};

// O formulário serve para CRIAR e para EDITAR (pedido do RH de 21/08/2026:
// jornada salva não podia mais ser alterada — a única saída era excluir e
// recriar, e nem excluir existia). `editandoId` decide qual action salva.
type FormJornada = {
  nome: string;
  entrada1: string;
  saida1: string;
  entrada2: string;
  saida2: string;
  cargaHoras: string;
  toleranciaMin: string;
  sabadoUtil: boolean;
  domingoUtil: boolean;
};

const FORM_VAZIO: FormJornada = {
  nome: "",
  entrada1: "08:00",
  saida1: "12:00",
  entrada2: "13:00",
  saida2: "17:00",
  cargaHoras: "8",
  toleranciaMin: "10",
  sabadoUtil: false,
  domingoUtil: false,
};

export function EscalasView({ empresaId, jornadas }: { empresaId: string; jornadas: JornadaItem[] }) {
  const router = useRouter();
  const [modalAberta, setModalAberta] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<FormJornada>(FORM_VAZIO);

  const campo = <K extends keyof FormJornada>(k: K, v: FormJornada[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const abrirParaCriar = () => {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setErro(null);
    setModalAberta(true);
  };

  const abrirParaEditar = (j: JornadaItem) => {
    setForm({
      nome: j.nome,
      entrada1: j.entrada1,
      saida1: j.saida1,
      entrada2: j.entrada2 ?? "",
      saida2: j.saida2 ?? "",
      // Horas com vírgula ou ponto — String(7.5) = "7.5", e o parser de volta
      // aceita os dois. Inteiro fica sem casa decimal ("8").
      cargaHoras: String(j.cargaDiariaMin / 60),
      toleranciaMin: String(j.toleranciaMin),
      sabadoUtil: j.sabadoUtil,
      domingoUtil: j.domingoUtil,
    });
    setEditandoId(j.id);
    setErro(null);
    setModalAberta(true);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();

    const horas = Number(String(form.cargaHoras).trim().replace(",", "."));
    if (!Number.isFinite(horas)) {
      setErro("Informe a carga diária em horas (ex.: 8 ou 7,5).");
      return;
    }

    setLoading(true);
    setErro(null);

    const dados = {
      empresaId,
      nome: form.nome,
      entrada1: form.entrada1,
      saida1: form.saida1,
      entrada2: form.entrada2,
      saida2: form.saida2,
      cargaDiariaMin: Math.round(horas * 60),
      toleranciaMin: Math.trunc(Number(form.toleranciaMin)),
      sabadoUtil: form.sabadoUtil,
      domingoUtil: form.domingoUtil,
    };

    // try/finally: sem ele, uma exceção na action deixaria o botão preso em
    // "Salvando..." — mesmo defeito já corrigido na aba Tratamento.
    try {
      if (editandoId) {
        const res = await editarJornadaTrabalho({ ...dados, jornadaId: editandoId });
        if (!res.ok) {
          setErro(res.error);
          return;
        }
      } else {
        const res = await criarJornadaTrabalho(dados);
        if (res.erro) {
          setErro(res.erro);
          return;
        }
      }
      setModalAberta(false);
      setEditandoId(null);
      setForm(FORM_VAZIO);
      // Sem o refresh a lista continuava com as props antigas e a jornada
      // criada/alterada só aparecia depois de F5 — o revalidatePath da action
      // limpa o cache do servidor, mas este componente é cliente (mesma causa
      // do defeito da ficha corrigido em v1.63.6).
      router.refresh();
    } catch {
      setErro("Não foi possível salvar agora. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Jornadas & Escalas de Trabalho</h2>
          <p className="text-xs text-muted-foreground">Cadastre horários contratuais e tolerâncias CLT para apuração de horas.</p>
        </div>
        <Button size="sm" onClick={abrirParaCriar} className="gap-1 text-xs">
          <Plus className="w-4 h-4" /> Nova Escala / Jornada
        </Button>
      </div>

      {modalAberta && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              {editandoId ? "Editar Horário Contratual" : "Cadastrar Horário Contratual"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvar} className="space-y-3">
              {erro && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{erro}</div>}
              <div>
                <Label className="text-xs">Nome da Escala / Turno</Label>
                <Input
                  placeholder="Ex: Comercial 8h (08:00 as 17:00 com 1h almoco)"
                  value={form.nome}
                  onChange={(e) => campo("nome", e.target.value)}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">1ª Entrada</Label>
                  <Input type="time" value={form.entrada1} onChange={(e) => campo("entrada1", e.target.value)} className="h-8 text-xs mt-1" required />
                </div>
                <div>
                  <Label className="text-xs">1ª Saída (Almoço)</Label>
                  <Input type="time" value={form.saida1} onChange={(e) => campo("saida1", e.target.value)} className="h-8 text-xs mt-1" required />
                </div>
                <div>
                  <Label className="text-xs">2ª Entrada (Retorno)</Label>
                  <Input type="time" value={form.entrada2} onChange={(e) => campo("entrada2", e.target.value)} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-xs">2ª Saída (Fim)</Label>
                  <Input type="time" value={form.saida2} onChange={(e) => campo("saida2", e.target.value)} className="h-8 text-xs mt-1" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Turno único (sem intervalo)? Deixe a 2ª entrada e a 2ª saída vazias.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Carga diária (horas)</Label>
                  {/* step="any", não "0.5": jornada CLT de 44h/6 dias é
                      7h20/dia = 7,33h, e com step de meia hora o navegador
                      bloqueava o submit — o RH acabaria gravando 7,5h e a
                      apuração cobraria 10 min a menos de extra por dia. */}
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    step="any"
                    value={form.cargaHoras}
                    onChange={(e) => campo("cargaHoras", e.target.value)}
                    className="h-8 text-xs mt-1 tabular-nums"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Tolerância (min/dia)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={1}
                    value={form.toleranciaMin}
                    onChange={(e) => campo("toleranciaMin", e.target.value)}
                    className="h-8 text-xs mt-1 tabular-nums"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Máx. 10 — Art. 58 § 1º CLT.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={form.sabadoUtil} onCheckedChange={(v) => campo("sabadoUtil", v === true)} />
                  Sábado é dia útil
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={form.domingoUtil} onCheckedChange={(v) => campo("domingoUtil", v === true)} />
                  Domingo é dia útil
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setModalAberta(false);
                    setEditandoId(null);
                    setErro(null);
                  }}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={loading} className="text-xs">
                  {loading ? "Salvando..." : editandoId ? "Salvar Alterações" : "Salvar Jornada"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {jornadas.length === 0 ? (
          <Card className="col-span-2 p-6 text-center text-xs text-muted-foreground">
            Nenhuma jornada cadastrada. Clique em &ldquo;Nova Escala / Jornada&rdquo; para cadastrar os horários padrão da empresa.
          </Card>
        ) : (
          jornadas.map((j) => (
            <CartaoJornada
              key={j.id}
              empresaId={empresaId}
              jornada={j}
              onEditar={() => abrirParaEditar(j)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Um cartão de jornada, com o estado do desativar/reativar DENTRO dele —
 * estado por linha, mesma forma de LinhaTratamento: erro e "..." de uma ação
 * aparecem no cartão clicado, não em todos.
 */
function CartaoJornada({
  empresaId,
  jornada: j,
  onEditar,
}: {
  empresaId: string;
  jornada: JornadaItem;
  onEditar: () => void;
}) {
  const router = useRouter();
  const [alternando, setAlternando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alternar = async () => {
    setAlternando(true);
    setErro(null);
    try {
      const res = await alternarJornadaAtiva(empresaId, j.id, !j.ativo);
      if (!res.ok) {
        setErro(res.error);
      }
      router.refresh();
    } catch {
      setErro("Não foi possível alterar agora. Tente de novo.");
    } finally {
      setAlternando(false);
    }
  };

  return (
    <Card className={`p-4 border space-y-2 ${j.ativo ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">{j.nome}</span>
        <Badge variant="secondary" className="text-[10px] shrink-0">Tolerância CLT: {j.toleranciaMin}m/dia</Badge>
      </div>
      <div className="text-xs text-muted-foreground space-y-1 font-mono">
        <div>Turno 1: {j.entrada1} às {j.saida1}</div>
        {j.entrada2 && <div>Turno 2: {j.entrada2} às {j.saida2}</div>}
      </div>
      <div className="text-[11px] text-muted-foreground pt-1 border-t flex items-center justify-between gap-2">
        <span>
          Carga diária: {Math.floor(j.cargaDiariaMin / 60)}h {j.cargaDiariaMin % 60}m
          {j.sabadoUtil || j.domingoUtil
            ? ` · inclui ${[j.sabadoUtil ? "sábado" : null, j.domingoUtil ? "domingo" : null].filter(Boolean).join(" e ")}`
            : ""}
        </span>
        {j.ativo ? (
          <span className="text-success flex items-center gap-1 font-medium shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Ativa
          </span>
        ) : (
          <span className="flex items-center gap-1 font-medium shrink-0">
            <PowerOff className="w-3 h-3" /> Inativa
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5 pt-1">
        {erro && <p className="mr-auto text-[11px] text-destructive">{erro}</p>}
        <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onEditar}>
          <Pencil className="w-3 h-3 mr-1" /> Editar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={alternando}
          onClick={alternar}
        >
          {alternando ? "..." : j.ativo ? (
            <><PowerOff className="w-3 h-3 mr-1" /> Desativar</>
          ) : (
            <><Power className="w-3 h-3 mr-1" /> Reativar</>
          )}
        </Button>
      </div>
    </Card>
  );
}
