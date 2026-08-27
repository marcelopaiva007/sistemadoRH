import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { formatarData, hojeUTC, paraInputDate } from "@/lib/datas";
import { rotuloCompetencia } from "@/lib/processos/alugueis";
import { STATUS_COM_PRAZO_CORRENDO } from "@/lib/processos/pendencias";
import { AlugueisView, type ContratoDeAluguel } from "./alugueis-view";

// Recebimento de aluguéis — os imóveis do grupo alugados a terceiros.
//
// Consolidada por padrão, como o resto do módulo. Um "aluguel" é um Contrato de
// categoria RECEITA — e, por decisão do dono (27/08/2026), ele vive INTEIRO
// aqui: cadastro, edição e parcelas. A tela de Contratos não mostra receita;
// misturar aluguel com torre e fornecedor era o que escondia o cadastro.
export default async function AlugueisPage({
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

  const [empresa, contratos, empresas, contrapartes] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.contrato.findMany({
      // TODOS os contratos de receita, inclusive rascunho/encerrado — esta tela
      // agora é o cadastro deles, e cadastro que some quando o status muda é
      // cadastro que ninguém acha. Quem NÃO tem prazo correndo fica fora dos
      // totais e não gera parcela (ver `prazoCorrendo` abaixo) — os números da
      // tela continuam batendo com a Central.
      where: { empresaId: { in: escopo }, categoria: "RECEITA" },
      orderBy: [{ status: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        empresaId: true,
        numero: true,
        titulo: true,
        status: true,
        tipo: true,
        valorMensal: true,
        indeterminado: true,
        dataInicio: true,
        dataFim: true,
        contraparteId: true,
        contraparte: { select: { razaoSocial: true } },
        recebimentos: {
          orderBy: { competencia: "asc" },
          select: {
            id: true,
            competencia: true,
            vencimento: true,
            valorPrevisto: true,
            recebidoEm: true,
            valorRecebido: true,
          },
          take: 600,
        },
      },
    }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
    // Contrapartes são do grupo inteiro (sem empresaId) — a lista alimenta o
    // select "inquilino" do formulário.
    prisma.contraparte.findMany({
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true },
    }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const hoje = hojeUTC();

  const naTela: ContratoDeAluguel[] = contratos.map((c) => {
    const prazoCorrendo = (STATUS_COM_PRAZO_CORRENDO as readonly string[]).includes(c.status);
    return {
      id: c.id,
      empresaId: c.empresaId,
      empresaNome: nomeDaEmpresa.get(c.empresaId) ?? "—",
      numero: c.numero,
      titulo: c.titulo,
      status: c.status,
      tipo: c.tipo,
      inquilino: c.contraparte.razaoSocial,
      contraparteId: c.contraparteId,
      valorMensal: c.valorMensal,
      dataInicioInput: paraInputDate(c.dataInicio),
      dataFimInput: c.dataFim ? paraInputDate(c.dataFim) : "",
      indeterminado: c.indeterminado,
      prazoCorrendo,
      // O dia de vencimento a sugerir para estender: o MAIOR dia visto nas
      // parcelas (recupera a intenção mesmo que um mês curto tenha grampeado
      // para 28/30). Vazio quando ainda não há parcela.
      diaVencimentoSugerido:
        c.recebimentos.length > 0
          ? Math.max(...c.recebimentos.map((r) => r.vencimento.getUTCDate()))
          : null,
      // Só o indeterminado precisa ser estendido; o de prazo fixo já nasce
      // inteiro. Contrato sem prazo correndo não gera nem estende.
      podeEstender: prazoCorrendo && (c.indeterminado || c.dataFim === null),
      parcelas: c.recebimentos.map((r) => ({
        id: r.id,
        competencia: rotuloCompetencia(r.competencia),
        vencimentoTexto: formatarData(r.vencimento),
        vencimentoInput: paraInputDate(r.vencimento),
        vencido: !r.recebidoEm && r.vencimento < hoje,
        valorPrevisto: r.valorPrevisto,
        recebido: r.recebidoEm !== null,
        recebidoEmTexto: formatarData(r.recebidoEm),
        valorRecebido: r.valorRecebido,
      })),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Aluguéis a receber</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Imóveis do grupo alugados a terceiros — o contrato de aluguel se cadastra AQUI, separado
          dos demais contratos. Cada um gera as parcelas mensais; marque o que foi recebido. O que
          passa do vencimento sem receber vira pendência na Central.
        </p>
      </div>

      <AlugueisView
        empresaId={empresaId}
        contratos={naTela}
        empresas={empresas}
        contrapartes={contrapartes}
      />
    </div>
  );
}
