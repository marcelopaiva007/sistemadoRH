// Anonimato e validação da pesquisa de clima (26/11/2026).
//
// A auditoria de 25/11/2026 achou três furos, todos silenciosos — a tela
// mostrava um número plausível e errado:
//   1. o piso de anonimato contava ITENS respondidos, não PESSOAS: 1 pessoa que
//      respondeu 35 perguntas aparecia como "35 respostas", com média e ranking;
//   2. a nota NPS (0-10) entrava na média da escala 1-5;
//   3. o envio público gravava pergunta de outra pesquisa, opção de outra
//      pergunta, nota fora da escala e pergunta repetida.
// Sem banco: roda no CI junto dos outros testes puros.

import { calcularClima, ehItemLikert, SETOR_OCULTO_COMENTARIO, type RespostaPrisma } from "../lib/clima";
import { validarItensEnvio, type PerguntaDoEnvio } from "../lib/pesquisa-envio-validacao";
import { AMOSTRA_MINIMA_ANONIMATO } from "../lib/constants-rh";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

type Pergunta = RespostaPrisma["itens"][number]["pergunta"];
const likert = (n: number, dim = "CREDIBILIDADE"): Pergunta => ({
  id: `l${n}`, enunciado: `Afirmação ${n}`, tipo: "LIKERT_5", dimensaoGPTW: dim, dimensao: null,
});
const PERGUNTAS_LIKERT = Array.from({ length: 35 }, (_, i) => likert(i + 1, i % 2 ? "RESPEITO" : "CREDIBILIDADE"));
const NPS: Pergunta = { id: "nps", enunciado: "Recomendaria?", tipo: "NPS_10", dimensaoGPTW: null, dimensao: null };
const TEXTO: Pergunta = { id: "txt", enunciado: "Comente", tipo: "TEXT", dimensaoGPTW: null, dimensao: null };
const TODAS = [...PERGUNTAS_LIKERT, NPS, TEXTO];

function pessoa(setor: string, nota: number, opts: { nps?: number; texto?: string; sexo?: string } = {}): RespostaPrisma {
  return {
    setorNomeSnapshot: setor,
    sexoSnapshot: opts.sexo ?? null,
    faixaEtariaSnapshot: null,
    itens: [
      ...PERGUNTAS_LIKERT.map((p) => ({ pergunta: p, valorNumerico: nota, valorTexto: null })),
      ...(opts.nps !== undefined ? [{ pergunta: NPS, valorNumerico: opts.nps, valorTexto: null }] : []),
      ...(opts.texto ? [{ pergunta: TEXTO, valorNumerico: null, valorTexto: opts.texto }] : []),
    ],
  };
}

console.log(`\nPiso de anonimato conta PESSOAS (piso = ${AMOSTRA_MINIMA_ANONIMATO})\n`);

