// Prepara (e depois remove) um colaborador descartável para conferir o portal
// de ponta a ponta no navegador, sem tocar em dado de gente real.
//
//   npx tsx scripts/portal-e2e.ts preparar   -> cria e imprime o link de acesso
//   npx tsx scripts/portal-e2e.ts alheio     -> cria um anexo de OUTRA pessoa e
//                                               imprime o id, para conferir que
//                                               a sessão do portal não o baixa
//   npx tsx scripts/portal-e2e.ts limpar     -> apaga tudo que foi criado
import "dotenv/config";

process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3100";

import { prisma } from "@/lib/prisma";
import { criarLinkDeAcesso } from "@/lib/portal-auth";
import { dataUTC } from "@/lib/datas";
import { empresaDeTeste } from "./_empresa-de-teste";

const NOME = "ZZ Teste do Portal (descartável)";
const CPF_FALSO = "00000000191";

async function preparar() {
  const empresa = await empresaDeTeste(prisma, { comSetor: true });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");
  const setor = await prisma.setor.findFirst({ where: { empresaId: empresa.id } });
  const posicao = await prisma.posicao.findFirst({ where: { empresaId: empresa.id } });
  if (!setor || !posicao) throw new Error("Empresa sem setor/posição cadastrados.");

  await limpar(true);

  const colaborador = await prisma.colaborador.create({
    data: {
      empresaId: empresa.id,
      nome: NOME,
      cpf: CPF_FALSO,
      email: "teste@exemplo.invalido",
      telefone: "(00) 00000-0000",
      setorId: setor.id,
      posicaoId: posicao.id,
      dataAdmissao: dataUTC(2023, 3, 10),
      tipoContrato: "CLT",
      matricula: "TESTE-001",
      cidade: "Vilhena",
      uf: "RO",
      emergenciaNome: "Contato de teste",
      emergenciaTelefone: "(00) 00000-0000",
    },
  });

  const conteudo = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const arquivo = await prisma.arquivo.create({
    data: {
      empresaId: empresa.id,
      nome: "aso-teste.pdf",
      mimeType: "application/pdf",
      tamanhoBytes: conteudo.byteLength,
      conteudo,
    },
  });
  await prisma.documentoColaborador.create({
    data: {
      empresaId: empresa.id,
      colaboradorId: colaborador.id,
      tipo: "ASO",
      descricao: "Exame periódico",
      validoAte: dataUTC(2026, 9, 15),
      arquivoId: arquivo.id,
    },
  });
  await prisma.solicitacaoFerias.create({
    data: {
      empresaId: empresa.id,
      colaboradorId: colaborador.id,
      periodoAquisitivoInicio: dataUTC(2024, 3, 10),
      dataInicio: dataUTC(2026, 9, 1),
      dataFim: dataUTC(2026, 9, 15),
      dias: 15,
      status: "APROVADA",
    },
  });
  await prisma.ausencia.create({
    data: {
      empresaId: empresa.id,
      colaboradorId: colaborador.id,
      tipo: "ATESTADO",
      dataInicio: dataUTC(2026, 7, 20),
      dataFim: dataUTC(2026, 7, 21),
      dias: 2,
      abonada: true,
      status: "APROVADA",
    },
  });

  const link = await criarLinkDeAcesso(colaborador.id, "RH");
  if (!link.ok) throw new Error(`falha ao gerar link: ${link.motivo}`);

  console.log(`Colaborador de teste criado (${colaborador.id})`);
  console.log(`CPF para a confirmação: ${CPF_FALSO}`);
  console.log(`\nLINK: ${link.url}\n`);
}

const NOME_ALHEIO = "ZZ Teste Colega (descartável)";

/** Anexo pertencente a outro colaborador — a sessão do portal não pode baixá-lo. */
async function alheio() {
  const empresa = await empresaDeTeste(prisma, { comSetor: true });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");
  const setor = await prisma.setor.findFirst({ where: { empresaId: empresa.id } });
  const posicao = await prisma.posicao.findFirst({ where: { empresaId: empresa.id } });
  if (!setor || !posicao) throw new Error("Empresa sem setor/posição cadastrados.");

  const colega = await prisma.colaborador.create({
    data: {
      empresaId: empresa.id,
      nome: NOME_ALHEIO,
      setorId: setor.id,
      posicaoId: posicao.id,
    },
  });
  const arquivo = await prisma.arquivo.create({
    data: {
      empresaId: empresa.id,
      nome: "contrato-do-colega.pdf",
      mimeType: "application/pdf",
      tamanhoBytes: 8,
      conteudo: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
    },
  });
  await prisma.documentoColaborador.create({
    data: {
      empresaId: empresa.id,
      colaboradorId: colega.id,
      tipo: "CONTRATO",
      arquivoId: arquivo.id,
    },
  });

  console.log(`ARQUIVO_ALHEIO: ${arquivo.id}`);
}

async function limpar(silencioso = false) {
  const colaboradores = await prisma.colaborador.findMany({
    where: { nome: { in: [NOME, NOME_ALHEIO] } },
    select: { id: true, documentos: { select: { arquivoId: true } }, ausencias: { select: { arquivoId: true } } },
  });
  if (colaboradores.length === 0) {
    if (!silencioso) console.log("Nada para limpar.");
    return;
  }

  for (const c of colaboradores) {
    const arquivos = [...c.documentos, ...c.ausencias]
      .map((x) => x.arquivoId)
      .filter((id): id is string => id !== null);
    // Colaborador em cascata leva documentos, férias, ausências, acessos e
    // sessões; os blobs têm FK SET NULL e precisam ir à mão.
    await prisma.colaborador.delete({ where: { id: c.id } });
    if (arquivos.length) await prisma.arquivo.deleteMany({ where: { id: { in: arquivos } } });
  }
  const auditoria = await prisma.auditLog.deleteMany({
    where: { entidadeId: { in: colaboradores.map((c) => c.id) } },
  });
  if (!silencioso) {
    console.log(`Removidos ${colaboradores.length} colaborador(es) de teste e ${auditoria.count} registro(s) de auditoria.`);
  }
}

const comando = process.argv[2];
const acao =
  comando === "limpar" ? limpar() : comando === "preparar" ? preparar() : comando === "alheio" ? alheio() : null;
if (!acao) {
  console.error("Uso: npx tsx scripts/portal-e2e.ts preparar|alheio|limpar");
  process.exit(1);
}
acao
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
