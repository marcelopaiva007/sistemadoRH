"use server";

// Caixa de documentos — o que o RH faz na fila: gravar com um clique o que a
// leitura automática deixou para conferir, descartar, desfazer uma gravação e
// mandar ler de novo. A leitura em si roda pelas rotas de
// app/api/rh/[empresaId]/caixa-documentos (ver lá o porquê).
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { apenasDigitosCnpj } from "@/lib/cnpj";
import type { ActionResult } from "@/lib/constants";
import { alcancaEscopo, type UsuarioCaixa } from "@/lib/caixa-documentos/acesso";
import { normalizarCampos, type CamposLidos, type InventarioPaginas } from "@/lib/caixa-documentos/extracao";
import { faltasParaGravar, paginasSoDele } from "@/lib/caixa-documentos/decidir";
import { gravarItem, type Ficha } from "@/lib/caixa-documentos/gravar";
import { apagarOriginal, bytesDoArquivo, fatiaDoItem, lerDados } from "@/lib/caixa-documentos/processar";
import { VALORES_TIPO_CAIXA, destinoDoTipo, tipoCaixaLabel, visivelNoPortal, type TipoCaixa } from "@/lib/caixa-documentos/tipos";

async function carregar(empresaId: string, itemId: string) {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const item = await prisma.itemDocumentoRecebido.findFirst({
    where: { id: itemId, recebido: { empresaId } },
    include: { recebido: true },
  });
  if (!item || !(await alcancaEscopo(user, item.recebido.empresasEscopo))) return null;
  return { user, item };
}

function revalidar(empresaId: string) {
  revalidatePath(`/rh/${empresaId}/caixa-documentos`);
}

/**
 * Grava um item da conferência com o que o RH confirmou (pessoa, tipo,
 * campos, páginas). Mesmas regras da gravação automática — o gravador é o
 * mesmo — mais as travas do que só uma pessoa pode decidir: empresa diferente
 * da impressa no documento e páginas que a IA achou com mais de uma pessoa.
 */
