"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import { dataLimiteDenuncia, janelaRenovatoria, proximoReajuste } from "@/lib/processos/contratos";
import type { ActionResult } from "@/lib/constants";

// Contratos e contrapartes do módulo Processos & Ativos.
//
// Mesmas duas regras de lib/actions/processos-frota.ts, e pelos mesmos motivos:
// o acesso é sempre `requireProcessosEmpresa` (nunca reimplementado à mão), e o
// `empresaId` gravado vem SEMPRE do alvo buscado dentro de `empresasVisiveis`,
// nunca do `empresaId` da URL — as telas são consolidadas, e uma linha de outro
// CNPJ na lista não pode mudar de dono ao ser editada.
//
// A diferença de modelo: `Contraparte` é do GRUPO, não do CNPJ. O mesmo locador
// aluga torre para duas empresas do grupo; duplicá-lo por CNPJ é como a certidão
// vencida ficaria em dia numa ficha e vencida na outra. Por isso ela não tem
// `empresaId` e as actions de contraparte só exigem que a pessoa alcance o
// módulo — o que ela vê de contrato continua escopado normalmente.
//
// NÃO existe aqui controle de certidão de fornecedor: o CEO decidiu em
// 23/08/2026 não desenvolver (o grupo não vai usar). A regra que sobrou da
// homologação de terceiros é `criticidade` na contraparte — um rótulo para a
// leitura de risco, sem fluxo de cobrança atrás.

function caminho(empresaId: string) {
  return `/processos/${empresaId}`;
}

