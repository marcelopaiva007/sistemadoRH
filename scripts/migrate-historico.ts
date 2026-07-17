/**
 * Migração do histórico Jan-Jun/2026 da planilha "Bonificação 2026 (1).xlsx" para o banco.
 *
 * Cada mês é importado como um FechamentoMensal já FECHADO, com os valores de
 * bonificação exatamente como estavam na planilha (não recalculados pela nova
 * engine de regras). Fontes usadas por mês, conforme confirmado com o usuário:
 *   - Jan-Abr: aba "VENDEDORES EXTERNO" (blocos por cidade)
 *   - Abril também: bloco "EQUIPE DE TELEFONIA MÓVEL" (categoria própria)
 *   - Maio: aba "Folha6" ("RESULTADO MAIO DE 2026") — fonte única, o bloco de
 *     maio dentro de VENDEDORES EXTERNO foi descartado por ser rascunho duplicado
 *   - Junho: aba "EXTERNO- JUNHO " ("RESULTADO JUNHO DE 2026") — fonte única
 *   - Jan-Maio: aba "CHIPS - ATENDIMENTO E ADM" (taxa de 50% do valor vendido)
 *   - Maio: aba "OUTROS SETORES"
 *   - Ajustes avulsos: Supervisor geral (Josenildo), Ação Comercial (3 pessoas
 *     recorrentes), Agregados
 *
 * Rode com: npx tsx scripts/migrate-historico.ts "<caminho-do-arquivo.xlsx>"
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { normalizarTexto } from "../lib/text";

const ARQUIVO = process.argv[2] ?? "C:\\Users\\User\\Downloads\\Bonificação 2026 (1).xlsx";

type Cargo = "VENDEDOR_EXTERNO" | "ATENDIMENTO_ADM" | "SUPERVISOR" | "OUTRO_SETOR";

type Entrada = {
  nome: string;
  cargo: Cargo;
  cidade?: string;
  quantidade?: number;
  aprovado?: number;
  cancelado?: number;
  valorInstalado?: number;
  qtdInternet?: number;
  qtdChip?: number;
  qtdGps?: number;
  qtdStreaming?: number;
  qtdTelefoniaFixa?: number;
  valorBase?: number;
  valorMeta?: number;
  valorSuperMeta?: number;
  valorSupervisor?: number;
};

type Ajuste = {
  nome: string;
  cargo: Cargo;
  descricao: string;
  valor: number;
};

type MesMigrado = {
  periodo: string;
  entradas: Entrada[];
  ajustes: Ajuste[];
};

function strOf(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const limpo = v.replace(/[^\d,.-]/g, "").replace(",", ".");
    const n = parseFloat(limpo);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function cell(sheet: XLSX.WorkSheet, addr: string): unknown {
  return sheet[addr]?.v;
}

// ---------- VENDEDORES EXTERNO (Jan-Abr): blocos por cidade ----------

function extrairVendedoresExterno(
  sheet: XLSX.WorkSheet,
  dataInicio: number,
  dataFim: number,
  cancelCol: string
): Entrada[] {
  const entradas: Entrada[] = [];
  let cidadeAtual = "";
  for (let r = dataInicio; r <= dataFim; r++) {
    const nome = strOf(cell(sheet, `C${r}`));
    if (!nome) continue;
    const cidadeCel = strOf(cell(sheet, `A${r}`));
    if (cidadeCel) cidadeAtual = cidadeCel;

    const metaRaw = cell(sheet, `L${r}`);
    const superMetaRaw = cell(sheet, `M${r}`);
    entradas.push({
      nome,
      cargo: "VENDEDOR_EXTERNO",
      cidade: cidadeAtual,
      quantidade: num(cell(sheet, `D${r}`)),
      aprovado: num(cell(sheet, `E${r}`)),
      cancelado: num(cell(sheet, `${cancelCol}${r}`)),
      valorInstalado: num(cell(sheet, `K${r}`)),
      valorMeta: typeof metaRaw === "number" ? metaRaw : 0,
      valorSuperMeta: typeof superMetaRaw === "number" ? superMetaRaw : 0,
    });
  }
  return entradas;
}

function extrairSupervisorEAcaoComercial(
  sheet: XLSX.WorkSheet,
  supervisorRow: number | null,
  acaoComercialRows: number[],
  colNome: string,
  colValor: string
): Ajuste[] {
  const ajustes: Ajuste[] = [];
  if (supervisorRow) {
    const nome = strOf(cell(sheet, `${colNome}${supervisorRow}`));
    const valor = num(cell(sheet, `${colValor}${supervisorRow}`));
    if (nome) {
      ajustes.push({ nome, cargo: "SUPERVISOR", descricao: "Bônus de supervisor geral (histórico)", valor });
    }
  }
  for (const r of acaoComercialRows) {
    const nome = strOf(cell(sheet, `${colNome}${r}`));
    const valor = num(cell(sheet, `${colValor}${r}`));
    if (nome) {
      ajustes.push({ nome, cargo: "OUTRO_SETOR", descricao: "Ação comercial (histórico)", valor });
    }
  }
  return ajustes;
}

// ---------- CHIPS - ATENDIMENTO E ADM (Jan-Maio) ----------

function extrairChips(sheet: XLSX.WorkSheet, dataInicio: number, dataFim: number): Entrada[] {
  const entradas: Entrada[] = [];
  for (let r = dataInicio; r <= dataFim; r++) {
    const nome = strOf(cell(sheet, `B${r}`));
    if (!nome) continue;
    entradas.push({
      nome,
      cargo: "ATENDIMENTO_ADM",
      cidade: strOf(cell(sheet, `C${r}`)) || undefined,
      quantidade: num(cell(sheet, `D${r}`)),
      valorInstalado: num(cell(sheet, `G${r}`)),
      valorBase: num(cell(sheet, `H${r}`)),
    });
  }
  return entradas;
}

// ---------- OUTROS SETORES (Maio) ----------

function extrairOutrosSetores(sheet: XLSX.WorkSheet, dataInicio: number, dataFim: number): Entrada[] {
  const entradas: Entrada[] = [];
  for (let r = dataInicio; r <= dataFim; r++) {
    const nome = strOf(cell(sheet, `A${r}`));
    if (!nome) continue;
    entradas.push({
      nome,
      cargo: "OUTRO_SETOR",
      quantidade: num(cell(sheet, `C${r}`)),
      aprovado: num(cell(sheet, `D${r}`)),
      cancelado: num(cell(sheet, `E${r}`)),
      valorInstalado: num(cell(sheet, `F${r}`)),
      valorBase: num(cell(sheet, `G${r}`)),
    });
  }
  return entradas;
}

// ---------- Folha6 (Maio) / EXTERNO-JUNHO (Junho): blocos de equipe ----------

function extrairEquipesProduto(sheet: XLSX.WorkSheet, inicio: number, fim: number): Entrada[] {
  const entradas: Entrada[] = [];
  let r = inicio;
  while (r <= fim) {
    const bVal = strOf(cell(sheet, `B${r}`)).toUpperCase();
    if (!bVal.startsWith("EQUIPE")) {
      r++;
      continue;
    }

    // r = linha de cabeçalho do bloco (data + nome da equipe); pessoas começam em r+2
    let personRow = r + 2;
    let cidadeAtual = "";
    const pessoasDoBloco: Entrada[] = [];

    while (personRow <= fim) {
      const bNome = strOf(cell(sheet, `B${personRow}`));
      if (!bNome || bNome.toUpperCase().startsWith("TOTAL")) break;

      const cidadeCel = strOf(cell(sheet, `A${personRow}`));
      if (cidadeCel) cidadeAtual = cidadeCel;

      const metaRaw = cell(sheet, `K${personRow}`);
      const superMetaRaw = cell(sheet, `L${personRow}`);
      pessoasDoBloco.push({
        nome: bNome,
        cargo: "VENDEDOR_EXTERNO",
        cidade: cidadeAtual,
        qtdInternet: num(cell(sheet, `D${personRow}`)),
        qtdChip: num(cell(sheet, `E${personRow}`)),
        qtdGps: num(cell(sheet, `F${personRow}`)),
        qtdStreaming: num(cell(sheet, `G${personRow}`)),
        qtdTelefoniaFixa: num(cell(sheet, `H${personRow}`)),
        quantidade: num(cell(sheet, `I${personRow}`)),
        aprovado: num(cell(sheet, `I${personRow}`)),
        valorInstalado: num(cell(sheet, `J${personRow}`)),
        valorMeta: typeof metaRaw === "number" ? metaRaw : 0,
        valorSuperMeta: typeof superMetaRaw === "number" ? superMetaRaw : 0,
      });
      personRow++;
    }

    // personRow está na linha "TOTAL"; procurar "VALOR A RECEBER" do líder da equipe nas próximas linhas
    let valorLider = 0;
    for (let i = 1; i <= 6 && personRow + i <= fim; i++) {
      const label = strOf(cell(sheet, `A${personRow + i}`)).toUpperCase();
      if (label.startsWith("VALOR A RECEBER")) {
        valorLider = num(cell(sheet, `B${personRow + i}`));
        break;
      }
      if (label.startsWith("EQUIPE")) break;
    }
    if (pessoasDoBloco.length > 0) {
      pessoasDoBloco[0].valorSupervisor = valorLider;
    }
    entradas.push(...pessoasDoBloco);
    r = personRow;
  }
  return entradas;
}

function extrairTailSupervisorAcaoComercial(
  sheet: XLSX.WorkSheet,
  inicio: number,
  fim: number
): Ajuste[] {
  const ajustes: Ajuste[] = [];
  for (let r = inicio; r <= fim; r++) {
    const label = strOf(cell(sheet, `A${r}`)).toUpperCase();
    const nome = strOf(cell(sheet, `B${r}`));
    const valor = num(cell(sheet, `C${r}`));
    if (!nome) continue;
    if (label.startsWith("SUPERVISOR")) {
      ajustes.push({ nome, cargo: "SUPERVISOR", descricao: "Bônus de supervisor geral (histórico)", valor });
    } else if (label.startsWith("AÇÃO COMERCIAL") || label.startsWith("A��O COMERCIAL")) {
      ajustes.push({ nome, cargo: "OUTRO_SETOR", descricao: "Ação comercial (histórico)", valor });
    }
  }
  return ajustes;
}

// ---------- Montagem dos 6 meses ----------

function montarMeses(wb: XLSX.WorkBook): MesMigrado[] {
  const vendedores = wb.Sheets["VENDEDORES EXTERNO"];
  const chips = wb.Sheets["CHIPS - ATENDIMENTO E ADM"];
  const outrosSetores = wb.Sheets["OUTROS SETORES"];
  const folha6 = wb.Sheets["Folha6"];
  const externoJunho = wb.Sheets["EXTERNO- JUNHO "];

  const meses: MesMigrado[] = [];

  // JANEIRO
  meses.push({
    periodo: "2026-01",
    entradas: [
      ...extrairVendedoresExterno(vendedores, 4, 16, "I"),
      ...extrairChips(chips, 4, 9),
    ],
    ajustes: [],
  });

  // FEVEREIRO
  meses.push({
    periodo: "2026-02",
    entradas: [
      ...extrairVendedoresExterno(vendedores, 22, 29, "I"),
      ...extrairChips(chips, 22, 33),
    ],
    ajustes: extrairSupervisorEAcaoComercial(vendedores, 33, [35, 36, 37], "C", "D"),
  });

  // MARÇO
  meses.push({
    periodo: "2026-03",
    entradas: [
      ...extrairVendedoresExterno(vendedores, 42, 59, "I"),
      ...extrairChips(chips, 46, 61),
    ],
    ajustes: extrairSupervisorEAcaoComercial(vendedores, 63, [65, 66, 67], "C", "D"),
  });

  // ABRIL (inclui bloco EQUIPE DE TELEFONIA MÓVEL, categoria própria)
  const equipeTelefoniaMovel: Entrada[] = [];
  for (let r = 84; r <= 88; r++) {
    const nome = strOf(cell(vendedores, `A${r}`));
    if (!nome) continue;
    equipeTelefoniaMovel.push({
      nome,
      cargo: "ATENDIMENTO_ADM",
      quantidade: num(cell(vendedores, `C${r}`)),
      aprovado: num(cell(vendedores, `K${r}`)),
      cancelado: num(cell(vendedores, `L${r}`)),
      qtdInternet: num(cell(vendedores, `I${r}`)),
      valorInstalado: num(cell(vendedores, `M${r}`)),
      valorBase: num(cell(vendedores, `N${r}`)),
    });
  }
  meses.push({
    periodo: "2026-04",
    entradas: [
      ...extrairVendedoresExterno(vendedores, 72, 76, "F"),
      ...equipeTelefoniaMovel,
      ...extrairChips(chips, 76, 92),
    ],
    ajustes: extrairSupervisorEAcaoComercial(vendedores, 93, [95, 96, 97], "C", "D"),
  });

  // MAIO — fonte única: Folha6 (+ CHIPS + OUTROS SETORES)
  const chipsMaioAnomalia: Entrada = {
    nome: "Verônica Roseno Meireles",
    cargo: "ATENDIMENTO_ADM",
    cidade: "Guarabira",
    quantidade: num(cell(chips, "C131")),
    valorInstalado: num(cell(chips, "F131")),
    valorBase: num(cell(chips, "G131")),
  };
  // Bloco órfão nas linhas 19-21 da Folha6, rotulado "BONIFICAÇÃO DE ABRIL" mas
  // que soma no total declarado de MAIO (D4=6895) — sem nome associado, logo
  // após o bloco da Equipe João Marcelo. Atribuído a João Marcelo Fernandes.
  const bonusOrfaoMaio: Ajuste = {
    nome: "João Marcelo Fernandes",
    cargo: "VENDEDOR_EXTERNO",
    descricao: 'Bônus de supervisor — bloco rotulado "BONIFICAÇÃO DE ABRIL" na aba de maio (histórico, verificar)',
    valor: num(cell(folha6, "B21")),
  };
  meses.push({
    periodo: "2026-05",
    entradas: [
      ...extrairEquipesProduto(folha6, 7, 150),
      ...extrairChips(chips, 108, 128),
      chipsMaioAnomalia,
      ...extrairOutrosSetores(outrosSetores, 4, 5),
    ],
    ajustes: [...extrairTailSupervisorAcaoComercial(folha6, 145, 149), bonusOrfaoMaio],
  });

  // JUNHO — fonte única: EXTERNO- JUNHO (+ agregado avulso da aba VENDEDORES EXTERNO)
  const agregadoJunho: Ajuste = {
    nome: strOf(cell(vendedores, "A161")),
    cargo: "OUTRO_SETOR",
    descricao: "Venda agregado (histórico)",
    valor: num(cell(vendedores, "F161")),
  };
  meses.push({
    periodo: "2026-06",
    entradas: [...extrairEquipesProduto(externoJunho, 7, 142)],
    ajustes: [...extrairTailSupervisorAcaoComercial(externoJunho, 138, 142), agregadoJunho],
  });

  return meses;
}

// ---------- Persistência ----------

async function obterOuCriarFuncionario(
  cache: Map<string, string>,
  cidadeCache: Map<string, string>,
  nome: string,
  cargo: Cargo,
  cidade?: string
): Promise<string> {
  const chave = normalizarTexto(nome);
  const existente = cache.get(chave);
  if (existente) return existente;

  let cidadeId: string | undefined;
  if (cidade) {
    const chaveCidade = normalizarTexto(cidade);
    cidadeId = cidadeCache.get(chaveCidade);
    if (!cidadeId) {
      const c = await prisma.cidade.upsert({
        where: { nome: cidade },
        update: {},
        create: { nome: cidade },
      });
      cidadeId = c.id;
      cidadeCache.set(chaveCidade, c.id);
    }
  }

  const f = await prisma.funcionario.create({
    data: { nome: nome.trim(), cargo, cidadeId },
  });
  cache.set(chave, f.id);
  return f.id;
}

async function main() {
  console.log(`Lendo arquivo: ${ARQUIVO}`);
  const wb = XLSX.readFile(ARQUIVO);
  const meses = montarMeses(wb);

  const funcionarioCache = new Map<string, string>();
  const cidadeCache = new Map<string, string>();

  // Pré-carrega funcionários/cidades já existentes no banco para que o script
  // seja idempotente e não crie duplicatas ao rodar mais de uma vez.
  const [funcionariosExistentes, cidadesExistentes] = await Promise.all([
    prisma.funcionario.findMany(),
    prisma.cidade.findMany(),
  ]);
  for (const f of funcionariosExistentes) funcionarioCache.set(normalizarTexto(f.nome), f.id);
  for (const c of cidadesExistentes) cidadeCache.set(normalizarTexto(c.nome), c.id);
  console.log(`Pré-carregados: ${funcionariosExistentes.length} funcionário(s), ${cidadesExistentes.length} cidade(s) já existentes.`);

  for (const mes of meses) {
    console.log(`\n=== Migrando ${mes.periodo} (${mes.entradas.length} entradas, ${mes.ajustes.length} ajustes) ===`);

    let valorTotalVendido = 0;
    let valorTotalBonificacao = 0;

    const fechamento = await prisma.fechamentoMensal.upsert({
      where: { periodo: mes.periodo },
      update: {},
      create: { periodo: mes.periodo, status: "ABERTO" },
    });

    for (const e of mes.entradas) {
      const funcionarioId = await obterOuCriarFuncionario(funcionarioCache, cidadeCache, e.nome, e.cargo, e.cidade);

      await prisma.lancamentoVenda.create({
        data: {
          funcionarioId,
          periodo: mes.periodo,
          quantidade: Math.round(e.quantidade ?? 0),
          aprovado: Math.round(e.aprovado ?? 0),
          cancelado: Math.round(e.cancelado ?? 0),
          valorInstalado: e.valorInstalado ?? 0,
          qtdInternet: Math.round(e.qtdInternet ?? 0),
          qtdChip: Math.round(e.qtdChip ?? 0),
          qtdGps: Math.round(e.qtdGps ?? 0),
          qtdStreaming: Math.round(e.qtdStreaming ?? 0),
          qtdTelefoniaFixa: Math.round(e.qtdTelefoniaFixa ?? 0),
          origem: "HISTORICO",
        },
      });

      // Estes meses são um import histórico (planilha 2026) de fechamentos já
      // FECHADOS. O breakdown antigo (base/meta/super-meta) não tem equivalente
      // exato no novo modelo por serviço, então o bônus não-supervisor é
      // consolidado em `valorDemais` (bucket genérico) — o que importa aqui é
      // preservar o Total e o valor de Supervisor de cada mês congelado.
      const valorHistorico = (e.valorBase ?? 0) + (e.valorMeta ?? 0) + (e.valorSuperMeta ?? 0);
      const valorSupervisor = e.valorSupervisor ?? 0;
      const valorTotal = valorHistorico + valorSupervisor;

      await prisma.bonificacaoCalculada.upsert({
        where: { fechamentoId_funcionarioId: { fechamentoId: fechamento.id, funcionarioId } },
        update: {
          valorDemais: { increment: valorHistorico },
          valorSupervisor: { increment: valorSupervisor },
          valorTotal: { increment: valorTotal },
        },
        create: {
          fechamentoId: fechamento.id,
          funcionarioId,
          valorDemais: valorHistorico,
          valorSupervisor,
          valorTotal,
          detalhesJson: { legado: true, origem: "planilha 2026" },
        },
      });

      valorTotalVendido += e.valorInstalado ?? 0;
      valorTotalBonificacao += valorTotal;
    }

    for (const a of mes.ajustes) {
      if (!a.nome || a.valor === 0) continue;
      const funcionarioId = await obterOuCriarFuncionario(funcionarioCache, cidadeCache, a.nome, a.cargo);
      await prisma.ajuste.create({
        data: {
          funcionarioId,
          fechamentoId: fechamento.id,
          periodo: mes.periodo,
          descricao: a.descricao,
          valor: a.valor,
        },
      });
      valorTotalBonificacao += a.valor;
    }

    await prisma.fechamentoMensal.update({
      where: { id: fechamento.id },
      data: { status: "FECHADO", valorTotalVendido, valorTotalBonificacao },
    });

    console.log(`Total vendido: R$ ${valorTotalVendido.toFixed(2)} | Total bonificação: R$ ${valorTotalBonificacao.toFixed(2)}`);
  }

  console.log("\nMigração concluída.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
