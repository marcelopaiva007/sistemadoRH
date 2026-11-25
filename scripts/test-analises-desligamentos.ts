// Análises da área Desligamentos (lib/desligamentos/analises.ts e
// relatorio.ts) — v1.216.0. Não toca o banco.
//
//   npx tsx scripts/test-analises-desligamentos.ts
import { dataUTC } from "@/lib/datas";
import { periodoDaUrl, placarDaMeta, quadroPorGestor, quadroPorSetor, type ConfigDaArea, type FichaDoPainel } from "@/lib/desligamentos/painel";
import {
  comparacaoAnual,
  contratacaoErrada,
  diasDeCasaNaSaida,
  motivosDasSaidas,
  pendenciasDeDados,
  serieMensal,
  SEM_CAUSA,
  validarIndicadoresNegocio,
} from "@/lib/desligamentos/analises";
import { gerarHtmlRelatorioDesligamentos } from "@/lib/desligamentos/relatorio";

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
const fmt = (d: Date) => d.toISOString().slice(0, 10);

let seq = 0;
function ficha(p: Partial<FichaDoPainel> & { setor?: string; gestor?: string }): FichaDoPainel {
  seq++;
  const setor = p.setor ?? "Comercial";
  const gestor = p.gestor ?? "Ana";
  const adm = p.dataAdmissao === undefined ? dataUTC(2020, 1, 1) : p.dataAdmissao;
  return {
    id: `f${seq}`,
    empresaId: "e1",
    nome: p.nome ?? `Pessoa ${seq}`,
    ativo: p.ativo ?? true,
    cargo: "Analista",
    setor,
    chaveSetor: setor.toLowerCase(),
    gestorChave: `col:${gestor}`,
    gestorNome: gestor,
    gestorOrigem: "lider",
    dataAdmissao: adm,
    dataDesligamento: p.dataDesligamento ?? null,
    inicioNoGrupo: p.inicioNoGrupo === undefined ? adm : p.inicioNoGrupo,
    motivoDesligamento: p.motivoDesligamento ?? null,
    causaDesligamento: p.causaDesligamento ?? null,
    saidaPorTransferencia: p.saidaPorTransferencia ?? false,
    entradaPorTransferencia: p.entradaPorTransferencia ?? false,
    temRetrato: p.temRetrato ?? false,
  };
}

const ano2026 = periodoDaUrl({}, HOJE);

console.log("1. Contratação errada");
seq = 0;
const base = [
  ...Array.from({ length: 8 }, () => ficha({})),
  // Contratada em março, saiu 45 dias depois.
  ficha({ setor: "Comercial", ativo: false, dataAdmissao: dataUTC(2026, 3, 2), dataDesligamento: dataUTC(2026, 4, 16), motivoDesligamento: "SEM_JUSTA_CAUSA", causaDesligamento: "DESEMPENHO" }),
  // Contratada em janeiro, saiu 150 dias depois.
  ficha({ setor: "Comercial", ativo: false, dataAdmissao: dataUTC(2026, 1, 5), dataDesligamento: dataUTC(2026, 6, 4), motivoDesligamento: "PEDIDO_DEMISSAO", causaDesligamento: "PEDIDO_COLABORADOR" }),
  // Veterana, saiu no ano.
  ficha({ setor: "Técnico", gestor: "Bruno", ativo: false, dataAdmissao: dataUTC(2018, 5, 1), dataDesligamento: dataUTC(2026, 8, 1), motivoDesligamento: "SEM_JUSTA_CAUSA" }),
  // Sem data de admissão.
  ficha({ setor: "Técnico", gestor: "Bruno", ativo: false, dataAdmissao: null, inicioNoGrupo: null, dataDesligamento: dataUTC(2026, 9, 1), motivoDesligamento: "ACORDO" }),
  // Contratada em 2026 e ainda ativa.
  ficha({ setor: "Técnico", gestor: "Bruno", dataAdmissao: dataUTC(2026, 7, 1) }),
  // Chegou por transferência em 2026 e saiu: a chegada não é contratação; a saída conta.
  ficha({ setor: "Técnico", gestor: "Bruno", ativo: false, dataAdmissao: dataUTC(2026, 2, 1), entradaPorTransferencia: true, inicioNoGrupo: dataUTC(2022, 1, 1), dataDesligamento: dataUTC(2026, 10, 1), motivoDesligamento: "PEDIDO_DEMISSAO" }),
  // Transferida para outro CNPJ: não é desligamento.
  ficha({ setor: "Comercial", ativo: false, dataDesligamento: dataUTC(2026, 5, 1), saidaPorTransferencia: true, motivoDesligamento: "TRANSFERENCIA_GRUPO" }),
];
const ce = contratacaoErrada(base, ano2026, HOJE, fmt);
ok(ce.total.saidas === 5, "5 saídas no ano (a transferência fica fora)");
ok(ce.total.ate90 === 1 && ce.total.ate180 === 2, "1 com menos de 90 dias, 2 com menos de 180");
ok(ce.total.semAdmissao === 1, "1 saída sem data de admissão, fora do cálculo de dias");
ok(ce.total.pctAte90 === 25, "% de menos de 90 sobre as 4 saídas com data (1 de 4)");
ok(ce.total.admissoes === 3 && ce.total.admissoesQueSairam === 2, "3 contratações em 2026 (a chegada por transferência não conta); 2 já saíram");
ok(Math.abs((ce.total.pctAdmissoesQueSairam ?? 0) - 66.666) < 0.01, "66,7% das contratações do ano já saíram");
ok(ce.porSetor[0].nome === "Comercial" && ce.porSetor[0].ate180 === 2, "Comercial lidera as saídas precoces");
ok(ce.pessoas.length === 2 && ce.pessoas[0].diasDeCasa === 45, "lista de quem saiu com < 180 dias, do mais rápido para o mais lento");
ok(diasDeCasaNaSaida(base.find((f) => f.entradaPorTransferencia)!)! > 1500, "tempo de casa de quem foi transferido conta desde a entrada no grupo");

