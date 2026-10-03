import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { obterIndicadoresRH, obterHorasTrabalhadas, obterBancoHoras } from "@/app/actions/rh-ponto-relatorios";
import { IndicadoresDashboard } from "../../indicadores-dashboard";
import { HorasTrabalhadasRelatorio } from "../../horas-trabalhadas-relatorio";
import { BancoHorasRelatorio } from "../../banco-horas-relatorio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RelatoriosAvancadosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // Período padrão: mês atual
  const agora = new Date();
  const mesReferencia = format(agora, "MMMM 'de' yyyy", { locale: ptBR });
  const competencia = format(agora, "yyyy-MM");

  // Buscar dados em paralelo
  const [indicadores, horasTrabalhadas, bancoHoras] = await Promise.all([
    obterIndicadoresRH(empresaId, agora),
    obterHorasTrabalhadas(empresaId, agora),
    obterBancoHoras(empresaId, competencia),
  ]);

  // Verificar erros
  const erroIndicadores = "erro" in indicadores;
  const erroHoras = "erro" in horasTrabalhadas;
  const erroBanco = "erro" in bancoHoras;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios Avançados</h1>
        <p className="text-muted-foreground mt-1">
          Dashboard completo de ponto e jornada da empresa
        </p>
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

      {/* Relatório de Banco de Horas */}
      {!erroBanco && <BancoHorasRelatorio dados={bancoHoras} competencia={competencia} />}

      {erroBanco && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-sm text-red-900">Erro ao Carregar Banco de Horas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">{bancoHoras.erro}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
