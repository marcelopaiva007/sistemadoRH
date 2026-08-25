import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { formatarData, hojeUTC, paraInputDate } from "@/lib/datas";
import { rotuloCompetencia } from "@/lib/processos/alugueis";
import { AlugueisView, type ContratoDeAluguel } from "./alugueis-view";

// Recebimento de aluguéis — os imóveis do grupo alugados a terceiros.
//
// Consolidada por padrão, como o resto do módulo. Um "aluguel" é um Contrato de
// categoria RECEITA; esta tela mostra as parcelas mensais dele — o que foi
// recebido, o que está em aberto e o que passou do vencimento.
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

  const [empresa, contratos, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.contrato.findMany({
      where: { empresaId: { in: escopo }, categoria: "RECEITA" },
      orderBy: [{ status: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        empresaId: true,
        numero: true,
        titulo: true,
        status: true,
        valorMensal: true,
        indeterminado: true,
        dataFim: true,
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
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const hoje = hojeUTC();

  const naTela: ContratoDeAluguel[] = contratos.map((c) => ({
    id: c.id,
    empresaId: c.empresaId,
    empresaNome: nomeDaEmpresa.get(c.empresaId) ?? "—",
    numero: c.numero,
    titulo: c.titulo,
    status: c.status,
    inquilino: c.contraparte.razaoSocial,
    valorMensal: c.valorMensal,
    // O dia de vencimento a sugerir para estender: o MAIOR dia visto nas
    // parcelas (recupera a intenção mesmo que um mês curto tenha grampeado
    // para 28/30). Vazio quando ainda não há parcela.
    diaVencimentoSugerido:
      c.recebimentos.length > 0
        ? Math.max(...c.recebimentos.map((r) => r.vencimento.getUTCDate()))
        : null,
    // Só o indeterminado precisa ser estendido; o de prazo fixo já nasce
    // inteiro. A tela usa isto para saber quando oferecer "estender".
    podeEstender: c.indeterminado || c.dataFim === null,
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
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Aluguéis a receber</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Imóveis do grupo alugados a terceiros. Cada contrato de receita gera as parcelas mensais;
          marque o que foi recebido. O que passa do vencimento sem receber vira pendência na Central.
        </p>
      </div>

      <AlugueisView empresaId={empresaId} contratos={naTela} />
    </div>
  );
}
