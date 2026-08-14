"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarLimiteEstagio } from "@/app/actions/rh-ponto";
import { TETO_LEGAL_ESTAGIO_MIN_DIA, TETO_LEGAL_ESTAGIO_MIN_SEMANA } from "@/lib/ponto-regras";

/**
 * Configurações de ponto da empresa — hoje só o teto de jornada do estagiário.
 *
 * POR QUE EM HORAS E NÃO EM MINUTOS. A coluna guarda minutos porque a apuração
 * trabalha em minutos, mas quem preenche pensa em "6 horas por dia". Pedir 360
 * aqui seria empurrar a unidade do banco para a tela.
 *
 * Os limites da lei aparecem escritos ao lado do campo, e não só na mensagem de
 * erro: quem está preenchendo precisa saber a régua ANTES de tentar, não depois
 * de levar uma recusa.
 */
export function ConfiguracoesPontoView({
  empresaId,
  minutosDia,
  minutosSemana,
}: {
  empresaId: string;
  minutosDia: number;
  minutosSemana: number;
}) {
  const router = useRouter();
  const [horasDia, setHorasDia] = useState(String(minutosDia / 60));
  const [horasSemana, setHorasSemana] = useState(String(minutosSemana / 60));
  const [salvando, setSalvando] = useState(false);

  const tetoDia = TETO_LEGAL_ESTAGIO_MIN_DIA / 60;
  const tetoSemana = TETO_LEGAL_ESTAGIO_MIN_SEMANA / 60;

  async function salvar() {
    const dia = Number(String(horasDia).replace(",", "."));
    const semana = Number(String(horasSemana).replace(",", "."));
    if (!Number.isFinite(dia) || !Number.isFinite(semana)) {
      toast.error("Informe as horas em número.");
      return;
    }

    setSalvando(true);
    const r = await salvarLimiteEstagio({
      empresaId,
      minutosDia: Math.round(dia * 60),
      minutosSemana: Math.round(semana * 60),
    });
    setSalvando(false);

    if (r.ok) {
      toast.success("Limite de estágio salvo.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Configurações do Ponto</h2>
        <p className="text-xs text-muted-foreground">
          Regras que valem para todos os colaboradores desta empresa.
        </p>
      </div>

      <Card className="border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GraduationCap className="size-4 text-muted-foreground" />
            Jornada do estagiário
          </CardTitle>
          <CardDescription className="text-xs">
            Vale só para quem tem contrato do tipo Estágio. Ao passar do limite, o sistema{" "}
            <strong>avisa e registra a marcação</strong> — não recusa. Recusar a saída deixaria o
            estagiário sem registro da hora em que foi embora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="horasDia">Horas por dia</Label>
              <Input
                id="horasDia"
                type="number"
                min={1}
                max={tetoDia}
                step="0.5"
                value={horasDia}
                onChange={(e) => setHorasDia(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Máximo de {tetoDia}h — teto da lei.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="horasSemana">Horas por semana</Label>
              <Input
                id="horasSemana"
                type="number"
                min={1}
                max={tetoSemana}
                step="1"
                value={horasSemana}
                onChange={(e) => setHorasSemana(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Máximo de {tetoSemana}h — teto da lei. A semana conta de segunda a domingo.
              </p>
            </div>
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            A <strong>Lei 11.788/2008, art. 10</strong> limita o estágio a {tetoDia} horas por dia e{" "}
            {tetoSemana} por semana (ensino superior, médio regular e educação profissional de nível
            médio). Você pode <strong>reduzir</strong> esses números como política da empresa —
            aumentar, não. Casos de educação especial e de anos finais do fundamental têm limite
            menor na lei (4h/20h) e hoje o sistema não os distingue: se houver algum no quadro, fale
            com a TI.
          </p>

          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
