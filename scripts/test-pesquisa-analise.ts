// Testes da análise gerencial genérica (lib/pesquisa-analise.ts).
// Não toca o banco.
//   npx tsx scripts/test-pesquisa-analise.ts
import { analisarPesquisa, temasDoComentario, tomDoComentario, type RespostaParaAnalise } from "@/lib/pesquisa-analise";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const perguntasEnps = [
  { id: "nota", ordem: 0, enunciado: "De 0 a 10, recomendaria?", tipo: "NPS_10", opcoes: [] },
  { id: "motivo", ordem: 1, enunciado: "O que motivou a sua nota?", tipo: "TEXT", opcoes: [] },
];

function resp(setor: string, nota: number, motivo?: string): RespostaParaAnalise {
  return {
    setorNomeSnapshot: setor,
    itens: [
      { perguntaId: "nota", valorNumerico: nota, valorTexto: null, opcaoId: null },
      ...(motivo ? [{ perguntaId: "motivo", valorNumerico: null, valorTexto: motivo, opcaoId: null }] : []),
    ],
  };
}

console.log("temas e tom\n");
ok(temasDoComentario("Os carros estão sempre quebrados").includes("Frota e veículos"), "carro quebrado → Frota");
ok(temasDoComentario("Precisamos de crédito no celular").includes("Ferramentas e equipamentos"), "celular → Ferramentas");
ok(temasDoComentario("Ambiente acolhedor, ótima equipe").includes("Ambiente e equipe"), "ambiente → Ambiente e equipe");
ok(!temasDoComentario("happy apparel").includes("Ferramentas e equipamentos"), "'app' curto não casa dentro de outra palavra");
ok(tomDoComentario("Carros quebrados, uma vergonha") === "negativo", "tom negativo");
ok(tomDoComentario("Excelente lugar, gosto muito") === "positivo", "tom positivo");
ok(tomDoComentario("Adotar a escala 5x2") === "misto", "sugestão sem sinal não vira elogio");
ok(tomDoComentario("Apesar de condutas parciais nas decisões, o ambiente é acolhedor") === "misto", "crítica + elogio = dividido");
ok(tomDoComentario("Disponibilizar o celular", true) === "negativo", "resposta a pergunta de melhoria = pedido de melhoria");
ok(tomDoComentario("Nada, está ótimo", true) === "positivo", "'nada a melhorar' não é crítica");
ok(!temasDoComentario("Carro quebrado, vergonha na frente dos clientes").includes("Clientes e serviço"), "'clientes' solto não puxa o tema Clientes");