console.log("2. Motivos");
const mot = motivosDasSaidas(base, ano2026, HOJE);
ok(mot.geral.total === 5, "5 saídas classificadas");
ok(mot.geral.porCausa.DESEMPENHO === 1 && mot.geral.porCausa.PEDIDO_COLABORADOR === 1, "causas contadas");
ok(mot.geral.porCausa[SEM_CAUSA] === 3, "3 saídas sem causa registrada");
ok(mot.geral.empresa === 2 && mot.geral.pedido === 2 && mot.geral.outros === 1, "empresa 2 × pedido 2 (+1 acordo)");
ok(mot.porSetor.length === 2 && mot.porGestor.some((g) => g.nome === "Bruno" && g.total === 3), "agrupado por setor e por gestor");

console.log("3. Comparações");
seq = 0;
const historico = [
  ...Array.from({ length: 10 }, () => ficha({ dataAdmissao: dataUTC(2020, 1, 1) })),
  ...Array.from({ length: 4 }, (_, i) => ficha({ dataAdmissao: dataUTC(2025, 3 + i, 1) })),
  ficha({ ativo: false, dataAdmissao: dataUTC(2019, 1, 1), dataDesligamento: dataUTC(2025, 6, 1), motivoDesligamento: "SEM_JUSTA_CAUSA" }),
  ficha({ ativo: false, dataAdmissao: dataUTC(2019, 1, 1), dataDesligamento: dataUTC(2026, 2, 1), motivoDesligamento: "PEDIDO_DEMISSAO" }),
  ficha({ dataAdmissao: dataUTC(2026, 4, 1) }),
];
const anos = comparacaoAnual(
  historico,
  15,
  [2025, 2026, 2024],
  HOJE,
  new Map([[2026, { crescimentoClientesPct: 2, crescimentoFaturamentoPct: -1.5, observacao: "ano de ajuste" }]]),
);
ok(anos.map((a) => a.ano).join(",") === "2024,2025,2026", "anos em ordem crescente");
const a25 = anos.find((a) => a.ano === 2025)!;
const a26 = anos.find((a) => a.ano === 2026)!;
ok(a25.desligamentos === 1 && a25.dispensasEmpresa === 1 && a25.admissoes === 4, "2025: 1 dispensa, 4 admissões");
ok(a25.ativosNoFim === 15, "fim de 2025: 15 ativos (10 + 4 + quem saiu em 2026)");
ok(a26.ativosNoFim === 15 && a26.emAndamento, "2026 até hoje: 15 ativos");
ok(a26.crescimentoQuadroPct === 0, "2026 sobre 2025: quadro estável (15 → 15)");
ok(Math.abs((a25.crescimentoQuadroPct ?? 0) - (15 - 12) / 12 * 100) < 1e-9, "2025 sobre 2024: 12 → 15 = +25%");
ok(a26.crescimentoClientesPct === 2 && a26.crescimentoFaturamentoPct === -1.5 && a26.observacao === "ano de ajuste", "crescimento do negócio digitado entra na linha do ano");
ok(a25.crescimentoClientesPct === null, "ano sem dado digitado fica vazio, não zero");
const serie = serieMensal(historico, 15, HOJE, 24);
ok(serie.length === 24 && serie[serie.length - 1].quadro === 15, "série de 24 meses, quadro de hoje no último mês");

console.log("4. Crescimento do negócio digitado");
const val = validarIndicadoresNegocio({ clientes_2026: "4,5", faturamento_2026: "-2%", observacao_2026: "  obs  ", clientes_2025: "", faturamento_2025: "" }, [2025, 2026]);
ok(val.ok && val.valores[1].crescimentoClientesPct === 4.5 && val.valores[1].crescimentoFaturamentoPct === -2 && val.valores[1].observacao === "obs", "aceita vírgula, sinal e %");
ok(val.ok && val.valores[0].crescimentoClientesPct === null, "campo vazio = não informado");
ok(!validarIndicadoresNegocio({ clientes_2026: "abc" }, [2026]).ok, "texto que não é número é recusado");
ok(!validarIndicadoresNegocio({ clientes_2026: "-150" }, [2026]).ok, "queda maior que 100% é recusada");

