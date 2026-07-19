import "server-only";
import { prisma } from "@/lib/prisma";
import {
  asRegraConfig,
  getRegraVigente,
  somaLancamentos,
  type LancamentoAgregado,
} from "@/lib/bonificacao";
import {
  calcularAcompanhamento,
  type AcompanhamentoFuncionario,
} from "@/lib/acompanhamento";
import { ensureFuncionarioContato } from "@/lib/ensure-schema";

const CARGOS_REGRA = [
  "VENDEDOR_EXTERNO",
  "ATENDIMENTO_ADM",
  "SUPERVISOR",
  "OUTRO_SETOR",
];

// Carrega e calcula o acompanhamento de metas de todos os funcionários ativos
// para o período. Reutilizado pela tela /metas e pelo cron de cobrança.
export async function carregarAcompanhamento(
  periodo: string,
): Promise<AcompanhamentoFuncionario[]> {
  await ensureFuncionarioContato();
  const [funcionarios, lancamentos, equipes] = await Promise.all([
    prisma.funcionario.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        cargo: true,
        email: true,
        telegramChatId: true,
        equipeId: true,
      },
    }),
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
      email: f.email,
      telegramChatId: f.telegramChatId,
      agregado,
      config,
      supervisorCtx,
    });
  });

  resultado.sort((a, b) => {
    const aAberto = a.metas.some((m) => (m.faltam ?? 0) > 0) ? 0 : 1;
    const bAberto = b.metas.some((m) => (m.faltam ?? 0) > 0) ? 0 : 1;
    if (aAberto !== bAberto) return aAberto - bAberto;
    return b.bonificacaoAtual - a.bonificacaoAtual;
  });

  return resultado;
}
