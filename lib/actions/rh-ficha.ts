"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
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
  jornadaSemanal: "inteiro",
  salarioBase: "decimal",
};

// Campos com validação própria (o resto é texto livre — a ficha vai sendo
// completada aos poucos e travar demais só faz o RH desistir de preencher).
const SO_DIGITOS = new Set(["cpf", "pis", "tituloEleitor", "cep"]);

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
  if (Object.keys(data).length === 0) return { ok: true };

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

  try {
    await prisma.colaborador.update({ where: { id: colaboradorId, empresaId }, data });
  } catch {
    return { ok: false, error: "Já existe um colaborador com esse CPF nesta empresa." };
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
  return { ok: true };
}
