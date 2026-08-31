import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { podeVerDemanda, prazoEmTexto } from "@/lib/delegacoes/consultas";
import {
  papelNaDemanda,
  prazoLimiteAceite,
  validarMarcarEmRisco,
  validarRepactuacao,
  validarReporte,
  validarTransicao,
} from "@/lib/delegacoes/estados";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { DemandaDetalhe } from "./demanda-detalhe";

/**
 * Detalhe da demanda: os dados, a linha do tempo completa e as ações do papel
 * de quem está olhando.
 *
 * O QUE PODE APARECER É DECIDIDO AQUI, no servidor, perguntando à própria
 * máquina de estados — não reimplementando as regras em `if` de tela. Cada
 * `podeX` abaixo é uma chamada real de `validarTransicao` com o retrato atual:
 * se a máquina mudar, a tela acompanha sozinha, e nunca oferece um botão que o
 * backend vai recusar. O contrário — tela permissiva e backend restritivo —
 * é o que ensina o usuário a desconfiar do sistema.
 */
export default async function DemandaPage({
  params,
}: {
  params: Promise<{ demandaId: string }>;
}) {
  const { demandaId } = await params;
  const usuario = await requireDelegacoesAccess();

  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      criterioAceite: true,
      evidenciaExigida: true,
      criticidade: true,
      horasEstimadas: true,
      status: true,
      emRisco: true,
      prazo: true,
      prazoOriginal: true,
      periodicidadeRetorno: true,
      area: true,
      enviadaEm: true,
      aceiteEm: true,
      encerradaEm: true,
      solicitanteId: true,
      responsavelId: true,
      solicitante: { select: { nome: true } },
      responsavel: { select: { nome: true } },
      marca: { select: { nome: true } },
      repactuacoes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, prazoAnterior: true, prazoNovo: true, motivo: true, autorNome: true, createdAt: true },
      },
      entregas: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          evidenciaTipo: true,
          evidenciaTexto: true,
          arquivoId: true,
          resultado: true,
          aceita: true,
          motivoDevolucao: true,
          createdAt: true,
        },
      },
      eventos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, tipoEvento: true, autorNome: true, dados: true, createdAt: true },
      },
      interacoes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, tipo: true, canal: true, conteudo: true, createdAt: true },
      },
    },
  });

  // "Não encontrada" também para quem não participa: mensagem diferente para
  // "não existe" e "não é sua" transforma a URL em oráculo de ids.
  if (!demanda || !podeVerDemanda(usuario, demanda)) notFound();

  // Candidatos a NOVO responsável, só para quem pode transferir (solicitante,
  // antes do aceite) — em qualquer outro caso a lista nunca é usada, mas
  // buscá-la sempre é mais simples do que replicar aqui a condição de
  // `podem.transferir` mais abaixo, e o custo é o mesmo de `/delegacoes/delegadas`.
  const podeTransferir =
    demanda.solicitanteId === usuario.id &&
    (demanda.status === "RASCUNHO" || demanda.status === "ENVIADA");
  const usuariosParaTransferir = podeTransferir
    ? await (async () => {
        const [usuarios, colaboradores] = await Promise.all([
          prisma.user.findMany({
            where: { ativo: true, NOT: { id: demanda.responsavelId } },
            select: { id: true, nome: true, role: true },
            orderBy: { nome: "asc" },
          }),
          prisma.colaborador.findMany({
            where: { ativo: true },
            select: { id: true, nome: true, usuario: { select: { id: true } } },
            orderBy: { nome: "asc" },
          }),
        ]);
        // SÓ COLABORADORES, como na criação da demanda (decisão da Direção em
        // 31/08/2026): os usuários do sistema saíram do seletor porque o
        // Telegram — o canal de cobrança — é vinculado à ficha de colaborador.
        return [
          ...usuarios
            .filter((u) => u.role === PAPEL_PORTAL)
            .map((u) => ({ tipo: "COLABORADOR" as const, idEhFicha: false, id: u.id, nome: u.nome })),
          ...colaboradores
            .filter((c) => !c.usuario)
            .map((c) => ({ tipo: "COLABORADOR" as const, idEhFicha: true, id: c.id, nome: c.nome })),
        ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      })()
    : [];

  const paraRegras = {
    status: demanda.status,
    solicitanteId: demanda.solicitanteId,
    responsavelId: demanda.responsavelId,
    evidenciaExigida: demanda.evidenciaExigida,
  };
  const eu = usuario.id ?? "";
  // Evidência de mentira só para perguntar "o botão de entregar existiria?" — a
  // exigência de verdade é cobrada na hora de entregar, com o que a pessoa
  // digitar. Sem isto, a regra 4 esconderia o botão de todo mundo.
  const evidenciaFicticia =
    demanda.evidenciaExigida === "ARQUIVO" ? { arquivoId: "?" } : { evidenciaTexto: "?" };

  const limiteAceite = prazoLimiteAceite(demanda);

  return (
    <DemandaDetalhe
      demanda={{
        id: demanda.id,
        titulo: demanda.titulo,
        descricao: demanda.descricao,
        criterioAceite: demanda.criterioAceite,
        evidenciaExigida: demanda.evidenciaExigida,
        criticidade: demanda.criticidade,
        horasEstimadas: demanda.horasEstimadas,
        status: demanda.status,
        emRisco: demanda.emRisco,
        prazoTexto: prazoEmTexto(demanda.prazo),
        prazoOriginalTexto: prazoEmTexto(demanda.prazoOriginal),
        prazoMudou: demanda.prazo.getTime() !== demanda.prazoOriginal.getTime(),
        periodicidadeRetorno: demanda.periodicidadeRetorno,
        area: demanda.area,
        marcaNome: demanda.marca?.nome ?? null,
        solicitanteNome: demanda.solicitante.nome,
        responsavelNome: demanda.responsavel.nome,
        aceiteEmTexto: demanda.aceiteEm ? formatarDataHoraBrasilia(demanda.aceiteEm) : null,
        encerradaEmTexto: demanda.encerradaEm ? formatarDataHoraBrasilia(demanda.encerradaEm) : null,
        limiteAceiteTexto:
          limiteAceite && !demanda.aceiteEm ? formatarDataHoraBrasilia(limiteAceite) : null,
      }}
      papel={papelNaDemanda(eu, paraRegras)}
      podem={{
        enviar: validarTransicao("ENVIAR", paraRegras, eu, {
          criterioAceite: demanda.criterioAceite,
          prazo: demanda.prazo,
        }).ok,
        aceitar: validarTransicao("ACEITAR", paraRegras, eu).ok,
        entregar: validarTransicao("ENTREGAR", paraRegras, eu, evidenciaFicticia).ok,
        encerrar: validarTransicao("ENCERRAR", paraRegras, eu).ok,
        concluirDireto: validarTransicao("CONCLUIR_DIRETO", paraRegras, eu, { motivo: "?" }).ok,
        devolver: validarTransicao("DEVOLVER", paraRegras, eu, { motivo: "?" }).ok,
        cancelar: validarTransicao("CANCELAR", paraRegras, eu, { motivo: "?" }).ok,
        repactuar: validarRepactuacao(paraRegras, eu, { prazoNovo: new Date(), motivo: "?" }).ok,
        reportar: validarReporte(paraRegras, eu, "?").ok,
        marcarRisco: validarMarcarEmRisco(paraRegras, eu).ok,
        // Não é transição de estado (por isso não mora em `validarX` da máquina
        // de estados) — é um cutucão único: só quem pediu, só enquanto ainda
        // não foi cobrada (regra 5 ou este botão, o que vier primeiro).
        cobrarAceite:
          papelNaDemanda(eu, paraRegras) === "SOLICITANTE" &&
          demanda.status === "ENVIADA" &&
          !demanda.emRisco,
        transferir: podeTransferir,
      }}
      usuariosParaTransferir={usuariosParaTransferir}
      repactuacoes={demanda.repactuacoes.map((r) => ({
        id: r.id,
        de: prazoEmTexto(r.prazoAnterior),
        para: prazoEmTexto(r.prazoNovo),
        motivo: r.motivo,
        autorNome: r.autorNome ?? "—",
        quandoTexto: formatarDataHoraBrasilia(r.createdAt),
      }))}
      entregas={demanda.entregas.map((e) => ({
        id: e.id,
        evidenciaTipo: e.evidenciaTipo,
        evidenciaTexto: e.evidenciaTexto,
        temArquivo: !!e.arquivoId,
        resultado: e.resultado,
        aceita: e.aceita,
        motivoDevolucao: e.motivoDevolucao,
        quandoTexto: formatarDataHoraBrasilia(e.createdAt),
      }))}
      // Linha do tempo = eventos (o que o sistema registrou) + interações (o
      // que foi dito), fundidos e ordenados juntos: separados em dois blocos, a
      // história fica ilegível — "reportou" e "entregou" pertencem à mesma
      // sequência.
      linhaDoTempo={[
        ...demanda.eventos.map((e) => ({
          id: `ev-${e.id}`,
          tipo: "EVENTO" as const,
          rotulo: e.tipoEvento,
          autorNome: e.autorNome ?? "sistema",
          texto:
            e.dados && typeof e.dados === "object" && "motivo" in e.dados
              ? String((e.dados as { motivo?: unknown }).motivo ?? "")
              : null,
          quando: e.createdAt.getTime(),
          quandoTexto: formatarDataHoraBrasilia(e.createdAt),
        })),
        ...demanda.interacoes.map((i) => ({
          id: `in-${i.id}`,
          tipo: "INTERACAO" as const,
          rotulo: i.tipo === "ENVIADA" ? "Cobrança enviada" : "Resposta do responsável",
          autorNome: i.canal.toLowerCase(),
          texto: i.conteudo,
          quando: i.createdAt.getTime(),
          quandoTexto: formatarDataHoraBrasilia(i.createdAt),
        })),
      ].sort((a, b) => b.quando - a.quando)}
    />
  );
}
