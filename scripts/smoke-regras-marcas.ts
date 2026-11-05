// Regras das marcas (área de admin, v1.190.0): "só ela" e "junto com".
//
// Monta dois grupos de teste com marcas e contas, aplica as mudanças de regra
// por lib/regras-marcas.ts e confere no banco quem foi junto, quem ficou e
// quais vínculos sobraram. Apaga tudo o que criou no fim.
//
//   DATABASE_URL=... npx tsx scripts/smoke-regras-marcas.ts
import { prisma } from "../lib/prisma";
import { aplicarRegraDaMarca } from "../lib/regras-marcas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) falhas++;
}

const sufixo = Date.now().toString(36);
const nome = (base: string) => `SMK ${base} ${sufixo}`;
const criados = { grupos: [] as string[], marcas: [] as string[], empresas: [] as string[], users: [] as string[] };

async function grupo(n: string) {
  const g = await prisma.grupo.create({ data: { nome: nome(n) } });
  criados.grupos.push(g.id);
  return g;
}
async function marca(n: string, grupoId: string) {
  const m = await prisma.marca.create({ data: { nome: nome(n), grupoId } });
  criados.marcas.push(m.id);
  const e = await prisma.empresa.create({
    data: { nome: nome(`${n} Matriz`), cnpj: String(10 ** 13 + Math.floor(Math.random() * 8 * 10 ** 13)), marcaId: m.id, ativo: true },
  });
  criados.empresas.push(e.id);
  return { ...m, empresaId: e.id };
}
async function conta(username: string, role: string, grupoId: string) {
  const u = await prisma.user.create({
    data: { username: `smk.${username}.${sufixo}`, nome: `SMK ${username}`, passwordHash: "!teste", role, grupoId, ativo: true },
  });
  criados.users.push(u.id);
  return u;
}
const vinculoMarca = (userId: string, marcaId: string, role: string) =>
  prisma.userMarca.create({ data: { userId, marcaId, role } });
const vinculoCnpj = (userId: string, empresaId: string, role: string) =>
  prisma.userEmpresa.create({ data: { userId, empresaId, role, ativo: true } });

const grupoDe = async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { grupoId: true } }))?.grupoId;
const marcasAtivas = async (userId: string) =>
  (await prisma.userMarca.findMany({ where: { userId, ativo: true }, select: { marcaId: true } })).map((v) => v.marcaId).sort();
const cnpjsAtivos = async (userId: string) =>
  (await prisma.userEmpresa.findMany({ where: { userId, ativo: true }, select: { empresaId: true } })).map((v) => v.empresaId).sort();

