"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
import { criariCiclo } from "@/lib/organograma";
import { dataDoFormulario } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

// A ficha é editada por blocos (identificação, endereço, emergência, banco,
// vínculo) e cada bloco é um formulário próprio. A action grava SÓ os campos
// que vieram no FormData — assim um bloco nunca apaga o que outro preencheu.

type Tipo = "texto" | "data" | "inteiro" | "decimal";

const CAMPOS: Record<string, Tipo> = {
  // identificação / contato
  nome: "texto",
  cpf: "texto",
  email: "texto",
  telefone: "texto",
  sexo: "texto",
  dataNascimento: "data",
  matricula: "texto",
  rg: "texto",
  rgOrgaoEmissor: "texto",
  rgUf: "texto",
  pis: "texto",
  ctpsNumero: "texto",
  ctpsSerie: "texto",
  ctpsUf: "texto",
  tituloEleitor: "texto",
  estadoCivil: "texto",
  escolaridade: "texto",
  nomeMae: "texto",
  nomePai: "texto",
  nacionalidade: "texto",
  naturalidade: "texto",
  // endereço
  cep: "texto",
  logradouro: "texto",
  numeroEndereco: "texto",
  complemento: "texto",
  bairro: "texto",
  cidade: "texto",
  uf: "texto",
  // contato de emergência
  emergenciaNome: "texto",
  emergenciaParentesco: "texto",
  emergenciaTelefone: "texto",
  // dados bancários
  bancoNome: "texto",
  bancoAgencia: "texto",
  bancoConta: "texto",
  bancoTipoConta: "texto",
  chavePix: "texto",
  // vínculo
  dataAdmissao: "data",
  dataDesligamento: "data",
  motivoDesligamento: "texto",
  tipoContrato: "texto",
  dataFimContrato: "data",
  jornadaSemanal: "inteiro",
  salarioBase: "decimal",
};

// Campos com validação própria (o resto é texto livre — a ficha vai sendo
// completada aos poucos e travar demais só faz o RH desistir de preencher).
const SO_DIGITOS = new Set(["cpf", "pis", "tituloEleitor", "cep"]);

// Sentinela do <select> de líder: campo ausente = bloco não postou isso;
// string vazia = "sem líder". Fora da tabela CAMPOS porque setor/cargo/líder
// são chaves estrangeiras — precisam ser conferidas contra a empresa antes de
// gravar, e um id inválido aqui é erro de escopo, não texto livre.
const CAMPOS_ESTRUTURA = ["setorId", "posicaoId", "supervisorId"] as const;

