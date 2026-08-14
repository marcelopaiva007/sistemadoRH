// A trava que impede o sistema de ficar sem ADMIN.
//
// O ADMIN é o único papel que administra empresas (`requireAdmin`). Sem nenhum
// ativo, ninguém cria CNPJ nem conserta o que travou, e não há tela para sair
// dessa situação — só acesso direto ao banco.
//
// São TRÊS PORTAS para o mesmo buraco: excluir o último ADMIN, desativá-lo, ou
// trocar o papel dele. Até 14/08/2026 só a exclusão era barrada; editar chegava
// ao mesmo lugar sem resistência nenhuma.

import { deixariaSistemaSemAdmin } from "../lib/usuarios-regras";

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

console.log(falhas === 0 ? "\n✅ Permissões: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
