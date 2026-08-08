// Testes de produtividade e ranking da equipe de RH (lib/produtividade-rh.ts). Não toca o banco.
//   npx tsx scripts/test-produtividade.ts
import {
  categoriaDaEntidade,
  produtividadePorCategoria,
  produtividadePorUsuario,
} from "@/lib/produtividade";
import {
  aplicarRanking,
  diasUteisNoIntervalo,
  type ResumoProdutividadePessoa,
} from "@/lib/produtividade-rh";
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

console.log("\n2. Produtividade por usuário");
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

console.log("\n3. Produtividade por categoria");
const porCategoria = produtividadePorCategoria(registros);
ok(porCategoria.length === 6, "sempre as 6 categorias, mesmo as zeradas");
const gestao = porCategoria.find((c) => c.categoria === "Gestão & Configuração")!;
ok(gestao.total === 1, "User conta em Gestão & Configuração");
const saude = porCategoria.find((c) => c.categoria === "Saúde & Segurança")!;
ok(saude.total === 0, "categoria sem nenhum registro aparece com zero, não some");

console.log("\n4. Cálculo de dias úteis no intervalo");
const de1 = new Date(Date.UTC(2026, 7, 3)); // Segunda-feira
const ate1 = new Date(Date.UTC(2026, 7, 7)); // Sexta-feira
ok(diasUteisNoIntervalo(de1, ate1) === 5, "Semana cheia (seg a sex) dá 5 dias úteis");

const de2 = new Date(Date.UTC(2026, 7, 1)); // Sábado
const ate2 = new Date(Date.UTC(2026, 7, 2)); // Domingo
ok(diasUteisNoIntervalo(de2, ate2) === 0, "Fim de semana dá 0 dias úteis");

console.log("\n5. Aplicação do Ranking de Produtividade");
const resumoOriginal: ResumoProdutividadePessoa[] = [
  { usuarioId: "u1", usuarioNome: "Carlos", usuarioRole: "RH_MANAGER", diasComAtividade: 5, totalAcoes: 100, aprovados: 10, reprovados: 2 },
  { usuarioId: "u2", usuarioNome: "Ana", usuarioRole: "RH_MANAGER", diasComAtividade: 5, totalAcoes: 150, aprovados: 20, reprovados: 1 },
  { usuarioId: "u3", usuarioNome: "Bruno", usuarioRole: "GESTOR_SETOR", diasComAtividade: 4, totalAcoes: 100, aprovados: 5, reprovados: 0 },
  { usuarioId: "u4", usuarioNome: "Daniela", usuarioRole: "RH_MANAGER", diasComAtividade: 0, totalAcoes: 0, aprovados: 0, reprovados: 0 },
  { usuarioId: "u5", usuarioNome: "Eduardo", usuarioRole: "ADMIN", diasComAtividade: 0, totalAcoes: 0, aprovados: 0, reprovados: 0 },
];

const comRanking = aplicarRanking(resumoOriginal);

ok(comRanking[0].usuarioNome === "Ana" && comRanking[0].posicao === 1, "Ana fica em 1º lugar com 150 ações");

const bruno = comRanking.find((r) => r.usuarioNome === "Bruno");
const carlos = comRanking.find((r) => r.usuarioNome === "Carlos");

ok(bruno?.posicao === 2 && carlos?.posicao === 2, "Bruno e Carlos empatam em 100 ações e compartilham o 2º lugar");

const daniela = comRanking.find((r) => r.usuarioNome === "Daniela");
const eduardo = comRanking.find((r) => r.usuarioNome === "Eduardo");
ok(daniela?.posicao === 4 && eduardo?.posicao === 4, "Daniela e Eduardo empatam com 0 ações e compartilham o 4º lugar");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
