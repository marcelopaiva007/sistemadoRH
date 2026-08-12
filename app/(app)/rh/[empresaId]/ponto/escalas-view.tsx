"use client";

import { useState } from "react";
import { ShieldCheck, Plus, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { criarJornadaTrabalho } from "@/app/actions/rh-ponto";

export type JornadaItem = {
  id: string;
  nome: string;
  entrada1: string;
  saida1: string;
  entrada2?: string | null;
  saida2?: string | null;
  cargaDiariaMin: number;
  toleranciaMin: number;
};

export function EscalasView({ empresaId, jornadas }: { empresaId: string; jornadas: JornadaItem[] }) {
  const [modalAberta, setModalAberta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [entrada1, setEntrada1] = useState("08:00");
  const [saida1, setSaida1] = useState("12:00");
  const [entrada2, setEntrada2] = useState("13:00");
  const [saida2, setSaida2] = useState("17:00");

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro(null);

    const res = await criarJornadaTrabalho({
      empresaId,
      nome,
      entrada1,
      saida1,
      entrada2,
      saida2,
    });

    if (res.erro) {
      setErro(res.erro);
    } else {
      setModalAberta(false);
      setNome("");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Jornadas & Escalas de Trabalho</h2>
          <p className="text-xs text-muted-foreground">Cadastre horários contratuais e tolerâncias CLT para apuração de horas.</p>
        </div>
        <Button size="sm" onClick={() => setModalAberta(true)} className="gap-1 text-xs">
          <Plus className="w-4 h-4" /> Nova Escala / Jornada
        </Button>
      </div>

      {modalAberta && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Cadastrar Horário Contratual</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvar} className="space-y-3">
              {erro && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{erro}</div>}
              <div>
                <Label className="text-xs">Nome da Escala / Turno</Label>
                <Input
                  placeholder="Ex: Comercial 8h (08:00 as 17:00 com 1h almoco)"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">1ª Entrada</Label>
                  <Input type="time" value={entrada1} onChange={(e) => setEntrada1(e.target.value)} className="h-8 text-xs mt-1" required />
                </div>
                <div>
                  <Label className="text-xs">1ª Saída (Almoço)</Label>
                  <Input type="time" value={saida1} onChange={(e) => setSaida1(e.target.value)} className="h-8 text-xs mt-1" required />
                </div>
                <div>
                  <Label className="text-xs">2ª Entrada (Retorno)</Label>
                  <Input type="time" value={entrada2} onChange={(e) => setEntrada2(e.target.value)} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-xs">2ª Saída (Fim)</Label>
                  <Input type="time" value={saida2} onChange={(e) => setSaida2(e.target.value)} className="h-8 text-xs mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setModalAberta(false)} className="text-xs">
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={loading} className="text-xs">
                  {loading ? "Salvando..." : "Salvar Jornada"}
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
            <Card key={j.id} className="p-4 border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{j.nome}</span>
                <Badge variant="secondary" className="text-[10px]">Tolerância CLT: {j.toleranciaMin}m/dia</Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 font-mono">
                <div>Turno 1: {j.entrada1} às {j.saida1}</div>
                {j.entrada2 && <div>Turno 2: {j.entrada2} às {j.saida2}</div>}
              </div>
              <div className="text-[11px] text-muted-foreground pt-1 border-t flex items-center justify-between">
                <span>Carga diária: {Math.floor(j.cargaDiariaMin / 60)}h {j.cargaDiariaMin % 60}m</span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Ativa
                </span>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
