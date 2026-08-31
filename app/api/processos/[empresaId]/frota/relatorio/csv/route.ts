import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { escopoDeEmpresas, usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
import { prisma } from "@/lib/prisma";
import { gerarCsv } from "@/lib/csv";
import { diferencaEmDiasUTC, formatarData, hojeUTC } from "@/lib/datas";
import { retratoFinanceiro, ROTULO_STATUS_VENCIMENTO } from "@/lib/processos/frota-financeiro";
import {
  formatarPlaca,
  MOTORIZACAO_VEICULO,
  PROPRIEDADE_VEICULO,
  rotulo,
  SITUACAO_VEICULO,
  TIPOS_DOCUMENTO_VEICULO,
} from "@/lib/processos/ctb";

export const runtime = "nodejs";

/**
 * Relatório da frota em CSV — pedido do RH em 31/08/2026, junto com o campo
 * de valor da tabela FIPE. Mesma visibilidade da tela de Veículos (escopo por
 * `?empresas=`, interseção com o que o usuário alcança) e mesmas regras de
 * leitura: motorista é a alocação formal, com o texto do cadastro como
 * fallback; o "próximo vencimento" considera só o documento mais recente de
 * cada tipo. Mesmo molde de auth de app/api/processos/[empresaId]/arquivos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;

  // Rota de API devolve 401/403 explícitos (redirect() é para páginas).
  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }
  if (!(await sistemasPermitidos(user)).includes("processos")) {
    return NextResponse.json({ error: "Sem acesso ao módulo Processos & Ativos." }, { status: 403 });
  }

  const empresasParam = new URL(req.url).searchParams.get("empresas") ?? undefined;
  const escopo = await escopoDeEmpresas(user, empresasParam);

  const [veiculos, empresas] = await Promise.all([
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: [{ situacao: "asc" }, { placa: "asc" }],
      select: {
        placa: true,
        renavam: true,
        chassi: true,
        marca: true,
        modelo: true,
        anoFab: true,
        anoModelo: true,
        empresaId: true,
        ufEmplacamento: true,
        cidadeBase: true,
        setor: true,
        emplacado: true,
        propriedade: true,
        motorizacao: true,
        situacao: true,
        aderidoSne: true,
        dataAdesaoSne: true,
        hodometroAtual: true,
        valorFipe: true,
        motoristaInformado: true,
        motoristaColaborador: { select: { nome: true } },
        alocacoes: {
          where: { dataFim: null },
          take: 1,
          select: { condutor: { select: { colaborador: { select: { nome: true } } } } },
        },
        documentos: { select: { tipo: true, dataVencimento: true } },
        financeiro: {
          select: {
            tipoAquisicao: true,
            situacao: true,
            valorParcela: true,
            qtdParcelasTotal: true,
            qtdParcelasPagas: true,
            dataPrimeiraParcela: true,
            recorrencia: true,
            recorrenciaIntervaloDias: true,
            dataProximoVencimento: true,
            credor: true,
          },
        },
        _count: { select: { infracoes: true } },
      },
    }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
  ]);

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const hoje = hojeUTC();

  // Valor em formato pt-BR com vírgula: o Excel brasileiro lê direto. O CSV
  // usa ";" de separador (gerarCsv), então a vírgula decimal não conflita.
  const reais = (v: number | null) =>
    v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const colunas = [
    "Placa",
    "Marca",
    "Modelo",
    "Ano fab/modelo",
    "Empresa (CNPJ)",
    "Situação",
    "Propriedade",
    "Motorização",
    "Emplacado",
    "UF",
    "Cidade-base",
    "Setor",
    "Com quem está",
    "Km atual",
    "Valor FIPE (R$)",
    "SNE aderido",
    "Adesão SNE",
    "Próximo vencimento",
    "Vencimento em",
    "Dias p/ vencer",
    "Situação financeira",
    "Credor",
    "Venc. financeiro",
    "Multas registradas",
    "Renavam",
    "Chassi",
  ];

  const linhas = veiculos.map((v) => {
    // Só o documento mais recente de cada tipo disputa o próximo vencimento —
    // um licenciamento antigo já substituído não é vencimento de nada.
    const maisRecentePorTipo = new Map<string, Date>();
    for (const d of v.documentos) {
      if (!d.dataVencimento) continue;
      const atual = maisRecentePorTipo.get(d.tipo);
      if (!atual || d.dataVencimento > atual) maisRecentePorTipo.set(d.tipo, d.dataVencimento);
    }
    let proximo: { tipo: string; data: Date; dias: number } | null = null;
    for (const [tipo, data] of maisRecentePorTipo) {
      const dias = diferencaEmDiasUTC(data, hoje);
      if (!proximo || dias < proximo.dias) proximo = { tipo, data, dias };
    }

    // Mesma resolução da tela: alocação formal → vínculo do cadastro → texto
    // legado da planilha.
    const motorista =
      v.alocacoes[0]?.condutor.colaborador.nome ??
      v.motoristaColaborador?.nome ??
      (v.motoristaInformado ? `${v.motoristaInformado} (texto legado)` : "");

    const fin = retratoFinanceiro(v.financeiro, hoje);

    return [
      formatarPlaca(v.placa),
      v.marca ?? "",
      v.modelo ?? "",
      [v.anoFab, v.anoModelo].filter(Boolean).join("/"),
      nomeDaEmpresa.get(v.empresaId) ?? "",
      rotulo(SITUACAO_VEICULO, v.situacao),
      rotulo(PROPRIEDADE_VEICULO, v.propriedade),
      rotulo(MOTORIZACAO_VEICULO, v.motorizacao),
      v.emplacado ? "Sim" : "Não",
      v.ufEmplacamento ?? "",
      v.cidadeBase ?? "",
      v.setor ?? "",
      motorista,
      v.hodometroAtual != null ? String(v.hodometroAtual) : "",
      reais(v.valorFipe),
      v.aderidoSne ? "Sim" : "Não",
      v.dataAdesaoSne ? formatarData(v.dataAdesaoSne) : "",
      proximo ? rotulo(TIPOS_DOCUMENTO_VEICULO, proximo.tipo) : "",
      proximo ? formatarData(proximo.data) : "",
      proximo ? String(proximo.dias) : "",
      ROTULO_STATUS_VENCIMENTO[fin.status],
      v.financeiro?.credor ?? "",
      fin.proximoVencimento ? formatarData(fin.proximoVencimento) : "",
      String(v._count.infracoes),
      v.renavam ?? "",
      v.chassi ?? "",
    ];
  });

  const corpo = gerarCsv(colunas, linhas);
  const nomeArquivo = `relatorio-frota-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
