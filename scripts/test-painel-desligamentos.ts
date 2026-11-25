// Motor da área Desligamentos (lib/desligamentos/painel.ts) — v1.215.0. Não
// toca o banco.
//
//   npx tsx scripts/test-painel-desligamentos.ts
import { turnoverNoPeriodo } from "@/lib/bi";
import { dataUTC } from "@/lib/datas";
import {
  classeDoMotivo,
  detalheDoRecorte,
  faixaDaTaxa,
  periodoDaUrl,
  placarDaMeta,
  quadroPorGestor,
  quadroPorSetor,
  validarConfiguracao,
  type ConfigDaArea,
  type FichaDoPainel,
} from "@/lib/desligamentos/painel";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const HOJE = dataUTC(2026, 11, 25);
const CONFIG: ConfigDaArea = { custoPorDesligamento: 4000, metaPct: 10, limitePct: 15, personalizada: false };

let seq = 0;
function ficha(p: Partial<FichaDoPainel> & { setor?: string; gestor?: string }): FichaDoPainel {
  seq++;
  const setor = p.setor ?? "Comercial";
  const gestor = p.gestor ?? "Ana";
  return {
    id: `f${seq}`,
    empresaId: "e1",
    nome: `Pessoa ${seq}`,
    ativo: p.ativo ?? true,
    cargo: "Analista",
    setor,
    chaveSetor: setor.toLowerCase(),
    gestorChave: `col:${gestor}`,
    gestorNome: gestor,
    gestorOrigem: "lider",
    dataAdmissao: p.dataAdmissao ?? dataUTC(2020, 1, 1),
    dataDesligamento: p.dataDesligamento ?? null,
    inicioNoGrupo: p.inicioNoGrupo ?? p.dataAdmissao ?? dataUTC(2020, 1, 1),
    motivoDesligamento: p.motivoDesligamento ?? null,
    causaDesligamento: p.causaDesligamento ?? null,
    saidaPorTransferencia: p.saidaPorTransferencia ?? false,
    entradaPorTransferencia: p.entradaPorTransferencia ?? false,
    temRetrato: p.temRetrato ?? false,
    ...("dataAdmissaoNoQuadro" in p ? { dataAdmissaoNoQuadro: p.dataAdmissaoNoQuadro } : {}),
  };
}

console.log("1. Faixas do semáforo e classe do motivo");
ok(faixaDaTaxa(9.99, CONFIG) === "verde", "9,99% é verde (abaixo da meta)");
ok(faixaDaTaxa(10, CONFIG) === "amarelo", "10% é amarelo (atingiu a meta)");
ok(faixaDaTaxa(15, CONFIG) === "amarelo", "15% ainda é amarelo (no limite)");
ok(faixaDaTaxa(15.01, CONFIG) === "vermelho", "acima de 15% é vermelho");
ok(classeDoMotivo("SEM_JUSTA_CAUSA") === "empresa" && classeDoMotivo("JUSTA_CAUSA") === "empresa", "dispensa (com ou sem justa causa) é decisão da empresa");
ok(classeDoMotivo("PEDIDO_DEMISSAO") === "pedido", "pedido de demissão é do colaborador");
ok(classeDoMotivo("ACORDO") === "outros" && classeDoMotivo(null) === "outros", "acordo e sem motivo ficam em outros");

