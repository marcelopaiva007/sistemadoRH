import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { calcularFerias, type PeriodoAquisitivo } from "@/lib/ferias";
import { hojeUTC } from "@/lib/datas";
import { FeriasView } from "./ferias-view";

// Tela de Férias do Departamento Pessoal.
//
// Saiu de dentro de Vencimentos porque as duas coisas têm natureza diferente:
// documento vencido se renova, férias vencidas viram passivo em dobro (art.
// 137) e só se resolvem concedendo. Misturado, o alerta mais caro do RH ficava
// perdido no meio dos certificados de NR.
//
// Os períodos aquisitivos NÃO vêm do banco — `calcularFerias` deriva tudo da
// data de admissão mais as solicitações registradas. Ver lib/ferias.ts.

export type LinhaFerias = {
  colaboradorId: string;
  nome: string;
  setor: string;
  admissao: string;
  periodo: PeriodoAquisitivo | null;
  saldoTotal: number;
  semHistorico: boolean;
};

export default async function FeriasPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const hoje = hojeUTC();

  const [colaboradores, semAdmissao] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true, dataAdmissao: { not: null } },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        dataAdmissao: true,
        setor: { select: { nome: true } },
        ferias: {
          where: { status: { in: ["APROVADA", "PENDENTE"] } },
          select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
        },
      },
    }),
    prisma.colaborador.count({ where: { empresaId, ativo: true, dataAdmissao: null } }),
  ]);

  const linhas: LinhaFerias[] = colaboradores.map((c) => {
    const resumo = calcularFerias(c.dataAdmissao!, c.ferias, hoje);
    // O período que o RH precisa resolver primeiro: o mais perto do limite
    // entre os que ainda têm saldo.
    const critico = resumo.periodos
      .filter((p) => p.status !== "EM_CURSO" && p.saldo > 0)
      .sort((a, b) => a.diasAteLimite - b.diasAteLimite)[0];

    return {
      colaboradorId: c.id,
      nome: c.nome,
      setor: c.setor.nome,
      admissao: c.dataAdmissao!.toISOString(),
      periodo: critico ?? null,
      saldoTotal: resumo.saldoDisponivel,
      // Mais de um período adquirido e nenhuma férias registrada é quase sempre
      // buraco de cadastro, não alguém que nunca saiu de férias — a base nasceu
      // sem histórico de gozo. A tela separa os dois casos para o número de
      // "vencidas" não nascer inflado.
      semHistorico: c.ferias.length === 0 && resumo.periodos.filter((p) => p.status !== "EM_CURSO").length > 0,
    };
  });

  return <FeriasView empresaId={empresaId} linhas={linhas} semAdmissao={semAdmissao} />;
}
