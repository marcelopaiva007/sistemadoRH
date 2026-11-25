import Link from "next/link";
import { obterIndicadoresRH, obterHorasTrabalhadas } from "@/app/actions/rh-ponto-relatorios";
import { competenciaBrasilia, deslocarCompetencia, lerCompetencia, rotuloDaCompetencia } from "@/lib/ponto-relatorios";
import { IndicadoresDashboard } from "../../indicadores-dashboard";
import { HorasTrabalhadasRelatorio } from "../../horas-trabalhadas-relatorio";
import { BancoHorasRelatorio } from "../../banco-horas-relatorio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RelatoriosAvancadosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { empresaId } = await params;
  const { mes } = await searchParams;

  // Mês do relatório: ?mes=AAAA-MM, ou o mês CORRENTE NO CALENDÁRIO DE
  // BRASÍLIA (26/11/2026). Antes era `format(new Date(), "yyyy-MM")`, que lê
  // no fuso do processo — UTC na Vercel: a partir das 21:00 do último dia do
  // mês a tela já pulava para o mês seguinte, vazio. E só existia o mês
  // corrente: não havia como olhar o mês fechado.
  const mesAtual = competenciaBrasilia();
  const competencia = lerCompetencia(mes) ? mes! : mesAtual;
  const mesReferencia = rotuloDaCompetencia(competencia);
  const anterior = deslocarCompetencia(competencia, -1);
  const seguinte = deslocarCompetencia(competencia, 1);
  const base = `/rh/${empresaId}/ponto/relatorios/avancados`;

  const [indicadores, horasTrabalhadas] = await Promise.all([
    obterIndicadoresRH(empresaId, competencia),
    obterHorasTrabalhadas(empresaId, competencia),
  ]);

  // Verificar erros
  const erroIndicadores = "erro" in indicadores;
  const erroHoras = "erro" in horasTrabalhadas;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios Avançados</h1>
        <p className="text-muted-foreground mt-1">
          Dashboard completo de ponto e jornada da empresa
        </p>
        <nav className="mt-3 flex flex-wrap items-center gap-3 text-sm" aria-label="Mês do relatório">
          <Link href={`${base}?mes=${anterior}`} className="underline underline-offset-4">
            ← mês anterior
          </Link>
          <span className="font-medium capitalize">{mesReferencia}</span>
          {competencia < mesAtual && (
            <Link href={`${base}?mes=${seguinte}`} className="underline underline-offset-4">
              mês seguinte →
            </Link>
          )}
          {competencia !== mesAtual && (
            <Link href={base} className="text-muted-foreground underline underline-offset-4">
              voltar ao mês atual
            </Link>
          )}
        </nav>
      </div>

      {/* Dashboard de Indicadores */}
      {!erroIndicadores && (
        <IndicadoresDashboard dados={indicadores} mesReferencia={mesReferencia} />
      )}

      {erroIndicadores && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-sm text-red-900">Erro ao Carregar Indicadores</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">{indicadores.erro}</p>
          </CardContent>
        </Card>
      )}

      {/* Relatório de Horas Trabalhadas */}
      {!erroHoras && (
        <HorasTrabalhadasRelatorio dados={horasTrabalhadas} mesReferencia={mesReferencia} />
      )}

      {erroHoras && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-sm text-red-900">Erro ao Carregar Horas Trabalhadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">{horasTrabalhadas.erro}</p>
          </CardContent>
        </Card>
      )}

      {/* Banco de Horas: aviso honesto — o sistema ainda não apura (26/11/2026) */}
      <BancoHorasRelatorio mesReferencia={mesReferencia} />
    </div>
  );
}