console.log("5. Pendências de dados");
seq = 0;
const comPendencias = [
  ficha({ setor: "Não definido", ativo: false, dataDesligamento: dataUTC(2026, 3, 1), motivoDesligamento: "SEM_JUSTA_CAUSA", causaDesligamento: "DESEMPENHO" }),
  ficha({ ativo: false, dataDesligamento: dataUTC(2026, 4, 1), motivoDesligamento: null, causaDesligamento: null }),
  ficha({ ativo: false, dataDesligamento: null }),
  ficha({ ativo: false, dataDesligamento: dataUTC(2026, 5, 1), saidaPorTransferencia: true, motivoDesligamento: "TRANSFERENCIA_GRUPO" }),
  ficha({ ativo: false, dataDesligamento: dataUTC(2026, 6, 1), motivoDesligamento: "SEM_JUSTA_CAUSA", causaDesligamento: "REESTRUTURACAO" }),
];
const pend = pendenciasDeDados(comPendencias, fmt, new Set(["f5"]));
ok(pend.setorNaoDefinido.length === 1 && pend.setorNaoDefinido[0].id === "f1", "saída em setor 'Não definido'");
ok(pend.semMotivo.length === 1 && pend.semMotivo[0].id === "f2", "saída sem motivo legal");
ok(pend.semCausa.length === 1 && pend.semCausa[0].id === "f2", "saída sem causa (a transferência não é cobrada)");
ok(pend.semData.length === 1 && pend.semData[0].data === null, "desligado sem data");
ok(pend.possivelTransferencia.length === 1 && pend.possivelTransferencia[0].id === "f5", "possível transferência não marcada");

console.log("6. Relatório (PDF)");
seq = 0;
const comNomePerigoso = [...base, ficha({ setor: "<script>alert(1)</script>", ativo: false, dataDesligamento: dataUTC(2026, 3, 3), motivoDesligamento: "SEM_JUSTA_CAUSA" })];
const html = gerarHtmlRelatorioDesligamentos({
  geradoEm: HOJE,
  recorte: "Todos os setores e gestores",
  periodoRotulo: ano2026.rotulo,
  config: CONFIG,
  placar: placarDaMeta(comNomePerigoso, 9, 2026, HOJE, CONFIG),
  setores: quadroPorSetor(comNomePerigoso, ano2026, HOJE, CONFIG),
  gestores: quadroPorGestor(comNomePerigoso, ano2026, HOJE, CONFIG),
  contratacao: contratacaoErrada(comNomePerigoso, ano2026, HOJE, fmt),
  motivos: motivosDasSaidas(comNomePerigoso, ano2026, HOJE),
  anos,
  avisos: ["aviso de teste"],
});
for (const secao of ["Placar da meta", "Custo dos desligamentos", "Quadro por setor", "Quadro por gestor", "Contratação errada", "Motivos das saídas", "Ano contra ano"]) {
  ok(html.includes(secao), `seção "${secao}" no relatório`);
}
ok(!html.includes("<script>alert(1)</script>") && html.includes("&lt;script&gt;"), "nome de setor vindo do banco é escapado");
ok(!/undefined|NaN/.test(html), "nada de 'undefined' ou 'NaN' no relatório");

console.log("7. Balde sem dono não lidera ranking");
seq = 0;
const comBalde = [
  ...Array.from({ length: 10 }, () => ficha({ setor: "Comercial" })),
  ficha({ setor: "Comercial", ativo: false, dataDesligamento: dataUTC(2026, 3, 1), motivoDesligamento: "SEM_JUSTA_CAUSA" }),
  // "Não definido" sem ninguém ativo: turnover de 200%, mas é cadastro a corrigir.
  ficha({ setor: "Não definido", ativo: false, dataDesligamento: dataUTC(2026, 4, 1), motivoDesligamento: "SEM_JUSTA_CAUSA" }),
  { ...ficha({ setor: "Comercial", ativo: false, dataDesligamento: dataUTC(2026, 5, 1) }), gestorChave: "sem-gestor", gestorNome: "Sem gestor definido" },
];
const setoresComBalde = quadroPorSetor(comBalde, ano2026, HOJE, CONFIG);
ok(setoresComBalde[setoresComBalde.length - 1].nome === "Não definido", "\"Não definido\" vai para o fim do quadro por setor, mesmo com o maior turnover");
const gestoresComBalde = quadroPorGestor(comBalde, ano2026, HOJE, CONFIG);
ok(gestoresComBalde[gestoresComBalde.length - 1].chave === "sem-gestor", "\"Sem gestor definido\" vai para o fim do quadro por gestor");
const ceBalde = contratacaoErrada(comBalde, ano2026, HOJE, fmt);
ok(ceBalde.porSetor[ceBalde.porSetor.length - 1].nome === "Não definido", "e para o fim em Contratação errada");

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTudo certo.");
