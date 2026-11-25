// Testes da paginação no servidor (lib/paginacao-servidor.ts). Não toca o banco.
//   npx tsx scripts/test-paginacao.ts
import {
  avisoDeLimite,
  fatiar,
  hrefComPagina,
  lerPagina,
  numerosDaPaginacao,
  resumoDaFatia,
} from "@/lib/paginacao-servidor";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("1. Leitura de ?pagina=");
ok(lerPagina(undefined) === 1, "sem parâmetro é a página 1");
ok(lerPagina("3") === 3, "número válido passa");
ok(lerPagina("0") === 1 && lerPagina("-2") === 1, "zero e negativo viram 1");
ok(lerPagina("abc") === 1 && lerPagina("") === 1, "lixo vira 1");
ok(lerPagina(["4", "9"]) === 4, "parâmetro repetido usa o primeiro");

console.log("\n2. Fatia");
const f1 = fatiar(1, 230, 100);
ok(f1.skip === 0 && f1.take === 100 && f1.totalPaginas === 3, "primeira página de 230 com 100 por vez");
ok(f1.de === 1 && f1.ate === 100, "faixa 1–100");
const f3 = fatiar(3, 230, 100);
ok(f3.skip === 200 && f3.de === 201 && f3.ate === 230, "última página parcial: 201–230");
const alem = fatiar(9, 230, 100);
ok(alem.pagina === 3 && alem.skip === 200, "página além do fim cai na última, não numa tela vazia");
const vazio = fatiar(5, 0, 50);
ok(vazio.pagina === 1 && vazio.totalPaginas === 1 && vazio.de === 0 && vazio.ate === 0, "sem registros: página 1 de 1, faixa zerada");
ok(fatiar(1, 50, 50).totalPaginas === 1, "exatamente uma página cheia não abre a segunda");
ok(fatiar(2, 51, 50).ate === 51 && fatiar(2, 51, 50).de === 51, "um item a mais abre a segunda com ele só");

console.log("\n3. Resumo");
ok(resumoDaFatia(f3) === "201–230 de 230", "resumo da última página");
ok(resumoDaFatia(vazio) === "Nenhum registro", "resumo sem registros");
ok(resumoDaFatia(fatiar(1, 1234, 100)) === "1–100 de 1.234", "milhar com ponto, como no Brasil");

console.log("\n4. Links mantêm os filtros");
ok(hrefComPagina({ status: "FALHOU", q: "" }, 2) === "?status=FALHOU&pagina=2", "filtro vazio sai da URL, página entra");
ok(hrefComPagina({ status: "FALHOU" }, 1) === "?status=FALHOU", "página 1 não vai para a URL");
ok(hrefComPagina({ empresas: "a,b", pagina: "7" }, 3) === "?empresas=a%2Cb&pagina=3", "pagina antiga nos params é trocada, ?empresas= é mantido");
ok(hrefComPagina({}, 1) === "?", "sem filtro nenhum, link para a própria tela limpa");

console.log("\n5. Números da barra");
ok(JSON.stringify(numerosDaPaginacao(1, 3)) === "[1,2,3]", "poucas páginas: todas");
ok(JSON.stringify(numerosDaPaginacao(5, 10)) === '[1,"...",4,5,6,"...",10]', "meio: primeira, vizinhas, última e reticências");
ok(JSON.stringify(numerosDaPaginacao(1, 1)) === "[1]", "página única");

console.log("\n6. Aviso de limite");
ok(avisoDeLimite(40, 40, "contas") === null, "coube tudo: sem aviso");
ok(avisoDeLimite(500, 812, "contas") === "Mostrando 500 de 812 contas.", "passou do teto: mostrando N de M");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