export async function confirmarItem(empresaId: string, itemId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const carregado = await carregar(empresaId, itemId);
  if (!carregado) return { ok: false, error: "Documento não encontrado." };
  const { user, item } = carregado;
  const recebido = item.recebido;
  if (item.status !== "CONFERIR") return { ok: false, error: "Este documento já foi resolvido." };

  const tipo = String(formData.get("tipo") ?? "") as TipoCaixa;
  if (!VALORES_TIPO_CAIXA.includes(tipo) || destinoDoTipo(tipo, false) === null) {
    return { ok: false, error: "Escolha o tipo de documento." };
  }

  const colaboradorId = String(formData.get("colaboradorId") ?? "");
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId: { in: recebido.empresasEscopo }, empresa: { ativo: true } },
    select: {
      id: true,
      empresaId: true,
      nome: true,
      ativo: true,
      posicaoId: true,
      dataAdmissao: true,
      dataDesligamento: true,
      empresa: { select: { cnpj: true } },
    },
  });
  if (!colaborador) return { ok: false, error: "Escolha a pessoa." };

  // Campos: o que veio do formulário por cima do que a IA leu, passando pela
  // MESMA limpeza (datas que não existem viram vazio, enum fora da lista some).
  const lidos = lerDados(item.dados).campos;
  const doForm: Record<string, unknown> = {};
  for (const chave of Object.keys(lidos) as (keyof CamposLidos)[]) {
    const v = formData.get(chave);
    if (v === null) continue;
    const texto = String(v).trim();
    doForm[chave] = ["anoCalendario", "dias", "cargaHoraria"].includes(chave) ? (texto ? Number(texto) : 0) : texto;
  }
  const campos = normalizarCampos({ ...lidos, ...doForm });
  const faltas = faltasParaGravar(tipo, campos);
  if (faltas.length > 0) return { ok: false, error: faltas.join(" ") };

  const total = recebido.paginas ?? 1;
  const de = Number(formData.get("paginaInicio") ?? item.paginaInicio);
  const ate = Number(formData.get("paginaFim") ?? item.paginaFim);
  if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 1 || ate < de || ate > total) {
    return { ok: false, error: `Páginas inválidas (o arquivo tem ${total}).` };
  }

  // CNPJ impresso no documento ≠ empresa da ficha escolhida: só com
  // confirmação explícita (vai para a auditoria).
  const cnpjDaFicha = colaborador.empresa.cnpj ? apenasDigitosCnpj(colaborador.empresa.cnpj) : null;
  const empresaDiferente = !!item.cnpjLido && item.cnpjLido !== cnpjDaFicha;
  if (empresaDiferente && formData.get("confirmoEmpresa") !== "on") {
    return { ok: false, error: "O CNPJ impresso no documento é de outra empresa. Marque a confirmação se esta é mesmo a ficha certa." };
  }

  // Páginas: com documento de outra pessoa nelas, nada vai ao portal — sem
  // exceção. Se só o inventário da IA ficou em dúvida, o RH, que está vendo as
  // páginas, pode confirmar.
  const vaiAoPortal = visivelNoPortal(tipo) || tipo === "OUTRO_DO_COLABORADOR";
  const outros = await prisma.itemDocumentoRecebido.findMany({
    where: { recebidoId: recebido.id, id: { not: item.id }, status: { not: "DESCARTADO" }, tipo: { not: "NAO_E_DE_COLABORADOR" } },
    select: { paginaInicio: true, paginaFim: true },
  });
  const sobrepoe = outros.some((o) => o.paginaInicio <= ate && o.paginaFim >= de);
  if (vaiAoPortal && sobrepoe) {
    return {
      ok: false,
      error:
        "Estas páginas têm documento de outra pessoa — o arquivo iria para o portal dela com dados de outro. Peça ao contador o arquivo com um documento por página, ou descarte.",
    };
  }
  const inventarioOk = paginasSoDele(
    { paginaInicio: de, paginaFim: ate, cpf: item.cpfLido, pis: item.pisLido },
    [],
    (recebido.inventarioPaginas as InventarioPaginas | null) ?? null,
    true,
  );
  if (vaiAoPortal && !inventarioOk && formData.get("confirmoPaginas") !== "on") {
    return {
      ok: false,
      error: "A leitura não confirmou que estas páginas são só desta pessoa. Olhe as páginas e marque a confirmação.",
    };
  }

  if (!recebido.arquivoId) return { ok: false, error: "O arquivo original não está mais guardado — anexe pela ficha." };
  const arquivo = await prisma.arquivo.findUnique({ where: { id: recebido.arquivoId }, select: { blobUrl: true, conteudo: true } });
  const original = arquivo ? await bytesDoArquivo(arquivo) : null;
  if (!original) return { ok: false, error: "Não consegui abrir o arquivo original — tente de novo." };

  const pego = await prisma.itemDocumentoRecebido.updateMany({
    where: { id: item.id, status: "CONFERIR" },
    data: { status: "GRAVANDO", paginaInicio: de, paginaFim: ate, tipo },
  });
  if (pego.count !== 1) return { ok: false, error: "Este documento acabou de ser resolvido em outra tela." };

  const ficha: Ficha = colaborador;
  const gravado = await gravarItem({
    tipo,
    campos,
    ficha,
    fatia: await fatiaDoItem(recebido, original, de, ate, tipo, ficha.nome),
    paginasExclusivas: !sobrepoe,
    usuario: { id: user.id, nome: user.name ?? null },
    origem: {
      recebidoId: recebido.id,
      itemId: item.id,
      arquivo: recebido.nome,
      paginaInicio: de,
      paginaFim: ate,
      enviadoPor: recebido.criadoPorNome,
    },
    automatico: false,
    chaveMatch: empresaDiferente ? "MANUAL_OUTRA_EMPRESA" : "MANUAL",
    confianca: item.confianca,
  });
  if (!gravado.ok) {
    await prisma.itemDocumentoRecebido.updateMany({
      where: { id: item.id, status: "GRAVANDO" },
      data: { status: "CONFERIR", paginaInicio: item.paginaInicio, paginaFim: item.paginaFim, tipo: item.tipo },
    });
    return { ok: false, error: gravado.error };
  }

  revalidar(empresaId);
  return { ok: true };
}

export async function descartarItem(empresaId: string, itemId: string): Promise<ActionResult> {
  const carregado = await carregar(empresaId, itemId);
  if (!carregado) return { ok: false, error: "Documento não encontrado." };
  const { item } = carregado;
  const r = await prisma.itemDocumentoRecebido.updateMany({
    where: { id: item.id, status: { in: ["CONFERIR", "PENDENTE"] } },
    data: { status: "DESCARTADO", cpfLido: null, pisLido: null, dados: {}, resolvidoPorNome: carregado.user.name ?? null, resolvidoEm: new Date() },
  });
  if (r.count !== 1) return { ok: false, error: "Este documento já foi resolvido." };
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "ItemDocumentoRecebido",
    entidadeId: item.id,
    resumo: `Caixa de documentos: ${tipoCaixaLabel(item.tipo)} (pág. ${item.paginaInicio}) de "${item.recebido.nome}" descartado.`,
  });
  revalidar(empresaId);
  return { ok: true };
}

