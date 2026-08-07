// Testes de produtividade da equipe de RH (lib/produtividade.ts). Não toca o banco.
//   npx tsx scripts/test-produtividade.ts
import {
  categoriaDaEntidade,
  produtividadePorCategoria,
  produtividadePorUsuario,
} from "@/lib/produtividade";
import { dataUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("1. Categoria por entidade");
ok(categoriaDaEntidade("Vaga") === "Ciclo de vida", "Vaga entra em Ciclo de vida");
ok(categoriaDaEntidade("Colaborador") === "Departamento Pessoal", "Colaborador entra em Departamento Pessoal");
ok(categoriaDaEntidade("EntidadeInexistente") === "Gestão & Configuração", "entidade fora do mapa cai em Gestão & Configuração, não some");

console.log("2. Produtividade por usuário");
const registros = [
  { usuarioId: "u1", usuarioNome: "Ana", usuarioRole: "RH_MANAGER", entidade: "Colaborador", createdAt: dataUTC(2026, 8, 7) },
  { usuarioId: "u1", usuarioNome: "Ana", usuarioRole: "RH_MANAGER", entidade: "SolicitacaoFerias", createdAt: dataUTC(2026, 8, 7) },
  { usuarioId: "u1", usuarioNome: "Ana", usuarioRole: "RH_MANAGER", entidade: "Vaga", createdAt: dataUTC(2026, 8, 8) },
  { usuarioId: "u2", usuarioNome: "Beto", usuarioRole: "ADMIN", entidade: "User", createdAt: dataUTC(2026, 8, 7) },
  { usuarioId: null, usuarioNome: "Candidato: alguém", usuarioRole: "CANDIDATO", entidade: "Candidatura", createdAt: dataUTC(2026, 8, 7) },
];
const porUsuario = produtividadePorUsuario(registros);
ok(porUsuario.length === 2, "registro sem usuarioId (ator do portal/público) não vira conta na lista");
ok(porUsuario[0].usuarioId === "u1" && porUsuario[0].total === 3, "quem tem mais ações vem primeiro");
ok(porUsuario[0].porCategoria["Departamento Pessoal"] === 2, "Colaborador + SolicitacaoFerias somam em Departamento Pessoal");
ok(porUsuario[0].porCategoria["Ciclo de vida"] === 1, "Vaga soma em Ciclo de vida");
ok(porUsuario[0].ultimaAcaoEm.getTime() === dataUTC(2026, 8, 8).getTime(), "última ação é a mais recente, não a última da lista");
ok(porUsuario[1].usuarioId === "u2" && porUsuario[1].total === 1, "segunda conta com 1 ação");

console.log("3. Produtividade por categoria");
const porCategoria = produtividadePorCategoria(registros);
ok(porCategoria.length === 6, "sempre as 6 categorias, mesmo as zeradas");
const gestao = porCategoria.find((c) => c.categoria === "Gestão & Configuração")!;
ok(gestao.total === 1, "User conta em Gestão & Configuração");
const saude = porCategoria.find((c) => c.categoria === "Saúde & Segurança")!;
ok(saude.total === 0, "categoria sem nenhum registro aparece com zero, não some");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
