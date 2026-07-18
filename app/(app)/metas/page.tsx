import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoAtual } from "@/lib/periodo";
import {
  asRegraConfig,
  getRegraVigente,
  somaLancamentos,
  type LancamentoAgregado,
} from "@/lib/bonificacao";
import { calcularAcompanhamento, type AcompanhamentoFuncionario } from "@/lib/acompanhamento";
import { MetasView } from "./metas-view";

const CARGOS_REGRA = [
  "VENDEDOR_EXTERNO",
  "ATENDIMENTO_ADM",
  "SUPERVISOR",
  "OUTRO_SETOR",
];

async function carregar(periodo: string): Promise<AcompanhamentoFuncionario[]> {
  const [funcionarios, lancamentos, equipes] = await Promise.all([
    prisma.funcionario.findMany({ where: { ativo: true }, include: { equipe: true } }),
    prisma.lancamentoVenda.findMany({ where: { periodo } }),
    prisma.equipe.findMany({
      include: { membros: { where: { ativo: true }, select: { id: true } } },
    }),
  ]);

  const lancPorFuncionario = new Map<string, LancamentoAgregado[]>();
  for (const l of lancamentos) {
    const lista = lancPorFuncionario.get(l.funcionarioId) ?? [];
    lista.push(l);
    lancPorFuncionario.set(l.funcionarioId, lista);
  }

  const configPorCargo = new Map<string, ReturnType<typeof asRegraConfig>>();
  for (const cargo of CARGOS_REGRA) {
    const regra = await getRegraVigente(cargo, periodo);
    configPorCargo.set(cargo, asRegraConfig(regra?.config));
  }

  // Total de internet por equipe (base do bônus/meta de supervisor).
  const internetPorEquipe = new Map<string, number>();
  for (const f of funcionarios) {
    if (!f.equipeId) continue;
    const ag = somaLancamentos(lancPorFuncionario.get(f.id) ?? []);
    internetPorEquipe.set(
      f.equipeId,
      (internetPorEquipe.get(f.equipeId) ?? 0) + ag.qtdInternet,
    );
  }

  const equipesPorSupervisor = new Map<string, typeof equipes>();
  for (const e of equipes) {
    if (!e.supervisorId) continue;
    const lista = equipesPorSupervisor.get(e.supervisorId) ?? [];
    lista.push(e);
    equipesPorSupervisor.set(e.supervisorId, lista);
  }

  const resultado = funcionarios.map((f) => {
    const agregado = somaLancamentos(lancPorFuncionario.get(f.id) ?? []);
    const config = configPorCargo.get(f.cargo) ?? null;

    let supervisorCtx: { totalInternetEquipe: number; tamanhoEquipe: number } | null =
      null;
    if (f.cargo === "SUPERVISOR") {
      const equipesSup = equipesPorSupervisor.get(f.id) ?? [];
      let totalInternet = 0;
      const ids = new Set<string>([f.id]);
      for (const e of equipesSup) {
        totalInternet += internetPorEquipe.get(e.id) ?? 0;
        for (const m of e.membros) ids.add(m.id);
        // Internet do próprio supervisor, se ele não estiver listado como membro.
        if (!e.membros.some((m) => m.id === f.id)) {
          totalInternet += agregado.qtdInternet;
        }
      }
      supervisorCtx = { totalInternetEquipe: totalInternet, tamanhoEquipe: ids.size };
    }

    return calcularAcompanhamento({
      funcionarioId: f.id,
      nome: f.nome,
      cargo: f.cargo,
      agregado,
      config,
      supervisorCtx,
    });
  });

  // Quem tem meta em aberto primeiro; depois maior bonificação atual.
  resultado.sort((a, b) => {
    const aAberto = a.metas.some((m) => (m.faltam ?? 0) > 0) ? 0 : 1;
    const bAberto = b.metas.some((m) => (m.faltam ?? 0) > 0) ? 0 : 1;
    if (aAberto !== bAberto) return aAberto - bAberto;
    return b.bonificacaoAtual - a.bonificacaoAtual;
  });

  return resultado;
}

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireUser();
  const { periodo: periodoParam } = await searchParams;
  const periodo = periodoParam?.match(/^\d{4}-\d{2}$/) ? periodoParam : periodoAtual();

  const acompanhamentos = await carregar(periodo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Acompanhamento de Metas</h1>
        <p className="text-muted-foreground">
          Progresso de cada vendedor, supervisor e gestor em relação à meta do mês,
          com um feedback do que falta para subir de faixa. Base: as vendas já
          sincronizadas e as Regras de Bonificação vigentes.
        </p>
      </div>
      <MetasView acompanhamentos={acompanhamentos} periodo={periodo} />
    </div>
  );
}
