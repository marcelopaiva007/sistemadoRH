// Tela de admin — "quais marcas cada conta vê" — e o login com Google, contra um
// banco de verdade (v1.187.0).
//
// O que se prova aqui:
// - Diretoria/Administrativo SEM marca marcada continua vendo o grupo inteiro;
//   COM marca marcada, só ela — e marca de OUTRO grupo não restringe nem abre
//   nada (a parede de grupo vem antes).
// - A regra do admin (`aplicarMarcasQueVe`) grava, solta, recusa marca de outro
//   grupo, recusa gestor de RH sem acesso nenhum e muda a conta de grupo.
// - O Google só entra numa conta ativa com o mesmo e-mail, sem diferença de
//   maiúscula, e recusa e-mail não verificado, sem cadastro ou ambíguo.
//
// Os dados são criados com um sufixo único e apagados no fim, mesmo com falha.
//
//   npx tsx scripts/smoke-marcas-direcao.ts

import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { direcaoRestrita } from "../lib/grupo";
import { empresasVisiveis, usuarioAlcancaEmpresa } from "../lib/rh-auth-guard";
import { aplicarMarcasQueVe } from "../lib/marcas-que-ve";
import { contaDoGoogle } from "../lib/login-google";
import { buscarDestinatarios } from "../lib/pesquisa-notificacoes";
import { usuarioPorIdentificador } from "../lib/usuario-por-identificador";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

const sfx = randomBytes(4).toString("hex");
const criados = { grupos: [] as string[], marcas: [] as string[], empresas: [] as string[], usuarios: [] as string[] };

function cnpj() {
  return String(10_000_000_000_000 + Math.floor(Math.random() * 89_999_999_999_999));
}

async function grupo(nome: string) {
  const g = await prisma.grupo.create({ data: { nome: `${nome} ${sfx}` } });
  criados.grupos.push(g.id);
  return g;
}
async function marca(nome: string, grupoId: string) {
  const m = await prisma.marca.create({ data: { nome: `${nome} ${sfx}`, grupoId } });
  criados.marcas.push(m.id);
  return m;
}
async function empresa(nome: string, marcaId: string) {
  const e = await prisma.empresa.create({
    data: { nome: `${nome} ${sfx}`, cnpj: cnpj(), marcaId, ativo: true },
  });
  criados.empresas.push(e.id);
  return e;
}
async function usuario(apelido: string, role: string, grupoId: string | null, extra: { email?: string; ativo?: boolean } = {}) {
  const u = await prisma.user.create({
    data: {
      nome: `${apelido} ${sfx}`,
      username: `smoke.${apelido}.${sfx}`.toLowerCase(),
      passwordHash: "!",
      role,
      grupoId,
      email: extra.email ?? null,
      ativo: extra.ativo ?? true,
    },
  });
  criados.usuarios.push(u.id);
  return u;
}
async function marcar(userId: string, marcaId: string, role: string) {
  await prisma.userMarca.create({ data: { userId, marcaId, role } });
}
const sessao = (
  u: { id: string; role: string },
  empresas: { empresaId: string; ativo: boolean }[] = [],
) => ({ id: u.id, role: u.role, empresas });

