import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { formatarData, hojeUTC } from "@/lib/datas";
import { retratoLicenciamento, resumoLicenciamento } from "@/lib/processos/licenciamento";
import { EmplacamentoView, type LinhaEmplacamento } from "./emplacamento-view";

// Emplacamento & Licenciamento (pedido da Direção em 31/08/2026): pela PLACA,
// o mês de pagamento do licenciamento de cada veículo — e a resposta que a
// gestão quer dar com uma olhada: "está tudo em dia?".
//
// Todo cálculo (final da placa → mês pelo calendário do Detran, semáforo,
// resumo) acontece AQUI no servidor, via lib/processos/licenciamento.ts; a
// view só exibe e clica. "Em dia" é um DocumentoVeiculo tipo LICENCIAMENTO do
// exercício — a mesma linha da aba de documentos do veículo, nunca um flag
// paralelo.
export default async function EmplacamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string; exercicio?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam, exercicio: exercicioParam } = await searchParams;
  const usuario = await requireProcessosEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const hoje = hojeUTC();
  const anoAtual = hoje.getUTCFullYear();
  // Exercício consultável (ex.: conferir se o ano passado fechou em dia) —
  // saneado para uma janela curta: fora dela é typo, não consulta.
  const exercicioPedido = Number(exercicioParam);
  const exercicio =
    Number.isInteger(exercicioPedido) && Math.abs(exercicioPedido - anoAtual) <= 5
      ? exercicioPedido
      : anoAtual;

  const [empresa, veiculos, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    // Um findMany só, com os licenciamentos do exercício no include — nunca
    // uma consulta por linha (mesma regra do Financeiro).
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: { placa: "asc" },
      select: {
        id: true,
        placa: true,
        marca: true,
        modelo: true,
        empresaId: true,
        emplacado: true,
        ufEmplacamento: true,
        documentos: {
          where: { tipo: "LICENCIAMENTO", exercicio },
          select: { id: true, arquivoId: true, criadoPorNome: true, criadoEm: true },
        },
      },
    }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));

  const linhas: LinhaEmplacamento[] = veiculos.map((v) => {
    const registro = v.documentos[0] ?? null;
    const ret = retratoLicenciamento(
      {
        placa: v.placa,
        emplacado: v.emplacado,
        ufEmplacamento: v.ufEmplacamento,
        registradoNoExercicio: !!registro,
      },
      exercicio,
      hoje,
    );
    return {
      veiculoId: v.id,
      placa: v.placa,
      modelo: [v.marca, v.modelo].filter(Boolean).join(" ") || "—",
      empresaNome: nomeDaEmpresa.get(v.empresaId) ?? "—",
      final: ret.final,
      ufEfetiva: ret.ufEfetiva,
      ufAssumida: ret.ufAssumida,
      status: ret.status,
      // Derivados prontos: o front não refaz conta nenhuma.
      primeiraParcelaTexto: ret.primeiraParcela ? formatarData(ret.primeiraParcela) : null,
      dataLimiteTexto: ret.dataLimite ? formatarData(ret.dataLimite) : null,
      dataLimiteTs: ret.dataLimite ? ret.dataLimite.getTime() : null,
      dias: ret.diasParaLimite,
      registradoPor: registro?.criadoPorNome ?? null,
      registradoEmTexto: registro ? formatarData(registro.criadoEm) : null,
      registroTemArquivo: !!registro?.arquivoId,
    };
  });

  const resumo = resumoLicenciamento(
    linhas.map((l) => ({
      status: l.status,
      final: l.final,
      ufEfetiva: l.ufEfetiva,
      ufAssumida: l.ufAssumida,
      primeiraParcela: null,
      dataLimite: null,
      diasParaLimite: l.dias,
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Emplacamento &amp; Licenciamento {exercicio}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          O mês de pagamento de cada veículo sai do final da placa, pelo calendário do Detran
          ({/* a UF vem do cadastro; vazia é assumida PB e a linha avisa */}PB 2026: final 1
          vence em março, final 0 em dezembro). Marcar &quot;em dia&quot; registra o
          licenciamento do exercício na ficha do veículo.
        </p>
      </div>

      <EmplacamentoView empresaId={empresaId} exercicio={exercicio} linhas={linhas} resumo={resumo} />
    </div>
  );
}
