// Confere as ferramentas do assistente contra o banco real. READ-ONLY —
// nenhuma delas escreve, então não precisa de rollback.
//
// O que este script NÃO cobre: a conversa com o modelo. Isso depende de
// ANTHROPIC_API_KEY e só dá para testar depois que a chave existir. O que dá
// para provar aqui é o que mais importa em termos de risco: as ferramentas
// rodam, respeitam o limite e NUNCA vazam dado de outra empresa.
//
//   npx tsx scripts/verificar-assistente.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { FERRAMENTAS, executarFerramenta } from "../lib/assistente/ferramentas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

async function main() {
  const empresas = await prisma.empresa.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  if (empresas.length < 2) throw new Error("São necessárias ao menos 2 empresas para testar o isolamento.");

  const [empresaA, empresaB] = empresas;
  console.log(`Empresa A: ${empresaA.nome} · Empresa B: ${empresaB.nome}\n`);

  console.log("1. Toda ferramenta declarada executa sem estourar");
  const entradasDeTeste: Record<string, Record<string, unknown>> = {
    contar_colaboradores: {},
    headcount_por_setor: {},
    buscar_colaborador: { nome: "a" },
    ferias_no_periodo: { inicio: "2026-01-01", fim: "2026-12-31" },
    aniversariantes_do_mes: { mes: 7 },
    aniversarios_de_empresa: { mes: 7 },
    conformidade_irregular: {},
    pendencias_da_empresa: {},
    vagas_e_candidatos: {},
  };

  for (const f of FERRAMENTAS) {
    const entrada = entradasDeTeste[f.name];
    if (!entrada) {
      falhas++;
      console.error(`  ✗ FALHOU: ferramenta "${f.name}" declarada mas sem caso de teste aqui`);
      continue;
    }
    try {
      const r = await executarFerramenta(empresaA.id, f.name, entrada);
      ok(r !== undefined && r !== null, `${f.name} respondeu`);
    } catch (e) {
      falhas++;
      console.error(`  ✗ FALHOU: ${f.name} estourou —`, (e as Error).message);
    }
  }

  console.log("\n2. Ferramenta desconhecida não quebra, devolve erro");
  {
    const r = (await executarFerramenta(empresaA.id, "apagar_tudo", {})) as Record<string, unknown>;
    ok(typeof r.erro === "string", "nome de ferramenta inventado devolve { erro }, não exceção");
  }

  console.log("\n3. Isolamento entre empresas");
  {
    const nomesA = (await executarFerramenta(empresaA.id, "buscar_colaborador", { nome: "a" })) as {
      nome: string;
    }[];
    const nomesB = (await executarFerramenta(empresaB.id, "buscar_colaborador", { nome: "a" })) as {
      nome: string;
    }[];

    const colaboradoresDeA = new Set(
      (await prisma.colaborador.findMany({ where: { empresaId: empresaA.id }, select: { nome: true } })).map(
        (c) => c.nome,
      ),
    );
    const colaboradoresDeB = new Set(
      (await prisma.colaborador.findMany({ where: { empresaId: empresaB.id }, select: { nome: true } })).map(
        (c) => c.nome,
      ),
    );

    ok(
      nomesA.every((p) => colaboradoresDeA.has(p.nome)),
      `busca na empresa A só devolveu gente da A (${nomesA.length} resultado(s))`,
    );
    ok(
      nomesB.every((p) => colaboradoresDeB.has(p.nome)),
      `busca na empresa B só devolveu gente da B (${nomesB.length} resultado(s))`,
    );

    const contA = (await executarFerramenta(empresaA.id, "contar_colaboradores", {})) as { total: number };
    const realA = await prisma.colaborador.count({ where: { empresaId: empresaA.id, ativo: true } });
    ok(contA.total === realA, `contagem da empresa A bate com o banco (${realA})`);
  }

  console.log("\n4. Validação de entrada");
  {
    const mesRuim = (await executarFerramenta(empresaA.id, "aniversariantes_do_mes", { mes: 13 })) as Record<
      string,
      unknown
    >;
    ok(typeof mesRuim.erro === "string", "mês 13 é recusado");

    const dataRuim = (await executarFerramenta(empresaA.id, "ferias_no_periodo", {
      inicio: "ontem",
      fim: "hoje",
    })) as Record<string, unknown>;
    ok(typeof dataRuim.erro === "string", "data em texto livre é recusada");

    const semNome = (await executarFerramenta(empresaA.id, "buscar_colaborador", { nome: "  " })) as Record<
      string,
      unknown
    >;
    ok(typeof semNome.erro === "string", "busca sem nome é recusada");
  }

  console.log("\n5. Limite de resultados");
  {
    const todos = (await executarFerramenta(empresaA.id, "buscar_colaborador", { nome: "a" })) as unknown[];
    ok(todos.length <= 50, `busca ampla ficou dentro do teto de 50 (${todos.length})`);
  }

  console.log(falhas === 0 ? "\nTodas as verificações passaram." : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
