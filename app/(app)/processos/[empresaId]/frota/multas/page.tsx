import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFrotaEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { diferencaEmDiasUTC, formatarData, formatarDataHoraBrasilia, hojeUTC } from "@/lib/datas";
import { PaginacaoPorLink } from "@/components/padroes/paginacao-por-link";
import { fatiar, lerPagina, resumoDaFatia } from "@/lib/paginacao-servidor";
import type { Prisma } from "@/app/generated/prisma/client";
import { MultasView, type MultaNaTela } from "./multas-view";

// 26/11/2026: as TRATADAS (indicação feita, dispensada etc.) passaram a vir
// paginadas do banco, 50 por vez, mais recentes primeiro. As A INDICAR vêm
// sempre todas — são a razão da tela e o número do cabeçalho — e continuam no
// topo, pelo prazo. Antes o histórico inteiro de multas do escopo ia para o
// navegador a cada abertura.
const TRATADAS_POR_PAGINA = 50;

const SELECT_MULTA = {
  id: true,
  numeroAIT: true,
  veiculoId: true,
  dataHoraInfracao: true,
  descricao: true,
  natureza: true,
  pontos: true,
  valorOriginal: true,
  statusIndicacao: true,
  statusProcessual: true,
  prazoIndicacaoCondutor: true,
  empresaId: true,
  veiculo: { select: { placa: true, modelo: true } },
  condutorIndicado: { select: { colaborador: { select: { nome: true } } } },
} satisfies Prisma.InfracaoSelect;

// Multas — a tela de maior retorno do módulo.
//
// Ordenada pelo prazo de indicação, o que está a indicar primeiro: é o único
// prazo que se paga toda vez que passa (3× o valor), e é o que esta tela existe
// para não deixar passar. O `?foco=` vem da Central: rola até a multa certa e a
// destaca — o painel de indicação abre pelo botão, que é quem dispara a
// consulta de "quem estava com o veículo".

export default async function MultasPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string; foco?: string; pagina?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam, foco, pagina: paginaParam } = await searchParams;
  const usuario = await requireFrotaEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  // Mesmo `escopo` de sempre; a paginação só fatia dentro dele.
  const whereTratadas = { empresaId: { in: escopo }, statusIndicacao: { not: "PENDENTE" as const } };
  const totalTratadas = await prisma.infracao.count({ where: whereTratadas });

  // `?foco=` da Central numa multa já tratada: abre na página dela, senão o
  // destaque apontaria para uma linha que não veio.
  let paginaPedida = lerPagina(paginaParam);
  if (foco && !paginaParam) {
    const alvo = await prisma.infracao.findFirst({
      where: { ...whereTratadas, id: foco },
      select: { id: true, dataHoraInfracao: true },
    });
    if (alvo) {
      const antes = await prisma.infracao.count({
        where: {
          ...whereTratadas,
          OR: [
            { dataHoraInfracao: { gt: alvo.dataHoraInfracao } },
            { dataHoraInfracao: alvo.dataHoraInfracao, id: { gt: alvo.id } },
          ],
        },
      });
      paginaPedida = Math.floor(antes / TRATADAS_POR_PAGINA) + 1;
    }
  }
  const fatia = fatiar(paginaPedida, totalTratadas, TRATADAS_POR_PAGINA);

  const [empresa, pendentes, tratadas, veiculos, condutores, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    // Só um desempate estável: a ORDEM das a indicar (por prazo) é do sort
    // explícito lá embaixo, num lugar só.
    prisma.infracao.findMany({
      where: { empresaId: { in: escopo }, statusIndicacao: "PENDENTE" },
      orderBy: { dataHoraInfracao: "desc" },
      select: SELECT_MULTA,
    }),
    // Tratadas: a ordem do banco É a da tela (mais recentes no topo), com o
    // id de desempate para a fatia não pular nem repetir linha entre páginas.
    prisma.infracao.findMany({
      where: whereTratadas,
      orderBy: [{ dataHoraInfracao: "desc" }, { id: "desc" }],
      skip: fatia.skip,
      take: fatia.take,
      select: SELECT_MULTA,
    }),
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo }, situacao: { in: ["ATIVO", "EM_MANUTENCAO"] } },
      orderBy: { placa: "asc" },
      select: { id: true, placa: true, modelo: true },
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

  const naTela: MultaNaTela[] = [...pendentes, ...tratadas].map((m) => ({
    id: m.id,
    numeroAIT: m.numeroAIT,
    placa: m.veiculo.placa,
    veiculoId: m.veiculoId,
    dataHoraInfracaoISO: m.dataHoraInfracao.toISOString(),
    dataHoraInfracaoTexto: formatarDataHoraBrasilia(m.dataHoraInfracao),
    descricao: m.descricao,
    natureza: m.natureza,
    pontos: m.pontos,
    valorOriginal: m.valorOriginal,
    statusIndicacao: m.statusIndicacao,
    statusProcessual: m.statusProcessual,
    prazoIndicacaoTexto: formatarData(m.prazoIndicacaoCondutor),
    diasParaIndicar: m.prazoIndicacaoCondutor ? diferencaEmDiasUTC(m.prazoIndicacaoCondutor, hoje) : null,
    condutorIndicadoNome: m.condutorIndicado?.colaborador.nome ?? null,
    empresaNome: nomeDaEmpresa.get(m.empresaId) ?? "—",
  }));

  // A ordem da tela, num lugar só: a indicar primeiro (pelo prazo), depois as
  // tratadas, mais recentes no topo.
  naTela.sort((a, b) => {
    const pa = a.statusIndicacao === "PENDENTE" ? 0 : 1;
    const pb = b.statusIndicacao === "PENDENTE" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (pa === 0) return (a.diasParaIndicar ?? 9999) - (b.diasParaIndicar ?? 9999);
    return b.dataHoraInfracaoISO.localeCompare(a.dataHoraInfracaoISO);
  });

  const aIndicar = naTela.filter((m) => m.statusIndicacao === "PENDENTE").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1">Multas</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {aIndicar > 0 ? (
            <>
              <strong className="text-foreground">
                {aIndicar} {aIndicar === 1 ? "multa espera" : "multas esperam"} indicação de condutor.
              </strong>{" "}
              Passou o prazo, a empresa paga 3× o valor.
            </>
          ) : (
            "Nenhuma multa esperando indicação de condutor."
          )}
        </p>
      </div>

      <MultasView
        empresaId={empresaId}
        multas={naTela}
        veiculos={veiculos}
        condutores={condutores.map((c) => ({ id: c.id, nome: c.colaborador.nome }))}
        foco={foco ?? null}
      />

      {totalTratadas > TRATADAS_POR_PAGINA && (
        <PaginacaoPorLink
          pagina={fatia.pagina}
          totalPaginas={fatia.totalPaginas}
          resumo={`Já tratadas: ${resumoDaFatia(fatia)}`}
          params={{ empresas: empresasParam }}
        />
      )}
    </div>
  );
}
