// Envio de contracheques — testes unitários da invalidação de assinatura
// e regras de reenvio / snapshot forense.
//
//   npx tsx scripts/test-contracheques-invalidacao.ts

import {
  TAMANHO_MINIMO_MOTIVO_INVALIDACAO,
  validarMotivoInvalidacao,
  podeInvalidarRecibo,
  montarSnapshotInvalidacao,
  camposResetAposInvalidacao,
  rotuloAcaoReenvio,
  acoesDisponiveisParaRecibo,
} from "../lib/contracheques/invalidacao";
import {
  resolverMetadadosContrachequeManual,
  decidirSegundoContrachequeDossie,
} from "../lib/contracheques/dossie";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("1. Validação do motivo de invalidação:");
ok(TAMANHO_MINIMO_MOTIVO_INVALIDACAO === 10, "mínimo de 10 caracteres");
const rVazio = validarMotivoInvalidacao("");
ok(!rVazio.ok && "error" in rVazio, "motivo vazio rejeitado");
const rCurto = validarMotivoInvalidacao("   curto   ");
ok(!rCurto.ok && "error" in rCurto, "motivo curto (< 10 chars) rejeitado");
const motivoValido = "Assinatura realizada no aparelho de terceiro com foto em branco.";
const rValido = validarMotivoInvalidacao(`   ${motivoValido}   `);
ok(rValido.ok && "motivo" in rValido && rValido.motivo === motivoValido, "motivo válido aparado (trimmed)");

console.log("\n2. Elegibilidade de invalidação:");
const rNulo = podeInvalidarRecibo(null);
ok(!rNulo.ok && "error" in rNulo, "recibo nulo não pode ser invalidado");
const rNaoConfirmado = podeInvalidarRecibo({ confirmadoEm: null });
ok(!rNaoConfirmado.ok && "error" in rNaoConfirmado, "recibo não confirmado não pode ser invalidado");
const rConfirmado = podeInvalidarRecibo({ confirmadoEm: new Date() });
ok(rConfirmado.ok, "recibo confirmado pode ser invalidado");

console.log("\n3. Snapshot forense de invalidação:");
const agora = new Date();
const reciboFake = {
  id: "recibo_123",
  documentoId: "doc_456",
  empresaId: "emp_789",
  colaboradorId: "colab_012",
  fotoArquivoId: "arq_foto_1",
  comprovanteArquivoId: "arq_comp_2",
  confirmadoIp: "192.168.1.1",
  confirmadoDispositivo: "iPhone 15",
  confirmadoLocalizacao: "-23.55,-46.63",
  hashDocumento: "a1b2c3d4e5f6",
  textoAceite: "Confirmo recebimento",
  canal: "EMAIL",
  enviadoEm: new Date(agora.getTime() - 86400000),
  cienciaTelegramEm: new Date(agora.getTime() - 72000000),
  vistoEm: new Date(agora.getTime() - 36000000),
  codigoValidadoEm: new Date(agora.getTime() - 18000000),
  canalCodigo: "EMAIL",
  confirmadoEm: agora,
};
const atorFake = { id: "user_rh_1", nome: "Mariana RH" };
const snapshot = montarSnapshotInvalidacao(reciboFake, motivoValido, atorFake);

ok(snapshot.reciboId === "recibo_123", "snapshot: reciboId preservado");
ok(snapshot.documentoId === "doc_456", "snapshot: documentoId preservado");
ok(snapshot.empresaId === "emp_789", "snapshot: empresaId preservado");
ok(snapshot.colaboradorId === "colab_012", "snapshot: colaboradorId preservado");
ok(snapshot.motivo === motivoValido, "snapshot: motivo registrado");
ok(snapshot.invalidadoPorId === "user_rh_1", "snapshot: ator id registrado");
ok(snapshot.invalidadoPorNome === "Mariana RH", "snapshot: ator nome registrado");
ok(snapshot.fotoArquivoId === "arq_foto_1", "snapshot: fotoArquivoId preservado");
ok(snapshot.comprovanteArquivoId === "arq_comp_2", "snapshot: comprovanteArquivoId preservado");
ok(snapshot.confirmadoIp === "192.168.1.1", "snapshot: IP preservado");
ok(snapshot.confirmadoDispositivo === "iPhone 15", "snapshot: dispositivo preservado");
ok(snapshot.confirmadoLocalizacao === "-23.55,-46.63", "snapshot: localização preservada");
ok(snapshot.hashDocumento === "a1b2c3d4e5f6", "snapshot: hashDocumento preservado");
ok(snapshot.textoAceite === "Confirmo recebimento", "snapshot: textoAceite preservado");
ok(snapshot.canalOriginal === "EMAIL", "snapshot: canalOriginal preservado");
ok(snapshot.enviadoEmOriginal === reciboFake.enviadoEm, "snapshot: enviadoEmOriginal preservado");
ok(snapshot.cienciaTelegramEm === reciboFake.cienciaTelegramEm, "snapshot: cienciaTelegramEm preservada");
ok(snapshot.vistoEmOriginal === reciboFake.vistoEm, "snapshot: vistoEmOriginal preservado");
ok(snapshot.codigoValidadoEm === reciboFake.codigoValidadoEm, "snapshot: codigoValidadoEm preservado");
ok(snapshot.canalCodigo === "EMAIL", "snapshot: canalCodigo preservado");
ok(snapshot.confirmadoEmOriginal === agora, "snapshot: confirmadoEmOriginal preservado");

