// Aviso de deploy de produção que falhou — chamado por
// .github/workflows/aviso-deploy.yml a cada status que a Vercel manda.
//
// Em 28/09/2026 os dois deploys de produção da v1.179.1 falharam e ninguém
// soube: o site seguiu no ar com a versão anterior, e a produção ficou parada
// na v1.179.0 até 30/10. A Vercel só mostrava o erro no painel dela. Daqui em
// diante, falha em Production abre uma issue atribuída ao dono do repositório
// (o GitHub manda e-mail), e o próximo deploy de produção que der certo fecha
// a issue sozinho.
//
// Uma issue aberta por vez: falhas seguidas viram comentários na mesma, em vez
// de uma caixa de entrada cheia do mesmo problema.

const ROTULO = "deploy-falhou";

module.exports = async function avisoDeploy({ github, context }) {
  const { deployment, deployment_status: status } = context.payload;
  if (!deployment || !status || deployment.environment !== "Production") return "ignorado";

  const commit = deployment.sha.slice(0, 7);
  const link = status.target_url || status.log_url || status.environment_url || "";
  const abertas = (
    await github.rest.issues.listForRepo({ ...context.repo, state: "open", labels: ROTULO, per_page: 10 })
  ).data;

  if (status.state === "success") {
    for (const issue of abertas) {
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: issue.number,
        body: `A produção voltou a publicar: o deploy do commit ${commit} ficou pronto.\n\n${link}`,
      });
      await github.rest.issues.update({ ...context.repo, issue_number: issue.number, state: "closed" });
    }
    return abertas.length ? "fechado" : "nada";
  }

  if (status.state !== "failure" && status.state !== "error") return "ignorado";

  const corpo =
    `O deploy de produção do commit \`${commit}\` falhou na Vercel.\n\n` +
    "**O site continua no ar com a versão anterior** — nada do que entrou no `master` desde então está publicado.\n\n" +
    `Log do build: ${link}\n\n` +
    "Esta issue fecha sozinha no próximo deploy de produção que der certo.";

  if (abertas.length) {
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: abertas[0].number,
      body: `Falhou de novo, agora no commit \`${commit}\`.\n\n${link}`,
    });
    return "comentado";
  }

  await github.rest.issues.create({
    ...context.repo,
    title: `Deploy de produção falhou (commit ${commit}) — o site segue na versão anterior`,
    body: corpo,
    labels: [ROTULO],
    assignees: [context.repo.owner],
  });
  return "aberto";
};