console.log("\neNPS com setores, comentários e ciclo anterior\n");
{
  const respostas = [
    ...Array.from({ length: 6 }, () => resp("Técnico", 10, "Ambiente acolhedor e oportunidade de crescimento")),
    resp("Técnico", 5, "Os carros vivem quebrados e remendados, vergonha na frente do cliente"),
    resp("Técnico", 6, "Falta crédito no celular para trabalhar"),
    resp("Vendas", 9, "Ótimo lugar"),
    resp("Vendas", 3, "Carro quebrado de novo"),
    resp("Vendas", 4, "Não pagam o celular"),
    resp("Vendas", 8),
    resp("RH", 10), // setor com 1 resposta: tem que ficar oculto
  ];
  const anterior = {
    titulo: "eNPS — setembro",
    data: new Date("2026-09-30"),
    convites: 20,
    perguntas: perguntasEnps,
    respostas: Array.from({ length: 10 }, () => resp("Técnico", 10)),
  };
  const a = analisarPesquisa({
    titulo: "eNPS — outubro",
    modelo: "P05-ENPS",
    data: new Date("2026-10-31"),
    convites: 26,
    perguntas: perguntasEnps,
    respostas,
    anteriores: [anterior],
  });

  ok(a.respostas === 13, `13 respostas (achou ${a.respostas})`);
  ok(a.participacao === 50, `participação 50% (achou ${a.participacao})`);
  ok(a.indicador.escala === "enps", "indicador principal é eNPS");
  // 8 promotores (6×10 + 9 + 10), 1 neutro (8), 4 detratores → (8−4)/13 = 31
  ok(a.enps?.score === 31, `eNPS 31 (achou ${a.enps?.score})`);
  ok(a.comparativo?.tendencia === "queda", `queda frente ao ciclo anterior (achou ${a.comparativo?.tendencia})`);
  ok(a.comparativo?.variacao === -69, `variação −69 (achou ${a.comparativo?.variacao})`);
  ok(a.serie.length === 2 && a.serie[1].titulo === "eNPS — outubro", "série do mais antigo ao atual");

  const rh = a.setores.find((s) => s.setor === "RH");
  ok(rh?.amostraInsuficiente === true && rh.enps === null, "setor com 1 resposta fica sem número (anonimato)");
  ok(a.setores[0].setor === "Vendas", `pior setor primeiro (achou ${a.setores[0].setor})`);

  const frota = a.temas.find((t) => t.tema === "Frota e veículos");
  ok(frota?.quantidade === 2, `2 comentários sobre frota (achou ${frota?.quantidade})`);
  ok(frota?.porGrupo.detrator === 2, "comentários de frota vêm de detratores");
  ok(frota?.tom === "negativo", `tom de frota negativo (achou ${frota?.tom})`);

  ok(a.recomendacoes.some((r) => r.titulo === "Tratar: Frota e veículos"), "recomenda tratar frota");
  ok(a.recomendacoes.some((r) => r.titulo.startsWith("Entender a queda")), "recomenda entender a queda");
  ok(a.recomendacoes[0].prioridade === "alta", "recomendações ordenadas por prioridade");
  ok(a.resumo.length >= 3, `resumo com ${a.resumo.length} frases`);
  ok(a.pontosAtencao.some((p) => p.titulo === "Frota e veículos"), "frota aparece em pontos de atenção (pesquisa de 1 nota)");
}

console.log("\nPesquisa de escala 1-5 (favorabilidade)\n");
{
  const perguntas = [
    { id: "a", ordem: 0, enunciado: "Fui bem recebido", tipo: "LIKERT_5", opcoes: [] },
    { id: "b", ordem: 1, enunciado: "Recebi o treinamento", tipo: "LIKERT_5", opcoes: [] },
  ];
  const respostas: RespostaParaAnalise[] = Array.from({ length: 4 }, (_, i) => ({
    setorNomeSnapshot: "Loja",
    itens: [
      { perguntaId: "a", valorNumerico: 5, valorTexto: null, opcaoId: null },
      { perguntaId: "b", valorNumerico: i < 3 ? 2 : 4, valorTexto: null, opcaoId: null },
    ],
  }));
  const a = analisarPesquisa({ titulo: "Onboarding", modelo: "P06-ONB30", data: null, convites: 4, perguntas, respostas });
  ok(a.indicador.escala === "favorabilidade", "indicador principal é favorabilidade");
  ok(a.favorabilidade === 63, `favorabilidade 63% (5 de 8 notas 4-5) (achou ${a.favorabilidade})`);
  ok(a.pontosFortes[0]?.titulo === "Fui bem recebido", "ponto forte certo");
  ok(a.pontosAtencao[0]?.titulo === "Recebi o treinamento", "ponto de atenção certo");
  ok(a.comparativo === null, "sem ciclo anterior: sem comparativo");
}

console.log("\nSem respostas\n");
{
  const a = analisarPesquisa({ titulo: "Vazia", modelo: "P05-ENPS", data: null, convites: 10, perguntas: perguntasEnps, respostas: [] });
  ok(a.respostas === 0 && a.recomendacoes.length === 0, "não inventa recomendação sem resposta");
  ok(a.resumo[0].includes("ainda não recebeu"), "resumo avisa que não há respostas");
}

if (falhas > 0) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