console.log("2. Placar da meta");
// 20 ativos o ano todo + 4 dispensados no ano (fev, mar, mar, jun) + 1 transferido (não conta).
seq = 0;
const ativos20 = Array.from({ length: 20 }, () => ficha({}));
const saiuNoAno = [
  ficha({ ativo: false, dataDesligamento: dataUTC(2026, 2, 10), motivoDesligamento: "SEM_JUSTA_CAUSA" }),
  ficha({ ativo: false, dataDesligamento: dataUTC(2026, 3, 5), motivoDesligamento: "PEDIDO_DEMISSAO" }),
  ficha({ ativo: false, dataDesligamento: dataUTC(2026, 3, 20), motivoDesligamento: "SEM_JUSTA_CAUSA" }),
  ficha({ ativo: false, dataDesligamento: dataUTC(2026, 6, 15), motivoDesligamento: "JUSTA_CAUSA" }),
];
const transferido = ficha({ ativo: false, dataDesligamento: dataUTC(2026, 4, 1), saidaPorTransferencia: true, motivoDesligamento: "TRANSFERENCIA_GRUPO" });
const base = [...ativos20, ...saiuNoAno, transferido];
const placar = placarDaMeta(base, 20, 2026, HOJE, CONFIG);
// Início do ano: 20 + 4 + 1 = 25; fim: 20 → quadro médio 22,5.
ok(placar.desligamentos === 4, "4 desligamentos (a transferência fica fora)");
ok(placar.quadroMedio === 22.5, "quadro médio = (25 + 20) ÷ 2 = 22,5");
ok(Math.abs(placar.realizadoPct - (4 / 22.5) * 100) < 1e-9, "realizado = 4 ÷ 22,5 = 17,8%");
ok(placar.metaPessoas === 2 && placar.limitePessoas === 3, "meta = 2 pessoas (2,25), limite = 3 pessoas (3,375)");
ok(placar.faixa === "vermelho", "17,8% está acima do limite: vermelho");
ok(placar.mesMetaUltrapassada === "mar/2026", "a meta (2,25) foi ultrapassada em março (3 no acumulado)");
ok(placar.mesLimiteUltrapassado === "jun/2026", "o limite (3,375) foi ultrapassado em junho (4 no acumulado)");
ok(placar.transferencias === 1, "a transferência aparece contada à parte");
ok(placar.serie.length === 11 && placar.serie[10].acumulado === 4, "série de jan a nov, acumulado final 4");
ok(placar.projecao !== null && placar.projecao.desligamentos === 4, "projeção: 4 em 329 dias → 4 em 365");
ok(placar.custo.total === 16000, "custo total = 4 × R$ 4.000");
ok(placar.custo.acimaDaMeta === 8000 && placar.custo.acimaDoLimite === 4000, "acima da meta: 2 × 4.000; acima do limite: 1 × 4.000");

const anoFechado = placarDaMeta(base, 20, 2025, HOJE, CONFIG);
ok(!anoFechado.emAndamento && anoFechado.projecao === null, "ano fechado não tem projeção");
ok(anoFechado.desligamentos === 0 && anoFechado.serie.length === 12, "2025 sem saídas, série de 12 meses");

console.log("3. Turnover de um ano fechado (quadro do fim reconstruído)");
const t2025 = turnoverNoPeriodo(base, 20, dataUTC(2025, 1, 1), dataUTC(2025, 12, 31), HOJE);
ok(t2025.headcountFim === 25 && t2025.headcountInicio === 25, "em 31/12/2025 o quadro era 25 (os que saíram em 2026 ainda estavam)");

console.log("4. Quadro por setor");
seq = 0;
const periodo2026 = periodoDaUrl({}, HOJE);
const comercialAtivos = Array.from({ length: 9 }, () => ficha({ setor: "Comercial" }));
const novato = ficha({ setor: "Comercial", dataAdmissao: dataUTC(2026, 8, 1), inicioNoGrupo: dataUTC(2026, 8, 1) });
const comercialSaidas = [
  ficha({ setor: "Comercial", ativo: false, dataDesligamento: dataUTC(2026, 5, 1), motivoDesligamento: "PEDIDO_DEMISSAO" }),
  ficha({ setor: "Comercial", ativo: false, dataDesligamento: dataUTC(2026, 9, 1), motivoDesligamento: "SEM_JUSTA_CAUSA" }),
];
const estoque = [ficha({ setor: "Estoque" }), ficha({ setor: "Estoque" })];
const extinto = [ficha({ setor: "Marketing", ativo: false, dataDesligamento: dataUTC(2026, 7, 1), motivoDesligamento: "SEM_JUSTA_CAUSA" })];
const setores = quadroPorSetor([...comercialAtivos, novato, ...comercialSaidas, ...estoque, ...extinto], periodo2026, HOJE, CONFIG);
const comercial = setores.find((l) => l.nome === "Comercial")!;
ok(comercial.ativos === 10 && comercial.saidas === 2 && comercial.entradas === 1, "Comercial: 10 ativos, 1 entrada, 2 saídas no ano");
ok(comercial.saldo === -1, "saldo = 1 − 2");
ok(comercial.dispensasEmpresa === 1 && comercial.pedidos === 1, "1 dispensa pela empresa × 1 pedido");
ok(comercial.custo === 8000, "custo estimado = 2 × R$ 4.000");
ok(comercial.pctMenosDeUmAno === 10, "1 dos 10 ativos tem menos de 1 ano de casa");
ok(setores.some((l) => l.nome === "Marketing"), "setor só com desligados aparece (perdeu todo mundo é o pior caso)");
ok(setores[0].nome === "Marketing", "ordem do pior para o melhor turnover");
ok(setores.find((l) => l.nome === "Estoque")!.amostraPequena, "Estoque com 2 ativos é marcado como equipe pequena");
ok(comercial.acimaDoLimite, "Comercial com 2 saídas sobre ~11 de quadro passa de 15%: destacado");