{
  // 3 pessoas no Comercial, 1 no Financeiro (35 itens respondidos cada).
  const respostas = [
    pessoa("Comercial", 4, { sexo: "M" }),
    pessoa("Comercial", 4, { sexo: "M" }),
    pessoa("Comercial", 5, { sexo: "M", texto: "Gosto muito da equipe daqui" }),
    pessoa("Financeiro", 1, { sexo: "F", texto: "Meu gestor não me escuta nunca" }),
  ];
  const { resultado } = calcularClima({ respostas, perguntas: TODAS });
  const fin = resultado.porSetor.find((s) => s.setor === "Financeiro");
  // "Comercial" é canonizado para "Vendas" (lib/de-para-rotulos.ts).
  const com = resultado.porSetor.find((s) => s.setor === "Vendas");

  ok(fin !== undefined && fin.respostas === 1, "setor com 1 pessoa e 35 itens conta 1 resposta (antes: 35)");
  ok(fin?.amostraInsuficiente === true, "1 pessoa com muitas respostas fica ABAIXO do piso");
  ok(fin?.media === null && fin?.media100 === null, "setor abaixo do piso não leva média nenhuma");
  ok(fin?.ranking === null, "setor abaixo do piso fica fora do ranking");
  ok(com?.respostas === 3 && com.amostraInsuficiente === false && com.media100 !== null, "setor com 3 pessoas tem número");
  ok(com?.ranking === 1, "ranking numera só quem tem número");
  ok(resultado.porSetor[resultado.porSetor.length - 1].setor === "Financeiro", "setor sem amostra vai para o fim da lista");

  const celulasFin = resultado.heatmap.filter((h) => h.setor === "Financeiro");
  ok(celulasFin.length > 0 && celulasFin.every((h) => h.amostraInsuficiente && h.media100 === null && h.nivel === null),
    "mapa de calor: células do setor de 1 pessoa sem número");
  ok(celulasFin.every((h) => h.respostas === 1), "mapa de calor: `respostas` = pessoas, não itens");
  const celulasCom = resultado.heatmap.filter((h) => h.setor === "Vendas");
  ok(celulasCom.every((h) => !h.amostraInsuficiente && h.media100 !== null), "mapa de calor: setor com amostra tem número");

  const doFin = resultado.comentarios.find((c) => c.texto.includes("gestor"));
  ok(doFin?.setor === SETOR_OCULTO_COMENTARIO, "comentário de setor abaixo do piso sai sem o nome do setor");
  const doCom = resultado.comentarios.find((c) => c.texto.includes("equipe"));
  ok(doCom?.setor === "Vendas", "comentário de setor com amostra mantém o setor");

  const fem = resultado.demografia?.porSexo.find((s) => s.sexo === "F");
  const mas = resultado.demografia?.porSexo.find((s) => s.sexo === "M");
  ok(fem?.count === 1 && fem.media === null, "recorte por sexo com 1 pessoa: contagem sim, média não");
  ok(mas?.count === 3 && mas.media !== null, "recorte por sexo com 3 pessoas tem média");

  ok(resultado.mediaPorDimensao.every((d) => d.respostas === 4), "dimensão: `respostas` = 4 pessoas (antes: itens)");
}

{
  const { resultado } = calcularClima({
    respostas: [pessoa("Comercial", 5, { texto: "comentário de alguém sozinho" }), pessoa("Comercial", 5)],
    perguntas: TODAS,
  });
  ok(resultado.mostraAmostraInsuficiente, "pesquisa inteira com 2 pessoas: amostra insuficiente");
  ok(resultado.mediaPorDimensao.length === 0 && resultado.porSetor.length === 0 && resultado.heatmap.length === 0,
    "pesquisa inteira abaixo do piso não manda média, setor nem mapa de calor");
  ok(resultado.comentarios.length === 0 && resultado.demografia === null, "nem comentário, nem demografia");
  ok(resultado.totalRespostas === 2, "a contagem de respostas continua visível");
}

console.log("\nNPS fora da média Likert\n");

{
  ok(!ehItemLikert({ pergunta: { tipo: "NPS_10" }, valorNumerico: 9 }), "item NPS não é Likert");
  ok(!ehItemLikert({ pergunta: { tipo: "FREQ_0_4" }, valorNumerico: 3 }), "frequência 0-4 não é Likert 1-5");
  ok(!ehItemLikert({ pergunta: { tipo: "LIKERT_5" }, valorNumerico: 9 }), "valor fora de 1-5 não entra");
  ok(ehItemLikert({ pergunta: { tipo: "LIKERT_5" }, valorNumerico: 3 }), "Likert 1-5 entra");

  // Todo mundo dá 3 no Likert e 10 no NPS: a média Likert tem de ser 3 (50/100).
  const respostas = [1, 2, 3].map(() => pessoa("Comercial", 3, { nps: 10 }));
  const { resultado } = calcularClima({ respostas, perguntas: TODAS });
  ok(resultado.mediaPorDimensao.every((d) => d.media === 3 && d.media100 === 50), "média por dimensão ignora a nota NPS (3,00 → 50)");
  ok(resultado.porSetor[0].media === 3, "média do setor ignora a nota NPS");
  ok(resultado.heatmap.every((h) => h.media100 === 50), "mapa de calor ignora a nota NPS");
  ok(resultado.demografia === null || resultado.demografia.porSexo.every((s) => s.media === null || s.media === 50),
    "recorte por sexo ignora a nota NPS");
  ok(!resultado.mediaPorDimensao.some((d) => d.dimensao === "GERAL"), "a pergunta NPS não vira dimensão GERAL");
  ok(resultado.nps?.score === 100 && resultado.nps.total === 3, "o NPS continua apurado no indicador próprio");
}

