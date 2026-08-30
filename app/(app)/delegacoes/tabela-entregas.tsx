import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { duracaoEmTexto, fracaoEmTexto, type Painel } from "@/lib/delegacoes/painel-entregas";
import { cn } from "@/lib/utils";

/**
 * A tabela "Como andam as entregas" — por pessoa, sobre um `Painel` já
 * montado (lib/delegacoes/painel-entregas.ts::montarPainelEntregas).
 *
 * Compartilhada entre Delegadas por mim (escopo: o que EU deleguei, sempre
 * "tudo") e o Relatório da Direção (escopo: o grupo inteiro, por período) —
 * mesma marcação, só o dado e o texto de cabeçalho mudam. Fatorada para as
 * duas telas nunca divergirem na coluna nova que uma ganhar e a outra não.
 */
export function TabelaEntregas({
  painel,
  titulo,
  descricao,
}: {
  painel: Painel;
  titulo: string;
  descricao: React.ReactNode;
}) {
  if (painel.linhas.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Pessoa</th>
                <th className="p-2 text-center font-medium">Com ela agora</th>
                <th className="p-2 text-center font-medium">Atrasadas</th>
                <th className="p-2 text-center font-medium">Entregou no prazo</th>
                <th className="p-2 text-center font-medium">Devoluções</th>
                <th className="p-2 text-center font-medium">Repactuou</th>
                <th className="p-2 text-center font-medium">Tempo até entregar</th>
                <th className="p-2 text-center font-medium">Horas estimadas (méd.)</th>
                <th className="p-2 text-center font-medium">Dentro da estimativa</th>
              </tr>
            </thead>
            <tbody>
              {painel.linhas.map((l) => (
                <tr key={l.nome} className="border-b border-border last:border-0">
                  <td className="p-2 font-medium">{l.nome}</td>
                  <td className="p-2 text-center">{l.abertas || "—"}</td>
                  <td className={cn("p-2 text-center", l.atrasadas > 0 && "font-medium text-destructive")}>
                    {l.atrasadas || "—"}
                  </td>
                  <td className="p-2 text-center">{fracaoEmTexto(l.noPrazo, l.entregues)}</td>
                  <td className="p-2 text-center">{l.devolucoes || "—"}</td>
                  <td className="p-2 text-center">{l.repactuadas || "—"}</td>
                  <td className="p-2 text-center">{duracaoEmTexto(l.horasMediaEntrega)}</td>
                  <td className="p-2 text-center">{duracaoEmTexto(l.horasEstimadasMedia)}</td>
                  <td className="p-2 text-center">{fracaoEmTexto(l.dentroEstimativa, l.comEstimativa)}</td>
                </tr>
              ))}
            </tbody>
            {painel.linhas.length > 1 && (
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="p-2">Todos</td>
                  <td className="p-2 text-center">{painel.totais.abertas}</td>
                  <td className="p-2 text-center">{painel.totais.atrasadas || "—"}</td>
                  <td className="p-2 text-center">
                    {fracaoEmTexto(painel.totais.noPrazo, painel.totais.entregues)}
                  </td>
                  <td className="p-2 text-center">{painel.totais.devolucoes || "—"}</td>
                  <td className="p-2 text-center">{painel.totais.repactuadas || "—"}</td>
                  <td className="p-2 text-center">{duracaoEmTexto(painel.totais.horasMediaEntrega)}</td>
                  <td className="p-2 text-center">{duracaoEmTexto(painel.totais.horasEstimadasMedia)}</td>
                  <td className="p-2 text-center">
                    {fracaoEmTexto(painel.totais.dentroEstimativa, painel.totais.comEstimativa)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
