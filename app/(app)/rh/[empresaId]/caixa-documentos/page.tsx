import { escopoDeEmpresas, empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { blobConfigurado } from "@/lib/blob";
import { mascararCpf } from "@/lib/cpf";
import { formatarData, formatarDataHoraBrasilia } from "@/lib/datas";
import { PAPEIS_QUE_CONFIGURAM } from "@/lib/segredos";
import { iaLigada } from "@/lib/caixa-documentos/ia";
import { lerDados, limparCaixa, DIAS_GUARDA_ORIGINAL } from "@/lib/caixa-documentos/processar";
import { conferenciaDasPaginas } from "@/lib/caixa-documentos/decidir";
import type { InventarioPaginas } from "@/lib/caixa-documentos/extracao";
import { marcasDe } from "@/lib/caixa-documentos/sigilo";
import {
  ABA_DO_DESTINO,
  DESTINO_LABEL,
  JANELA_PAGINAS,
  MOTIVO_FORA_DO_ESCOPO,
  destinoDoTipo,
  type TipoCaixa,
} from "@/lib/caixa-documentos/tipos";
import { CaixaView, type ArquivoNaCaixa, type FichaOpcao, type ItemConferir, type ItemGravado } from "./caixa-view";

// Caixa de documentos (v1.179.0). O RH solta os PDFs que chegam do contador —
// contracheques, ASOs, atestados, certificados, documentos pessoais — e a IA
// lê, acha de quem é cada documento e encaminha para o lugar certo. O que ela
// não tem certeza fica na fila "Para conferir", resolvida com um clique.
//
// A página só LISTA e mostra. Ler e encaminhar roda pela rota
// /api/rh/<empresa>/caixa-documentos/<arquivo>/avancar, chamada pela própria
// tela em rodadas (ver lib/caixa-documentos/processar.ts).
export default async function CaixaDocumentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  // A LISTA respeita o filtro da barra do topo (arquivos enviados a partir dos
  // CNPJs filtrados). A BUSCA de pessoas de cada arquivo, não: usa o escopo
  // congelado no envio (todas as empresas que quem enviou acessa).
  const escopo = await escopoDeEmpresas(usuario, empresasParam);
  const visiveis = new Set(await empresasVisiveis(usuario));
  // Faxina é de melhor esforço: se falhar (duas telas abrindo juntas), a
  // lista abre do mesmo jeito e a próxima visita termina o serviço.
  await limparCaixa(escopo).catch((e) => console.error("[caixa-documentos] faxina", e));

  // Só aparece o arquivo de quem alcança TODO o escopo dele — senão veria
  // pessoas de um CNPJ que não acessa. Filtrado no banco, ANTES do limite:
  // filtrado depois, os 60 mais novos podiam ser todos de quem vê mais, e os
  // desta pessoa sumiam da lista.
  const idsVisiveis = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM rh."DocumentoRecebido"
    WHERE "empresaId" = ANY(${escopo}::text[]) AND status <> 'AGUARDANDO_UPLOAD'
      AND "empresasEscopo" <@ ${[...visiveis]}::text[]
    ORDER BY "createdAt" DESC LIMIT 60`;
  const recebidos = await prisma.documentoRecebido.findMany({
    where: { id: { in: idsVisiveis.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      empresaId: true,
      empresasEscopo: true,
      nome: true,
      status: true,
      paginas: true,
      proximaPagina: true,
      erro: true,
      resumoIa: true,
      arquivoId: true,
      criadoPorNome: true,
      createdAt: true,
      updatedAt: true,
      inventarioPaginas: true,
      mimeType: true,
    },
  });
  const ids = recebidos.map((r) => r.id);

  const [contagens, itensConferir, foraDoEscopo, itensGravados, fichas, empresasSemCnpj, ligada] = await Promise.all([
    prisma.itemDocumentoRecebido.groupBy({ by: ["recebidoId", "status"], where: { recebidoId: { in: ids } }, _count: { _all: true } }),
    prisma.itemDocumentoRecebido.findMany({
      where: { recebidoId: { in: ids }, status: "CONFERIR" },
      orderBy: [{ recebidoId: "asc" }, { ordem: "asc" }],
      take: 300,
    }),
    // Os descartados sozinhos por serem de empresa que quem enviou não acessa.
    prisma.itemDocumentoRecebido.groupBy({
      by: ["recebidoId"],
      where: { recebidoId: { in: ids }, status: "DESCARTADO", motivo: { startsWith: MOTIVO_FORA_DO_ESCOPO } },
      _count: { _all: true },
    }),
    prisma.itemDocumentoRecebido.findMany({
      where: { recebidoId: { in: ids }, status: "GRAVADO" },
      orderBy: { resolvidoEm: "desc" },
      take: 200,
      select: {
        id: true,
        recebidoId: true,
        tipo: true,
        nomeLido: true,
        paginaInicio: true,
        paginaFim: true,
        destinoEntidade: true,
        resolvidoPorNome: true,
        resolvidoEm: true,
        colaborador: { select: { id: true, nome: true, empresaId: true } },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId: { in: [...visiveis] }, empresa: { ativo: true } },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        cpf: true,
        pis: true,
        ativo: true,
        empresaId: true,
        dataAdmissao: true,
        empresa: { select: { nome: true, cnpj: true } },
        setor: { select: { nome: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: [...visiveis] }, ativo: true, cnpj: null },
      select: { nome: true },
    }),
    iaLigada(),
  ]);

  const nomeArquivo = new Map(recebidos.map((r) => [r.id, r]));
  const fichasOpcao: FichaOpcao[] = fichas.map((f) => ({
    id: f.id,
    nome: f.nome,
    empresaId: f.empresaId,
    empresaNome: f.empresa.nome,
    cnpj: f.empresa.cnpj?.replace(/\D/g, "") ?? null,
    setor: f.setor?.nome ?? "—",
    admissao: f.dataAdmissao ? formatarData(f.dataAdmissao) : "—",
    ativo: f.ativo,
    cpfFinal: mascararCpf(f.cpf),
  }));

  const fichaPorId = new Map(fichas.map((f) => [f.id, f]));
  const conferir: ItemConferir[] = itensConferir.map((i) => {
    const r = nomeArquivo.get(i.recebidoId)!;
    const d = lerDados(i.dados);
    const tipo = i.tipo as TipoCaixa;
    const total = r.paginas ?? 1;
    const inventario = (r.inventarioPaginas as InventarioPaginas | null) ?? null;
    const janela = { de: Math.max(1, i.paginaInicio - JANELA_PAGINAS), ate: Math.min(total, i.paginaFim + JANELA_PAGINAS) };
    // Só a contagem de pessoas vai à tela — as marcas de CPF/PIS ficam aqui.
    const pessoasPorPagina: Record<number, number | null> = {};
    for (let p = janela.de; p <= janela.ate; p++) pessoasPorPagina[p] = inventario?.[String(p)]?.pessoas ?? null;
    const sugerida = i.colaboradorId ? fichaPorId.get(i.colaboradorId) : undefined;
    return {
      id: i.id,
      recebidoId: i.recebidoId,
      empresaId: r.empresaId,
      arquivo: r.nome,
      paginasDoArquivo: r.paginas ?? 1,
      tipo,
      paginaInicio: i.paginaInicio,
      paginaFim: i.paginaFim,
      nomeLido: i.nomeLido,
      cpfMascarado: i.cpfLido ? mascararCpf(i.cpfLido) : null,
      temPis: !!i.pisLido,
      cnpjLido: i.cnpjLido,
      confianca: i.confianca,
      motivos: (i.motivo ?? "").split("\n").filter(Boolean),
      sugestaoId: i.colaboradorId,
      opcoes: d.opcoes ?? [],
      campos: d.campos,
      janela,
      pessoasPorPagina,
      // Para a pessoa sugerida e as páginas lidas: "OK" dispensa o "olhei as
      // páginas" do RH. Qualquer outra escolha, o servidor confere ao gravar.
      paginasDaSugestao: sugerida
        ? conferenciaDasPaginas(i.paginaInicio, i.paginaFim, inventario, marcasDe(sugerida.cpf, sugerida.pis))
        : null,
      originalGuardado: !!r.arquivoId,
    };
  });

  const gravados: ItemGravado[] = itensGravados.map((i) => {
    const destino = destinoDoTipo(i.tipo as TipoCaixa, false);
    return {
      id: i.id,
      empresaId: nomeArquivo.get(i.recebidoId)?.empresaId ?? empresaId,
      arquivo: nomeArquivo.get(i.recebidoId)?.nome ?? "",
      tipo: i.tipo as TipoCaixa,
      pessoa: i.colaborador?.nome ?? i.nomeLido ?? "—",
      link: i.colaborador && destino ? `/rh/${i.colaborador.empresaId}/colaboradores/${i.colaborador.id}?tab=${ABA_DO_DESTINO[destino]}` : null,
      destino: destino ? DESTINO_LABEL[destino] : "—",
      quando: i.resolvidoEm ? formatarDataHoraBrasilia(i.resolvidoEm) : "—",
      quem: i.resolvidoPorNome ?? "—",
      podeDesfazer: !!nomeArquivo.get(i.recebidoId)?.arquivoId,
    };
  });

  const arquivos: ArquivoNaCaixa[] = recebidos.map((r) => {
    const n = (s: string) => contagens.find((c) => c.recebidoId === r.id && c.status === s)?._count._all ?? 0;
    return {
      id: r.id,
      empresaId: r.empresaId,
      nome: r.nome,
      status: r.status,
      paginas: r.paginas,
      paginasLidas: Math.min(r.paginas ?? 0, r.proximaPagina - 1),
      gravados: n("GRAVADO"),
      conferir: n("CONFERIR"),
      descartados: n("DESCARTADO"),
      naoColaborador: itensConferir.filter((i) => i.recebidoId === r.id && i.tipo === "NAO_E_DE_COLABORADOR").length,
      foraDoEscopo: foraDoEscopo.find((f) => f.recebidoId === r.id)?._count._all ?? 0,
      erro: r.erro,
      resumo: r.resumoIa,
      enviadoPor: r.criadoPorNome ?? "—",
      enviadoEm: formatarDataHoraBrasilia(r.createdAt),
      originalGuardado: !!r.arquivoId,
    };
  });

  return (
    <CaixaView
      empresaId={empresaId}
      arquivos={arquivos}
      conferir={conferir}
      gravados={gravados}
      fichas={fichasOpcao}
      iaLigada={ligada}
      podeConfigurarIa={PAPEIS_QUE_CONFIGURAM.includes(usuario.role)}
      comBlob={blobConfigurado()}
      ambienteDeTeste={process.env.VERCEL_ENV === "preview"}
      empresasSemCnpj={empresasSemCnpj.map((e) => e.nome)}
      totalEmpresas={visiveis.size}
      diasGuardaOriginal={DIAS_GUARDA_ORIGINAL}
    />
  );
}