console.log("\n4. Reset de campos do recibo após invalidação:");
const novoToken = "tok_novo_seguro_999";
const reset = camposResetAposInvalidacao(novoToken);
ok(reset.tokenAssinatura === novoToken, "tokenAssinatura rotacionado");
ok(reset.confirmadoEm === null, "confirmadoEm zerado");
ok(reset.confirmadoIp === null, "confirmadoIp zerado");
ok(reset.confirmadoDispositivo === null, "confirmadoDispositivo zerado");
ok(reset.confirmadoLocalizacao === null, "confirmadoLocalizacao zerado");
ok(reset.hashDocumento === null, "hashDocumento zerado");
ok(reset.textoAceite === null, "textoAceite zerado");
ok(reset.fotoArquivoId === null, "fotoArquivoId desvinculado");
ok(reset.comprovanteArquivoId === null, "comprovanteArquivoId desvinculado");
ok(reset.vistoEm === null, "vistoEm zerado");
ok(reset.cienciaTelegramEm === null, "cienciaTelegramEm zerado");
ok(reset.codigoValidadoEm === null, "codigoValidadoEm zerado");
ok(reset.codigo2faHash === null, "codigo2faHash zerado");
ok(reset.codigoExpiraEm === null, "codigoExpiraEm zerado");
ok(reset.tentativasCodigo === 0, "tentativasCodigo zerado");
ok(reset.bloqueadoEm === null, "bloqueadoEm zerado");
ok(reset.enviadoEm === null, "enviadoEm zerado");
ok(reset.enviadoPorNome === null, "enviadoPorNome zerado");
ok(reset.canal === null, "canal zerado");
ok(reset.envioErro === null, "envioErro zerado");
ok(reset.lembretesEnviados === 0, "lembretesEnviados zerado");
ok(reset.ultimoLembreteEm === null, "ultimoLembreteEm zerado");

console.log("\n5. Regras de ação da listagem (ações disponíveis e rótulo):");
ok(rotuloAcaoReenvio(true) === "Reenviar", "rotulo reenviar se já enviado");
ok(rotuloAcaoReenvio(false) === "Enviar", "rotulo enviar se não enviado");

const acConfirmado = acoesDisponiveisParaRecibo({ situacao: "CONFIRMADO", temEmail: true });
ok(acConfirmado.podeInvalidar === true && acConfirmado.podeReenviar === false, "confirmado: pode invalidar, não pode reenviar");

const acEnviado = acoesDisponiveisParaRecibo({ situacao: "ENVIADO", temEmail: true });
ok(acEnviado.podeInvalidar === false && acEnviado.podeReenviar === true, "enviado com email: pode reenviar");

const acSemEmail = acoesDisponiveisParaRecibo({ situacao: "ENVIADO", temEmail: false });
ok(acSemEmail.podeReenviar === false, "sem email: não pode reenviar");

const acBloqueado = acoesDisponiveisParaRecibo({ situacao: "BLOQUEADO", temEmail: true });
ok(acBloqueado.podeReenviar === true, "bloqueado com email: pode reenviar");

const acNaoEnviado = acoesDisponiveisParaRecibo({ situacao: "NAO_ENVIADO", temEmail: true });
ok(acNaoEnviado.podeReenviar === true, "nao enviado com email: pode enviar/reenviar");

