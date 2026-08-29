// A rede que fica ENTRE a IA e o banco: `normalizarProposta`.
//
// O modelo é bom, mas não é uma fonte confiável de dado estruturado — ele pode
// devolver um enum inventado, um prazo no passado, uma empresa que não existe
// ou simplesmente esquecer um campo. Nada disso pode virar demanda. Este teste
// prova que o que sai daqui está sempre dentro do domínio, sem banco e sem
// gastar um token.
//
//   npx tsx scripts/test-delegacoes-redator.ts

import {
  DIAS_PADRAO_POR_CRITICIDADE,
  normalizarProposta,
  type PropostaBruta,
} from "../lib/delegacoes/redator";
import { CRITICIDADES, EVIDENCIAS_EXIGIDAS, PERIODICIDADES_RETORNO, TITULO_MAXIMO } from "../lib/delegacoes/estados";

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

// Um dia fixo, para os prazos serem conferíveis: 01/09/2026, meio-dia em
// Brasília (o teste não pode depender de quando roda).
const HOJE = new Date("2026-09-01T12:00:00-03:00");
const MARCAS = ["LM Telecom", "Centrysol", "VAPT"];
const params = { hoje: HOJE, marcas: MARCAS };

const COMPLETA: PropostaBruta = {
  titulo: "Levantar três orçamentos do gerador da torre 12",
  descricao: "Gerador da torre 12 precisa de substituição.",
  criterioAceite: "Três orçamentos anexados, com prazo de entrega de cada fornecedor",
  evidenciaExigida: "LINK",
  criticidade: 2,
  prazo: "2026-09-10",
  periodicidadeRetorno: "SEMANAL",
  marcaNome: "LM Telecom",
  area: "Infraestrutura",
  assumiu: [],
};

console.log("\nO caminho feliz — a IA devolveu tudo certo\n");
{
  const r = normalizarProposta(COMPLETA, params);
  ok(r.ok, "proposta completa passa");
  if (r.ok) {
    igual(r.proposta.prazo, "2026-09-10", "o prazo que a IA deu é respeitado");
    igual(r.proposta.criticidade, 2, "criticidade preservada");
    igual(r.proposta.marcaNome, "LM Telecom", "marca casada com o cadastro");
    igual(r.proposta.assumiu, [], "nada assumido — o contexto disse tudo");
  }
}

console.log("\nO que a IA NÃO pode fazer virar dado\n");
{
  // Enum inventado: cai no padrão em vez de gravar lixo.
  const r1 = normalizarProposta({ ...COMPLETA, evidenciaExigida: "PRINT" }, params);
  ok(r1.ok && r1.proposta.evidenciaExigida === "TEXTO", "evidência fora do domínio vira TEXTO");
  ok(
    r1.ok && (EVIDENCIAS_EXIGIDAS as readonly string[]).includes(r1.proposta.evidenciaExigida),
    "e o valor final está sempre dentro do domínio",
  );

  const r2 = normalizarProposta({ ...COMPLETA, periodicidadeRetorno: "QUINZENAL" }, params);
  ok(
    r2.ok && (PERIODICIDADES_RETORNO as readonly string[]).includes(r2.proposta.periodicidadeRetorno),
    "periodicidade fora do domínio vira uma válida",
  );

  const r3 = normalizarProposta({ ...COMPLETA, criticidade: 7 }, params);
  ok(r3.ok && (CRITICIDADES as readonly number[]).includes(r3.proposta.criticidade), "criticidade fora de 1-3 vira normal");
  ok(
    r3.ok && r3.proposta.assumiu.some((a) => a.includes("criticidade")),
    "e a pessoa é avisada de que foi assumido",
  );

  // Empresa que não existe: NÃO etiqueta a demanda com uma marca inventada.
  const r4 = normalizarProposta({ ...COMPLETA, marcaNome: "LM Telecomunicações S/A" }, params);
  ok(r4.ok && r4.proposta.marcaNome === null, "empresa que não está no cadastro é descartada");
  ok(
    r4.ok && r4.proposta.assumiu.some((a) => a.includes("empresa")),
    "e o descarte é declarado, não silencioso",
  );

  // Título gigante: cortado, nunca rejeitado por tamanho.
  const r5 = normalizarProposta({ ...COMPLETA, titulo: "x".repeat(300) }, params);
  ok(r5.ok && r5.proposta.titulo.length === TITULO_MAXIMO, `título é cortado em ${TITULO_MAXIMO}`);
}

