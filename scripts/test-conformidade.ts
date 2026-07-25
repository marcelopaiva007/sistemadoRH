// Testes do motor de conformidade SST (lib/conformidade.ts). Não toca o banco.
//   npx tsx scripts/test-conformidade.ts
import {
  calcularValidade,
  conformidadeDoColaborador,
  situacaoDoExame,
  type CertificadoParaCalculo,
} from "@/lib/conformidade";
import { dataUTC, somarMesesUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const HOJE = dataUTC(2026, 7, 25);
const REQUISITOS = [
  { norma: "NR-35", validadeMeses: 24 },
  { norma: "NR-10", validadeMeses: 24 },
  { norma: "NR-06", validadeMeses: null },
];

console.log("1. Cálculo de validade");
ok(somarMesesUTC(dataUTC(2026, 1, 31), 1).getTime() === dataUTC(2026, 2, 28).getTime(), "31/01 + 1 mês vira 28/02");
ok(somarMesesUTC(dataUTC(2025, 7, 25), 24).getTime() === dataUTC(2027, 7, 25).getTime(), "24 meses viram 2 anos");
ok(calcularValidade(dataUTC(2026, 7, 25), null) === null, "treinamento sem reciclagem não ganha validade");
ok(
  calcularValidade(dataUTC(2026, 7, 25), 12)!.getTime() === dataUTC(2027, 7, 25).getTime(),
  "validade de 12 meses",
);

console.log("2. Situação por certificado");
const certificados: CertificadoParaCalculo[] = [
  // Vencido: fez em 2023 com validade de 2 anos.
  { norma: "NR-10", realizadoEm: dataUTC(2023, 5, 10), validoAte: dataUTC(2025, 5, 10) },
  // Em dia, mas vence em 30 dias -> dentro da janela de alerta de 60.
  { norma: "NR-35", realizadoEm: dataUTC(2024, 8, 24), validoAte: dataUTC(2026, 8, 24) },
  // Sem validade -> permanente.
  { norma: "NR-06", realizadoEm: dataUTC(2022, 1, 5), validoAte: null },
];
const c = conformidadeDoColaborador(REQUISITOS, certificados, HOJE);
const porNorma = Object.fromEntries(c.itens.map((i) => [i.norma, i]));
ok(porNorma["NR-10"].situacao === "VENCIDO", "certificado fora da validade fica VENCIDO");
ok(porNorma["NR-35"].situacao === "VENCENDO", "vencendo em 30 dias entra na janela de alerta");
ok(porNorma["NR-35"].diasAteVencer === 30, "contagem de dias até vencer");
ok(porNorma["NR-06"].situacao === "EM_DIA", "treinamento sem reciclagem conta como em dia");
ok(c.regular === false && c.pendencias.length === 1, "vencido é pendência; vencendo ainda não é");
ok(c.itens[0].situacao === "VENCIDO", "a lista vem ordenada pelo mais grave");

console.log("3. Reciclagem substitui o treinamento anterior");
const comReciclagem = conformidadeDoColaborador(
  [{ norma: "NR-10", validadeMeses: 24 }],
  [
    { norma: "NR-10", realizadoEm: dataUTC(2023, 5, 10), validoAte: dataUTC(2025, 5, 10) },
    { norma: "NR-10", realizadoEm: dataUTC(2026, 3, 2), validoAte: dataUTC(2028, 3, 2) },
  ],
  HOJE,
);
ok(comReciclagem.regular, "o certificado mais recente é o que vale");

console.log("4. Requisito nunca cumprido");
const semNada = conformidadeDoColaborador(REQUISITOS, [], HOJE);
ok(semNada.itens.every((i) => i.situacao === "NUNCA_FEITO"), "sem certificado, tudo NUNCA_FEITO");
ok(semNada.pendencias.length === 3, "todos entram como pendência");

console.log("5. Certificado de norma que a função não exige");
const foraDoEscopo = conformidadeDoColaborador(
  [{ norma: "NR-35", validadeMeses: 24 }],
  [{ norma: "NR-33", realizadoEm: dataUTC(2026, 1, 1), validoAte: dataUTC(2027, 1, 1) }],
  HOJE,
);
ok(foraDoEscopo.itens.length === 1, "só os requisitos da função entram na conta");
ok(foraDoEscopo.itens[0].situacao === "NUNCA_FEITO", "certificado de outra norma não cobre o requisito");

console.log("6. Exame ocupacional");
const semExame = situacaoDoExame([], HOJE);
ok(semExame.situacao === "NUNCA_FEITO", "sem exame, NUNCA_FEITO");

const exameVencido = situacaoDoExame(
  [{ tipo: "PERIODICO", realizadoEm: dataUTC(2025, 1, 10), validoAte: dataUTC(2026, 1, 10), resultado: "APTO", restricoes: null }],
  HOJE,
);
ok(exameVencido.situacao === "VENCIDO", "ASO fora da validade fica VENCIDO");

const exameAtual = situacaoDoExame(
  [
    { tipo: "ADMISSIONAL", realizadoEm: dataUTC(2024, 3, 1), validoAte: dataUTC(2025, 3, 1), resultado: "APTO", restricoes: null },
    { tipo: "PERIODICO", realizadoEm: dataUTC(2026, 6, 1), validoAte: dataUTC(2027, 6, 1), resultado: "APTO_COM_RESTRICAO", restricoes: "Sem trabalho em altura" },
  ],
  HOJE,
);
ok(exameAtual.situacao === "EM_DIA", "o exame mais recente é o que vale");
ok(exameAtual.restricoes === "Sem trabalho em altura", "a restrição do exame vigente é preservada");

const soDemissional = situacaoDoExame(
  [{ tipo: "DEMISSIONAL", realizadoEm: dataUTC(2026, 7, 1), validoAte: null, resultado: "APTO", restricoes: null }],
  HOJE,
);
ok(soDemissional.situacao === "NUNCA_FEITO", "demissional não conta como exame vigente");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
