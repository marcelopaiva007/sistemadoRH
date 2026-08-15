// A trava que impede o sistema de ficar sem ADMIN.
//
// O ADMIN é o único papel que administra empresas (`requireAdmin`). Sem nenhum
// ativo, ninguém cria CNPJ nem conserta o que travou, e não há tela para sair
// dessa situação — só acesso direto ao banco.
//
// São TRÊS PORTAS para o mesmo buraco: excluir o último ADMIN, desativá-lo, ou
// trocar o papel dele. Até 14/08/2026 só a exclusão era barrada; editar chegava
// ao mesmo lugar sem resistência nenhuma.

import {
  deixariaSistemaSemAdmin,
  gestorSetorPodeAbrirMeuSetor,
  promoveriaAGestorSemSetor,
} from "../lib/usuarios-regras";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

const ADMIN_ATIVO = { role: "ADMIN", ativo: true };

console.log("\nÚltimo ADMIN: as três portas ficam fechadas\n");

ok(
  deixariaSistemaSemAdmin(ADMIN_ATIVO, { role: "ADMIN", ativo: false }, 0),
  "desativar o último ADMIN é barrado",
);
ok(
  deixariaSistemaSemAdmin(ADMIN_ATIVO, { role: "RH_MANAGER", ativo: true }, 0),
  "rebaixar o último ADMIN para RH_MANAGER é barrado",
);
ok(
  deixariaSistemaSemAdmin(ADMIN_ATIVO, { role: "DIRETORIA", ativo: true }, 0),
  "trocar para DIRETORIA também — DIRETORIA não administra empresas",
);
ok(
  deixariaSistemaSemAdmin(ADMIN_ATIVO, { role: "GESTOR_SETOR", ativo: false }, 0),
  "rebaixar E desativar de uma vez continua barrado",
);

console.log("\nO que precisa continuar passando\n");

ok(
  !deixariaSistemaSemAdmin(ADMIN_ATIVO, { role: "ADMIN", ativo: true }, 0),
  "editar nome/e-mail do único ADMIN passa — papel e situação não mudaram",
);
ok(
  !deixariaSistemaSemAdmin(ADMIN_ATIVO, { role: "RH_MANAGER", ativo: true }, 1),
  "com OUTRO admin ativo, rebaixar é permitido",
);
ok(
  !deixariaSistemaSemAdmin(ADMIN_ATIVO, { role: "ADMIN", ativo: false }, 3),
  "com três outros admins, desativar é permitido",
);

console.log("\nQuem não era ADMIN ativo não é o último de nada\n");

ok(
  !deixariaSistemaSemAdmin({ role: "RH_MANAGER", ativo: true }, { role: "RH_MANAGER", ativo: false }, 0),
  "desativar um RH_MANAGER não é bloqueado, mesmo sem admin nenhum",
);
ok(
  !deixariaSistemaSemAdmin({ role: "ADMIN", ativo: false }, { role: "RH_MANAGER", ativo: true }, 0),
  "ADMIN JÁ desativado não conta como último — o sistema já estava nesse estado",
);
// O caminho de volta: promover alguém a ADMIN nunca pode ser barrado, senão um
// sistema que ficou sem admin não teria como sair disso pela tela.
ok(
  !deixariaSistemaSemAdmin({ role: "RH_MANAGER", ativo: true }, { role: "ADMIN", ativo: true }, 0),
  "promover alguém a ADMIN sempre passa — é a saída de um sistema sem admin",
);

// ─────────────────────────────────────────────────────────────────────────────
// Gestor de setor: o vínculo pela metade que deixava a tela em branco.
//
// A home manda todo GESTOR_SETOR para /rh/meu-setor. Enquanto essa tela
// devolvia para a home quem estava sem setor, as duas ficavam se empurrando e o
// navegador não renderizava nada. As duas pontas agora leem a MESMA função —
// é isso que impede o empurra-empurra de voltar.

console.log("\nGestor de setor: quem consegue abrir Meu Setor\n");

const GESTOR_OK = {
  role: "GESTOR_SETOR",
  empresaAtivaId: "emp-1",
  setorAtivaId: "set-1",
  empresas: [{ empresaId: "emp-1", ativo: true }],
};

ok(gestorSetorPodeAbrirMeuSetor(GESTOR_OK), "gestor com empresa e setor ativos abre a tela");
ok(
  !gestorSetorPodeAbrirMeuSetor({ ...GESTOR_OK, setorAtivaId: null }),
  "sem setor não abre — era o caso que ficava em branco",
);
ok(
  !gestorSetorPodeAbrirMeuSetor({ ...GESTOR_OK, empresaAtivaId: null, setorAtivaId: null }),
  "sem vínculo nenhum não abre",
);
ok(
  !gestorSetorPodeAbrirMeuSetor({ ...GESTOR_OK, empresas: [{ empresaId: "emp-1", ativo: false }] }),
  "vínculo desativado não abre, mesmo com setor no token",
);
ok(
  !gestorSetorPodeAbrirMeuSetor({ ...GESTOR_OK, empresas: [{ empresaId: "emp-2", ativo: true }] }),
  "vínculo ativo em OUTRA empresa não vale para a empresa ativa",
);
ok(
  !gestorSetorPodeAbrirMeuSetor({ ...GESTOR_OK, role: "RH_MANAGER" }),
  "quem não é gestor de setor não é dono desta tela",
);

console.log("\nPromover a gestor de setor sem setor é barrado\n");

const SEM_SETOR = [{ ativo: true, setorId: null }];
const COM_SETOR = [{ ativo: true, setorId: "set-1" }];

ok(
  promoveriaAGestorSemSetor({ role: "RH_MANAGER" }, { role: "GESTOR_SETOR" }, SEM_SETOR),
  "promover quem tem vínculo sem setor é barrado",
);
ok(
  promoveriaAGestorSemSetor({ role: "RH_MANAGER" }, { role: "GESTOR_SETOR" }, []),
  "promover quem não tem vínculo nenhum é barrado",
);
ok(
  promoveriaAGestorSemSetor({ role: "ADMIN" }, { role: "GESTOR_SETOR" }, [{ ativo: false, setorId: "set-1" }]),
  "setor num vínculo DESATIVADO não conta",
);
ok(
  !promoveriaAGestorSemSetor({ role: "RH_MANAGER" }, { role: "GESTOR_SETOR" }, COM_SETOR),
  "com setor no vínculo ativo, a promoção passa",
);
ok(
  !promoveriaAGestorSemSetor({ role: "GESTOR_SETOR" }, { role: "GESTOR_SETOR" }, SEM_SETOR),
  "editar quem JÁ é gestor não é barrado — é assim que o RH conserta o cadastro",
);
ok(
  !promoveriaAGestorSemSetor({ role: "GESTOR_SETOR" }, { role: "RH_MANAGER" }, SEM_SETOR),
  "tirar o papel de gestor sempre passa",
);

console.log(falhas === 0 ? "\n✅ Permissões: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