async function main() {
  const A = await grupo("Grupo A");
  const B = await grupo("Grupo B");
  const A1 = await marca("A1", A.id);
  const A2 = await marca("A2", A.id);
  const B1 = await marca("B1", B.id);

  const dirA = await conta("dirA", "DIRETORIA", A.id); // vê tudo de A
  const dirA2 = await conta("dirA2", "DIRETORIA", A.id); // restrita a A2
  await vinculoMarca(dirA2.id, A2.id, "DIRETORIA");
  const admA = await conta("admA", "ADMIN", A.id); // único ADMIN de A
  const rhA1 = await conta("rhA1", "RH_MANAGER", A.id);
  await vinculoMarca(rhA1.id, A1.id, "RH_MANAGER");
  const rhA12 = await conta("rhA12", "RH_MANAGER", A.id);
  await vinculoMarca(rhA12.id, A1.id, "RH_MANAGER");
  await vinculoMarca(rhA12.id, A2.id, "RH_MANAGER");
  const gesA2 = await conta("gesA2", "GESTOR_SETOR", A.id);
  await vinculoCnpj(gesA2.id, A2.empresaId, "GESTOR_SETOR");
  const dirB = await conta("dirB", "DIRETORIA", B.id);
  const rhBvelho = await conta("rhBvelho", "RH_MANAGER", B.id);
  await vinculoMarca(rhBvelho.id, B1.id, "RH_MANAGER");
  await vinculoMarca(rhBvelho.id, A2.id, "RH_MANAGER"); // vínculo velho, fora do grupo

  console.log("\nA trava do último ADMIN\n");
  const recusa = await aplicarRegraDaMarca({ marcaId: A2.id, destino: { tipo: "SO_ELA" }, contasQueVaoJunto: [admA.id, dirA2.id] });
  ok(!recusa.ok && /sem ADMIN ativo/.test(recusa.error), "levar o único ADMIN do grupo junto é recusado");
  ok((await prisma.marca.findUnique({ where: { id: A2.id } }))?.grupoId === A.id, "e nada muda: A2 continua em A");

  console.log("\nPedido com conta de outro grupo é recusado\n");
  const r4 = await aplicarRegraDaMarca({ marcaId: A2.id, destino: { tipo: "SO_ELA" }, contasQueVaoJunto: [dirB.id] });
  ok(!r4.ok && /lista de contas mudou/.test(r4.error), "conta que não é do grupo da marca não vai junto");
  ok((await grupoDe(dirB.id)) === B.id, "e ela continua no grupo dela");
  void rhA1;

  console.log("\nA2 passa a ser \"só ela\", levando quem vê só A2\n");
  const r1 = await aplicarRegraDaMarca({ marcaId: A2.id, destino: { tipo: "SO_ELA" }, contasQueVaoJunto: [dirA2.id, gesA2.id] });
  ok(r1.ok, `aplicada (${r1.ok ? r1.resumo : r1.error})`);
  const novo = r1.ok ? r1.grupoDestinoId! : "";
  criados.grupos.push(novo);
  const grupoNovo = await prisma.grupo.findUnique({ where: { id: novo } });
  ok(grupoNovo?.nome === A2.nome && grupoNovo.ativo, `grupo novo com o nome da marca (${grupoNovo?.nome})`);
  ok((await prisma.marca.findUnique({ where: { id: A2.id } }))?.grupoId === novo, "A2 mudou para o grupo novo");
  ok((await grupoDe(dirA2.id)) === novo && (await marcasAtivas(dirA2.id)).join() === A2.id, "Diretoria restrita a A2 foi junto e segue com A2");
  ok((await grupoDe(gesA2.id)) === novo && (await cnpjsAtivos(gesA2.id)).join() === A2.empresaId, "gestor do CNPJ de A2 foi junto e manteve o CNPJ");
  ok((await grupoDe(rhA12.id)) === A.id && (await marcasAtivas(rhA12.id)).join() === A1.id, "RH de A1+A2 ficou em A só com A1");
  ok((await grupoDe(dirA.id)) === A.id && (await marcasAtivas(dirA.id)).length === 0, "Diretoria sem restrição ficou em A (deixa de ver A2 pela parede do grupo)");
  ok((await marcasAtivas(rhBvelho.id)).join() === B1.id, "vínculo velho de outro grupo com A2 foi desativado");
  ok((await prisma.grupo.findUnique({ where: { id: A.id } }))?.ativo === true, "o grupo A continua ativo (tem A1)");

  console.log("\nSó ela de novo: nada a fazer\n");
  const r0 = await aplicarRegraDaMarca({ marcaId: A2.id, destino: { tipo: "SO_ELA" }, contasQueVaoJunto: [] });
  ok(r0.ok && /já é vista sozinha/.test(r0.resumo), "marca que já está sozinha não muda");

  console.log("\nA2 (sozinha) se junta a B: todas as contas vão e o grupo fecha\n");
  const r2 = await aplicarRegraDaMarca({ marcaId: A2.id, destino: { tipo: "JUNTO", grupoId: B.id }, contasQueVaoJunto: [] });
  ok(r2.ok, `aplicada (${r2.ok ? r2.resumo : r2.error})`);
  ok((await prisma.marca.findUnique({ where: { id: A2.id } }))?.grupoId === B.id, "A2 agora está em B");
  ok((await grupoDe(dirA2.id)) === B.id && (await marcasAtivas(dirA2.id)).join() === A2.id, "Diretoria que veio entra em B restrita a A2 (não ganha B1)");
  ok((await grupoDe(gesA2.id)) === B.id && (await cnpjsAtivos(gesA2.id)).join() === A2.empresaId, "gestor veio com o CNPJ de A2");
  ok((await prisma.grupo.findUnique({ where: { id: novo } }))?.ativo === false, "o grupo que ficou vazio foi encerrado");
  ok((await marcasAtivas(dirB.id)).length === 0 && (await grupoDe(dirB.id)) === B.id, "Diretoria de B sem restrição continua sem restrição (passa a ver A2 também)");

  console.log("\nGrupo encerrado volta a ser usado quando a marca fica sozinha de novo\n");
  const r3 = await aplicarRegraDaMarca({ marcaId: A2.id, destino: { tipo: "SO_ELA" }, contasQueVaoJunto: [dirA2.id] });
  ok(r3.ok && r3.grupoDestinoId === novo, "reaproveitou o grupo com o nome da marca");
  ok((await prisma.grupo.findUnique({ where: { id: novo } }))?.ativo === true, "e ele voltou a ficar ativo");
  ok((await grupoDe(gesA2.id)) === B.id && (await cnpjsAtivos(gesA2.id)).length === 0, "quem não foi junto ficou em B sem o CNPJ de A2");
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await prisma.userMarca.deleteMany({ where: { userId: { in: criados.users } } });
    await prisma.userEmpresa.deleteMany({ where: { userId: { in: criados.users } } });
    await prisma.user.deleteMany({ where: { id: { in: criados.users } } });
    await prisma.empresa.deleteMany({ where: { id: { in: criados.empresas } } });
    await prisma.marca.deleteMany({ where: { id: { in: criados.marcas } } });
    await prisma.grupo.deleteMany({ where: { id: { in: [...new Set(criados.grupos)] } } });
    await prisma.$disconnect();
    console.log(falhas === 0 ? "\nTudo certo. (dados de teste apagados)\n" : `\n${falhas} falha(s).\n`);
    process.exit(falhas === 0 ? 0 : 1);
  });
