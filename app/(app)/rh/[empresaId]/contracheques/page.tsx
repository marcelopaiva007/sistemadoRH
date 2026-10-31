import { prisma } from "@/lib/prisma";
import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import {
  chaveDaCompetencia,
  competenciaDoTexto,
  rotuloDoContracheque,
  situacaoDo,
  tipoFolhaDaChave,
} from "@/lib/contracheques/situacao";
import { ContrachequesView, type LinhaContracheque } from "./contracheques-view";

// Envio de contracheques (v1.180.0). A pergunta que esta tela responde: "quem
// já recebeu — e confirmou, com foto — o contracheque deste mês?". Os
// contracheques chegam ao Dossiê pela Caixa de documentos; daqui o RH manda o
// aviso e acompanha abertura e confirmação.

// Enviar a competência inteira manda um aviso POR PESSOA, em série — mesmo
// motivo do teto das Entregas: sem isto, 200 avisos morrem no timeout padrão.
export const maxDuration = 300;

export default async function ContrachequesPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string; competencia?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam, competencia: competenciaParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);
  const visiveis = await empresasVisiveis(usuario);
  // `?empresas=` estreita (interseção, nunca amplia) — mesma regra das Entregas.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const doEscopo = {
    tipo: "CONTRACHEQUE",
    empresaId: { in: escopo },
    arquivoId: { not: null },
    // Só ficha ativa: desligado não entra no portal (lerSessaoPortal), e o
    // aviso ficaria "não abriu" para sempre. A prova de quem saiu é a da
    // rescisão, fora daqui.
    colaborador: { ativo: true, empresa: { ativo: true } },
  } as const;

  // Competências com contracheque no Dossiê, da mais nova para a mais antiga.
  const competencias = (
    await prisma.documentoColaborador.groupBy({
      by: ["competencia"],
      where: { ...doEscopo, competencia: { not: null } },
      _count: { _all: true },
      orderBy: { competencia: "desc" },
      take: 24,
    })
  )
    .filter((c) => c.competencia)
    .map((c) => ({ chave: chaveDaCompetencia(c.competencia!), total: c._count._all }));

  const escolhida = competenciaDoTexto(competenciaParam ?? "") ?? competenciaDoTexto(competencias[0]?.chave ?? "");

  const docs = escolhida
    ? await prisma.documentoColaborador.findMany({
        where: { ...doEscopo, competencia: escolhida },
        orderBy: { colaborador: { nome: "asc" } },
        take: 1000,
        select: {
          id: true,
          empresaId: true,
          arquivoId: true,
          chaveDedupe: true,
          colaborador: {
            select: {
              id: true,
              nome: true,
              ativo: true,
              email: true,
              telegramChatId: true,
              empresa: { select: { nome: true } },
              setor: { select: { nome: true } },
            },
          },
          recibo: {
            select: {
              enviadoEm: true,
              canal: true,
              envioErro: true,
              envios: true,
              vistoEm: true,
              confirmadoEm: true,
              confirmadoIp: true,
              fotoArquivoId: true,
            },
          },
        },
      })
    : [];

  const quando = (d: Date | null | undefined) => (d ? formatarDataHoraBrasilia(d) : null);
  const linhas: LinhaContracheque[] = docs.map((d) => {
    const tipoFolha = tipoFolhaDaChave(d.chaveDedupe);
    return {
      documentoId: d.id,
      empresaId: d.empresaId,
      arquivoId: d.arquivoId,
      pessoa: d.colaborador.nome,
      colaboradorId: d.colaborador.id,
      desligado: !d.colaborador.ativo,
      empresa: d.colaborador.empresa.nome,
      setor: d.colaborador.setor?.nome ?? "—",
      temTelegram: !!d.colaborador.telegramChatId,
      temEmail: !!d.colaborador.email,
      folha: rotuloDoContracheque(escolhida!, tipoFolha),
      situacao: situacaoDo(d.recibo),
      enviadoEm: quando(d.recibo?.enviadoEm),
      canal: d.recibo?.canal ?? null,
      envioErro: d.recibo?.envioErro ?? null,
      envios: d.recibo?.envios ?? 0,
      vistoEm: quando(d.recibo?.vistoEm),
      confirmadoEm: quando(d.recibo?.confirmadoEm),
      confirmadoIp: d.recibo?.confirmadoIp ?? null,
      fotoArquivoId: d.recibo?.fotoArquivoId ?? null,
    };
  });

  return (
    <ContrachequesView
      empresaId={empresaId}
      competencias={competencias}
      competencia={escolhida ? chaveDaCompetencia(escolhida) : null}
      linhas={linhas}
    />
  );
}