async function main() {
  const g1 = await grupo("Smoke Marcas G1");
  const g2 = await grupo("Smoke Marcas G2");
  const ma = await marca("Smoke MA", g1.id);
  const mb = await marca("Smoke MB", g1.id);
  const mx = await marca("Smoke MX", g2.id);
  const ea = await empresa("Smoke EA", ma.id);
  const eb = await empresa("Smoke EB", mb.id);
  const ex = await empresa("Smoke EX", mx.id);

  const dirGlobal = await usuario("dir-global", "DIRETORIA", g1.id);
  const dirRestrita = await usuario("dir-restrita", "DIRETORIA", g1.id);
  await marcar(dirRestrita.id, ma.id, "DIRETORIA");
  const admForaDoGrupo = await usuario("adm-fora", "ADMIN", g1.id);
  await marcar(admForaDoGrupo.id, mx.id, "RH_MANAGER");
  const rh = await usuario("rh", "RH_MANAGER", g1.id);
  await marcar(rh.id, mb.id, "RH_MANAGER");
  const gestor = await usuario("gestor", "GESTOR_SETOR", g1.id);
  // Diretoria com vínculo ANTIGO de gestor (papel RH) — o caso de quem foi
  // promovido: não pode ficar restrita de surpresa no deploy.
  const dirLegado = await usuario("dir-legado", "DIRETORIA", g1.id);
  await marcar(dirLegado.id, ma.id, "RH_MANAGER");

  console.log("\nQuem está preso a algumas marcas\n");
  ok(!(await direcaoRestrita(dirGlobal)), "Diretoria sem marca marcada NÃO está restrita");
  ok(await direcaoRestrita(dirRestrita), "Diretoria com marca marcada está restrita");
  ok(!(await direcaoRestrita(admForaDoGrupo)), "marca de OUTRO grupo não restringe o ADMIN");
  ok(!(await direcaoRestrita(rh)), "gestor de RH não é 'direção restrita' — segue os vínculos");
  ok(!(await direcaoRestrita(dirLegado)), "vínculo antigo de gestor numa Diretoria NÃO restringe");
  {
    const v = await empresasVisiveis(sessao(dirLegado));
    ok(v.includes(ea.id) && v.includes(eb.id), "…e ela segue vendo o grupo inteiro");
  }

  console.log("\nO que cada um enxerga (empresasVisiveis)\n");
  {
    const v = await empresasVisiveis(sessao(dirGlobal));
    ok(v.includes(ea.id) && v.includes(eb.id), "Diretoria global vê as duas marcas do grupo");
    ok(!v.includes(ex.id), "…e nada do outro grupo");
  }
  {
    const v = await empresasVisiveis(sessao(dirRestrita));
    ok(v.includes(ea.id), "Diretoria restrita vê a marca marcada");
    ok(!v.includes(eb.id), "…e NÃO vê a outra marca do mesmo grupo");
    ok(!v.includes(ex.id), "…nem o outro grupo");
  }
  {
    const v = await empresasVisiveis(sessao(admForaDoGrupo));
    ok(v.includes(ea.id) && v.includes(eb.id), "ADMIN com marca de outro grupo continua vendo o grupo inteiro");
    ok(!v.includes(ex.id), "…e a marca do outro grupo continua inalcançável");
  }
  {
    const v = await empresasVisiveis(sessao(rh));
    ok(v.includes(eb.id) && !v.includes(ea.id), "gestor de RH vê só a marca vinculada (como antes)");
  }

  console.log("\nAlcance de um CNPJ (usuarioAlcancaEmpresa — rotas de API e telas)\n");
  ok(await usuarioAlcancaEmpresa(sessao(dirRestrita), ea.id), "restrita alcança CNPJ da marca marcada");
  ok(!(await usuarioAlcancaEmpresa(sessao(dirRestrita), eb.id)), "restrita NÃO alcança CNPJ de outra marca do grupo");
  ok(await usuarioAlcancaEmpresa(sessao(dirGlobal), eb.id), "global alcança qualquer CNPJ do grupo");
  ok(!(await usuarioAlcancaEmpresa(sessao(dirGlobal), ex.id)), "global não alcança CNPJ do outro grupo");
  ok(!(await usuarioAlcancaEmpresa(sessao(admForaDoGrupo), ex.id)), "vínculo antigo com outro grupo não abre o CNPJ de lá");
  {
    // Vínculo de CNPJ de OUTRA marca numa Diretoria restrita não amplia nada.
    await prisma.userEmpresa.create({
      data: { userId: dirRestrita.id, empresaId: eb.id, role: "RH_MANAGER", papelPrincipal: false },
    });
    const comCnpj = sessao(dirRestrita, [{ empresaId: eb.id, ativo: true }]);
    ok(!(await empresasVisiveis(comCnpj)).includes(eb.id), "restrita com CNPJ de outra marca vinculado NÃO o vê");
    ok(!(await usuarioAlcancaEmpresa(comCnpj, eb.id)), "…nem o alcança");
  }

  console.log("\nAvisos de pesquisa por empresa (buscarDestinatarios)\n");
  {
    const paraEB = (await buscarDestinatarios(eb.id)).map((d) => d.userId);
    const paraEA = (await buscarDestinatarios(ea.id)).map((d) => d.userId);
    ok(paraEB.includes(dirGlobal.id) && paraEA.includes(dirGlobal.id), "Diretoria global recebe aviso das duas marcas");
    ok(paraEA.includes(dirRestrita.id), "Diretoria restrita recebe aviso da marca marcada");
    ok(!paraEB.includes(dirRestrita.id), "…e NÃO recebe aviso de empresa de outra marca");
    ok(paraEB.includes(admForaDoGrupo.id), "ADMIN com marca de outro grupo segue recebendo tudo do grupo");
  }

  console.log("\nA regra da tela de admin (aplicarMarcasQueVe)\n");
  {
    const r = await aplicarMarcasQueVe({ userId: dirGlobal.id, grupoId: g1.id, marcaIds: [mb.id] });
    ok(r.ok, "admin prende a Diretoria a uma marca");
    ok(await direcaoRestrita(dirGlobal), "…e ela passa a estar restrita");
    const v = await empresasVisiveis(sessao(dirGlobal));
    ok(v.includes(eb.id) && !v.includes(ea.id), "…vendo só a marca escolhida");
  }
  {
    const r = await aplicarMarcasQueVe({ userId: dirGlobal.id, grupoId: g1.id, marcaIds: [] });
    ok(r.ok, "admin desmarca tudo");
    ok(!(await direcaoRestrita(dirGlobal)), "…e a Diretoria volta a ver o grupo inteiro");
    const v = await empresasVisiveis(sessao(dirGlobal));
    ok(v.includes(ea.id) && v.includes(eb.id), "…as duas marcas de novo");
  }
  {
    const r = await aplicarMarcasQueVe({ userId: dirRestrita.id, grupoId: g1.id, marcaIds: [mx.id] });
    ok(!r.ok && /não é deste grupo/.test(r.error), "marca de outro grupo é recusada");
  }
  {
    const r = await aplicarMarcasQueVe({ userId: dirLegado.id, grupoId: g1.id, marcaIds: [ma.id] });
    ok(r.ok, "admin marca a mesma marca do vínculo antigo");
    ok(await direcaoRestrita(dirLegado), "…e o vínculo vira restrição de verdade");
  }
  {
    // Vínculo com marca DESATIVADA: a tela não mostra, e salvar não pode apagá-lo.
    const mc = await marca("Smoke MC", g1.id);
    await prisma.marca.update({ where: { id: mc.id }, data: { ativo: false } });
    const rh2 = await usuario("rh2", "RH_MANAGER", g1.id);
    await marcar(rh2.id, mb.id, "RH_MANAGER");
    await marcar(rh2.id, mc.id, "RH_MANAGER");
    const r = await aplicarMarcasQueVe({ userId: rh2.id, grupoId: g1.id, marcaIds: [ma.id] });
    ok(r.ok, "admin troca as marcas de um gestor de RH");
    const links = await prisma.userMarca.findMany({ where: { userId: rh2.id }, select: { marcaId: true, ativo: true } });
    const ativo = (id: string) => links.find((l) => l.marcaId === id)?.ativo;
    ok(ativo(ma.id) === true && ativo(mb.id) === false, "…a marca escolhida entra e a desmarcada sai");
    ok(ativo(mc.id) === true, "…e o vínculo com marca desativada (sem checkbox) fica");
  }
  {
    const r = await aplicarMarcasQueVe({ userId: rh.id, grupoId: g1.id, marcaIds: [] });
    ok(!r.ok && /pelo menos uma marca/.test(r.error), "gestor de RH sem marca e sem CNPJ é recusado");
  }
  {
    const r = await aplicarMarcasQueVe({ userId: gestor.id, grupoId: g1.id, marcaIds: [ma.id] });
    ok(!r.ok && /setor/.test(r.error), "gestor de setor fica fora da tela de marcas");
  }
  {
    const r = await aplicarMarcasQueVe({ userId: rh.id, grupoId: g2.id, marcaIds: [mx.id] });
    ok(r.ok, "admin muda o gestor de RH de grupo, já com a marca de lá");
    const depois = await prisma.user.findUnique({ where: { id: rh.id }, select: { grupoId: true } });
    ok(depois?.grupoId === g2.id, "…a conta passa para o outro grupo");
    const v = await empresasVisiveis(sessao(rh));
    ok(v.includes(ex.id) && !v.includes(eb.id), "…e vê só a marca do grupo novo");
    const antiga = await prisma.userMarca.findUnique({
      where: { userId_marcaId: { userId: rh.id, marcaId: mb.id } },
      select: { ativo: true },
    });
    ok(antiga?.ativo === false, "…o vínculo com a marca do grupo antigo foi desligado");
  }

  console.log("\nLogin com Google (contaDoGoogle)\n");
  const emailBase = `smoke.google.${sfx}@example.com`;
  const comGoogle = await usuario("google", "RH_MANAGER", g1.id, { email: `Smoke.Google.${sfx}@Example.com` });
  await usuario("google-inativo", "RH_MANAGER", g1.id, { email: `smoke.inativo.${sfx}@example.com`, ativo: false });
  await usuario("dup1", "RH_MANAGER", g1.id, { email: `Dup.${sfx}@example.com` });
  await usuario("dup2", "DIRETORIA", g1.id, { email: `dup.${sfx}@example.com` });
  {
    const r = await contaDoGoogle(emailBase, true);
    ok(r.ok && r.userId === comGoogle.id, "e-mail verificado entra na conta certa, sem diferença de maiúscula");
  }
  {
    const r = await contaDoGoogle(emailBase, false);
    ok(!r.ok && r.motivo === "email-nao-verificado", "e-mail não verificado pelo Google é recusado");
  }
  {
    const r = await contaDoGoogle(`ninguem.${sfx}@example.com`, true);
    ok(!r.ok && r.motivo === "sem-cadastro", "Gmail sem conta é recusado (não cria conta)");
  }
  {
    const r = await contaDoGoogle(`smoke.inativo.${sfx}@example.com`, true);
    ok(!r.ok && r.motivo === "sem-cadastro", "conta desativada não entra pelo Google");
  }
  {
    const r = await contaDoGoogle(`DUP.${sfx}@EXAMPLE.COM`, true);
    ok(!r.ok && r.motivo === "mais-de-uma-conta", "e-mail em duas contas não escolhe uma ao acaso");
  }
  {
    // "_" e "%" não são coringa: o Google de "ana_souza@" não entra na conta de "ana.souza@".
    const ana = await usuario("ana", "RH_MANAGER", g1.id, { email: `ana.souza.${sfx}@example.com` });
    const r = await contaDoGoogle(`ana_souza.${sfx}@example.com`, true);
    ok(!r.ok && r.motivo === "sem-cadastro", "\"_\" no e-mail do Google não funciona como coringa");
    const r2 = await contaDoGoogle(`ana%.${sfx}@example.com`, true);
    ok(!r2.ok, "\"%\" também não");
    ok((await usuarioPorIdentificador(`ana_souza.${sfx}@example.com`, "email")) === null, "login/senha por e-mail com \"_\" não acha a conta de outro");
    ok((await usuarioPorIdentificador(`ANA.SOUZA.${sfx}@EXAMPLE.COM`, "email"))?.id === ana.id, "…e maiúscula continua não importando");
  }
  {
    const master = await usuario("master", "MASTER", null, { email: `master.${sfx}@example.com` });
    const r = await contaDoGoogle(`master.${sfx}@example.com`, true);
    ok(!r.ok && master.role === "MASTER", "a conta MASTER não entra pelo Google (só usuário e senha)");
  }
}

async function limpar() {
  const ids = criados.usuarios;
  await prisma.userMarca.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userEmpresa.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.empresa.deleteMany({ where: { id: { in: criados.empresas } } });
  await prisma.marca.deleteMany({ where: { id: { in: criados.marcas } } });
  await prisma.grupo.deleteMany({ where: { id: { in: criados.grupos } } });
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await limpar().catch((e) => console.error("Falha ao limpar os dados do smoke:", e));
    await prisma.$disconnect();
    console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
    process.exit(falhas === 0 ? 0 : 1);
  });
