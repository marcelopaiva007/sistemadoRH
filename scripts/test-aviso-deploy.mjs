// O aviso de deploy de produção que falhou (.github/scripts/aviso-deploy.cjs),
// com um GitHub de mentira que só anota o que seria feito.
//
//   node scripts/test-aviso-deploy.mjs
//
// O caso real não dá para provocar de propósito — seria derrubar um deploy de
// produção. Os payloads abaixo têm o formato do que a Vercel mandou em
// 28/09/2026 (environment "Production", state "failure").
import avisoDeploy from "../.github/scripts/aviso-deploy.cjs";

let falhas = 0;
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

function githubDeMentira(abertas = []) {
  const feito = [];
  const github = {
    rest: {
      issues: {
        listForRepo: async (a) => (feito.push(["listar", a]), { data: abertas }),
        create: async (a) => (feito.push(["abrir", a]), { data: { number: 99 } }),
        createComment: async (a) => (feito.push(["comentar", a]), {}),
        update: async (a) => (feito.push(["atualizar", a]), {}),
      },
    },
  };
  return { github, feito };
}

const contexto = (environment, state) => ({
  repo: { owner: "marcelopaiva007", repo: "sistemadoRH" },
  payload: {
    deployment: { environment, sha: "88a8b24a0d7fbcf9bce0fa0698e2dff44f2cb7e0" },
    deployment_status: { state, target_url: "https://sistemado-ndxj8t4rr.vercel.app" },
  },
});

(async () => {
  console.log("Falha em produção\n");
  {
    const { github, feito } = githubDeMentira();
    const r = await avisoDeploy({ github, context: contexto("Production", "failure") });
    const abrir = feito.find(([o]) => o === "abrir");
    ok(r === "aberto" && abrir, "sem issue aberta, abre uma");
    ok(abrir && abrir[1].assignees[0] === "marcelopaiva007", "atribuída ao dono do repositório (o GitHub manda e-mail)");
    ok(abrir && abrir[1].title.includes("88a8b24"), "o título diz o commit");
    ok(abrir && abrir[1].body.includes("versão anterior"), "o texto diz que o site segue na versão anterior");
    ok(abrir && abrir[1].labels.includes("deploy-falhou"), "leva o rótulo que o sucesso procura para fechar");
  }
  {
    const { github, feito } = githubDeMentira([{ number: 7 }]);
    const r = await avisoDeploy({ github, context: contexto("Production", "failure") });
    ok(r === "comentado" && !feito.some(([o]) => o === "abrir"), "com issue aberta, comenta nela em vez de abrir outra");
    ok(feito.some(([o, a]) => o === "comentar" && a.issue_number === 7), "o comentário vai na issue que já estava aberta");
  }
  {
    const { github } = githubDeMentira();
    ok((await avisoDeploy({ github, context: contexto("Production", "error") })) === "aberto", "state 'error' também avisa");
  }

  console.log("\nProdução voltou\n");
  {
    const { github, feito } = githubDeMentira([{ number: 7 }]);
    const r = await avisoDeploy({ github, context: contexto("Production", "success") });
    ok(r === "fechado", "sucesso depois de falha fecha a issue");
    ok(feito.some(([o, a]) => o === "atualizar" && a.issue_number === 7 && a.state === "closed"), "fecha a issue certa");
  }
  {
    const { github, feito } = githubDeMentira();
    const r = await avisoDeploy({ github, context: contexto("Production", "success") });
    ok(r === "nada" && !feito.some(([o]) => o !== "listar"), "sucesso sem falha pendente não faz nada");
  }

  console.log("\nO que não é falha de produção\n");
  for (const [env, st] of [["Preview", "failure"], ["Production", "pending"], ["Production", "in_progress"]]) {
    const { github, feito } = githubDeMentira();
    const r = await avisoDeploy({ github, context: contexto(env, st) });
    ok(r === "ignorado" && !feito.some(([o]) => o === "abrir" || o === "comentar"), `${env}/${st} não avisa ninguém`);
  }

  if (falhas) {
    console.error(`\n${falhas} falha(s).`);
    process.exit(1);
  }
  console.log("\nTudo certo.");
})();
