import { escopoDeEmpresas, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { tipoExameLabel } from "@/lib/constants-sst";
import { diferencaEmDiasUTC, formatarData, hojeUTC } from "@/lib/datas";
import { RelatorioAsoView, type LinhaRelatorioAso } from "./relatorio-aso-view";

// Relatório de ASO (Saúde & segurança). Pedido do RH em 28/09/2026: ASO
// vencido deixou de ser pendência — não é tarefa do dia, é uma fila de
// regularização que o RH puxa quando vai agendar exames com a clínica. Esta
// tela é o lugar dela: o painel do tamanho do atraso e a lista do mais antigo
// para o mais novo.
//
// Mesma base do card de ASO em /vencimentos: parte do COLABORADOR ativo (não
// da tabela de exames), para quem nunca teve ASO cadastrado aparecer; o exame
// que vale é o mais recente de cada pessoa, sem contar o demissional.
export default async function RelatorioAsoPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  // Sem filtro na URL, tudo que o usuário enxerga; com filtro, a INTERSEÇÃO —
  // id digitado à mão não vira acesso (ver escopoDeEmpresas).
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const hoje = hojeUTC();
  const colaboradores = await prisma.colaborador.findMany({
    // `empresa.ativo`: o vínculo do usuário pode continuar ativo num CNPJ que
    // foi desativado, e o layout de /rh/<empresa> dá 404 para ele. Sem este
    // filtro, o relatório listaria (e o "Anexar ASO" gravaria) num CNPJ que
    // nenhuma outra tela abre.
    where: { empresaId: { in: escopo }, ativo: true, empresa: { ativo: true } },
    select: {
      id: true,
      nome: true,
      empresaId: true,
      setor: { select: { nome: true } },
      empresa: { select: { nome: true } },
      exames: {
        where: { tipo: { not: "DEMISSIONAL" } },
        orderBy: { realizadoEm: "desc" },
        take: 1,
        select: { tipo: true, realizadoEm: true, validoAte: true },
      },
    },
    orderBy: { nome: "asc" },
  });

  const linhas: LinhaRelatorioAso[] = colaboradores.map((c) => {
    const exame = c.exames[0] ?? null;
    return {
      colaboradorId: c.id,
      empresaId: c.empresaId,
      nome: c.nome,
      empresaNome: c.empresa.nome,
      setorNome: c.setor.nome,
      tipoLabel: exame ? tipoExameLabel(exame.tipo) : null,
      realizadoTexto: exame ? formatarData(exame.realizadoEm) : null,
      validadeTexto: exame?.validoAte ? formatarData(exame.validoAte) : null,
      dias: exame?.validoAte ? diferencaEmDiasUTC(exame.validoAte, hoje) : null,
      temExame: !!exame,
    };
  });

  return <RelatorioAsoView linhas={linhas} geradoEm={formatarData(hoje)} empresaId={empresaId} />;
}
