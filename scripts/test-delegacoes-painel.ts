// A prova do painel de entregas (lib/delegacoes/painel-entregas.ts): agrega
// demandas por responsável, sem banco. Pedido da Direção em 29/08/2026: saber
// quem entrega no prazo e o tempo médio de cada um — sem inventar apontamento
// de horas que o sistema não tem (é tempo aceite→entrega, tempo corrido).
//
//   npx tsx scripts/test-delegacoes-painel.ts

import {
  duracaoEmTexto,
  fracaoEmTexto,
  montarPainelEntregas,
  type DemandaParaPainel,
} from "../lib/delegacoes/painel-entregas";

let falhas = 0;
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

const AGORA = new Date("2026-09-10T12:00:00-03:00");
const h = (n: number) => new Date(AGORA.getTime() - n * 3_600_000);

function demanda(over: Partial<DemandaParaPainel>): DemandaParaPainel {
  return {
    status: "EM_EXECUCAO",
    prazo: AGORA,
    enviadaEm: h(48),
    aceiteEm: h(47),
    responsavelNome: "Ana",
    repactuacoes: 0,
    horasEstimadas: null,
    entregas: [],
    ...over,
  };
}

console.log("\nQuem some do painel — rascunho e cancelada não contam\n");
{
  const p = montarPainelEntregas([
    demanda({ status: "RASCUNHO", responsavelNome: "Ana" }),
    demanda({ status: "CANCELADA", responsavelNome: "Ana" }),
  ]);
  igual(p.linhas.length, 0, "rascunho e cancelada não geram linha nenhuma");
}

console.log("\nAbertas e atraso — dia de calendário de Brasília, não instante\n");
{
  const prazoOntem = new Date("2026-09-09T23:00:00-03:00");
  const prazoHoje = new Date("2026-09-10T08:00:00-03:00");
  const prazoAmanha = new Date("2026-09-11T00:30:00-03:00");
  const p = montarPainelEntregas(
    [
      demanda({ status: "EM_EXECUCAO", prazo: prazoOntem, responsavelNome: "Ana" }),
      demanda({ status: "ACEITA", prazo: prazoHoje, responsavelNome: "Ana" }),
      demanda({ status: "ENVIADA", prazo: prazoAmanha, responsavelNome: "Ana" }),
    ],
    AGORA,
  );
  const ana = p.linhas.find((l) => l.nome === "Ana")!;
  igual(ana.abertas, 3, "as três contam como abertas (ENVIADA/ACEITA/EM_EXECUCAO)");
  igual(ana.atrasadas, 1, "só a de prazo ONTEM está atrasada — hoje ainda vale (dia inteiro)");
}

console.log("\nEntrega no prazo — mesma régua: dia de calendário\n");
{
  const prazo = new Date("2026-09-05T12:00:00-03:00");
  const entregaMesmoDiaTarde = new Date("2026-09-05T22:00:00-03:00");
  const entregaDiaSeguinte = new Date("2026-09-06T00:30:00-03:00");
  const p = montarPainelEntregas([
    demanda({
      status: "ENCERRADA",
      prazo,
      responsavelNome: "Bruno",
      entregas: [{ createdAt: entregaMesmoDiaTarde, aceita: true }],
    }),
    demanda({
      status: "ENTREGUE",
      prazo,
      responsavelNome: "Carla",
      entregas: [{ createdAt: entregaDiaSeguinte, aceita: null }],
    }),
  ]);
  const bruno = p.linhas.find((l) => l.nome === "Bruno")!;
  const carla = p.linhas.find((l) => l.nome === "Carla")!;
  igual(bruno.noPrazo, 1, "22h do dia do prazo AINDA é no prazo — vale até o fim do dia");
  igual(carla.noPrazo, 0, "0h30 do dia seguinte já passou do prazo");
  igual(bruno.entregues, 1, "ENCERRADA conta como entregue");
  igual(carla.entregues, 1, "ENTREGUE (aguardando aceite) também conta como entregue");
}

