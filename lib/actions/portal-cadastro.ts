"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
import { enviarParaBlob } from "@/lib/blob";
import { sendEmail } from "@/lib/email";
import { buscarDestinatarios } from "@/lib/pesquisa-notificacoes";
import { dataDoFormulario } from "@/lib/datas";
import { TIPOS_DOCUMENTO, TIPOS_CONTA_BANCARIA, tipoContaLabel } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";

// Autoatendimento cadastral do colaborador.
//
// A divisão real não é "passa pelo RH" vs. "não passa" — nenhum campo de
// texto fica represado esperando aprovação aqui, nem número de documento
// (RG/PIS/CTPS) nem dado bancário. O que muda por campo é o RISCO: contato e
// endereço errados custam uma correspondência perdida; dado bancário errado —
// ou trocado por quem invadiu o Telegram da pessoa — desvia um pagamento. Por
// isso só ele dispara aviso automático ao RH (buscarDestinatarios) a cada
// alteração, para alguém confirmar com a pessoa antes do próximo pagamento. A
// foto do documento continua indo para a fila de conferência em
// `enviarMeuDocumento` — é onde a aprovação de verdade acontece.
//
// Nada aqui recebe colaboradorId por parâmetro: sempre sai da sessão. Server
// action é endpoint público, e aceitar o id de fora deixaria qualquer pessoa
// logada editar a ficha de outra.

const texto = (fd: FormData, campo: string, max = 200) =>
  String(fd.get(campo) ?? "").trim().slice(0, max) || null;

const digitos = (fd: FormData, campo: string, max: number) =>
  String(fd.get(campo) ?? "").replace(/\D/g, "").slice(0, max) || null;

const uf = (fd: FormData, campo: string) =>
  String(fd.get(campo) ?? "").trim().toUpperCase().slice(0, 2) || null;

/** Módulo 11 sobre os 10 primeiros dígitos, como manda o layout do PIS/PASEP. */
function pisValido(valor: string): boolean {
  if (valor.length !== 11 || /^(\d)\1{10}$/.test(valor)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((acc, peso, i) => acc + Number(valor[i]) * peso, 0);
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(valor[10]);
}

/** Campos sem impacto em folha ou pagamento — gravam direto. */
export async function atualizarMeusDados(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: {
      id: true, nome: true, empresaId: true,
      bancoNome: true, bancoAgencia: true, bancoConta: true, bancoTipoConta: true, chavePix: true,
    },
  });
  if (!colaborador) return { ok: false, error: "Cadastro não encontrado." };

  const email = texto(formData, "email");
  if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    return { ok: false, error: "E-mail inválido. Confira o endereço." };
  }
  const cep = String(formData.get("cep") ?? "").replace(/\D/g, "").slice(0, 8) || null;
  if (cep && cep.length !== 8) return { ok: false, error: "O CEP precisa ter 8 dígitos." };

  // O PIS carrega dígito verificador. Conferir aqui custa nada e evita que um
  // dígito trocado atravesse a conferência do RH e só quebre no eSocial, meses
  // depois, quando ninguém lembra de onde veio.
  const pis = String(formData.get("pis") ?? "").replace(/\D/g, "") || null;
  if (pis && !pisValido(pis)) {
    return { ok: false, error: "PIS/PASEP inválido — confira os números no documento." };
  }

  const bancoTipoConta = String(formData.get("bancoTipoConta") ?? "").trim() || null;
  if (bancoTipoConta && !TIPOS_CONTA_BANCARIA.some((t) => t.value === bancoTipoConta)) {
    return { ok: false, error: "Selecione um tipo de conta válido." };
  }
  const dadosBancarios = {
    bancoNome: texto(formData, "bancoNome", 60),
    bancoTipoConta,
    bancoAgencia: texto(formData, "bancoAgencia", 20),
    bancoConta: texto(formData, "bancoConta", 30),
    chavePix: texto(formData, "chavePix", 140),
  };
  // Dado bancário é o que move dinheiro — só ele justifica avisar o RH. Compara
  // com o que já estava salvo para não gerar e-mail toda vez que a pessoa só
  // corrige o telefone e reenvia o formulário inteiro.
  const bancoMudou =
    dadosBancarios.bancoNome !== colaborador.bancoNome ||
    dadosBancarios.bancoTipoConta !== colaborador.bancoTipoConta ||
    dadosBancarios.bancoAgencia !== colaborador.bancoAgencia ||
    dadosBancarios.bancoConta !== colaborador.bancoConta ||
    dadosBancarios.chavePix !== colaborador.chavePix;

  await prisma.colaborador.update({
    where: { id: colaborador.id },
    data: {
      email,
      ...dadosBancarios,
      telefone: texto(formData, "telefone", 40),
      estadoCivil: texto(formData, "estadoCivil", 40),
      escolaridade: texto(formData, "escolaridade", 60),
      nomeMae: texto(formData, "nomeMae"),
      nomePai: texto(formData, "nomePai"),
      nacionalidade: texto(formData, "nacionalidade", 60),
      naturalidade: texto(formData, "naturalidade", 80),
      cep,
      logradouro: texto(formData, "logradouro"),
      numeroEndereco: texto(formData, "numeroEndereco", 20),
      complemento: texto(formData, "complemento", 80),
      bairro: texto(formData, "bairro", 80),
      cidade: texto(formData, "cidade", 80),
      uf: String(formData.get("uf") ?? "").trim().toUpperCase().slice(0, 2) || null,
      emergenciaNome: texto(formData, "emergenciaNome"),
      emergenciaParentesco: texto(formData, "emergenciaParentesco", 40),
      emergenciaTelefone: texto(formData, "emergenciaTelefone", 40),
      // Números de documento: quem tem o papel na mão digita melhor do que quem
      // lê a foto depois. O RH confere contra o anexo em vez de transcrever.
      rg: texto(formData, "rg", 20),
      rgOrgaoEmissor: texto(formData, "rgOrgaoEmissor", 20),
      rgUf: uf(formData, "rgUf"),
      pis,
      tituloEleitor: digitos(formData, "tituloEleitor", 14),
      ctpsNumero: texto(formData, "ctpsNumero", 20),
      ctpsSerie: texto(formData, "ctpsSerie", 10),
      ctpsUf: uf(formData, "ctpsUf"),
    },
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: colaborador.id,
    resumo: bancoMudou
      ? `${colaborador.nome} atualizou os próprios dados cadastrais pelo portal, incluindo dado bancário/PIX.`
      : `${colaborador.nome} atualizou os próprios dados cadastrais pelo portal.`,
  });

  // Dado bancário mudou: o RH precisa saber AGORA, não no próximo relatório —
  // é a janela entre a troca e o próximo pagamento que decide se dá tempo de
  // confirmar com a pessoa antes de uma chave PIX trocada desviar o valor.
  if (bancoMudou) {
    const linhas = [
      dadosBancarios.bancoNome && `Banco: ${dadosBancarios.bancoNome}`,
      dadosBancarios.bancoTipoConta && `Tipo de conta: ${tipoContaLabel(dadosBancarios.bancoTipoConta)}`,
      dadosBancarios.bancoAgencia && `Agência: ${dadosBancarios.bancoAgencia}`,
      dadosBancarios.bancoConta && `Conta: ${dadosBancarios.bancoConta}`,
      dadosBancarios.chavePix && `Chave PIX: ${dadosBancarios.chavePix}`,
    ].filter(Boolean).join(" · ") || "todos os campos foram apagados";
    const mensagem =
      `${colaborador.nome} alterou os dados bancários pelo portal. Novo valor — ${linhas}. ` +
      `Confirme com a pessoa por um canal à parte antes do próximo pagamento.`;

    const destinatarios = await buscarDestinatarios(colaborador.empresaId);
    for (const d of destinatarios) {
      if (!d.email) continue;
      const resultado = await sendEmail({
        to: d.email,
        subject: `[RH] Dado bancário alterado — ${colaborador.nome}`,
        text: mensagem,
        html: `<p>${mensagem}</p>`,
      });
      if (!resultado.ok) {
        console.error(`[portal-cadastro] falha ao avisar ${d.email} sobre troca de dado bancário:`, resultado.error);
      }
    }
  }

  revalidatePath("/portal");
  return { ok: true };
}

