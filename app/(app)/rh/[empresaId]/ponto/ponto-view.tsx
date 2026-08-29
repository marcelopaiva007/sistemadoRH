"use client";

import { useState } from "react";
import { Download, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatarData } from "@/lib/datas";

function formatarHora(data: Date): string {
  return new Date(data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type Ponto = {
  id: string;
  tipo: string;
  dataHora: Date;
  dentro_janela: boolean;
  localizacao: string | null;
  colaborador: {
    id: string;
    nome: string;
    setor: { nome: string };
  };
};

type Colaborador = {
  id: string;
  nome: string;
};

type Config = {
  minutosAntecipacao: number;
  minutosTolerancia: number;
} | null;

export function PontoView({
  pontos: pontosInicial,
  colaboradores,
  config,
}: {
  pontos: Ponto[];
  colaboradores: Colaborador[];
  config: Config;
}) {
  const [pontos] = useState(pontosInicial);
  const [filtroColaborador, setFiltroColaborador] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"" | "ENTRADA" | "SAÍDA">("");
  const [filtroData, setFiltroData] = useState("");

  const pontosFiltrados = pontos.filter((p) => {
    if (filtroColaborador && p.colaborador.id !== filtroColaborador) return false;
    if (filtroTipo && p.tipo !== filtroTipo) return false;
    if (filtroData) {
      const dataPonto = new Date(p.dataHora).toISOString().split("T")[0];
      if (dataPonto !== filtroData) return false;
    }
    return true;
  });

  function exportarCSV() {
    // Neutraliza injeção de fórmula (DDE) e escapa aspas: um campo controlável
    // pelo colaborador (nome, setor) iniciado por = + - @ viraria fórmula ao
    // abrir o CSV no Excel. Mesma proteção do helper de servidor (lib/csv.ts).
    const celula = (valor: string) => {
      const s = String(valor ?? "");
      const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${seguro.replace(/"/g, '""')}"`;
    };
    const csv = [
      ["Data", "Hora", "Colaborador", "Setor", "Tipo", "Localização", "Status"],
      ...pontosFiltrados.map((p) => [
        formatarData(p.dataHora),
        formatarHora(p.dataHora),
        p.colaborador.nome,
        p.colaborador.setor.nome,
        p.tipo,
        p.localizacao || "—",
        p.dentro_janela ? "No horário" : "Fora da janela",
      ]),
    ]
      .map((row) => row.map(celula).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponto_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Ponto</h2>
        <p className="text-sm text-muted-foreground">
          Registros de entrada e saída dos colaboradores com localização e foto.
        </p>
      </div>

      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
        <CardHeader>
          <CardTitle className="text-base text-green-900 dark:text-green-100">
            Como funciona o fluxo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-green-800 dark:text-green-200">
          <div>
            <strong>1. RH define escalas:</strong> Acesse{" "}
            <em>Departamento Pessoal → Escalas</em> e atribua os turnos/horários para cada
            colaborador por dia.
          </div>
          <div>
            <strong>2. RH configura tolerância:</strong> (Opcional) Clique em &quot;Configuração&quot;
            para ajustar janela de ponto antes/depois do horário (padrão: ±60min).
          </div>
          <div>
            <strong>3. Colaborador bate ponto:</strong> No portal, aba &quot;Ponto&quot;, clica
            &quot;Entrada&quot;/&quot;Saída&quot;, captura selfie e autoriza localização.
          </div>
          <div>
            <strong>4. RH valida:</strong> Visualiza aqui todos os pontos, vê quem bateu fora
            da janela (⚠) e exporta para folha/relatório.
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Colaborador</label>
            <select
              value={filtroColaborador}
              onChange={(e) => setFiltroColaborador(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Todos</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <select
              value={filtroTipo}
              onChange={(e) => {
                const valor = e.target.value;
                if (valor === "" || valor === "ENTRADA" || valor === "SAÍDA") {
                  setFiltroTipo(valor as typeof filtroTipo);
                }
              }}
              className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Todas</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SAÍDA">Saída</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Data</label>
            <Input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={exportarCSV} variant="outline" size="sm">
            <Download className="mr-2 size-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Settings className="mr-2 size-4" />
            Configuração
          </Button>
        </div>
      </div>

      {config && (
        <Card className="bg-blue-50 dark:bg-blue-950">
          <CardContent className="pt-6 text-sm">
            <p>
              <strong>Janela de ponto:</strong> ±{config.minutosAntecipacao}min antes e +
              {config.minutosTolerancia}min depois do horário de trabalho
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {pontosFiltrados.length} ponto{pontosFiltrados.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pontosFiltrados.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Nenhum registro de ponto encontrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium">Data/Hora</th>
                    <th className="px-3 py-2 text-left font-medium">Colaborador</th>
                    <th className="px-3 py-2 text-left font-medium">Setor</th>
                    <th className="px-3 py-2 text-center font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Localização</th>
                    <th className="px-3 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pontosFiltrados.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{formatarData(p.dataHora)}</div>
                        <div className="text-xs text-muted-foreground">{formatarHora(p.dataHora)}</div>
                      </td>
                      <td className="px-3 py-2">{p.colaborador.nome}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {p.colaborador.setor.nome}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={p.tipo === "ENTRADA" ? "default" : "secondary"}>
                          {p.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {p.localizacao ? (
                          <a
                            href={`https://maps.google.com/?q=${p.localizacao}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Ver no mapa
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={p.dentro_janela ? "default" : "secondary"}>
                          {p.dentro_janela ? "✓ No horário" : "⚠ Fora"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