function limpo(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/** "12.345.678/0001-90" e "12345678000190" são o mesmo fornecedor. */
function normalizarDocumento(v: string): string {
  return v.replace(/\D/g, "");
}

/**
 * Número tratado como número — mas "" não é 0.
 *
 * O formulário manda string vazia para campo não preenchido, e `Number("")` é
 * 0: sem isto, "valor mensal em branco" viraria um contrato de R$ 0,00 no
 * relatório de custo, que é pior que um campo vazio porque parece dado.
 */
function numero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contraparte — o cadastro do outro lado, global ao grupo
// ─────────────────────────────────────────────────────────────────────────────

export async function salvarContraparte(input: {
  id?: string | null;
  /** Só para a guarda de acesso e para o revalidate — não é gravado. */
  empresaId: string;
  tipoPessoa: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnpjCpf: string;
  papeis: string[];
  criticidade?: string | null;
  emailNotificacaoFormal?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const razaoSocial = limpo(input.razaoSocial);
  if (!razaoSocial) return { ok: false, error: "Informe a razão social ou o nome." };

  const documento = normalizarDocumento(input.cnpjCpf ?? "");
  if (documento.length !== 11 && documento.length !== 14) {
    return { ok: false, error: "CNPJ deve ter 14 dígitos e CPF, 11." };
  }

  // O documento é único no grupo inteiro. Sem esta checagem, o erro chegaria
  // como violação de unique do Postgres — sem dizer QUEM já usa o número, que é
  // exatamente o que a pessoa precisa saber para não recadastrar.
  if (input.id) {
    const existe = await prisma.contraparte.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existe) return { ok: false, error: "Contraparte não encontrada." };
  }

  const jaExiste = await prisma.contraparte.findUnique({
    where: { cnpjCpf: documento },
    select: { id: true, razaoSocial: true },
  });
  if (jaExiste && jaExiste.id !== input.id) {
    return { ok: false, error: `Este CNPJ/CPF já está cadastrado como "${jaExiste.razaoSocial}".` };
  }

  const dados = {
    tipoPessoa: input.tipoPessoa || "JURIDICA",
    razaoSocial,
    nomeFantasia: limpo(input.nomeFantasia),
    cnpjCpf: documento,
    papeis: (input.papeis ?? []).join(","),
    criticidade: input.criticidade || "NORMAL",
    emailNotificacaoFormal: limpo(input.emailNotificacaoFormal),
    telefone: limpo(input.telefone),
    endereco: limpo(input.endereco),
    observacoes: limpo(input.observacoes),
  };

  const contraparte = input.id
    ? await prisma.contraparte.update({ where: { id: input.id }, data: dados })
    : await prisma.contraparte.create({
        data: { ...dados, criadoPorId: usuario.id, criadoPorNome: usuario.name ?? null },
      });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "Contraparte",
    entidadeId: contraparte.id,
    resumo: `${input.id ? "Editou" : "Cadastrou"} a contraparte ${razaoSocial}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true, id: contraparte.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contrato
// ─────────────────────────────────────────────────────────────────────────────

/** Os três dados que produzem a data do reajuste continuam os mesmos? */
function reajusteInalterado(
  anterior: { dataInicio: Date; mesBaseReajuste: number | null; periodicidadeReajusteMeses: number | null } | null,
  dataInicio: Date,
  mesBase: number | null,
  periodicidade: number | null,
): boolean {
  if (!anterior) return false;
  return (
    anterior.dataInicio.getTime() === dataInicio.getTime() &&
    anterior.mesBaseReajuste === mesBase &&
    anterior.periodicidadeReajusteMeses === periodicidade
  );
}

/**
 * Cadastra ou edita um contrato.
 *
 * As três datas de alerta — limite de denúncia, janela renovatória e próximo
 * reajuste — são MATERIALIZADAS aqui, não calculadas na leitura. Duas razões,
 * as mesmas da frota: o detector de pendências precisa filtrar por data no
 * banco (índice), e um alerta antigo tem que continuar explicando por que
 * disparou mesmo que a regra mude depois.
 */
export async function salvarContrato(input: {
  id?: string | null;
  /** O CNPJ da URL — guarda de acesso e revalidação da rota. */
  empresaId: string;
  /** O CNPJ que ASSINA o contrato. Pode ser outro: a tela é consolidada. */
  empresaContratoId: string;
  numero: string;
  contraparteId: string;
  tipo: string;
  categoria?: string | null;
  titulo: string;
  objeto?: string | null;
  status?: string | null;
  criticidade?: string | null;
  gestorId?: string | null;
  setorId?: string | null;
  dataAssinatura?: string | null;
  dataInicio: string;
  dataFim?: string | null;
  indeterminado?: boolean;
  renovacaoAutomatica?: boolean;
  avisoPrevioNaoRenovacaoDias?: number | null;
  locacaoNaoResidencial?: boolean;
  buildToSuit?: boolean;
  renunciaRevisionalPactuada?: boolean;
  valorMensal?: number | null;
  valorTotal?: number | null;
  indiceReajuste?: string | null;
  periodicidadeReajusteMeses?: number | null;
  mesBaseReajuste?: number | null;
  multaCompensatoriaPct?: number | null;
  multaMoratoriaPct?: number | null;
  foroComarca?: string | null;
  foroUf?: string | null;
  lgpdAplicavel?: boolean;
  pontosFixacaoContratados?: number | null;
  pontosFixacaoOcupados?: number | null;
  observacoes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);

  // Editando: o alvo tem que estar no alcance, e FICA no CNPJ dele. Um update
  // por id puro aceitaria o id de um contrato de empresa que a pessoa nem
  // enxerga; reescrever `empresaId` a partir da URL mudaria o contrato de
  // empresa em silêncio — os dois defeitos que a frota já teve.
  let empresaDoContrato = input.empresaContratoId;
  let anterior: {
    empresaId: string;
    dataInicio: Date;
    mesBaseReajuste: number | null;
    periodicidadeReajusteMeses: number | null;
    proximoReajuste: Date | null;
  } | null = null;
  if (input.id) {
    anterior = await prisma.contrato.findFirst({
      where: { id: input.id, empresaId: { in: visiveis } },
      select: {
        empresaId: true,
        dataInicio: true,
        mesBaseReajuste: true,
        periodicidadeReajusteMeses: true,
        proximoReajuste: true,
      },
    });
    if (!anterior) return { ok: false, error: "Contrato não encontrado no seu acesso." };
    empresaDoContrato = anterior.empresaId;
  } else if (!visiveis.includes(empresaDoContrato)) {
    return { ok: false, error: "Empresa fora do seu acesso." };
  }

  const numeroContrato = limpo(input.numero);
  if (!numeroContrato) return { ok: false, error: "Informe o número do contrato." };
  const titulo = limpo(input.titulo);
  if (!titulo) return { ok: false, error: "Informe um título que identifique o contrato." };

  const dataInicio = dataDoFormulario(input.dataInicio);
  if (!dataInicio) return { ok: false, error: "Informe a data de início da vigência." };

  const contraparte = await prisma.contraparte.findUnique({
    where: { id: input.contraparteId },
    select: { id: true, razaoSocial: true },
  });
  if (!contraparte) return { ok: false, error: "Escolha a contraparte do contrato." };

  const indeterminado = input.indeterminado ?? false;
  const dataFim = indeterminado ? null : dataDoFormulario(input.dataFim);
  if (!indeterminado && !dataFim) {
    return { ok: false, error: "Informe a data de fim, ou marque o contrato como prazo indeterminado." };
  }
  if (dataFim && dataFim <= dataInicio) {
    return { ok: false, error: "A data de fim tem que ser posterior à de início." };
  }

  // Periodicidade menor que 12 meses torna a cláusula NULA de pleno direito
  // (Lei 10.192/2001, art. 2º, §1º). Recusar na entrada é melhor que gravar e
  // alertar depois: o sistema não deve ajudar a agendar um reajuste ilegal.
  const periodicidade = numero(input.periodicidadeReajusteMeses);
  if (periodicidade !== null && periodicidade < 12) {
    return {
      ok: false,
      error: "Reajuste com periodicidade menor que 12 meses é nulo de pleno direito (Lei 10.192/2001, art. 2º, §1º).",
    };
  }
  const mesBase = numero(input.mesBaseReajuste);
  if (mesBase !== null && (mesBase < 1 || mesBase > 12)) {
    return { ok: false, error: "Mês-base do reajuste tem que ser de 1 a 12." };
  }

  const avisoPrevio = numero(input.avisoPrevioNaoRenovacaoDias);
  const janela = janelaRenovatoria(dataFim, input.locacaoNaoResidencial ?? false);

  const dados = {
    empresaId: empresaDoContrato,
    numero: numeroContrato,
    contraparteId: contraparte.id,
    tipo: input.tipo,
    categoria: input.categoria || "DESPESA",
    titulo,
    objeto: limpo(input.objeto),
    status: input.status || "VIGENTE",
    criticidade: input.criticidade || "NORMAL",
    gestorId: limpo(input.gestorId),
    setorId: limpo(input.setorId),
    dataAssinatura: dataDoFormulario(input.dataAssinatura),
    dataInicio,
    dataFim,
    indeterminado,
    renovacaoAutomatica: input.renovacaoAutomatica ?? false,
    avisoPrevioNaoRenovacaoDias: avisoPrevio,
    dataLimiteDenuncia: dataLimiteDenuncia(dataFim, avisoPrevio),
    locacaoNaoResidencial: input.locacaoNaoResidencial ?? false,
    janelaRenovatoriaInicio: janela?.inicio ?? null,
    janelaRenovatoriaFim: janela?.fim ?? null,
    buildToSuit: input.buildToSuit ?? false,
    renunciaRevisionalPactuada: input.renunciaRevisionalPactuada ?? false,
    valorMensal: numero(input.valorMensal),
    valorTotal: numero(input.valorTotal),
    indiceReajuste: limpo(input.indiceReajuste),
    periodicidadeReajusteMeses: periodicidade,
    mesBaseReajuste: mesBase,
    proximoReajuste: reajusteInalterado(anterior, dataInicio, mesBase, periodicidade)
      ? anterior!.proximoReajuste
      : proximoReajuste(dataInicio, mesBase, periodicidade, new Date()),
    multaCompensatoriaPct: numero(input.multaCompensatoriaPct),
    multaMoratoriaPct: numero(input.multaMoratoriaPct),
    foroComarca: limpo(input.foroComarca),
    foroUf: limpo(input.foroUf),
    lgpdAplicavel: input.lgpdAplicavel ?? false,
    pontosFixacaoContratados: numero(input.pontosFixacaoContratados),
    pontosFixacaoOcupados: numero(input.pontosFixacaoOcupados),
    observacoes: limpo(input.observacoes),
  };

  // O nome do gestor entra CONGELADO na linha, como o resto do sistema faz:
  // quem responde pelo contrato hoje é uma pergunta de hoje, e o histórico não
  // pode mudar quando a pessoa muda de cargo ou sai.
  const gestor = dados.gestorId
    ? await prisma.colaborador.findFirst({
        where: { id: dados.gestorId, empresaId: { in: visiveis } },
        select: { nome: true },
      })
    : null;
  if (dados.gestorId && !gestor) return { ok: false, error: "Gestor não encontrado no seu acesso." };

  // O par (empresa, número) é único. Checar antes dá a mensagem que resolve;
  // deixar estourar o unique do Postgres dá um erro que ninguém entende.
  const duplicado = await prisma.contrato.findFirst({
    where: { empresaId: empresaDoContrato, numero: numeroContrato, NOT: input.id ? { id: input.id } : undefined },
    select: { id: true },
  });
  if (duplicado) return { ok: false, error: `Já existe um contrato ${numeroContrato} nesta empresa.` };

  const contrato = input.id
    ? await prisma.contrato.update({
        where: { id: input.id },
        data: { ...dados, gestorNome: gestor?.nome ?? null },
      })
    : await prisma.contrato.create({
        data: {
          ...dados,
          gestorNome: gestor?.nome ?? null,
          criadoPorId: usuario.id,
          criadoPorNome: usuario.name ?? null,
        },
      });

  await registrarAuditoria({
    empresaId: empresaDoContrato,
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "Contrato",
    entidadeId: contrato.id,
    resumo: `${input.id ? "Editou" : "Cadastrou"} o contrato ${numeroContrato} — ${contraparte.razaoSocial}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true, id: contrato.id };
}
