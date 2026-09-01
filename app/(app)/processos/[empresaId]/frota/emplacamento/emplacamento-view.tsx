"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { Search } from "lucide-react";
import { formatarPlaca } from "@/lib/processos/ctb";
import {
  desfazerLicenciamentoEmDia,
  marcarLicenciamentoEmDia,
} from "@/lib/actions/processos-frota";
import {
  ROTULO_STATUS_LICENCIAMENTO,
  type StatusLicenciamento,
} from "@/lib/processos/licenciamento";

// A tela do Emplacamento. Os derivados vêm PRONTOS do servidor (final da
// placa, mês, semáforo, resumo) — aqui só se filtra, ordena e clica.

export type LinhaEmplacamento = {
  veiculoId: string;
  placa: string;
  modelo: string;
  empresaNome: string;
  final: number | null;
  ufEfetiva: string;
  ufAssumida: boolean;
  status: StatusLicenciamento;
  primeiraParcelaTexto: string | null;
  dataLimiteTexto: string | null;
  dataLimiteTs: number | null;
  dias: number | null;
  registradoPor: string | null;
  registradoEmTexto: string | null;
  registroTemArquivo: boolean;
};

export type ResumoEmplacamento = {
  total: number;
  emDia: number;
  vencidos: number;
  venceEmBreve: number;
  pendentes: number;
  naoEmplacados: number;
  semCalendario: number;
  tudoEmDia: boolean;
};

/** Badge do semáforo — cor + ícone + texto, nunca só a cor. */
function BadgeStatus({ status }: { status: StatusLicenciamento }) {
  const rotulo = ROTULO_STATUS_LICENCIAMENTO[status];
  if (status === "VENCIDO" || status === "NAO_EMPLACADO")
    return <Badge variant="destructive">{rotulo}</Badge>;
  if (status === "VENCE_EM_BREVE")
    return (
      <Badge className="border-transparent bg-amber-500 text-white hover:bg-amber-500 dark:bg-amber-600">
        {rotulo}
      </Badge>
    );
  if (status === "EM_DIA")
    return (
      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-700">
        {rotulo}
      </Badge>
    );
  return <Badge variant="secondary">{rotulo}</Badge>;
}

/** A ordem de quem precisa de atenção primeiro — vencido antes de tudo. */
const PESO_STATUS: Record<StatusLicenciamento, number> = {
  VENCIDO: 0,
  NAO_EMPLACADO: 1,
  VENCE_EM_BREVE: 2,
  PENDENTE: 3,
  SEM_CALENDARIO: 4,
  EM_DIA: 5,
};

const OPCOES_FILTRO: { value: StatusLicenciamento | ""; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "VENCIDO", label: "Vencidos" },
  { value: "NAO_EMPLACADO", label: "Não emplacados" },
  { value: "VENCE_EM_BREVE", label: "Vencendo em breve" },
  { value: "PENDENTE", label: "A pagar no ano" },
  { value: "SEM_CALENDARIO", label: "Sem calendário" },
  { value: "EM_DIA", label: "Em dia" },
];