/** Descarta de uma vez as páginas que a IA disse não serem de ninguém (capa, resumo, guia). */
export async function descartarNaoColaborador(empresaId: string, recebidoId: string): Promise<ActionResult> {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const recebido = await prisma.documentoRecebido.findFirst({ where: { id: recebidoId, empresaId } });
  if (!recebido || !(await alcancaEscopo(user, recebido.empresasEscopo))) return { ok: false, error: "Arquivo não encontrado." };
  const r = await prisma.itemDocumentoRecebido.updateMany({
    where: { recebidoId, tipo: "NAO_E_DE_COLABORADOR", status: "CONFERIR" },
    data: { status: "DESCARTADO", dados: {}, resolvidoPorNome: user.name ?? null, resolvidoEm: new Date() },
  });
  if (r.count > 0) {
    await registrarAuditoria({
      empresaId,
      acao: "EXCLUIR",
      entidade: "DocumentoRecebido",
      entidadeId: recebidoId,
      resumo: `Caixa de documentos: ${r.count} página(s) que não eram de colaborador descartada(s) em "${recebido.nome}".`,
    });
  }
  revalidar(empresaId);
  return { ok: true };
}

/**
 * Descarta o arquivo: o que falta conferir sai da fila. O que JÁ foi gravado
 * continua nas fichas (use "Desfazer" em cada um para tirar).
 */
export async function descartarRecebido(empresaId: string, recebidoId: string): Promise<ActionResult> {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const recebido = await prisma.documentoRecebido.findFirst({ where: { id: recebidoId, empresaId } });
  if (!recebido || !(await alcancaEscopo(user, recebido.empresasEscopo))) return { ok: false, error: "Arquivo não encontrado." };
  if (recebido.processandoDesde && recebido.processandoDesde > new Date(Date.now() - 330_000)) {
    return { ok: false, error: "O arquivo está sendo lido agora — espere a rodada terminar." };
  }
  await prisma.$transaction([
    prisma.itemDocumentoRecebido.updateMany({
      where: { recebidoId, status: { in: ["CONFERIR", "PENDENTE"] } },
      data: { status: "DESCARTADO", cpfLido: null, pisLido: null, dados: {}, resolvidoPorNome: user.name ?? null, resolvidoEm: new Date() },
    }),
    prisma.documentoRecebido.update({ where: { id: recebidoId }, data: { status: "DESCARTADO", processandoDesde: null } }),
  ]);
  const gravados = await prisma.itemDocumentoRecebido.count({ where: { recebidoId, status: "GRAVADO" } });
  // Sem nada gravado, o original não serve para mais nada (nem para desfazer).
  if (gravados === 0) await apagarOriginal(recebidoId);
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "DocumentoRecebido",
    entidadeId: recebidoId,
    resumo: `Caixa de documentos: arquivo "${recebido.nome}" descartado${gravados ? ` (${gravados} documento(s) já gravado(s) continuam nas fichas)` : ""}.`,
  });
  revalidar(empresaId);
  return { ok: true };
}

/** Arquivo em ERRO volta para a fila de leitura, do ponto onde parou. */
export async function tentarDeNovo(empresaId: string, recebidoId: string): Promise<ActionResult> {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const recebido = await prisma.documentoRecebido.findFirst({ where: { id: recebidoId, empresaId } });
  if (!recebido || !(await alcancaEscopo(user, recebido.empresasEscopo))) return { ok: false, error: "Arquivo não encontrado." };
  if (!recebido.arquivoId) return { ok: false, error: "O arquivo original não está mais guardado — envie de novo." };
  const r = await prisma.documentoRecebido.updateMany({
    where: { id: recebidoId, status: "ERRO" },
    data: {
      status: (recebido.paginas ?? 1) < recebido.proximaPagina ? "ROTEANDO" : recebido.proximaPagina > 1 ? "LENDO" : "PENDENTE",
      tentativas: 0,
      erro: null,
      processandoDesde: null,
    },
  });
  if (r.count !== 1) return { ok: false, error: "Este arquivo não está com erro." };
  revalidar(empresaId);
  return { ok: true };
}

