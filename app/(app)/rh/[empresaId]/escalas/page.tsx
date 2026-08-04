import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { dataDoFormulario, hojeUTC, paraInputDate, somarDiasUTC } from "@/lib/datas";
import { diasDaSemana, inicioDaSemanaUTC } from "@/lib/escala";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import { EscalasView } from "./escalas-view";

// Grade semanal de plantão/turno por setor. Sem cálculo de hora extra ou
// banco de horas de propósito — é "quem está de plantão em cada dia", o que
// a operação de campo pediu.
export default async function EscalasPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ semana?: string; setor?: string }>;
}) {
  const { empresaId } = await params;
  const { semana: semanaParam, setor: setorId } = await searchParams;
  await requireEmpresaAccess(empresaId);

  const referencia = dataDoFormulario(semanaParam) ?? hojeUTC();
  const inicioSemana = inicioDaSemanaUTC(referencia);
  const dias = diasDaSemana(inicioSemana);
  const fimSemana = dias[6];

  const [setores, colaboradores, escalas, turnosDisponiveis] = await Promise.all([
    prisma.setor.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true, ...(setorId ? { setorId } : {}) },
      orderBy: [{ setor: { nome: "asc" } }, { nome: "asc" }],
      select: { id: true, nome: true, setor: { select: { id: true, nome: true } } },
    }),
    prisma.escalaTurno.findMany({
      where: { empresaId, data: { gte: inicioSemana, lte: fimSemana } },
      select: { colaboradorId: true, data: true, turno: true },
    }),
    opcoesDoCatalogo(empresaId, "TIPO_TURNO"),
  ]);

  const turnoPorCelula = new Map<string, string>();
  for (const e of escalas) turnoPorCelula.set(`${e.colaboradorId}::${e.data.toISOString()}`, e.turno);

  return (
    <EscalasView
      empresaId={empresaId}
      inicioSemanaISO={paraInputDate(inicioSemana)}
      semanaAnteriorISO={paraInputDate(somarDiasUTC(inicioSemana, -7))}
      semanaSeguinteISO={paraInputDate(somarDiasUTC(inicioSemana, 7))}
      hojeISO={paraInputDate(hojeUTC())}
      dias={dias.map((d) => paraInputDate(d))}
      setores={setores}
      setorSelecionado={setorId ?? ""}
      colaboradores={colaboradores.map((c) => ({ id: c.id, nome: c.nome, setorNome: c.setor.nome }))}
      turnoPorCelula={Object.fromEntries(turnoPorCelula)}
      turnosDisponiveis={turnosDisponiveis}
    />
  );
}