console.log("\n6. Resolução de metadados de contracheque manual no Dossiê:");
const metaMensal = resolverMetadadosContrachequeManual({
  competencia: "2026-10",
  tipoFolha: "MENSAL",
});
ok(metaMensal !== null, "metaMensal resolvido");
if (metaMensal) {
  ok(metaMensal.competencia.toISOString() === "2026-10-01T00:00:00.000Z", "competencia: 2026-10-01T00:00:00Z");
  ok(metaMensal.tipoFolha === "MENSAL", "tipoFolha: MENSAL");
  ok(metaMensal.chaveDedupe === "CONTRACHEQUE:2026-10:MENSAL", "chaveDedupe: CONTRACHEQUE:2026-10:MENSAL");
  ok(metaMensal.mesAno === "10/2026", "mesAno: 10/2026");
  ok(metaMensal.rotulo === "10/2026", "rotulo: 10/2026");
  ok(metaMensal.descricaoPadrao === "Competência 10/2026", "descricaoPadrao: Competência 10/2026");
}

const meta13 = resolverMetadadosContrachequeManual({
  competencia: "2026-10",
  tipoFolha: "DECIMO_TERCEIRO",
});
ok(meta13 !== null, "meta13 resolvido");
if (meta13) {
  ok(meta13.chaveDedupe === "CONTRACHEQUE:2026-10:DECIMO_TERCEIRO", "chaveDedupe 13o");
  ok(meta13.rotulo === "10/2026 (13º salário)", "rotulo 13o");
  ok(meta13.descricaoPadrao === "Competência 10/2026 (13º salário)", "descricaoPadrao 13o");
}

const metaFallback = resolverMetadadosContrachequeManual({
  competencia: "",
  descricao: "Competência 10/2026",
});
ok(metaFallback !== null, "metaFallback resolvido via descricao");
if (metaFallback) {
  ok(metaFallback.chaveDedupe === "CONTRACHEQUE:2026-10:MENSAL", "metaFallback chaveDedupe");
  ok(metaFallback.mesAno === "10/2026", "metaFallback mesAno");
}

const metaInvalido = resolverMetadadosContrachequeManual({
  competencia: "2026-13",
});
ok(metaInvalido === null, "competencia 2026-13 retorna null");

const metaSemMes = resolverMetadadosContrachequeManual({
  competencia: "",
  descricao: "Documento qualquer sem competencia",
});
ok(metaSemMes === null, "descricao sem mes/ano retorna null");

console.log("\n7. Decisão de segundo contracheque manual no Dossiê:");
const decCriar = decidirSegundoContrachequeDossie(null, "10/2026");
ok(decCriar.acao === "CRIAR", "decisao sem existente: CRIAR");

const decSubstSemRecibo = decidirSegundoContrachequeDossie(
  { id: "d1", arquivoId: "a1", recibo: null },
  "10/2026"
);
ok(
  decSubstSemRecibo.acao === "SUBSTITUIR_PENDENTE" &&
    decSubstSemRecibo.documentoId === "d1" &&
    decSubstSemRecibo.arquivoAnteriorId === "a1" &&
    decSubstSemRecibo.reciboId === null,
  "decisao pendente sem recibo: SUBSTITUIR_PENDENTE"
);

const decSubstPendente = decidirSegundoContrachequeDossie(
  { id: "d1", arquivoId: "a1", recibo: { id: "r1", confirmadoEm: null } },
  "10/2026"
);
ok(
  decSubstPendente.acao === "SUBSTITUIR_PENDENTE" &&
    decSubstPendente.documentoId === "d1" &&
    decSubstPendente.arquivoAnteriorId === "a1" &&
    decSubstPendente.reciboId === "r1",
  "decisao pendente com recibo: SUBSTITUIR_PENDENTE com reciboId"
);

const decBloqAssinado = decidirSegundoContrachequeDossie(
  { id: "d1", arquivoId: "a1", recibo: { id: "r1", confirmadoEm: new Date() } },
  "10/2026"
);
ok(
  decBloqAssinado.acao === "BLOQUEAR_JA_ASSINADO" &&
    decBloqAssinado.error.includes("assinado") &&
    decBloqAssinado.error.includes("Invalidar recibo"),
  "decisao já assinado: BLOQUEAR_JA_ASSINADO com orientacao de invalidar"
);

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