console.log("\nBaixa direta — ENCERRADA sem entrega aceita não mede a pessoa\n");
{
  // Decisão da Direção (31/08/2026): quando o solicitante dá baixa direta
  // (concluída sem entrega formal), a demanda NÃO conta tempo de trabalho nem
  // entra no "% no prazo" do responsável — ele não entregou nada.
  const p = montarPainelEntregas(
    [
      demanda({ status: "ENCERRADA", responsavelNome: "Elisa", entregas: [] }),
      // Devolvida e depois baixada direto: a única entrega existente foi
      // recusada — a devolução conta, a "entrega" não.
      demanda({
        status: "ENCERRADA",
        responsavelNome: "Elisa",
        entregas: [{ createdAt: h(30), aceita: false }],
      }),
      // Uma entrega de verdade, para a linha existir e provar o contraste.
      demanda({
        status: "ENCERRADA",
        responsavelNome: "Elisa",
        prazo: AGORA,
        entregas: [{ createdAt: h(10), aceita: true }],
      }),
    ],
    AGORA,
  );
  const elisa = p.linhas.find((l) => l.nome === "Elisa")!;
  igual(elisa.entregues, 1, "só a demanda com entrega ACEITA conta como entregue");
  igual(elisa.abertas, 0, "as baixadas também não voltam a contar como abertas");
  igual(elisa.noPrazo, 1, "o % no prazo só olha a entrega real");
  igual(elisa.devolucoes, 1, "a devolução que aconteceu antes da baixa continua contando");
  // aceite h(47) → entrega h(10): 37h corridas, vindas SÓ da entrega real.
  igual(
    elisa.horasMediaEntrega !== null && Math.round(elisa.horasMediaEntrega),
    37,
    "o tempo médio vem SÓ da entrega real — baixa direta não gera medição",
  );
}

console.log("\nQual entrega vale — a aceita, ou a última quando nenhuma foi aceita\n");
{
  const p = montarPainelEntregas([
    demanda({
      status: "ENCERRADA",
      responsavelNome: "Duda",
      aceiteEm: h(100),
      entregas: [
        { createdAt: h(80), aceita: false }, // devolvida
        { createdAt: h(10), aceita: true }, // a que vale
      ],
    }),
  ]);
  const duda = p.linhas.find((l) => l.nome === "Duda")!;
  igual(duda.devolucoes, 1, "a devolvida conta em devolucoes");
  // O tempo medido é até a entrega ACEITA (h(10)), não a devolvida (h(80)).
  igual(Math.round(duda.horasMediaEntrega ?? -1), 90, "mede até a entrega que valeu, não a devolvida");
}

console.log("\nTempo até entregar — aceite→entrega; sem aceite, envio→entrega\n");
{
  const p1 = montarPainelEntregas([
    demanda({
      status: "ENCERRADA",
      responsavelNome: "Eva",
      enviadaEm: h(50),
      aceiteEm: h(48),
      entregas: [{ createdAt: h(24), aceita: true }],
    }),
  ]);
  igual(
    Math.round(p1.linhas[0].horasMediaEntrega ?? -1),
    24,
    "com aceite registrado, conta do ACEITE (48h atrás até 24h atrás = 24h)",
  );

  const p2 = montarPainelEntregas([
    demanda({
      status: "ENCERRADA",
      responsavelNome: "Eva",
      enviadaEm: h(50),
      aceiteEm: null,
      entregas: [{ createdAt: h(10), aceita: true }],
    }),
  ]);
  igual(
    Math.round(p2.linhas[0].horasMediaEntrega ?? -1),
    40,
    "sem aceite registrado, cai para o ENVIO (50h atrás até 10h atrás = 40h)",
  );

  const p3 = montarPainelEntregas([
    demanda({
      status: "ENCERRADA",
      responsavelNome: "Eva",
      enviadaEm: null,
      aceiteEm: null,
      entregas: [{ createdAt: h(10), aceita: true }],
    }),
  ]);
  igual(p3.linhas[0].horasMediaEntrega, null, "sem envio nem aceite, não inventa duração");
}

console.log("\nMédia — de cada pessoa, e a geral ponderada por medição\n");
{
  const p = montarPainelEntregas([
    demanda({ status: "ENCERRADA", responsavelNome: "Fabio", aceiteEm: h(20), entregas: [{ createdAt: h(10), aceita: true }] }), // 10h
    demanda({ status: "ENCERRADA", responsavelNome: "Fabio", aceiteEm: h(40), entregas: [{ createdAt: h(10), aceita: true }] }), // 30h
    demanda({ status: "ENCERRADA", responsavelNome: "Gil", aceiteEm: h(100), entregas: [{ createdAt: h(10), aceita: true }] }), // 90h
  ]);
  const fabio = p.linhas.find((l) => l.nome === "Fabio")!;
  const gil = p.linhas.find((l) => l.nome === "Gil")!;
  igual(Math.round(fabio.horasMediaEntrega ?? -1), 20, "Fábio: média de 10h e 30h = 20h");
  igual(Math.round(gil.horasMediaEntrega ?? -1), 90, "Gil: uma medição só, 90h");
  // Ponderada por medição (3 no total: 10+30+90=130/3≈43.3), NÃO média das
  // médias de pessoa ((20+90)/2=55) — a segunda daria peso igual a quem
  // entregou uma vez e a quem entregou várias.
  igual(Math.round(p.totais.horasMediaEntrega ?? -1), 43, "total pondera por medição, não por pessoa");
}