console.log("\nValidação do envio público\n");

{
  const PERGUNTAS: PerguntaDoEnvio[] = [
    { id: "lk", tipo: "LIKERT_5", obrigatoria: true, opcoes: [] },
    { id: "fq", tipo: "FREQ_0_4", obrigatoria: false, opcoes: [] },
    { id: "np", tipo: "NPS_10", obrigatoria: false, opcoes: [] },
    { id: "mc", tipo: "MULTIPLE_CHOICE", obrigatoria: false, opcoes: [{ id: "o1" }, { id: "o2" }] },
    { id: "mc2", tipo: "MULTIPLE_CHOICE", obrigatoria: false, opcoes: [{ id: "o9" }] },
    { id: "tx", tipo: "TEXT", obrigatoria: false, opcoes: [] },
  ];

  const valido = validarItensEnvio(PERGUNTAS, [
    { perguntaId: "lk", valorNumerico: 4, valorTexto: "lixo" },
    { perguntaId: "fq", valorNumerico: 0 },
    { perguntaId: "np", valorNumerico: 10 },
    { perguntaId: "mc", opcaoId: "o2" },
    { perguntaId: "tx", valorTexto: "  bom  " },
  ]);
  ok(valido.ok && valido.itens.length === 5, "envio correto passa");
  ok(valido.ok && valido.itens[0].valorTexto === null, "campo que não é do tipo é descartado (texto em Likert)");
  ok(valido.ok && valido.itens[4].valorTexto === "bom", "texto chega aparado");

  const estranha = validarItensEnvio(PERGUNTAS, [
    { perguntaId: "lk", valorNumerico: 4 },
    { perguntaId: "de-outra-pesquisa", valorNumerico: 5 },
  ]);
  ok(!estranha.ok, "pergunta que não é da pesquisa: recusa");

  const opcaoAlheia = validarItensEnvio(PERGUNTAS, [
    { perguntaId: "lk", valorNumerico: 4 },
    { perguntaId: "mc", opcaoId: "o9" },
  ]);
  ok(!opcaoAlheia.ok, "opção de outra pergunta: recusa");
  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "lk", valorNumerico: 4 }, { perguntaId: "mc" }]).ok,
    "múltipla escolha sem opção: recusa");

  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "lk", valorNumerico: 6 }]).ok, "Likert 6: fora da faixa, recusa");
  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "lk", valorNumerico: 0 }]).ok, "Likert 0: fora da faixa, recusa");
  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "lk", valorNumerico: 3 }, { perguntaId: "fq", valorNumerico: 5 }]).ok,
    "frequência 5: fora da faixa 0-4, recusa");
  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "lk", valorNumerico: 3 }, { perguntaId: "np", valorNumerico: 11 }]).ok,
    "NPS 11: fora da faixa 0-10, recusa");
  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "lk", valorNumerico: 3.5 }]).ok, "nota fracionada: recusa");
  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "lk" }]).ok, "Likert sem nota: recusa");

  const duplicada = validarItensEnvio(PERGUNTAS, [
    { perguntaId: "lk", valorNumerico: 5 },
    { perguntaId: "lk", valorNumerico: 5 },
  ]);
  ok(!duplicada.ok, "mesma pergunta duas vezes: recusa");

  ok(!validarItensEnvio(PERGUNTAS, [{ perguntaId: "fq", valorNumerico: 2 }]).ok, "obrigatória faltando: recusa");
  const textoVazio = validarItensEnvio(PERGUNTAS, [
    { perguntaId: "lk", valorNumerico: 2 },
    { perguntaId: "tx", valorTexto: "   " },
  ]);
  ok(textoVazio.ok && textoVazio.itens.length === 1, "texto em branco não é gravado");
  ok(!validarItensEnvio([{ id: "x", tipo: "DESCONHECIDO", obrigatoria: false, opcoes: [] }], [{ perguntaId: "x", valorNumerico: 1 }]).ok,
    "tipo de pergunta desconhecido: recusa");
}

console.log(falhas === 0 ? "\nTodos os testes passaram.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