/**
 * Desfaz uma gravação (automática ou manual): apaga o registro criado e o
 * arquivo da pessoa, e o documento volta para a conferência. Existe porque o
 * que vai ao Dossiê aparece no portal na hora — um engano precisa sair rápido.
 */
export async function desfazerItem(empresaId: string, itemId: string): Promise<ActionResult> {
  const carregado = await carregar(empresaId, itemId);
  if (!carregado) return { ok: false, error: "Documento não encontrado." };
  const { user, item } = carregado;
  if (item.status !== "GRAVADO" || !item.destinoEntidade || !item.destinoId) {
    return { ok: false, error: "Este documento não está gravado." };
  }
  if (!item.recebido.arquivoId) {
    return { ok: false, error: "O arquivo original já não está guardado — exclua o registro pela ficha da pessoa." };
  }
  const id = item.destinoId;

  const resultado = await prisma.$transaction(async (tx) => {
    let arquivoId: string | null = null;
    let empresaDoDestino: string | null = null;
    switch (item.destinoEntidade) {
      case "ExameOcupacional": {
        const r = await tx.exameOcupacional.findUnique({ where: { id }, select: { arquivoId: true, empresaId: true } });
        if (!r) return "sumiu";
        await tx.exameOcupacional.delete({ where: { id } });
        [arquivoId, empresaDoDestino] = [r.arquivoId, r.empresaId];
        break;
      }
      case "CertificadoNR": {
        const r = await tx.certificadoNR.findUnique({ where: { id }, select: { arquivoId: true, empresaId: true } });
        if (!r) return "sumiu";
        await tx.certificadoNR.delete({ where: { id } });
        [arquivoId, empresaDoDestino] = [r.arquivoId, r.empresaId];
        break;
      }
      case "Ausencia": {
        const r = await tx.ausencia.findUnique({ where: { id }, select: { arquivoId: true, empresaId: true, status: true } });
        if (!r) return "sumiu";
        // Aprovada já mexeu em folha/ponto: desfazer aqui esconderia isso.
        if (r.status !== "PENDENTE") return "decidida";
        await tx.ausencia.delete({ where: { id } });
        [arquivoId, empresaDoDestino] = [r.arquivoId, r.empresaId];
        break;
      }
      case "DocumentoColaborador": {
        const r = await tx.documentoColaborador.findUnique({ where: { id }, select: { arquivoId: true, empresaId: true } });
        if (!r) return "sumiu";
        await tx.documentoColaborador.delete({ where: { id } });
        [arquivoId, empresaDoDestino] = [r.arquivoId, r.empresaId];
        break;
      }
      default:
        return "sumiu";
    }
    if (arquivoId) await tx.arquivo.delete({ where: { id: arquivoId } });
    await tx.itemDocumentoRecebido.update({
      where: { id: item.id },
      data: {
        status: "CONFERIR",
        destinoEntidade: null,
        destinoId: null,
        resolvidoPorNome: null,
        resolvidoEm: null,
        motivo: `Gravação desfeita por ${user.name ?? "RH"} — confira e grave de novo, ou descarte.`,
      },
    });
    if (item.recebido.status === "CONCLUIDO" || item.recebido.status === "DESCARTADO") {
      await tx.documentoRecebido.update({ where: { id: item.recebidoId }, data: { status: "CONCLUIDO" } });
    }
    return { empresaDoDestino };
  });

  if (resultado === "sumiu") return { ok: false, error: "O registro já não existe (foi excluído pela ficha)." };
  if (resultado === "decidida") return { ok: false, error: "A ausência já foi decidida em Aprovações — ajuste pela ficha da pessoa." };

  await registrarAuditoria({
    empresaId: resultado.empresaDoDestino,
    acao: "EXCLUIR",
    entidade: item.destinoEntidade,
    entidadeId: id,
    resumo: `${tipoCaixaLabel(item.tipo)} gravado pela Caixa de documentos foi desfeito (volta para a conferência).`,
    detalhes: { caixa: item.recebidoId, item: item.id },
  });
  if (item.colaboradorId && resultado.empresaDoDestino) {
    revalidatePath(`/rh/${resultado.empresaDoDestino}/colaboradores/${item.colaboradorId}`);
  }
  revalidar(empresaId);
  return { ok: true };
}