console.log("\nPrazo — o campo em que inventar dói mais\n");
{
  // Sem prazo: padrão da criticidade, SEMPRE declarado.
  for (const c of CRITICIDADES) {
    const r = normalizarProposta({ ...COMPLETA, criticidade: c, prazo: "" }, params);
    const dias = DIAS_PADRAO_POR_CRITICIDADE[c];
    const esperado = new Date(HOJE.getTime());
    esperado.setUTCDate(esperado.getUTCDate() + dias);
    ok(
      r.ok && r.proposta.prazo === esperado.toISOString().slice(0, 10),
      `criticidade ${c} sem prazo: ${dias} dia(s) à frente`,
    );
    ok(
      r.ok && r.proposta.assumiu.some((a) => a.startsWith("prazo:")),
      `criticidade ${c}: o prazo assumido é declarado`,
    );
  }

  // Prazo no passado: recusado e substituído, com aviso. Um prazo vencido no
  // ato do envio deixaria a demanda nascer atrasada.
  const passado = normalizarProposta({ ...COMPLETA, prazo: "2026-08-01" }, params);
  ok(passado.ok && passado.proposta.prazo > "2026-09-01", "prazo no passado é substituído");
  ok(
    passado.ok && passado.proposta.assumiu.some((a) => a.includes("já passou")),
    "e o motivo aparece para a pessoa",
  );

  // Hoje ainda vale: prazo de hoje é legítimo ("preciso disso hoje").
  const hoje = normalizarProposta({ ...COMPLETA, prazo: "2026-09-01" }, params);
  ok(hoje.ok && hoje.proposta.prazo === "2026-09-01", "prazo de HOJE é aceito, não tratado como passado");

  // Data impossível: 30 de fevereiro não pode rolar para 2 de março.
  const impossivel = normalizarProposta({ ...COMPLETA, prazo: "2026-02-30" }, params);
  ok(impossivel.ok && impossivel.proposta.prazo !== "2026-03-02", "30/02 não vira 02/03");

  // Formato livre: "sexta que vem" não é data.
  const texto = normalizarProposta({ ...COMPLETA, prazo: "sexta que vem" }, params);
  ok(texto.ok && /^\d{4}-\d{2}-\d{2}$/.test(texto.proposta.prazo), "texto livre não passa como prazo");
}

console.log("\nO que faz a proposta ser RECUSADA (em vez de remendada)\n");
{
  // Título e critério de aceite são o compromisso — sem eles não há demanda, e
  // remendar seria inventar o combinado no lugar de quem delega.
  const semTitulo = normalizarProposta({ ...COMPLETA, titulo: "   " }, params);
  ok(!semTitulo.ok, "sem título, a proposta é recusada — não remendada");

  const semCriterio = normalizarProposta({ ...COMPLETA, criterioAceite: "" }, params);
  ok(!semCriterio.ok, "REGRA 2: sem critério de aceite, recusada");
  ok(
    !semCriterio.ok && semCriterio.erro.toLowerCase().includes("pront"),
    "e o erro explica o que falta, em português de quem usa",
  );

  const vazio = normalizarProposta({}, params);
  ok(!vazio.ok, "resposta vazia da IA não vira demanda");
}

console.log("\nassumiu[] é sempre uma lista de texto\n");
{
  const r = normalizarProposta({ ...COMPLETA, assumiu: "não é lista" as unknown }, params);
  ok(r.ok && Array.isArray(r.proposta.assumiu), "assumiu malformado vira lista vazia, não quebra");
  const r2 = normalizarProposta({ ...COMPLETA, assumiu: ["ok", "", 42 as unknown as string] }, params);
  ok(r2.ok && r2.proposta.assumiu.every((a) => typeof a === "string" && a.length > 0), "itens vazios e não-texto são descartados");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
