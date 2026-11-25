import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { dataDoFormulario, hojeUTC, paraInputDate, somarDiasUTC } from "@/lib/datas";
import { diasDaSemana, inicioDaSemanaUTC } from "@/lib/escala";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import { CICLO_DOMINGO_PADRAO, conferirEscalaClt, type TurnoDaPessoa } from "@/lib/escala-clt";
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
  // Conferência CLT (26/11/2026): a regra do domingo precisa das semanas
  // anteriores — 1 folga dominical a cada 7 semanas —, e a interjornada de
  // segunda olha o domingo anterior. Busca 6 semanas para trás; os avisos
  // mostrados são só os da semana na tela.
  const inicioHistorico = somarDiasUTC(inicioSemana, -7 * (CICLO_DOMINGO_PADRAO - 1));

  const [setores, colaboradores, escalas, turnosDisponiveis] = await Promise.all([
    prisma.setor.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true, ...(setorId ? { setorId } : {}) },
      orderBy: [{ setor: { nome: "asc" } }, { nome: "asc" }],
      select: { id: true, nome: true, setor: { select: { id: true, nome: true } } },
    }),
    prisma.escalaTurno.findMany({
      where: { empresaId, data: { gte: inicioHistorico, lte: fimSemana } },
      select: { colaboradorId: true, data: true, turno: true },
    }),
    opcoesDoCatalogo(empresaId, "TIPO_TURNO"),
  ]);

  const turnoPorCelula = new Map<string, string>();
  const turnosPorPessoa = new Map<string, TurnoDaPessoa[]>();
  for (const e of escalas) {
    if (e.data >= inicioSemana) turnoPorCelula.set(`${e.colaboradorId}::${e.data.toISOString()}`, e.turno);
    const lista = turnosPorPessoa.get(e.colaboradorId) ?? [];
    lista.push({ data: paraInputDate(e.data), turno: e.turno });
    turnosPorPessoa.set(e.colaboradorId, lista);
  }

  // Avisos por célula ("<colaborador>::<AAAA-MM-DD>"). Não bloqueiam nada: o
  // RH vê e decide (acordo coletivo, 12x36 e compensação mudam a conta).
  const diasDaTela = new Set(dias.map((d) => paraInputDate(d)));
  const rotuloDoTurno = (v: string) => turnosDisponiveis.find((t) => t.value === v)?.label ?? v;
  const avisosPorCelula: Record<string, string[]> = {};
  for (const c of colaboradores) {
    const turnos = turnosPorPessoa.get(c.id);
    if (!turnos) continue;
    const violacoes = conferirEscalaClt(
      turnos,
      { inicio: paraInputDate(inicioHistorico), fim: paraInputDate(fimSemana) },
      { rotuloDoTurno },
    );
    for (const v of violacoes) {
      if (!diasDaTela.has(v.data)) continue;
      (avisosPorCelula[`${c.id}::${v.data}`] ??= []).push(v.mensagem);
    }
  }

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
      avisosPorCelula={avisosPorCelula}
      turnosDisponiveis={turnosDisponiveis}
    />
  );
}
