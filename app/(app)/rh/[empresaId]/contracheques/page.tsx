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
import { contarFilaEmailContracheque } from "@/lib/contracheques/fila-email";
import { ContrachequesView, type LinhaContracheque } from "./contracheques-view";

// Envio de contracheques (v1.180.0). A pergunta que esta tela responde: "quem
// já recebeu — e confirmou, com foto — o contracheque deste mês?". Os
// contracheques chegam ao Dossiê pela Caixa de documentos; daqui o RH manda o
// aviso e acompanha abertura e confirmação.

// Enviar a competência inteira manda um aviso POR PESSOA, em série — mesmo
// motivo do teto das Entregas: sem isto, 200 avisos morrem no timeout padrão.
export const maxDuration = 300;

/** Quantos contracheques a tela lista de uma vez. Passou disso, avisa (não corta calado). */
const LIMITE_DA_LISTA = 1000;

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
    // Desligado ENTRA (26/11/2026). Antes só ficha ativa, e o contracheque do
    // mês da rescisão sumia da tela e do envio — justo o que o ex-colaborador
    // tem direito de receber. A assinatura não passa pelo portal: é o link
    // /assinar/<token> do e-mail, validado por CPF, que funciona para quem
    // saiu. O envio para desligado vai só por e-mail (ver
    // lib/contracheques/envio.ts). Empresa inativa continua fora — é escopo.
    colaborador: { empresa: { ativo: true } },
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

  // Teto da lista: um a mais que o limite para SABER que cortou — antes o
  // `take: 1000` cortava calado e a tela parecia a competência inteira.
  const docsBrutos = escolhida
    ? await prisma.documentoColaborador.findMany({
        where: { ...doEscopo, competencia: escolhida },
        orderBy: { colaborador: { nome: "asc" } },
        take: LIMITE_DA_LISTA + 1,
        select: {
          id: true,
          empresaId: true,
          arquivoId: true,
          chaveDedupe: true,
          colaborador: {
            select: {
              id: true,
              nome: true,
              cpf: true,
              ativo: true,
              email: true,
              telegramChatId: true,
              telegramInvalidoEm: true,
              telegramInvalidoMotivo: true,
              empresa: { select: { nome: true, cnpj: true } },
              setor: { select: { nome: true } },
            },
          },
          recibo: {
            select: {
              enviadoEm: true,
              canal: true,
              envioErro: true,
              envios: true,
              cienciaTelegramEm: true,
              vistoEm: true,
              confirmadoEm: true,
              confirmadoIp: true,
              fotoArquivoId: true,
              comprovanteArquivoId: true,
              hashDocumento: true,
              lembretesEnviados: true,
              bloqueadoEm: true,
              emailNaFilaDesde: true,
              invalidacoes: {
                orderBy: { invalidadoEm: "desc" },
                take: 5,
                select: {
                  id: true,
                  motivo: true,
                  invalidadoPorNome: true,
                  invalidadoEm: true,
                  confirmadoEmOriginal: true,
                  confirmadoIp: true,
                  fotoArquivoId: true,
                  comprovanteArquivoId: true,
                },
              },
            },
          },
        },
      })
    : [];
  const cortou = docsBrutos.length > LIMITE_DA_LISTA;
  const docs = cortou ? docsBrutos.slice(0, LIMITE_DA_LISTA) : docsBrutos;
  const limiteAtingido =
    cortou && escolhida
      ? {
          mostrados: LIMITE_DA_LISTA,
          total: await prisma.documentoColaborador.count({ where: { ...doEscopo, competencia: escolhida } }),
        }
      : null;

  const agora = new Date();
  const quando = (d: Date | null | undefined) => (d ? formatarDataHoraBrasilia(d) : null);
  const linhas: LinhaContracheque[] = docs.map((d) => {
    const tipoFolha = tipoFolhaDaChave(d.chaveDedupe);
    return {
      documentoId: d.id,
      empresaId: d.empresaId,
      arquivoId: d.arquivoId,
      pessoa: d.colaborador.nome,
      cpf: d.colaborador.cpf ?? "—",
      colaboradorId: d.colaborador.id,
      desligado: !d.colaborador.ativo,
      empresa: d.colaborador.empresa.nome,
      cnpj: d.colaborador.empresa.cnpj ?? "—",
      setor: d.colaborador.setor?.nome ?? "—",
      // Desligado não é avisado nem cobrado no Telegram (envio.ts e a cobrança
      // em lote filtram por ativo) — mostrar "Telegram ativo" mentiria. Chat
      // recusado pelo Telegram (bot bloqueado, chat apagado) também não conta
      // como "Telegram ativo" — OS 11/11/2026, item 4.
      temTelegram: d.colaborador.ativo && !!d.colaborador.telegramChatId && !d.colaborador.telegramInvalidoEm,
      telegramBloqueado: d.colaborador.ativo && !!d.colaborador.telegramChatId && !!d.colaborador.telegramInvalidoEm,
      telegramMotivo: d.colaborador.telegramInvalidoMotivo ?? null,
      emailNaFila: !!d.recibo?.emailNaFilaDesde,
      temEmail: !!d.colaborador.email,
      email: d.colaborador.email,
      folha: rotuloDoContracheque(escolhida!, tipoFolha),
      situacao: situacaoDo(d.recibo, agora),
      enviadoEm: quando(d.recibo?.enviadoEm),
      canal: d.recibo?.canal ?? null,
      envioErro: d.recibo?.envioErro ?? null,
      envios: d.recibo?.envios ?? 0,
      cienciaTelegramEm: quando(d.recibo?.cienciaTelegramEm),
      vistoEm: quando(d.recibo?.vistoEm),
      confirmadoEm: quando(d.recibo?.confirmadoEm),
      confirmadoIp: d.recibo?.confirmadoIp ?? null,
      hashDocumento: d.recibo?.hashDocumento ?? null,
      fotoArquivoId: d.recibo?.fotoArquivoId ?? null,
      comprovanteArquivoId: d.recibo?.comprovanteArquivoId ?? null,
      lembretesEnviados: d.recibo?.lembretesEnviados ?? 0,
      bloqueado: d.recibo?.bloqueadoEm !== null && d.recibo?.bloqueadoEm !== undefined,
      invalidacoes: (d.recibo?.invalidacoes ?? []).map((inv) => ({
        id: inv.id,
        motivo: inv.motivo,
        invalidadoPorNome: inv.invalidadoPorNome,
        invalidadoEm: formatarDataHoraBrasilia(inv.invalidadoEm),
        confirmadoEmOriginal: formatarDataHoraBrasilia(inv.confirmadoEmOriginal),
        confirmadoIp: inv.confirmadoIp ?? null,
        fotoArquivoId: inv.fotoArquivoId ?? null,
        comprovanteArquivoId: inv.comprovanteArquivoId ?? null,
      })),
    };
  });

  // Fila do teto diário (OS 11/11/2026, item 1): conta o ESCOPO inteiro, não só
  // a competência aberta — quem está na fila de outubro também importa.
  const naFilaEmail = await contarFilaEmailContracheque(escopo);

  return (
    <ContrachequesView
      empresaId={empresaId}
      naFilaEmail={naFilaEmail}
      competencias={competencias}
      competencia={escolhida ? chaveDaCompetencia(escolhida) : null}
      linhas={linhas}
      limiteAtingido={limiteAtingido}
    />
  );
}
