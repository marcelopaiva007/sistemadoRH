// A prova do classificador (spec §7) — lib/delegacoes/classificador.ts, sem
// API: a normalização é onde a regra que dá nome ao módulo vira código.
//
//   npx tsx scripts/test-delegacoes-classificador.ts

import { normalizarClassificacao, CONFIANCA_MINIMA, RESUMO_MAXIMO } from "../lib/delegacoes/classificador";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

console.log("\nA REGRA: confiança baixa nunca vira PRECISA_DECISAO_SUA\n");
{
  const r = normalizarClassificacao({
    classificacao: "PRECISA_DECISAO_SUA",
    resumo: "Pediu autorização para a compra.",
    confianca: 0.4,
  });
  ok(r.ok, "normaliza sem erro");
  if (r.ok) igual(r.resultado.classificacao, "EM_RISCO", "confiança 0.4 (< 0.6) força EM_RISCO, mesmo o modelo tendo dito PRECISA_DECISAO_SUA");

  const noLimite = normalizarClassificacao({
    classificacao: "PRECISA_DECISAO_SUA",
    resumo: "x",
    confianca: CONFIANCA_MINIMA,
  });
  if (noLimite.ok) igual(noLimite.resultado.classificacao, "PRECISA_DECISAO_SUA", `confiança EXATAMENTE ${CONFIANCA_MINIMA} já é confiança suficiente — passa`);

  const abaixo = normalizarClassificacao({
    classificacao: "PRECISA_DECISAO_SUA",
    resumo: "x",
    confianca: CONFIANCA_MINIMA - 0.001,
  });
  if (abaixo.ok) igual(abaixo.resultado.classificacao, "EM_RISCO", "um fiapo abaixo do limite já força EM_RISCO");
}

console.log("\nConfiança baixa força EM_RISCO em QUALQUER classificação original, não só PRECISA_DECISAO_SUA\n");
{
  for (const original of ["NO_PRAZO", "TRAVADO_DEPENDENCIA"] as const) {
    const r = normalizarClassificacao({ classificacao: original, resumo: "x", confianca: 0.2 });
    if (r.ok) igual(r.resultado.classificacao, "EM_RISCO", `${original} com confiança 0.2 também vira EM_RISCO`);
  }
}

console.log("\nPrazo sugerido — nunca inventado, só aceito em formato de data válida\n");
{
  const semData = normalizarClassificacao({ classificacao: "EM_RISCO", resumo: "x", confianca: 0.9 });
  if (semData.ok) igual(semData.resultado.prazoSugerido, null, "sem o modelo ter mandado nada, fica null");

  const comData = normalizarClassificacao({
    classificacao: "EM_RISCO",
    prazoSugerido: "2026-09-15",
    resumo: "x",
    confianca: 0.9,
  });
  if (comData.ok) igual(comData.resultado.prazoSugerido, "2026-09-15", "data válida passa");

  const dataImpossivel = normalizarClassificacao({
    classificacao: "EM_RISCO",
    prazoSugerido: "2026-02-30",
    resumo: "x",
    confianca: 0.9,
  });
  if (dataImpossivel.ok) igual(dataImpossivel.resultado.prazoSugerido, null, "30/02 não existe — vira null, não rola pra março");

  const textoLivre = normalizarClassificacao({
    classificacao: "EM_RISCO",
    prazoSugerido: "semana que vem",
    resumo: "x",
    confianca: 0.9,
  });
  if (textoLivre.ok) igual(textoLivre.resultado.prazoSugerido, null, "texto que não é aaaa-mm-dd vira null, nunca é interpretado");
}

console.log("\nBloqueador e resumo — cortados, nunca vazios viram string vazia perdida\n");
{
  const r = normalizarClassificacao({
    classificacao: "TRAVADO_DEPENDENCIA",
    bloqueador: "  fornecedor não respondeu o e-mail  ",
    resumo: "x".repeat(500),
    confianca: 0.9,
  });
  if (r.ok) {
    igual(r.resultado.bloqueador, "fornecedor não respondeu o e-mail", "bloqueador vem aparado");
    igual(r.resultado.resumo.length, RESUMO_MAXIMO, `resumo nunca passa de ${RESUMO_MAXIMO} caracteres`);
  }

  const semBloqueio = normalizarClassificacao({ classificacao: "EM_RISCO", bloqueador: "   ", resumo: "x", confianca: 0.9 });
  if (semBloqueio.ok) igual(semBloqueio.resultado.bloqueador, null, "bloqueador só de espaços vira null, não string vazia");
}

console.log("\nClassificação fora do domínio e resumo ausente\n");
{
  const foraDoDominio = normalizarClassificacao({ classificacao: "TALVEZ", resumo: "x", confianca: 0.9 });
  if (foraDoDominio.ok) igual(foraDoDominio.resultado.classificacao, "EM_RISCO", "classificação que o modelo inventou (fora do enum) cai no baseline de atenção, não é descartada");

  const semResumo = normalizarClassificacao({ classificacao: "NO_PRAZO", confianca: 0.9 });
  ok(!semResumo.ok, "sem resumo nenhum, a normalização recusa — não inventa um resumo vazio");
}

console.log("\nConfiança fora de [0,1] — nunca passa adiante um número absurdo\n");
{
  const acimaDeUm = normalizarClassificacao({ classificacao: "NO_PRAZO", resumo: "x", confianca: 5 });
  if (acimaDeUm.ok) igual(acimaDeUm.resultado.confianca, 1, "confiança > 1 é grampeada em 1");

  const negativa = normalizarClassificacao({ classificacao: "NO_PRAZO", resumo: "x", confianca: -3 });
  if (negativa.ok) igual(negativa.resultado.confianca, 0, "confiança negativa é grampeada em 0 — e força EM_RISCO");
  if (negativa.ok) igual(negativa.resultado.classificacao, "EM_RISCO", "confiança grampeada em 0 também aciona a regra da confiança mínima");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
