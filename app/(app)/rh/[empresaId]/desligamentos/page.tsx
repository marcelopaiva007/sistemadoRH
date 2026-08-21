import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { PRIMEIRO_DESLIGAMENTO_COBRADO } from "@/lib/constants-dp";
import { DesligamentosView } from "./desligamentos-view";

// Visão consolidada dos desligamentos: quem saiu, quanto do checklist de saída
// já foi concluído e se a entrevista de desligamento já foi feita. Isso é o
// que falta rastrear depois que a data de desligamento é preenchida na ficha
// — o motivo formal em si já mora lá (Fase 1).
export default async function DesligamentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);
  // Mesma regra de filtro-empresas.tsx::useFiltroEmpresas: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — id digitado à mão não
  // vira acesso.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId: { in: escopo }, dataDesligamento: { not: null } },
    orderBy: { dataDesligamento: "desc" },
    select: {
      id: true,
      nome: true,
      empresaId: true,
      empresa: { select: { nome: true } },
      dataDesligamento: true,
      motivoDesligamento: true,
      checklistDispensado: true,
      setor: { select: { nome: true } },
      checklistDesligamento: { select: { concluido: true } },
      entrevistaDesligamento: { select: { id: true } },
    },
  });

  const desligamentos = colaboradores.map((c) => ({
    id: c.id,
    nome: c.nome,
    empresaId: c.empresaId,
    empresaNome: c.empresa.nome,
    dataDesligamento: c.dataDesligamento!,
    motivoDesligamento: c.motivoDesligamento,
    setorNome: c.setor.nome,
    checklistTotal: c.checklistDesligamento.length,
    checklistConcluido: c.checklistDesligamento.filter((i) => i.concluido).length,
    checklistDispensado: c.checklistDispensado,
    temEntrevista: c.entrevistaDesligamento !== null,
  }));

  // Dispensado não conta como pendência — é justamente o que resolve o "sem
  // como cobrar" de quem saiu antes do sistema existir (ver rh-offboarding.ts).
  // A dispensa cobre o offboarding INTEIRO: entrevista de saída de quem já foi
  // embora há meses também não existe para cobrar, então sai do contador junto.
  //
  // Corte de 16/08/2026 (PRIMEIRO_DESLIGAMENTO_COBRADO, decisão do CEO de
  // 20/08): desligamento anterior é histórico importado e sai dos TRÊS
  // indicadores — mas fica na LISTA logo abaixo, com o estado real de cada um.
  // A mesma régua vale nos contadores de lib/pendencias.ts; se divergirem, o
  // cartão de Pendências diz um número e esta tela mostra outro.
  const cobrado = (d: { dataDesligamento: Date }) =>
    d.dataDesligamento >= PRIMEIRO_DESLIGAMENTO_COBRADO;
  const semChecklist = desligamentos.filter(
    (d) => cobrado(d) && d.checklistTotal === 0 && !d.checklistDispensado,
  ).length;
  const checklistPendente = desligamentos.filter(
    (d) => cobrado(d) && d.checklistTotal > 0 && d.checklistConcluido < d.checklistTotal,
  ).length;
  // Só saída que JÁ aconteceu: quem está em aviso prévio ainda trabalha e a
  // entrevista dele não tem como existir. Mesma régua do contador
  // `desligamentosSemEntrevista` (lib/pendencias.ts) — o checklist é diferente
  // de propósito, ele precisa existir ANTES da saída.
  const hoje = hojeUTC();
  const semEntrevista = desligamentos.filter(
    (d) => cobrado(d) && !d.temEntrevista && !d.checklistDispensado && d.dataDesligamento <= hoje,
  ).length;

  return (
    <DesligamentosView
      desligamentos={desligamentos}
      resumo={{ total: desligamentos.length, semChecklist, checklistPendente, semEntrevista }}
    />
  );
}