console.log("\nRepactuação — conta a demanda, não o número de repactuações\n");
{
  const p = montarPainelEntregas([
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Helo", repactuacoes: 3 }),
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Helo", repactuacoes: 0 }),
  ]);
  igual(p.linhas.find((l) => l.nome === "Helo")!.repactuadas, 1, "só uma das duas foi repactuada");
}

console.log("\nOrdenação — mais carga primeiro, empate por nome\n");
{
  const p = montarPainelEntregas([
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Zeca" }),
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Zeca" }),
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Ana" }),
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Bia" }),
  ]);
  igual(p.linhas.map((l) => l.nome), ["Zeca", "Ana", "Bia"], "Zeca (2) antes de Ana e Bia (1 cada, alfabético)");
}

console.log("\nHoras estimadas — média entra mesmo sem entrega (é planejamento, não medição)\n");
{
  const p = montarPainelEntregas([
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Ivo", horasEstimadas: 4 }),
    demanda({ status: "ACEITA", responsavelNome: "Ivo", horasEstimadas: 8 }),
  ]);
  const ivo = p.linhas.find((l) => l.nome === "Ivo")!;
  igual(ivo.horasEstimadasMedia, 6, "média de 4h e 8h, mesmo as duas ainda abertas");
  igual(ivo.comEstimativa, 0, "nenhuma entregue ainda — sem denominador de 'dentro da estimativa'");
  igual(ivo.dentroEstimativa, 0, "idem");
}

console.log("\nDentro da estimativa — só compara quem tem os DOIS números\n");
{
  const p = montarPainelEntregas([
    demanda({
      status: "ENCERRADA",
      responsavelNome: "Juli",
      horasEstimadas: 10,
      aceiteEm: h(8),
      entregas: [{ createdAt: h(0), aceita: true }], // 8h reais, estimativa 10h → dentro
    }),
    demanda({
      status: "ENCERRADA",
      responsavelNome: "Juli",
      horasEstimadas: 5,
      aceiteEm: h(8),
      entregas: [{ createdAt: h(0), aceita: true }], // 8h reais, estimativa 5h → fora
    }),
    demanda({
      status: "ENCERRADA",
      responsavelNome: "Juli",
      horasEstimadas: null,
      aceiteEm: h(8),
      entregas: [{ createdAt: h(0), aceita: true }], // sem estimativa → não entra na conta
    }),
  ]);
  const juli = p.linhas.find((l) => l.nome === "Juli")!;
  igual(juli.entregues, 3, "as três contam como entregues, com estimativa ou sem");
  igual(juli.comEstimativa, 2, "só as duas com estimativa E tempo medível entram no denominador");
  igual(juli.dentroEstimativa, 1, "só a de 8h real dentro dos 10h estimados conta");
}

console.log("\nHoras estimadas — total geral pondera por estimativa, não por pessoa\n");
{
  const p = montarPainelEntregas([
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Ken", horasEstimadas: 2 }),
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Ken", horasEstimadas: 6 }),
    demanda({ status: "EM_EXECUCAO", responsavelNome: "Léo", horasEstimadas: 40 }),
  ]);
  // Ken: média 4h. Léo: média 40h. Ponderada por estimativa: (2+6+40)/3 = 16.
  // Média das médias daria (4+40)/2 = 22 — errado, mesma armadilha do tempo real.
  igual(Math.round(p.totais.horasEstimadasMedia ?? -1), 16, "total pondera por estimativa, não por pessoa");
}

console.log("\nTextos — duração e fração\n");
{
  igual(duracaoEmTexto(null), "—", "sem medida");
  igual(duracaoEmTexto(0.5), "menos de 1h", "menos de uma hora");
  igual(duracaoEmTexto(5), "5h", "horas simples");
  igual(duracaoEmTexto(47), "47h", "47h ainda em horas (limite é 48)");
  igual(duracaoEmTexto(48), "2d", "48h vira 2 dias exatos");
  igual(duracaoEmTexto(50), "2d 2h", "2 dias e 2 horas");
  igual(fracaoEmTexto(0, 0), "—", "sem entregas, sem fração");
  igual(fracaoEmTexto(4, 5), "4 de 5 (80%)", "fração sempre com o percentual junto");
  igual(fracaoEmTexto(1, 1), "1 de 1 (100%)", "100% de UM aparece com a base — nunca só '100%'");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