/**
 * Envio de cópia de documento. Entra como pendência: `origem = COLABORADOR` e
 * `conferidoEm` nulo. O RH confere o anexo contra o que foi digitado antes de
 * o dado virar verdade cadastral — um anexo trocado ou ilegível não pode
 * entrar na ficha sem ninguém olhar.
 */
export async function enviarMeuDocumento(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, nome: true, empresaId: true },
  });
  if (!colaborador) return { ok: false, error: "Cadastro não encontrado." };

  const tipo = String(formData.get("tipo") ?? "").trim();
  if (!TIPOS_DOCUMENTO.some((t) => t.value === tipo)) {
    return { ok: false, error: "Selecione o tipo de documento." };
  }

  const leitura = await lerAnexo(formData);
  if (!leitura.ok) return { ok: false, error: leitura.error };
  if (!leitura.anexo) return { ok: false, error: "Anexe a foto ou o PDF do documento." };

  const envio = await enviarParaBlob({
    empresaId: colaborador.empresaId,
    colaboradorId: colaborador.id,
    nome: leitura.anexo.nome,
    mimeType: leitura.anexo.mimeType,
    bytes: leitura.anexo.bytes,
  });
  if (!envio.ok) return { ok: false, error: envio.error };

  const arquivo = await prisma.arquivo.create({
    data: {
      empresaId: colaborador.empresaId,
      nome: leitura.anexo.nome,
      mimeType: leitura.anexo.mimeType,
      tamanhoBytes: leitura.anexo.bytes.byteLength,
      blobUrl: envio.url,
      criadoPorNome: colaborador.nome,
    },
  });

  await prisma.documentoColaborador.create({
    data: {
      empresaId: colaborador.empresaId,
      colaboradorId: colaborador.id,
      tipo,
      descricao: texto(formData, "descricao"),
      emitidoEm: dataDoFormulario(formData.get("emitidoEm")),
      validoAte: dataDoFormulario(formData.get("validoAte")),
      observacoes: texto(formData, "observacoes", 500),
      origem: "COLABORADOR",
      criadoPorNome: colaborador.nome,
      arquivoId: arquivo.id,
    },
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "CRIAR",
    entidade: "DocumentoColaborador",
    entidadeId: colaborador.id,
    resumo: `${colaborador.nome} enviou um documento pelo portal (aguardando conferência).`,
  });

  revalidatePath("/portal");
  revalidatePath(`/rh/${colaborador.empresaId}/pendencias`);
  return { ok: true };
}
