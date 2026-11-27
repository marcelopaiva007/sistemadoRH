"use client";

// Motorista só em texto → vínculo com o cadastro, em lote — OS 11/11/2026,
// item 10. Muitos veículos importados da planilha têm só o primeiro nome do
// motorista ("Texto legado da planilha"), sem ficha ligada; um por um pela
// edição do veículo não anda. Aqui a lista inteira aparece de uma vez, com uma
// SUGESTÃO quando o texto casa com um único colaborador ativo — sugestão, não
// gravação: só vai para o banco o que o RH confirmar no botão.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarPlaca } from "@/lib/processos/ctb";
import { vincularMotoristasEmLote } from "@/lib/actions/processos-frota";

const CAMPO = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";

function semAcento(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * O colaborador que o texto da planilha provavelmente quer dizer: o ÚNICO
 * ativo cujo nome começa com o texto (ou com o primeiro nome dele). Dois ou
 * mais candidatos = sem sugestão — chutar aqui ligaria o carro à pessoa errada.
 */
function sugerir(texto: string, colaboradores: { id: string; nome: string }[]): string {
  const t = semAcento(texto.split("/")[0] ?? "");
  if (!t) return "";
  const porInicio = colaboradores.filter((c) => semAcento(c.nome).startsWith(t));
  if (porInicio.length === 1) return porInicio[0].id;
  return "";
}

export function MotoristasLegadoPainel({
  empresaId,
  veiculos,
  colaboradores,
}: {
  empresaId: string;
  veiculos: { id: string; placa: string; marca: string | null; modelo: string | null; motoristaInformado: string | null; motoristaColaboradorId: string | null }[];
  colaboradores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  const legados = useMemo(
    () => veiculos.filter((v) => (v.motoristaInformado ?? "").trim() && !v.motoristaColaboradorId),
    [veiculos],
  );
  const sugestoes = useMemo(
    () => Object.fromEntries(legados.map((v) => [v.id, sugerir(v.motoristaInformado ?? "", colaboradores)])),
    [legados, colaboradores],
  );
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const escolhaDe = (id: string) => escolhas[id] ?? sugestoes[id] ?? "";

  if (legados.length === 0) return null;

  const prontos = legados.filter((v) => escolhaDe(v.id));

  function gravar() {
    iniciar(async () => {
      const r = await vincularMotoristasEmLote({
        empresaId,
        vinculos: prontos.map((v) => ({ veiculoId: v.id, colaboradorId: escolhaDe(v.id) })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.vinculados ?? prontos.length} veículo(s) com motorista vinculado ao cadastro.`);
      setEscolhas({});
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="size-4" />
          {legados.length} veículo(s) com motorista só em texto da planilha
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAberto((a) => !a)}>
            {aberto ? "Fechar" : "Vincular ao cadastro"}
          </Button>
        </CardTitle>
        <CardDescription>
          O nome veio da planilha importada e não está ligado a nenhuma ficha. Escolha o colaborador de cada
          um e grave tudo de uma vez. Quando o nome casa com uma única pessoa ativa, ela já vem sugerida —
          confira antes de gravar.
        </CardDescription>
      </CardHeader>
      {aberto && (
        <CardContent className="space-y-3 px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Texto da planilha</TableHead>
                <TableHead className="w-80">Motorista no cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {legados.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium tabular-nums">{formatarPlaca(v.placa)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>{v.motoristaInformado}</TableCell>
                  <TableCell>
                    <select
                      className={CAMPO}
                      value={escolhaDe(v.id)}
                      onChange={(e) => setEscolhas((s) => ({ ...s, [v.id]: e.target.value }))}
                    >
                      <option value="">— não vincular agora —</option>
                      {colaboradores.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                    {sugestoes[v.id] && escolhas[v.id] === undefined && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">sugerido pelo nome — confira</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-2 px-4">
            <span className="text-xs text-muted-foreground">{prontos.length} pronto(s) para gravar</span>
            <Button size="sm" disabled={pendente || prontos.length === 0} onClick={gravar}>
              {pendente ? "Gravando…" : `Vincular ${prontos.length} veículo(s)`}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
