import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { diferencaEmDiasUTC, formatarData, hojeUTC } from "@/lib/datas";
import { limiteDePontos } from "@/lib/processos/ctb";
import { CondutoresView, type CondutorNaTela } from "./condutores-view";

// Quem dirige a serviço da empresa. É extensão do colaborador — a lista de
// "quem pode virar condutor" sai do cadastro que já existe, e não de um cadastro
// paralelo de motorista que alguém teria de manter em dia.
export default async function CondutoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireProcessosEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const hoje = hojeUTC();
  const umAnoAtras = new Date(hoje.getTime() - 365 * 86_400_000);

  const [empresa, condutores, colaboradores, importaveis, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.condutor.findMany({
      where: { empresaId: { in: escopo }, colaborador: { ativo: true } },
      orderBy: { colaborador: { nome: "asc" } },
      select: {
        id: true,
        colaboradorId: true,
        empresaId: true,
        cnhNumero: true,
        cnhCategoria: true,
        cnhUf: true,
        cnhValidade: true,
        toxicologicoValidade: true,
        cursoReciclagemUltimaData: true,
        possuiEAR: true,
        statusHabilitacao: true,
        colaborador: { select: { nome: true } },
        // TODAS as infrações indicadas nos últimos 12 meses, com pontos e
        // natureza. Duas contas saem daqui: os PONTOS ATIVOS (soma do que
        // pontua — pontuação no CTB expira em janela móvel de 12 meses, então
        // é derivada, nunca acumulada) e o LIMITE de quem não tem EAR (20 com
        // duas ou mais gravíssimas, 30 com uma, 40 com nenhuma).
        infracoesIndicadas: {
          where: { dataHoraInfracao: { gte: umAnoAtras } },
          select: { pontos: true, geraPontos: true, natureza: true },
        },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo }, ativo: true, condutor: null },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    // Quantos dá para importar do cadastro: colaborador ativo com documento de
    // CNH e ainda sem condutor. Alimenta o botão "Importar do cadastro".
    prisma.colaborador.count({
      where: {
        empresaId: { in: escopo },
        ativo: true,
        condutor: null,
        documentos: { some: { tipo: { in: ["CNH", "CNH_CATEGORIA"] } } },
      },
    }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));

  // A data como o <input type="date"> espera, para o prefill da edição. Sem
  // prefill, salvar uma correção de categoria apagaria a validade da CNH.
  const paraInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  const naTela: CondutorNaTela[] = condutores.map((c) => {
    const gravissimas = c.infracoesIndicadas.filter((i) => i.natureza === "GRAVISSIMA").length;
    const pontosAtivos = c.infracoesIndicadas.reduce((a, i) => a + (i.geraPontos ? i.pontos : 0), 0);
    return {
      id: c.id,
      colaboradorId: c.colaboradorId,
      nome: c.colaborador.nome,
      empresaNome: nomeDaEmpresa.get(c.empresaId) ?? "—",
      cnhCategoria: c.cnhCategoria,
      cnhNumero: c.cnhNumero,
      cnhUf: c.cnhUf,
      cnhValidadeTexto: formatarData(c.cnhValidade),
      cnhValidadeInput: paraInput(c.cnhValidade),
      toxicologicoValidadeInput: paraInput(c.toxicologicoValidade),
      cursoReciclagemInput: paraInput(c.cursoReciclagemUltimaData),
      diasParaCnh: c.cnhValidade ? diferencaEmDiasUTC(c.cnhValidade, hoje) : null,
      possuiEAR: c.possuiEAR,
      pontosAcumulados: pontosAtivos,
      limitePontos: limiteDePontos(c.possuiEAR, gravissimas),
      statusHabilitacao: c.statusHabilitacao,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Condutores</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Habilitação, exame e pontuação de quem dirige a serviço. Os pontos entram na conta quando
          o condutor é indicado numa multa — antes disso a infração é do veículo, não de ninguém.
        </p>
      </div>

      <CondutoresView
        empresaId={empresaId}
        condutores={naTela}
        colaboradoresSemCondutor={colaboradores}
        importaveis={importaveis}
      />
    </div>
  );
}
