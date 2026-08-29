// O teste que sustenta a promessa da Onda 1: o modelo novo (perfil + permissão)
// devolve o MESMO alcance que o papel devolvia. Se algum caso aqui falha, é
// sinal de que a virada tiraria acesso de alguém — e aí não sobe.
//
//   npx tsx scripts/test-permissoes.ts

import {
  ACOES,
  PERFIS_SEMENTE,
  algumGrantCobre,
  grantCobre,
  sistemasDosGrants,
  todasAsPermissoes,
} from "../lib/permissoes/catalogo";
import { estadoParaGrants, grantsParaEstado } from "../lib/permissoes/matriz";
import { modulosDoPapel } from "../components/modulos";

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

console.log("\nGrant cobre permissão — curinga e exato\n");
{
  ok(grantCobre("*", "rh:folha:editar"), "'*' cobre qualquer permissão");
  ok(grantCobre("rh:*", "rh:folha:editar"), "'rh:*' cobre todo o RH");
  ok(!grantCobre("rh:*", "processos:frota:ver"), "'rh:*' NÃO cobre Processos");
  ok(grantCobre("rh:folha:*", "rh:folha:editar"), "'rh:folha:*' cobre editar da Folha");
  ok(!grantCobre("rh:folha:*", "rh:ferias:ver"), "'rh:folha:*' não vaza para outra área");
  ok(grantCobre("rh:folha:ver", "rh:folha:ver"), "grant exato cobre a si mesmo");
  ok(!grantCobre("rh:folha:ver", "rh:folha:editar"), "ver NÃO implica editar — os dois são concedidos à parte");
  // A armadilha do prefixo: 'rh:fol' não pode casar 'rh:folha' — só casa com ':' no fim.
  ok(!grantCobre("rh:fol:*", "rh:folha:ver"), "curinga respeita a fronteira de área (prefixo com ':')");
  ok(algumGrantCobre(["rh:ferias:*", "rh:folha:ver"], "rh:folha:ver"), "algum grant da lista cobrindo já basta");
  ok(!algumGrantCobre(["rh:ferias:*"], "rh:folha:ver"), "nenhum grant cobrindo, nega");
}

console.log("\nCatálogo — íntegro e sem duplicata\n");
{
  const todas = todasAsPermissoes();
  igual(new Set(todas).size, todas.length, "nenhuma permissão duplicada no catálogo");
  ok(todas.every((p) => p.split(":").length === 3), "toda permissão é sistema:area:acao");
  ok(todas.every((p) => ACOES.includes(p.split(":")[2] as (typeof ACOES)[number])), "toda ação é ver ou editar");
  ok(todas.some((p) => p.startsWith("rh:")), "há permissões de RH");
  ok(todas.some((p) => p.startsWith("processos:")), "há permissões de Processos");
  // Áreas só-leitura não geram 'editar' — matriz sem caixa que não protege nada.
  ok(!todas.includes("rh:auditoria:editar"), "Auditoria é só leitura, não gera editar");
  ok(!todas.includes("processos:pendencias:editar"), "Central de Pendências é só leitura");
  ok(todas.includes("rh:folha:editar"), "Folha gera editar");
  ok(todas.includes("processos:contratos:editar"), "Contratos gera editar");
}

console.log("\nEquivalência com hoje — ninguém perde sistema no dia da virada\n");
{
  // Para os papéis de escritório, os sistemas que o perfil-semente alcança têm
  // que ser EXATAMENTE os que o papel enxerga hoje (components/modulos.ts).
  for (const papel of ["ADMIN", "DIRETORIA", "RH_MANAGER"]) {
    const semente = PERFIS_SEMENTE.find((p) => p.papelDeOrigem === papel)!;
    const sistemasNovo = sistemasDosGrants(semente.grants).sort();
    const sistemasHoje = modulosDoPapel(papel).map((m) => m.slug).sort();
    igual(sistemasNovo, sistemasHoje, `${papel}: mesmos sistemas de hoje (${sistemasHoje.join(", ") || "nenhum"})`);
  }

  // Admin enxerga TUDO — nenhuma permissão do catálogo fica de fora.
  const admin = PERFIS_SEMENTE.find((p) => p.papelDeOrigem === "ADMIN")!;
  ok(todasAsPermissoes().every((p) => algumGrantCobre(admin.grants, p)), "Administrador cobre todas as permissões");

  // Gestor de Setor é o retrato do papel mais restrito: nenhuma edição, e nada
  // em Processos. (Hoje ele nem vê o seletor de módulo — a Onda 2 decide se
  // esse sliver de leitura vira menu; a Onda 1 só não pode DAR poder novo.)
  const gestor = PERFIS_SEMENTE.find((p) => p.papelDeOrigem === "GESTOR_SETOR")!;
  const editaveis = todasAsPermissoes().filter((p) => p.endsWith(":editar"));
  ok(!editaveis.some((p) => algumGrantCobre(gestor.grants, p)), "Gestor de Setor não edita nada");
  ok(!todasAsPermissoes().filter((p) => p.startsWith("processos:")).some((p) => algumGrantCobre(gestor.grants, p)),
    "Gestor de Setor não alcança Processos");
}

