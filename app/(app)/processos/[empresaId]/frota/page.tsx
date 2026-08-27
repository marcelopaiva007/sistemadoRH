import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { diferencaEmDiasUTC, formatarData, hojeUTC, paraInputDate } from "@/lib/datas";
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
        anoFab: true,
        chassi: true,
        hodometroAtual: true,
        cidadeBase: true,
        setor: true,
        emplacado: true,
        motoristaInformado: true,
        ufEmplacamento: true,
        propriedade: true,
        motorizacao: true,
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
        // A lista INTEIRA (era só os com vencimento, e sem id): desde
        // 27/08/2026 a tela mostra os documentos do veículo com o anexo, para
        // ver/substituir/excluir. Nota fiscal e ATPV não têm vencimento e
        // precisam aparecer igual.
        documentos: {
          orderBy: [{ dataVencimento: "asc" }, { tipo: "asc" }],
          select: {
            id: true,
            tipo: true,
            exercicio: true,
            dataEmissao: true,
            dataVencimento: true,
            valor: true,
            observacoes: true,
            arquivo: { select: { id: true, nome: true, mimeType: true, tamanhoBytes: true } },
          },
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
      // Documento sem vencimento (nota fiscal, ATPV) entra na lista mas não
      // disputa o "próximo vencimento" — a query deixou de filtrar por data.
      if (!d.dataVencimento) continue;
      const atual = maisRecentePorTipo.get(d.tipo);
      if (!atual || d.dataVencimento > atual) maisRecentePorTipo.set(d.tipo, d.dataVencimento);
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
      anoFab: v.anoFab,
      chassi: v.chassi,
      hodometroAtual: v.hodometroAtual,
      cidadeBase: v.cidadeBase,
      setor: v.setor,
      emplacado: v.emplacado,
      motoristaInformado: v.motoristaInformado,
      empresaId: v.empresaId,
      ufEmplacamento: v.ufEmplacamento,
      propriedade: v.propriedade,
      motorizacao: v.motorizacao,
      situacao: v.situacao,
      aderidoSne: v.aderidoSne,
      // Prefill da edição: sem a data no formulário, editar um veículo
      // aderido exigiria redigitar uma data que ninguém tem à mão.
      dataAdesaoSneInput: v.dataAdesaoSne ? v.dataAdesaoSne.toISOString().slice(0, 10) : "",
      empresaNome: nomeDaEmpresa.get(v.empresaId) ?? "—",
      condutorAtual: v.alocacoes[0]?.condutor.colaborador.nome ?? null,
      vencimentoMaisProximo: proximo,
      documentos: v.documentos.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        exercicio: d.exercicio,
        dataEmissaoInput: d.dataEmissao ? paraInputDate(d.dataEmissao) : "",
        dataVencimentoInput: d.dataVencimento ? paraInputDate(d.dataVencimento) : "",
        vencimentoTexto: d.dataVencimento ? formatarData(d.dataVencimento) : null,
        vencido: d.dataVencimento ? d.dataVencimento < hoje : false,
        valor: d.valor,
        observacoes: d.observacoes,
        arquivo: d.arquivo,
      })),
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
        empresas={empresas}
      />
    </div>
  );
}