export function EmplacamentoView({
  empresaId,
  exercicio,
  linhas,
  resumo,
}: {
  empresaId: string;
  exercicio: number;
  linhas: LinhaEmplacamento[];
  resumo: ResumoEmplacamento;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmaDesfazer, setConfirmaDesfazer] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  function agir(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setConfirmaDesfazer(null);
      router.refresh();
    });
  }

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return linhas
      .filter((l) => {
        if (filtroStatus && l.status !== filtroStatus) return false;
        if (
          b &&
          !l.placa.toLowerCase().includes(b) &&
          !l.modelo.toLowerCase().includes(b) &&
          !l.empresaNome.toLowerCase().includes(b)
        )
          return false;
        return true;
      })
      .sort(
        // Quem precisa de atenção primeiro; dentro do mesmo status, o
        // vencimento mais próximo; por fim a placa, estável.
        (a, b2) =>
          PESO_STATUS[a.status] - PESO_STATUS[b2.status] ||
          (a.dataLimiteTs ?? Infinity) - (b2.dataLimiteTs ?? Infinity) ||
          a.placa.localeCompare(b2.placa),
      );
  }, [linhas, busca, filtroStatus]);

  const pendencias = resumo.vencidos + resumo.venceEmBreve + resumo.pendentes + resumo.naoEmplacados;

  return (
    <div className="space-y-4">
      {/* A resposta que a gestão veio buscar, antes de qualquer tabela. */}
      {resumo.tudoEmDia ? (
        <p className="rounded-md border border-emerald-600/40 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          ✅ Frota com o licenciamento {exercicio} todo em dia
          {resumo.semCalendario > 0 &&
            ` — com a ressalva de ${resumo.semCalendario} veículo(s) sem calendário derivável (placa provisória ou UF sem tabela)`}
          .
        </p>
      ) : (
        <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Ainda não dá para dizer que está tudo em dia: {pendencias} veículo(s) pedem atenção no
          exercício {exercicio}.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador rotulo="Em dia" valor={`${resumo.emDia} de ${resumo.total}`} />
        <Indicador
          rotulo="Vencidos"
          valor={resumo.vencidos}
          estado={resumo.vencidos > 0 ? "alerta" : "padrao"}
        />
        <Indicador
          rotulo="Vencendo em 30 dias"
          valor={resumo.venceEmBreve}
          estado={resumo.venceEmBreve > 0 ? "alerta" : "padrao"}
        />
        <Indicador
          rotulo="Não emplacados"
          valor={resumo.naoEmplacados}
          estado={resumo.naoEmplacados > 0 ? "alerta" : "padrao"}
        />
        <Indicador rotulo="Sem calendário" valor={resumo.semCalendario} />
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Placa, modelo ou empresa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <select
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
        >
          {OPCOES_FILTRO.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtradas.length} de {linhas.length} veículos
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placa</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Final</TableHead>
              <TableHead>1ª parcela</TableHead>
              <TableHead>Vence em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum veículo com esse filtro.
                </TableCell>
              </TableRow>
            )}
            {filtradas.map((l) => (
              <TableRow key={l.veiculoId}>
                <TableCell className="font-medium whitespace-nowrap">
                  {formatarPlaca(l.placa)}
                  {l.ufAssumida && (
                    <span
                      className="ml-1 text-xs text-muted-foreground"
                      title="UF de emplacamento vazia no cadastro — calendário assumido da Paraíba"
                    >
                      (UF? → {l.ufEfetiva})
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-48 truncate">{l.modelo}</TableCell>
                <TableCell className="max-w-40 truncate">{l.empresaNome}</TableCell>
                <TableCell>{l.final ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{l.primeiraParcelaTexto ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {l.dataLimiteTexto ?? "—"}
                  {l.dias != null && l.status !== "EM_DIA" && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {l.dias < 0 ? `(${-l.dias}d atrás)` : `(${l.dias}d)`}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <BadgeStatus status={l.status} />
                  {l.status === "EM_DIA" && l.registradoPor && (
                    <span className="ml-1 block text-xs text-muted-foreground">
                      por {l.registradoPor} em {l.registradoEmTexto}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {(l.status === "PENDENTE" ||
                    l.status === "VENCE_EM_BREVE" ||
                    l.status === "VENCIDO" ||
                    l.status === "SEM_CALENDARIO") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendente}
                      onClick={() =>
                        agir(() =>
                          marcarLicenciamentoEmDia({ empresaId, veiculoId: l.veiculoId, exercicio }),
                        )
                      }
                    >
                      Marcar em dia
                    </Button>
                  )}
                  {l.status === "EM_DIA" &&
                    !l.registroTemArquivo &&
                    (confirmaDesfazer === l.veiculoId ? (
                      <span className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pendente}
                          onClick={() =>
                            agir(() =>
                              desfazerLicenciamentoEmDia({
                                empresaId,
                                veiculoId: l.veiculoId,
                                exercicio,
                              }),
                            )
                          }
                        >
                          Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmaDesfazer(null)}>
                          Não
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendente}
                        onClick={() => setConfirmaDesfazer(l.veiculoId)}
                      >
                        Desfazer
                      </Button>
                    ))}
                  {l.status === "NAO_EMPLACADO" && (
                    <span className="text-xs text-muted-foreground">emplacar primeiro</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Calendário: DETRAN-PB 2026 (Portaria nº 590/2025/DS) — a data limite é a da 3ª
        parcela/pagamento integral. Veículo &quot;em dia&quot; ganha um registro de
        Licenciamento {exercicio} na ficha (aba de documentos), onde o comprovante pode ser
        anexado depois. &quot;Desfazer&quot; só existe enquanto não houver arquivo anexado.
      </p>
    </div>
  );
}
