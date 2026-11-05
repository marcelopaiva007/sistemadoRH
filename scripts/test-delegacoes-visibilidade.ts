// Quem enxerga qual demanda — a prova da regra de visibilidade por linha
// (lib/delegacoes/consultas.ts), sem banco.
//
// Esta é a regra que decide se o módulo vaza ou não: a guarda do módulo só diz
// "você entra", e a máquina de estados só diz "você pode agir". Entre as duas
// existe a pergunta que ninguém mais responde — "esta demanda aparece para
// você?" — e é esta.
//
//   npx tsx scripts/test-delegacoes-visibilidade.ts

import {
  demandasVisiveisPara,
  diasAtePrazo,
  ehDirecao,
  podeVerDemanda,
  prazoEmTexto,
} from "../lib/delegacoes/consultas";
import { prazoDoFormulario } from "../lib/delegacoes/estados";

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

const SOL = { id: "u-sol", role: "RH_MANAGER" };
const RESP = { id: "u-resp", role: "GESTOR_SETOR" };
const OUTRO = { id: "u-outro", role: "RH_MANAGER" };
const DIRETORIA = { id: "u-dir", role: "DIRETORIA" };
const ADMIN = { id: "u-adm", role: "ADMIN" };

const demanda = { solicitanteId: SOL.id, responsavelId: RESP.id };

console.log("\nQuem é Direção — o recorte de quem vê tudo\n");
{
  ok(ehDirecao(ADMIN), "ADMIN é direção");
  ok(ehDirecao(DIRETORIA), "DIRETORIA é direção");
  ok(!ehDirecao(SOL), "RH_MANAGER não é direção");
  ok(!ehDirecao(RESP), "GESTOR_SETOR não é direção");
}

console.log("\nO where da lista\n");
{
  // Direção vê tudo — do PRÓPRIO grupo de sociedade (lib/grupo.ts, v1.186.0):
  // a demanda é do grupo de quem a pediu.
  igual(
    demandasVisiveisPara(ADMIN),
    { solicitante: { grupo: { usuarios: { some: { id: ADMIN.id } } } } },
    "direção vê tudo do próprio grupo — e nada do outro",
  );
  igual(
    demandasVisiveisPara(SOL),
    { OR: [{ solicitanteId: SOL.id }, { responsavelId: SOL.id }] },
    "todo o resto vê o que pediu OU o que faz",
  );
  // Falhar FECHADO: sessão sem id não pode virar "sem filtro", que devolveria
  // a base inteira. É o mesmo erro que já derrubou telas escopadas por empresa
  // neste repo — filtro que some sem avisar.
  igual(
    demandasVisiveisPara({ role: "RH_MANAGER" }),
    { id: { in: [] } },
    "sessão sem id não vê NADA (falha fechada, nunca 'sem filtro')",
  );
  // Direção sem id não tem grupo para comparar: falha fechada, como os demais.
  // (Até a v1.185 o papel bastava e ela via a base inteira.)
  igual(demandasVisiveisPara({ role: "ADMIN" }), { id: { in: [] } }, "direção sem id não vê NADA");
}

// Grupos de sociedade de mentira para o teste sem banco: SOL, RESP e DIRETORIA
// no grupo A; a "DIRETORIA_B" no grupo B.
const DIRETORIA_B = { id: "u-dir-b", role: "DIRETORIA" };
const GRUPOS: Record<string, string> = { "u-sol": "A", "u-resp": "A", "u-dir": "A", "u-dir-b": "B" };
const grupoDe = async (id: string) => GRUPOS[id] ?? null;

async function blocoDetalhe() {
  console.log("\nA mesma pergunta para UMA demanda (tela de detalhe)\n");
  ok(await podeVerDemanda(SOL, demanda, grupoDe), "quem pediu vê");
  ok(await podeVerDemanda(RESP, demanda, grupoDe), "quem faz vê");
  ok(await podeVerDemanda(DIRETORIA, demanda, grupoDe), "a direção do grupo vê");
  ok(!(await podeVerDemanda(DIRETORIA_B, demanda, grupoDe)), "a direção de OUTRO grupo NÃO vê");
  ok(!(await podeVerDemanda(OUTRO, demanda, grupoDe)), "quem não participa NÃO vê — nem com id válido");
  ok(!(await podeVerDemanda({ role: "RH_MANAGER" }, demanda, grupoDe)), "sessão sem id não vê");
  const propria = { solicitanteId: "eu", responsavelId: "eu" };
  ok(await podeVerDemanda({ id: "eu", role: "GESTOR_SETOR" }, propria, grupoDe), "quem delegou para si vê");
}

console.log("\nO recorte não se mistura com filtro de tela\n");
{
  // A armadilha documentada em consultas.ts: espalhar o recorte no mesmo
  // objeto de um filtro que também use OR faz um sobrescrever o outro — e o
  // que some é o de ACESSO. A prova é estrutural: o recorte É um OR.
  const recorte = demandasVisiveisPara(SOL) as { OR?: unknown[] };
  ok(Array.isArray(recorte.OR), "o recorte de acesso usa OR — por isso combina com AND, nunca espalhado");
}

console.log("\nO prazo na tela é o dia que a pessoa digitou — em Brasília\n");
{
  // O defeito que a revisão adversarial de 29/08/2026 pegou: `prazoDoFormulario`
  // ancora a data em 23:59:59 de BRASÍLIA, que em UTC já é o dia seguinte.
  // Formatar ou contar dias por componentes UTC fazia a tela responder 06/09
  // para quem digitou 05/09 — e uma demanda vencida ontem aparecer como "0d",
  // fora do bloco "Atrasadas" por um dia inteiro.
  const prazo = prazoDoFormulario("2026-09-05")!;
  igual(prazoEmTexto(prazo), "05/09/2026", "digitou 05/09, a tela mostra 05/09 (não 06/09)");

  const em = (iso: string) => new Date(iso);
  igual(diasAtePrazo(prazo, em("2026-09-01T12:00:00-03:00")), 4, "quatro dias antes: 4d");
  igual(diasAtePrazo(prazo, em("2026-09-05T09:00:00-03:00")), 0, "no dia, de manhã: 0d");
  igual(diasAtePrazo(prazo, em("2026-09-05T22:00:00-03:00")), 0, "no dia, às 22h: AINDA 0d");
  igual(diasAtePrazo(prazo, em("2026-09-06T09:00:00-03:00")), -1, "no dia seguinte: -1d (atrasada)");
  igual(diasAtePrazo(prazo, em("2026-09-07T09:00:00-03:00")), -2, "dois dias depois: -2d");

  // A virada do dia é à meia-noite de Brasília, não às 21h (meia-noite UTC).
  igual(
    diasAtePrazo(prazo, em("2026-09-04T23:30:00-03:00")),
    1,
    "23h30 da véspera ainda falta 1 dia — a virada é à meia-noite de Brasília",
  );
}

blocoDetalhe().then(() => {
  console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
  process.exit(falhas === 0 ? 0 : 1);
});