console.log("5. Quadro por gestor e detalhe");
seq = 0;
const doBruno = [
  ficha({ gestor: "Bruno" }),
  ficha({ gestor: "Bruno", ativo: false, dataDesligamento: dataUTC(2026, 10, 1), causaDesligamento: "DESEMPENHO", inicioNoGrupo: dataUTC(2026, 8, 3) }),
  { ...ficha({ gestor: "Bruno", ativo: false, dataDesligamento: dataUTC(2026, 4, 1), causaDesligamento: null }), gestorOrigem: "lider_do_setor" as const },
];
const daCarla = [ficha({ gestor: "Carla" }), ficha({ gestor: "Carla" })];
const gestores = quadroPorGestor([...doBruno, ...daCarla], periodo2026, HOJE, CONFIG);
ok(gestores.length === 2 && gestores[0].nome === "Bruno", "dois gestores, o pior primeiro");
ok(gestores[0].saidasPeloSetor === 1, "a linha diz quantas saídas chegaram ao gestor pela dedução do setor");
ok(quadroPorSetor(doBruno, periodo2026, HOJE, CONFIG)[0].saidasPeloSetor === undefined, "linha de setor não tem essa contagem");
const detalhe = detalheDoRecorte(doBruno, periodo2026, HOJE, (d) => d.toISOString().slice(0, 10));
ok(detalhe.saidas.length === 2 && detalhe.saidas[0].data === "2026-10-01", "saídas do período, mais recente primeiro");
ok(detalhe.saidas[0].diasDeCasa === 59, "tempo de casa pela admissão no grupo (03/08 → 01/10 = 59 dias)");
ok(
  detalhe.porCausa.some((c) => c.causa === "DESEMPENHO" && c.total === 1) && detalhe.porCausa.some((c) => c.causa === null),
  "causas contadas, inclusive 'sem causa registrada'",
);
ok(detalhe.mesAMes.length === 12, "mês a mês dos últimos 12 meses");

console.log("6. Configuração digitada");
const valida = validarConfiguracao({ custo: "4.000,00", meta: "10", limite: "15" });
ok(valida.ok && valida.valores.custoCentavos === 400000, "\"4.000,00\" vira 400.000 centavos");
const comPonto = validarConfiguracao({ custo: "R$ 5500.50", meta: "12,5", limite: "20%" });
ok(comPonto.ok && comPonto.valores.custoCentavos === 550050 && comPonto.valores.metaPct === 12.5 && comPonto.valores.limitePct === 20, "aceita R$, ponto decimal, vírgula e %");
ok(!validarConfiguracao({ custo: "4000", meta: "15", limite: "10" }).ok, "limite abaixo da meta é recusado");
ok(!validarConfiguracao({ custo: "0", meta: "10", limite: "15" }).ok, "custo zero é recusado");
ok(!validarConfiguracao({ custo: "4000", meta: "120", limite: "150" }).ok, "percentual acima de 100 é recusado");

console.log("7. Período da URL");
ok(periodoDaUrl({}, HOJE).chave === "ano" && periodoDaUrl({}, HOJE).inicio.getTime() === dataUTC(2026, 1, 1).getTime(), "padrão: o ano corrente");
ok(periodoDaUrl({ periodo: "12m" }, HOJE).inicio.getTime() === dataUTC(2025, 11, 25).getTime(), "12 meses");
const pers = periodoDaUrl({ periodo: "personalizado", de: "2026-03-01", ate: "2026-06-30" }, HOJE);
ok(pers.chave === "personalizado" && pers.rotulo === "01/03/2026 a 30/06/2026", "personalizado válido");
ok(periodoDaUrl({ periodo: "personalizado", de: "2026-07-01", ate: "2026-06-30" }, HOJE).chave === "ano", "personalizado invertido cai no padrão");
ok(periodoDaUrl({ periodo: "personalizado", de: "lixo", ate: "2026-06-30" }, HOJE).chave === "ano", "data inválida cai no padrão");

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTudo certo.");