console.log("\nPerfis-semente — um por papel, todos marcados como sistema\n");
{
  igual(PERFIS_SEMENTE.length, 4, "quatro perfis-semente");
  const papeis = PERFIS_SEMENTE.map((p) => p.papelDeOrigem).sort();
  igual(papeis, ["ADMIN", "DIRETORIA", "GESTOR_SETOR", "RH_MANAGER"], "um por papel conhecido");
  ok(new Set(PERFIS_SEMENTE.map((p) => p.id)).size === 4, "ids de perfil-semente únicos");
  ok(new Set(PERFIS_SEMENTE.map((p) => p.nome)).size === 4, "nomes de perfil-semente únicos");
}

console.log("\nMatriz — grants viram estado e voltam sem perder nem inventar acesso\n");
{
  // Normaliza para comparar ("ordem/duplicata não importam, o CONJUNTO importa").
  const conj = (g: string[]) => [...new Set(g)].sort();
  const voltaIgual = (grants: string[], descricao: string) =>
    igual(conj(estadoParaGrants(grantsParaEstado(grants))), conj(grants), descricao);

  voltaIgual(["*"], "acesso total vai e volta como '*'");
  voltaIgual(["rh:*", "processos:*"], "os dois sistemas inteiros preservam os dois curingas");
  voltaIgual(["rh:folha:ver", "rh:folha:editar"], "permissões exatas preservadas");
  voltaIgual(["rh:*", "processos:contratos:ver"], "um sistema inteiro + uma tela exata de outro");

  // '*' apaga tudo o resto — não faz sentido guardar exatas sob acesso total.
  igual(
    estadoParaGrants(grantsParaEstado(["*", "rh:folha:ver"])),
    ["*"],
    "acesso total absorve as permissões exatas (não duplica sob o '*')",
  );

  // Exata de um sistema que também está inteiro é redundante — some no ida-e-volta.
  igual(
    estadoParaGrants(grantsParaEstado(["rh:*", "rh:folha:editar"])),
    ["rh:*"],
    "exata coberta pelo curinga do próprio sistema não vira grant duplicado",
  );

  // Marcar 'ver' não arrasta 'editar' — a matriz concede um sem o outro.
  const soVer = grantsParaEstado(["rh:folha:ver"]);
  ok(soVer.exatas.has("rh:folha:ver") && !soVer.exatas.has("rh:folha:editar"), "só 'ver' marcado deixa 'editar' desmarcado");
}

console.log("\nEnforcement de módulo — quem alcança o quê pelos grants\n");
{
  // A guarda usa sistemasDosGrants para decidir acesso ao módulo. Cada
  // perfil-semente tem que alcançar exatamente os sistemas que o papel via.
  const alcanca = (grants: string[], slug: string) => sistemasDosGrants(grants).includes(slug);

  const admin = PERFIS_SEMENTE.find((p) => p.papelDeOrigem === "ADMIN")!.grants;
  ok(
    alcanca(admin, "rh") && alcanca(admin, "processos") && alcanca(admin, "delegacoes"),
    "Administrador alcança os TRÊS sistemas — o grant '*' cobre módulo novo sozinho",
  );

  const rh = PERFIS_SEMENTE.find((p) => p.papelDeOrigem === "RH_MANAGER")!.grants;
  ok(alcanca(rh, "rh") && alcanca(rh, "processos"), "Gestor de RH alcança RH e Processos (como hoje)");
  // Módulo novo NÃO chega de graça a quem tem grant explícito: Delegações só
  // entra no Gestor de RH quando alguém conceder na tela de Perfis. É o que
  // impede uma entrega de código de alargar acesso sem decisão de gestão.
  ok(!alcanca(rh, "delegacoes"), "Gestor de RH NÃO ganha Delegações sem alguém conceder");

  // Um perfil "só RH" (o que o CEO quer poder criar) NÃO alcança processos.
  ok(alcanca(["rh:*"], "rh") && !alcanca(["rh:*"], "processos"), "perfil só-RH não alcança Processos");
  // E um "só Processos".
  ok(!alcanca(["processos:*"], "rh") && alcanca(["processos:*"], "processos"), "perfil só-Processos não alcança RH");
  // Uma permissão exata de leitura já dá acesso ao módulo (o seletor mostra).
  ok(alcanca(["rh:time:ver"], "rh"), "uma permissão de RH já faz alcançar o sistema RH");
}

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
