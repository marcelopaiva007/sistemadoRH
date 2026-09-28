// Fumaça do envio de contracheques contra o banco de verdade (sem Telegram nem
// SMTP configurados: o aviso falha e isso também é verificado). Cria as
// próprias empresas e pessoas e apaga tudo no fim.
//
//   npx tsx scripts/smoke-contracheques.ts
import "dotenv/config";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../lib/prisma";
import { enviarContracheques } from "../lib/contracheques/envio";
import { abrirContracheque, confirmarRecebimento } from "../lib/contracheques/confirmar";
import { recibosConfirmadosTravando } from "../lib/contracheques/protecao";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const SUFIXO = Date.now().toString(36);

async function main() {
  const marca = await prisma.marca.create({ data: { nome: `Smoke CC ${SUFIXO}` } });
  const empresa = await prisma.empresa.create({ data: { nome: `CC ${SUFIXO}`, marcaId: marca.id, ativo: true } });
  const setor = await prisma.setor.create({ data: { empresaId: empresa.id, nome: "Smoke", ativo: true } });
  const posicao = await prisma.posicao.create({ data: { empresaId: empresa.id, nome: "Smoke" } });
  const pessoa = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.colaborador.create({
      data: { empresaId: empresa.id, nome, setorId: setor.id, posicaoId: posicao.id, dataAdmissao: new Date(Date.UTC(2024, 0, 10)), ativo: true, ...extra },
    });
  const ana = await pessoa("Ana Contracheque Smoke", { email: `ana.${SUFIXO}@exemplo.com` });
  const bruno = await pessoa("Bruno Contracheque Smoke");

  const pdf = Buffer.from(`%PDF-1.4 contracheque ${SUFIXO}`);
  const documento = async (colaboradorId: string) => {
    const arquivo = await prisma.arquivo.create({
      data: { empresaId: empresa.id, nome: "contracheque.pdf", mimeType: "application/pdf", tamanhoBytes: pdf.byteLength, conteudo: pdf },
    });
    return prisma.documentoColaborador.create({
      data: {
        empresaId: empresa.id,
        colaboradorId,
        tipo: "CONTRACHEQUE",
        arquivoId: arquivo.id,
        competencia: new Date(Date.UTC(2026, 7, 1)),
        chaveDedupe: "CONTRACHEQUE:2026-08:MENSAL",
      },
    });
  };
  const docAna = await documento(ana.id);
  const docBruno = await documento(bruno.id);
  const usuario = { nome: "Smoke" };

  try {
    console.log("1. Enviar a competência:");
    const r = await enviarContracheques([docAna.id, docBruno.id], usuario);
    const reciboAna = await prisma.reciboContracheque.findUniqueOrThrow({ where: { documentoId: docAna.id } });
    const reciboBruno = await prisma.reciboContracheque.findUniqueOrThrow({ where: { documentoId: docBruno.id } });
    ok(reciboAna.empresaId === empresa.id && reciboAna.tipoFolha === "MENSAL", "recibo nasce com o CNPJ da ficha e o tipo de folha");
    ok(!!reciboAna.enviadoEm && reciboAna.envios === 1, "tentativa de aviso registrada");
    ok(
      reciboBruno.canal === null && (reciboBruno.envioErro ?? "").includes("nem e-mail"),
      "sem Telegram nem e-mail → registra que não há como avisar",
    );
    ok(r.avisados + r.semCanal === 2, `resumo do envio (${r.avisados} avisados, ${r.semCanal} sem canal)`);
    await enviarContracheques([docAna.id], usuario);
    ok((await prisma.reciboContracheque.count({ where: { documentoId: docAna.id } })) === 1, "reenviar não duplica o recibo");

    console.log("\n2. Abrir no portal:");
    ok((await abrirContracheque(reciboAna.id, bruno.id)) === null, "o contracheque da Ana não abre para o Bruno");
    const semAbrir = await confirmarRecebimento({ reciboId: reciboAna.id, colaboradorId: ana.id, fotoDataUrl: null, ip: "1.2.3.4", dispositivo: null });
    ok(!semAbrir.ok && semAbrir.error.includes("Abra"), "confirmar antes de abrir é recusado");
    const aberto = await abrirContracheque(reciboAna.id, ana.id);
    ok(!!aberto && Buffer.from(aberto.bytes).equals(pdf), "a Ana abre o próprio contracheque");
    ok(!!(await prisma.reciboContracheque.findUniqueOrThrow({ where: { id: reciboAna.id } })).vistoEm, "a abertura fica registrada");

    console.log("\n3. Confirmar com foto:");
    const semFoto = await confirmarRecebimento({ reciboId: reciboAna.id, colaboradorId: ana.id, fotoDataUrl: "data:image/jpeg;base64,AA==", ip: "1.2.3.4", dispositivo: null });
    ok(!semFoto.ok, "foto inválida é recusada");
    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#888" } }).jpeg().toBuffer();
    const foto = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const outro = await confirmarRecebimento({ reciboId: reciboAna.id, colaboradorId: bruno.id, fotoDataUrl: foto, ip: "1.2.3.4", dispositivo: null });
    ok(!outro.ok, "o Bruno não confirma pela Ana");
    const certo = await confirmarRecebimento({ reciboId: reciboAna.id, colaboradorId: ana.id, fotoDataUrl: foto, ip: "1.2.3.4", dispositivo: "Teste/1.0" });
    const confirmado = await prisma.reciboContracheque.findUniqueOrThrow({ where: { id: reciboAna.id }, include: { fotoArquivo: true } });
    ok(certo.ok && !!confirmado.confirmadoEm && confirmado.confirmadoIp === "1.2.3.4", "confirmado, com hora e IP");
    ok(confirmado.hashDocumento === createHash("sha256").update(pdf).digest("hex"), "o hash é o do arquivo que ela abriu");
    ok(!!confirmado.fotoArquivo && confirmado.fotoArquivo.mimeType === "image/jpeg" && confirmado.fotoArquivo.empresaId === empresa.id, "a foto fica guardada");
    const deNovo = await confirmarRecebimento({ reciboId: reciboAna.id, colaboradorId: ana.id, fotoDataUrl: foto, ip: "9.9.9.9", dispositivo: null });
    const aposDeNovo = await prisma.reciboContracheque.findUniqueOrThrow({ where: { id: reciboAna.id } });
    ok(deNovo.ok && aposDeNovo.confirmadoIp === "1.2.3.4", "confirmar de novo não sobrescreve a prova");
    const r2 = await enviarContracheques([docAna.id], usuario);
    ok(r2.jaConfirmados === 1 && r2.avisados + r2.semCanal === 0, "quem já confirmou não recebe aviso de novo");

    console.log("\n4. A prova não se apaga por tabela:");
    const [pelaFicha, peloDoc, doBruno] = await prisma.$transaction(async (tx) => [
      await recibosConfirmadosTravando(tx, { colaboradorId: ana.id }),
      await recibosConfirmadosTravando(tx, { documentoId: docAna.id }),
      await recibosConfirmadosTravando(tx, { documentoId: docBruno.id }),
    ]);
    ok(pelaFicha === 1 && peloDoc === 1, "excluir a ficha ou o contracheque da Ana é barrado (confirmado com foto)");
    ok(doBruno === 0, "o do Bruno, sem confirmação, pode sair");
  } finally {
    const recibos = await prisma.reciboContracheque.findMany({ where: { empresaId: empresa.id }, select: { fotoArquivoId: true } });
    await prisma.reciboContracheque.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.documentoColaborador.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.arquivo.deleteMany({ where: { OR: [{ empresaId: empresa.id }, { id: { in: recibos.map((r) => r.fotoArquivoId).filter((x): x is string => !!x) } }] } });
    await prisma.auditLog.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.colaborador.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.posicao.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.setor.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
    await prisma.marca.delete({ where: { id: marca.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(falhas === 0 ? "\nFumaça dos contracheques: tudo certo." : `\n${falhas} verificação(ões) falharam.`);
    process.exit(falhas === 0 ? 0 : 1);
  });
