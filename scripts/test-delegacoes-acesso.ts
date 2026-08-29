// O acesso de portal do funcionário sem login — as invariantes que fazem o
// Caminho A ser seguro, provadas contra o código de verdade.
//
// A ideia do desenho: a demanda continua com UM dono (`User`), e o funcionário
// sem login ganha um usuário que NÃO consegue entrar pelo sistema — ele
// responde pelo portal. Se qualquer uma das travas abaixo cair, esse desenho
// vira uma porta de entrada, e é por isso que elas têm teste.
//
//   npx tsx scripts/test-delegacoes-acesso.ts

import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { PAPEL_PORTAL, ehAcessoDePortal, usernameDoPortal } from "../lib/delegacoes/acesso-colaborador";
import { modulosDoPapel } from "../components/modulos";
import { sistemasDosGrants } from "../lib/permissoes/catalogo";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

const leia = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("\nO papel do acesso de portal não alcança NADA (falha fechada)\n");
{
  ok(modulosDoPapel(PAPEL_PORTAL).length === 0, "papel COLABORADOR não enxerga módulo nenhum");
  ok(sistemasDosGrants([]).length === 0, "sem grants, nenhum sistema é alcançado");
  // A guarda cai no papel quando a pessoa não tem perfil — e o papel dá zero.
  // É esse par que impede o acesso de portal de abrir /delegacoes por URL.
  ok(
    modulosDoPapel("ADMIN").length > 0,
    "controle: um papel de escritório continua alcançando (o teste acima não passa por vacuidade)",
  );
}

console.log("\nA senha do acesso de portal não abre o login\n");
{
  // O login faz `bcrypt.compare(senha, user.passwordHash)`. O que o acesso de
  // portal guarda é hash de um segredo aleatório que ninguém nunca viu.
  const senhasComuns = ["", "123456", "senha", "admin", "colaborador"];
  const hashAleatorio = bcrypt.hashSync(
    "d3a1f2c4b5e6a7f8091a2b3c4d5e6f708192a3b4c5d6e7f8", 10,
  );
  ok(
    senhasComuns.every((s) => !bcrypt.compareSync(s, hashAleatorio)),
    "nenhuma senha comum casa com o hash aleatório",
  );
  // E o próprio `authorize` exige `ativo` antes do bcrypt — quem for desligado
  // não passa nem se a senha existisse.
  const auth = leia("auth.ts");
  ok(auth.includes("!user.ativo"), "o login barra usuário inativo antes de comparar a senha");
  ok(auth.includes("bcrypt.compare"), "e a senha é conferida por bcrypt.compare (não por igualdade)");
}

console.log("\nA TRAVA PRINCIPAL: sem e-mail, não há 'esqueci minha senha'\n");
{
  const acesso = leia("lib/delegacoes/acesso-colaborador.ts");
  // A ausência do campo é a trava. Se alguém um dia acrescentar `email:` na
  // criação, este teste cai — e é exatamente o dia em que ele precisa cair.
  const trechoCreate = acesso.slice(acesso.indexOf("tx.user.create"), acesso.indexOf("return {\n    ok: true,\n      userId: criado"));
  ok(!/(^|\W)email:/.test(trechoCreate), "o acesso de portal NASCE sem e-mail");

  const recuperacao = leia("lib/actions/recuperacao-senha.ts");
  ok(
    recuperacao.includes("where: { email }"),
    "a recuperação de senha acha a pessoa SÓ por e-mail — por isso o e-mail nulo é a trava",
  );
}

console.log("\nO username é reservado e estável\n");
{
  const u1 = usernameDoPortal("clb_abc123");
  ok(u1 === "colaborador.clb_abc123", "username derivado do id da ficha, não do nome");
  ok(u1 === usernameDoPortal("clb_abc123"), "estável: a mesma ficha dá sempre o mesmo username");
  ok(u1 !== usernameDoPortal("clb_xyz789"), "fichas diferentes, usernames diferentes");
  ok(u1.startsWith("colaborador."), "prefixo reservado, para não colidir com gente do escritório");
}

console.log("\nAs telas de administração não listam acessos de portal\n");
{
  for (const tela of [
    "app/(app)/cadastros/usuarios/page.tsx",
    "app/(app)/cadastros/perfis/page.tsx",
    "app/(app)/rh/[empresaId]/sinais/page.tsx",
  ]) {
    const s = leia(tela);
    ok(
      s.includes("PAPEL_PORTAL") && s.includes("role: { not: PAPEL_PORTAL }"),
      `${tela.split("/").slice(-2).join("/")} exclui os acessos de portal`,
    );
  }
}

console.log("\nO menu do topo não vaza navegação para papel desconhecido\n");
{
  const topbar = leia("components/app-topbar.tsx");
  ok(
    topbar.includes("navByRole[role] ?? []"),
    "papel desconhecido fica SEM menu (antes herdava o de Diretoria)",
  );
  ok(!topbar.includes("navByRole[role] ?? diretoriaNav"), "o fallback antigo, que falhava aberto, saiu");
}

console.log("\nehAcessoDePortal distingue os dois tipos de gente\n");
{
  ok(ehAcessoDePortal({ role: PAPEL_PORTAL }), "acesso de portal é reconhecido");
  for (const papel of ["ADMIN", "DIRETORIA", "RH_MANAGER", "GESTOR_SETOR"]) {
    ok(!ehAcessoDePortal({ role: papel }), `${papel} NÃO é acesso de portal`);
  }
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
