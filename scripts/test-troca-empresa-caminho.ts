// Troca do CNPJ no caminho da URL — a conta que o seletor da barra de topo e o
// filtro das telas fazem a cada troca de empresa.
//
// Ela decide DUAS coisas que erram calado quando erram:
//
//   1. Qual <empresaId> fica no caminho. Esse id é o CNPJ em que os formulários
//      de criação gravam ("Abrir competência" na Folha) e o que as telas
//      escopadas por marca usam (Pendências, Colaboradores). Apontar para uma
//      empresa diferente da filtrada zera uma tela ou grava no CNPJ errado, sem
//      mensagem nenhuma.
//   2. Se o resto do caminho sobrevive. Toda rota de detalhe busca o recurso por
//      { id, empresaId }; levar o id da ficha para a empresa nova dá 404 — e,
//      como a navegação é `replace`, o Voltar do navegador não desfaz.
//
// Sem banco de propósito: é função pura, roda em qualquer lugar.

import { trocarEmpresaNoCaminho, urlDoFiltro } from "../app/(app)/rh/[empresaId]/filtro-empresas";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
function igual(recebido: string, esperado: string, descricao: string) {
  const passou = recebido === esperado;
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${esperado}`);
    console.log(`     recebido: ${recebido}`);
    falhas++;
  }
}

// cuids reais do banco (25 caracteres) — o formato que a função reconhece como
// id de recurso. VAPT e LM SISTEMAS são CNPJs; o terceiro é um colaborador.
const VAPT = "cmruyzx6s00026worpcw8g4er";
const LM = "cmruyzwsb00006worlf1dx02k";
const COLAB = "cmrxsgbt80016o4or5kzevuri";

console.log("\nTroca simples: a tela em que a pessoa está é preservada\n");
igual(trocarEmpresaNoCaminho(`/rh/${VAPT}`, VAPT, LM), `/rh/${LM}`, "raiz da empresa");
igual(
  trocarEmpresaNoCaminho(`/rh/${VAPT}/colaboradores`, VAPT, LM),
  `/rh/${LM}/colaboradores`,
  "lista de colaboradores continua na lista",
);
igual(
  trocarEmpresaNoCaminho(`/rh/${VAPT}/folha`, VAPT, LM),
  `/rh/${LM}/folha`,
  "folha continua na folha",
);

console.log("\nSub-tela estática NÃO é confundida com id de recurso\n");
igual(
  trocarEmpresaNoCaminho(`/rh/${VAPT}/ferias/programadas`, VAPT, LM),
  `/rh/${LM}/ferias/programadas`,
  "ferias/programadas sobrevive inteira",
);
igual(
  trocarEmpresaNoCaminho(`/rh/${VAPT}/avaliacoes/painel`, VAPT, LM),
  `/rh/${LM}/avaliacoes/painel`,
  "avaliacoes/painel sobrevive inteira",
);

console.log("\nId de recurso é cortado: a ficha da empresa antiga daria 404\n");
igual(
  trocarEmpresaNoCaminho(`/rh/${VAPT}/colaboradores/${COLAB}`, VAPT, LM),
  `/rh/${LM}/colaboradores`,
  "ficha de colaborador cai na lista da empresa nova",
);
igual(
  trocarEmpresaNoCaminho(`/rh/${VAPT}/pesquisas/${COLAB}/resultados`, VAPT, LM),
  `/rh/${LM}/pesquisas`,
  "sub-tela DEPOIS do id vai junto (o id é que manda)",
);

console.log("\nMesma empresa: nada muda — limpar filtro não expulsa da ficha\n");
igual(
  trocarEmpresaNoCaminho(`/rh/${VAPT}/colaboradores/${COLAB}`, VAPT, VAPT),
  `/rh/${VAPT}/colaboradores/${COLAB}`,
  "ficha aberta continua aberta ao só limpar o filtro",
);

console.log("\nRotas que casam com /rh/<algo> mas não são empresa\n");
igual(
  trocarEmpresaNoCaminho("/rh/meu-setor", VAPT, LM),
  "/rh/meu-setor",
  "/rh/meu-setor intocada",
);
igual(
  trocarEmpresaNoCaminho("/rh/empresas", VAPT, LM),
  "/rh/empresas",
  "/rh/empresas intocada",
);
igual(
  trocarEmpresaNoCaminho("/usuarios", VAPT, LM),
  "/usuarios",
  "caminho fora de /rh intocado",
);
igual(
  trocarEmpresaNoCaminho(`/rh/${LM}/colaboradores`, VAPT, LM),
  `/rh/${LM}/colaboradores`,
  "caminho que já está em outra empresa não é reescrito",
);

// ─────────────────────────────────────────────────────────────────────────
// urlDoFiltro: a decisão completa (querystring + caminho) que o seletor da
// barra de topo e a árvore de filtro das telas fazem — a MESMA função para os
// dois, desde que a cópia divergiu e só uma delas recebeu correção.
// ─────────────────────────────────────────────────────────────────────────

// Os 5 CNPJs da LM Telecom e o único da VAPT, como no banco de produção.
const LM_TODOS = [LM, "cms6f3hjw000004jvwm3a38s4", "cms6fb486000204jlt3sl27rm"];

console.log("\nEscolher uma MARCA de vários CNPJs vindo de outra marca\n");
igual(
  urlDoFiltro({ empresaIds: LM_TODOS, pathname: `/rh/${VAPT}`, busca: "", empresaIdAtual: VAPT }),
  `/rh/${LM}?empresas=${LM_TODOS.join(",")}`,
  "o caminho SAI da VAPT e entra na marca escolhida (era o defeito ALTO: tela zerava e cadastro ia pro CNPJ errado)",
);
igual(
  urlDoFiltro({
    empresaIds: LM_TODOS,
    pathname: `/rh/${VAPT}/folha`,
    busca: "",
    empresaIdAtual: VAPT,
  }),
  `/rh/${LM}/folha?empresas=${LM_TODOS.join(",")}`,
  "a tela em que a pessoa está é preservada na troca",
);

console.log("\nSeleção que JÁ contém o CNPJ atual não faz a pessoa pular de CNPJ\n");
igual(
  urlDoFiltro({ empresaIds: LM_TODOS, pathname: `/rh/${LM}`, busca: "", empresaIdAtual: LM }),
  `/rh/${LM}?empresas=${LM_TODOS.join(",")}`,
  "fica no CNPJ em que já estava",
);

console.log('\n"Todas as marcas": lista vazia LIMPA o filtro\n');
igual(
  urlDoFiltro({
    empresaIds: [],
    pathname: `/rh/${VAPT}/colaboradores`,
    busca: `empresas=${VAPT}`,
    empresaIdAtual: VAPT,
  }),
  `/rh/${VAPT}/colaboradores`,
  "o parâmetro empresas some da URL",
);
igual(
  urlDoFiltro({
    empresaIds: [],
    pathname: `/rh/${VAPT}/colaboradores`,
    busca: `empresas=${VAPT}&lacuna=telegram`,
    empresaIdAtual: VAPT,
  }),
  `/rh/${VAPT}/colaboradores?lacuna=telegram`,
  "os OUTROS filtros da tela sobrevivem",
);
igual(
  urlDoFiltro({
    empresaIds: [],
    pathname: `/rh/${VAPT}/colaboradores/${COLAB}`,
    busca: `empresas=${VAPT}`,
    empresaIdAtual: VAPT,
  }),
  `/rh/${VAPT}/colaboradores/${COLAB}`,
  "limpar o filtro não expulsa da ficha aberta",
);

console.log("\nEntrar num CNPJ só\n");
igual(
  urlDoFiltro({
    empresaIds: [LM],
    pathname: `/rh/${VAPT}/colaboradores`,
    busca: "",
    empresaIdAtual: VAPT,
  }),
  `/rh/${LM}/colaboradores?empresas=${LM}`,
  "caminho e filtro apontam para o mesmo CNPJ",
);
igual(
  urlDoFiltro({
    empresaIds: [LM],
    pathname: `/rh/${VAPT}/colaboradores/${COLAB}`,
    busca: "",
    empresaIdAtual: VAPT,
  }),
  `/rh/${LM}/colaboradores?empresas=${LM}`,
  "ficha da empresa antiga não vira 404: cai na lista da nova",
);

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
ok(falhas === 0, "suíte completa");
process.exit(falhas === 0 ? 0 : 1);
