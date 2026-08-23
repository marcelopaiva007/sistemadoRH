import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { diferencaEmDiasUTC, formatarData, hojeUTC } from "@/lib/datas";
import { VeiculosView, type VeiculoNaTela } from "./veiculos-view";

// Veículos da frota. Consolidada por padrão e filtrada por `?empresas=`, como
// o resto do sistema — com a INTERSEÇÃO entre o pedido e o que o usuário
// alcança, para id digitado à mão não virar acesso.
export default async function VeiculosPage({
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

  // O cabeçalho entra no mesmo Promise.all das listas: ele só depende do
  // empresaId da URL, e serializá-lo antes custava um round-trip a mais por
  // carregamento.
  const [empresa, veiculos, condutores, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: [{ situacao: "asc" }, { placa: "asc" }],
      select: {
        id: true,
        placa: true,
        renavam: true,
        marca: true,
        modelo: true,
        anoModelo: true,
        ufEmplacamento: true,
        propriedade: true,
        situacao: true,
        aderidoSne: true,
        dataAdesaoSne: true,
        empresaId: true,
        // Só a alocação aberta — quem está com o carro AGORA.
        alocacoes: {
          where: { dataFim: null },
          take: 1,
          select: { condutor: { select: { colaborador: { select: { nome: true } } } } },
        },
        documentos: {
          where: { dataVencimento: { not: null } },
          orderBy: { dataVencimento: "asc" },
          select: { tipo: true, dataVencimento: true },
        },
      },
    }),
    prisma.condutor.findMany({
      where: { empresaId: { in: escopo }, colaborador: { ativo: true } },
      orderBy: { colaborador: { nome: "asc" } },
      select: { id: true, colaborador: { select: { nome: true } } },
    }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const hoje = hojeUTC();

  const naTela: VeiculoNaTela[] = veiculos.map((v) => {
    // O mais próximo de vencer entre os documentos, considerando só o mais
    // recente de cada tipo: um licenciamento de 2024 já substituído pelo de
    // 2026 não é o "próximo vencimento" de coisa nenhuma.
    const maisRecentePorTipo = new Map<string, Date>();
    for (const d of v.documentos) {
      const atual = maisRecentePorTipo.get(d.tipo);
      if (!atual || d.dataVencimento! > atual) maisRecentePorTipo.set(d.tipo, d.dataVencimento!);
    }
    let proximo: { tipo: string; texto: string; dias: number } | null = null;
    for (const [tipo, data] of maisRecentePorTipo) {
      const dias = diferencaEmDiasUTC(data, hoje);
      if (!proximo || dias < proximo.dias) proximo = { tipo, texto: formatarData(data), dias };
    }

    return {
      id: v.id,
      placa: v.placa,
      renavam: v.renavam,
      marca: v.marca,
      modelo: v.modelo,
      anoModelo: v.anoModelo,
      ufEmplacamento: v.ufEmplacamento,
      propriedade: v.propriedade,
      situacao: v.situacao,
      aderidoSne: v.aderidoSne,
      // Prefill da edição: sem a data no formulário, editar um veículo
      // aderido exigiria redigitar uma data que ninguém tem à mão.
      dataAdesaoSneInput: v.dataAdesaoSne ? v.dataAdesaoSne.toISOString().slice(0, 10) : "",
      empresaNome: nomeDaEmpresa.get(v.empresaId) ?? "—",
      condutorAtual: v.alocacoes[0]?.condutor.colaborador.nome ?? null,
      vencimentoMaisProximo: proximo,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Veículos</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A frota e o que vence em cada carro. A coluna &ldquo;com quem está&rdquo; é a que importa
          no dia da multa.
        </p>
      </div>

      <VeiculosView
        empresaId={empresaId}
        veiculos={naTela}
        condutores={condutores.map((c) => ({ id: c.id, nome: c.colaborador.nome }))}
      />
    </div>
  );
}