function lerCampo(formData: FormData, campo: string, tipo: Tipo): unknown | undefined {
  if (!formData.has(campo)) return undefined;
  const bruto = formData.get(campo);
  const texto = typeof bruto === "string" ? bruto.trim() : "";

  if (tipo === "data") return dataDoFormulario(bruto);
  if (texto === "") return null;
  if (tipo === "inteiro") {
    const n = Number.parseInt(texto, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (tipo === "decimal") {
    // Aceita "3.500,00" e "3500.00" — o RH digita no formato brasileiro.
    const n = Number(texto.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return SO_DIGITOS.has(campo) ? texto.replace(/\D/g, "") : texto;
}

/**
 * Confere setor/cargo/líder contra a empresa da rota e escreve em `data`.
 * Devolve a mensagem de erro, ou null se está tudo certo.
 *
 * Setor e cargo são obrigatórios no banco (NOT NULL): a ficha corrige quem
 * ficou em "Não definido" na importação, nunca esvazia. Líder é opcional e
 * pode ser removido — vazio ali significa "sem líder".
 *
 * Aceita setor/cargo inativos: quem já está num setor desativado continua
 * podendo ter o resto da estrutura corrigida sem ser forçado a mudar de setor
 * na mesma tacada.
 */
async function validarEstrutura(
  empresaId: string,
  colaborador: { id: string; supervisorId: string | null },
  formData: FormData,
  data: Record<string, unknown>,
): Promise<string | null> {
  const colaboradorId = colaborador.id;

  const setorId = String(formData.get("setorId") ?? "").trim();
  if (formData.has("setorId")) {
    if (!setorId) return "Selecione o setor.";
    const setor = await prisma.setor.findFirst({ where: { id: setorId, empresaId }, select: { id: true } });
    if (!setor) return "Setor inválido para esta empresa.";
    data.setorId = setorId;
  }

  const posicaoId = String(formData.get("posicaoId") ?? "").trim();
  if (formData.has("posicaoId")) {
    if (!posicaoId) return "Selecione o cargo.";
    const posicao = await prisma.posicao.findFirst({ where: { id: posicaoId, empresaId }, select: { id: true } });
    if (!posicao) return "Cargo inválido para esta empresa.";
    data.posicaoId = posicaoId;
  }

  if (formData.has("supervisorId")) {
    const supervisorId = String(formData.get("supervisorId") ?? "").trim();
    if (!supervisorId) {
      data.supervisorId = null;
    } else if (supervisorId !== colaborador.supervisorId) {
      // Manter o líder atual nunca é rejeitado: ele pode ter sido desligado e
      // ainda não substituído, e travar aqui impediria corrigir o setor.
      if (supervisorId === colaboradorId) return "Alguém não pode liderar a si mesmo.";
      const supervisor = await prisma.colaborador.findFirst({
        where: { id: supervisorId, empresaId, ativo: true },
        select: { id: true },
      });
      if (!supervisor) return "Líder inválido para esta empresa.";
      if (await criariCiclo(colaboradorId, supervisorId)) {
        return "Essa escolha criaria um ciclo de liderança (A lidera B que lidera A).";
      }
      data.supervisorId = supervisorId;
    }
  }

  return null;
}

export async function atualizarFicha(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const atual = await prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId } });
  if (!atual) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const data: Record<string, unknown> = {};
  for (const [campo, tipo] of Object.entries(CAMPOS)) {
    const valor = lerCampo(formData, campo, tipo);
    if (valor !== undefined) data[campo] = valor;
  }

  // Estrutura (setor/cargo/líder). Só entra se o bloco de estrutura postou —
  // nenhum outro bloco da ficha manda esses campos.
  if (CAMPOS_ESTRUTURA.some((c) => formData.has(c))) {
    const erro = await validarEstrutura(empresaId, atual, formData, data);
    if (erro) return { ok: false, error: erro };
  }

  if (Object.keys(data).length === 0) {
    // Nenhum campo reconhecido veio no FormData. Hoje só acontece com um bloco
    // vazio de propósito; se um `name` de campo um dia divergir de CAMPOS,
    // é aqui que a tela mostraria "salvo" sem gravar nada — o log é a rede
    // de segurança contra esse silêncio.
    console.warn(`[rh-ficha] atualizarFicha(${colaboradorId}) sem nenhum campo reconhecido no FormData.`);
    return { ok: true };
  }

  if (typeof data.nome === "string" && data.nome.length < 2) {
    return { ok: false, error: "Informe o nome do colaborador." };
  }
  if (typeof data.cpf === "string" && data.cpf.length !== 11) {
    return { ok: false, error: "CPF deve ter 11 dígitos." };
  }
  if (typeof data.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { ok: false, error: "E-mail inválido." };
  }
  if (
    data.dataDesligamento instanceof Date &&
    (data.dataAdmissao ?? atual.dataAdmissao) instanceof Date &&
    data.dataDesligamento < ((data.dataAdmissao ?? atual.dataAdmissao) as Date)
  ) {
    return { ok: false, error: "O desligamento não pode ser anterior à admissão." };
  }

  // Motivo obrigatório só no MOMENTO do desligamento (data nova ou mudou) —
  // não em toda edição de quem já está desligado, senão corrigir um salário
  // de um ex-colaborador de 2024 fica bloqueado pelo motivo que ninguém
  // registrou na época. É essa distinção que faz 137 desligados sem motivo
  // (ver seção 3.1 do estudo de Gestão) não voltarem a se repetir daqui pra
  // frente sem travar o cadastro existente.
  const desligamentoMudou =
    data.dataDesligamento instanceof Date &&
    (!(atual.dataDesligamento instanceof Date) ||
      data.dataDesligamento.getTime() !== atual.dataDesligamento.getTime());
  if (desligamentoMudou) {
    const motivo = typeof data.motivoDesligamento === "string" ? data.motivoDesligamento : atual.motivoDesligamento;
    if (!motivo) return { ok: false, error: "Informe o motivo do desligamento." };
    const admissao = data.dataAdmissao instanceof Date ? data.dataAdmissao : atual.dataAdmissao;
    if (!(admissao instanceof Date)) {
      return { ok: false, error: "Informe a data de admissão antes de registrar o desligamento." };
    }
  }

  try {
    await prisma.colaborador.update({ where: { id: colaboradorId, empresaId }, data });
  } catch (e) {
    if (violouUnique(e, "Colaborador_empresaId_cpf_key")) {
      return { ok: false, error: "Já existe um colaborador com esse CPF nesta empresa." };
    }
    // Qualquer outro erro aqui virava a mesma mensagem de CPF duplicado —
    // uma falha real de escrita ficava disfarçada de erro de validação e
    // ninguém saberia diferenciar os dois casos no log.
    console.error(`[rh-ficha] falha ao gravar colaborador ${colaboradorId}:`, e);
    throw e;
  }

  const mudancas = diffCampos(atual as unknown as Record<string, unknown>, data);
  if (Object.keys(mudancas).length > 0) {
    await registrarAuditoria({
      empresaId,
      acao: "ATUALIZAR",
      entidade: "Colaborador",
      entidadeId: colaboradorId,
      resumo: `Ficha de ${atual.nome} atualizada (${Object.keys(mudancas).join(", ")}).`,
      detalhes: mudancas,
    });
  }

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  // Mudança de estrutura sai do cadastro e reaparece em três telas: o
  // organograma, os indicadores por setor e o bloco "Preenchimento da base" na
  // tela inicial. Sem revalidar, o RH corrige o setor e o contador continua
  // dizendo "2 sem setor definido".
  if (data.setorId !== undefined || data.posicaoId !== undefined || data.supervisorId !== undefined) {
    revalidatePath(`/rh/${empresaId}`);
    revalidatePath(`/rh/${empresaId}/organograma`);
    revalidatePath(`/rh/${empresaId}/indicadores`);
  }
  return { ok: true };
}
