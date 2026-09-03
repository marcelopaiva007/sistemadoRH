"use server";

import { prisma } from "@/lib/prisma";
import { lerAnexo } from "@/lib/anexos";
import { registrarAuditoria } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
// A mesma conta de CPF do importador de planilhas — uma implementação só,
// para os dois nunca discordarem sobre o que é um CPF válido.
import { apenasDigitosCpf as soDigitos, cpfValido } from "@/lib/cpf";
import type { ActionResult } from "@/lib/constants";

// Server action SEM sessão — roda a partir de /vagas/<slug>, página pública.
// O que autoriza é o slug (imprevisível por causa do sufixo aleatório) somado
// ao estado da vaga: só aceita inscrição em vaga ABERTA e publicada.
//
// Proteção contra inscrição repetida: o CPF é obrigatório aqui (diferente do
// cadastro pelo RH) e a constraint @@unique([vagaId, candidatoId]) barra a
// segunda tentativa da mesma pessoa na mesma vaga.


export async function inscreverSePublicamente(
  slug: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const vaga = await prisma.vaga.findUnique({
    where: { slug },
    select: { id: true, empresaId: true, titulo: true, status: true, publicada: true },
  });
  if (!vaga || !vaga.publicada || vaga.status !== "ABERTA") {
    return { ok: false, error: "Esta vaga não está mais recebendo inscrições." };
  }

  if (formData.get("consentimento") !== "true") {
    return { ok: false, error: "É preciso aceitar o uso dos seus dados para se inscrever." };
  }

  const nome = String(formData.get("nome") ?? "").trim();
  if (nome.length < 3) return { ok: false, error: "Informe seu nome completo." };

  const cpf = soDigitos(String(formData.get("cpf") ?? ""));
  if (!cpfValido(cpf)) return { ok: false, error: "CPF inválido. Confira os números digitados." };

  const telefone = String(formData.get("telefone") ?? "").trim();
  if (soDigitos(telefone).length < 10) {
    return { ok: false, error: "Informe um telefone com DDD." };
  }

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  // Limites de tamanho: entrada pública não autenticada não pode gravar linhas
  // gigantes (armazenamento/DoS) nem alimentar exportações com campos enormes.
  const dados = {
    nome: nome.slice(0, 120),
    email: String(formData.get("email") ?? "").trim().slice(0, 160) || null,
    telefone: telefone.slice(0, 40),
    cidade: String(formData.get("cidade") ?? "").trim().slice(0, 120) || null,
  };

  const existente = await prisma.candidato.findUnique({
    where: { empresaId_cpf: { empresaId: vaga.empresaId, cpf } },
    select: { id: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      // Só grava o currículo para candidato NOVO. Num CPF já cadastrado, o
      // caminho público não guarda anexo (evita órfão e a sobrescrita abaixo).
      const arquivo =
        anexo && !existente
          ? await tx.arquivo.create({
              data: {
                empresaId: vaga.empresaId,
                nome: anexo.nome,
                mimeType: anexo.mimeType,
                tamanhoBytes: anexo.bytes.byteLength,
                conteudo: anexo.bytes,
                // Sem usuário: quem enviou foi o próprio candidato.
                // `dados.nome`, já cortado — o nome cru iria sem limite para
                // Arquivo, EventoCandidatura e AuditLog (colunas TEXT).
                criadoPorNome: `Candidato: ${dados.nome}`,
              },
              select: { id: true },
            })
          : null;

      const candidato = existente
        ? // CPF já cadastrado: o caminho público NÃO sobrescreve identidade
          // nem currículo. Como aqui só o CPF (dado de baixo sigilo) "autentica",
          // permitir a edição deixaria qualquer um que saiba o CPF adulterar os
          // dados/currículo de outra pessoa. Só registra o novo consentimento; a
          // candidatura na vaga é criada abaixo. Correção de dados fica com o RH.
          await tx.candidato.update({
            where: { id: existente.id },
            data: { consentimentoEm: new Date() },
          })
        : await tx.candidato.create({
            data: {
              empresaId: vaga.empresaId,
              cpf,
              ...dados,
              origem: "PUBLICO",
              consentimentoEm: new Date(),
              arquivoId: arquivo?.id ?? null,
            },
          });

      const candidatura = await tx.candidatura.create({
        data: { empresaId: vaga.empresaId, vagaId: vaga.id, candidatoId: candidato.id, etapa: "TRIAGEM" },
      });
      await tx.eventoCandidatura.create({
        data: {
          candidaturaId: candidatura.id,
          etapaNova: "TRIAGEM",
          motivo: "Inscrição feita pelo candidato na página da vaga.",
          registradoPorNome: `Candidato: ${dados.nome}`,
        },
      });
    });
  } catch (e) {
    if (violouUnique(e, "Candidatura_vagaId_candidatoId_key")) {
      return { ok: false, error: "Você já se inscreveu nesta vaga. O RH entrará em contato." };
    }
    throw e;
  }

  await registrarAuditoria({
    empresaId: vaga.empresaId,
    acao: "CRIAR",
    entidade: "Candidatura",
    entidadeId: vaga.id,
    resumo: `Inscrição pública recebida para a vaga "${vaga.titulo}".`,
    // O nome do candidato fica no registro, mas CPF/telefone não entram na
    // trilha — dado pessoal de quem nem é colaborador ainda.
    ator: { id: "publico", nome: `Candidato: ${dados.nome}`, papel: "CANDIDATO" },
  });

  return { ok: true };
}
