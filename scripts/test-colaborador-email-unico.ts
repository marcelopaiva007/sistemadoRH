// Teste TDD — Unicidade de E-mail no Grupo e Alerta de Duplicados
//
// Regras testadas:
// 1. Normalização de e-mail (trim + lowercase, vazio -> null)
// 2. Conflito entre pessoas (só permite mesmo e-mail se ambos tiverem o mesmo CPF válido de 11 dígitos)
// 3. Resolução de empresas do grupo (Empresa -> Marca -> grupoId)
// 4. Validação no banco (validarEmailColaboradorLivre) com mock de Prisma
// 5. Busca de conflitos fora da tela (buscarConflitosDeEmailNoGrupo)
// 6. Integração com encontrarDuplicados (lib/duplicados.ts)

import {
  normalizarEmailColaborador,
  ehConflitoDeEmailEntrePessoas,
  empresaIdsDoGrupoDaEmpresa,
  validarEmailColaboradorLivre,
  buscarConflitosDeEmailNoGrupo,
  type DbClient,
} from "../lib/colaborador-email";
import { encontrarDuplicados, type PessoaParaComparar } from "../lib/duplicados";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

async function run() {
  console.log("\n1. Normalização de e-mail\n");
  ok(
    normalizarEmailColaborador("  Fulano@Empresa.COM ") === "fulano@empresa.com",
    "trim e lowercase em e-mail válido",
  );
  ok(normalizarEmailColaborador("") === null, "string vazia vira null");
  ok(normalizarEmailColaborador("   ") === null, "somente espaços vira null");
  ok(normalizarEmailColaborador(null) === null, "null vira null");
  ok(normalizarEmailColaborador(undefined) === null, "undefined vira null");
  ok(
    normalizarEmailColaborador("colab.silva+dp@gmail.com") === "colab.silva+dp@gmail.com",
    "preserva tags e pontuação",
  );

  console.log("\n2. Conflito de e-mail entre pessoas (função pura)\n");
  ok(
    !ehConflitoDeEmailEntrePessoas(
      { id: "c1", cpf: "12345678901" },
      { id: "c1", cpf: "12345678901" },
    ),
    "mesmo id não conflita consigo mesmo",
  );
  ok(
    !ehConflitoDeEmailEntrePessoas(
      { id: "c1", cpf: "123.456.789-01" },
      { id: "c2", cpf: "12345678901" },
    ),
    "mesmo CPF de 11 dígitos (com/sem máscara) NÃO gera conflito (mesma pessoa física)",
  );
  ok(
    ehConflitoDeEmailEntrePessoas(
      { id: "c1", cpf: "11111111111" },
      { id: "c2", cpf: "22222222222" },
    ),
    "CPFs distintos geram conflito",
  );
  ok(
    ehConflitoDeEmailEntrePessoas(
      { id: "c1", cpf: null },
      { id: "c2", cpf: "22222222222" },
    ),
    "um sem CPF e outro com CPF gera conflito",
  );
  ok(
    ehConflitoDeEmailEntrePessoas(
      { id: "c1", cpf: null },
      { id: "c2", cpf: null },
    ),
    "ambos sem CPF geram conflito",
  );
  ok(
    ehConflitoDeEmailEntrePessoas(
      { id: "c1", cpf: "123" },
      { id: "c2", cpf: "123" },
    ),
    "CPF inválido (< 11 dígitos) não é aceito como prova de mesma pessoa -> conflito",
  );

  console.log("\n3. Resolução de empresas do grupo (empresaIdsDoGrupoDaEmpresa)\n");
  const mockDbGrupo = {
    empresa: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "emp-1" || where.id === "emp-2" || where.id === "emp-3") {
          return { marca: { grupoId: "grupo-alpha" } };
        }
        if (where.id === "emp-avulsa") {
          return { marca: { grupoId: null } };
        }
        return null;
      },
      findMany: async ({ where }: { where: { marca: { grupoId: string } } }) => {
        if (where.marca.grupoId === "grupo-alpha") {
          return [{ id: "emp-1" }, { id: "emp-2" }, { id: "emp-3" }];
        }
        return [];
      },
    },
  };

  const idsAlpha = await empresaIdsDoGrupoDaEmpresa(mockDbGrupo as unknown as DbClient, "emp-1");
  ok(
    idsAlpha.sort().join(",") === "emp-1,emp-2,emp-3",
    "retorna todos os empresaIds das marcas pertencentes ao grupo",
  );

  const idsAvulsa = await empresaIdsDoGrupoDaEmpresa(mockDbGrupo as unknown as DbClient, "emp-avulsa");
  ok(
    idsAvulsa.length === 1 && idsAvulsa[0] === "emp-avulsa",
    "empresa sem grupo retorna apenas a si mesma",
  );

  console.log("\n4. Validação de e-mail livre (validarEmailColaboradorLivre)\n");
  const mockColaboradoresDb = [
    {
      id: "colab-10",
      empresaId: "emp-1",
      nome: "Carlos Eduardo",
      cpf: "11111111111",
      email: "carlos@grupo.com",
      ativo: true,
      empresa: {
        nome: "Empresa 1",
        marca: { nome: "Marca Alpha" },
      },
    },
    {
      id: "colab-20",
      empresaId: "emp-2",
      nome: "Renata Dias",
      cpf: "22222222222",
      email: "renata@grupo.com",
      ativo: false,
      empresa: {
        nome: "Empresa 2",
        marca: { nome: "Marca Beta" },
      },
    },
  ];

  const mockDbColaborador = {
    empresa: mockDbGrupo.empresa,
    colaborador: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const empresaIdFilter = where.empresaId as { in?: string[] } | undefined;
        const idFilter = where.id as { not?: string } | undefined;
        const emailFilter = where.email as { equals?: string } | string | undefined;
        const orFilter = where.OR as Array<{ email?: { equals?: string } | string }> | undefined;

        return mockColaboradoresDb.filter((c) => {
          if (empresaIdFilter?.in && !empresaIdFilter.in.includes(c.empresaId)) return false;
          if (idFilter?.not && c.id === idFilter.not) return false;
          if (emailFilter) {
            const buscado = (typeof emailFilter === "string" ? emailFilter : emailFilter.equals ?? "").toLowerCase();
            if (c.email.toLowerCase() !== buscado) return false;
          }
          if (orFilter) {
            const casou = orFilter.some((clause) => {
              if (clause.email) {
                const b = (typeof clause.email === "string" ? clause.email : clause.email.equals ?? "").toLowerCase();
                return c.email.toLowerCase() === b;
              }
              return false;
            });
            if (!casou) return false;
          }
          return true;
        });
      },
    },
  };

  const erroInexistente = await validarEmailColaboradorLivre(mockDbColaborador as unknown as DbClient, {
    empresaId: "emp-1",
    email: "novo@grupo.com",
    cpfProprio: "33333333333",
  });
  ok(erroInexistente === null, "e-mail novo não gera erro");

  const erroVazio = await validarEmailColaboradorLivre(mockDbColaborador as unknown as DbClient, {
    empresaId: "emp-1",
    email: "   ",
  });
  ok(erroVazio === null, "e-mail vazio ou null não gera erro");

  const erroMesmoCpf = await validarEmailColaboradorLivre(mockDbColaborador as unknown as DbClient, {
    empresaId: "emp-2",
    email: "carlos@grupo.com",
    cpfProprio: "111.111.111-11", // mesmo CPF de Carlos Eduardo
  });
  ok(erroMesmoCpf === null, "mesmo e-mail para mesma pessoa física (mesmo CPF) é permitido");

  const erroPropriaFicha = await validarEmailColaboradorLivre(mockDbColaborador as unknown as DbClient, {
    empresaId: "emp-1",
    email: "carlos@grupo.com",
    colaboradorIdExcluir: "colab-10",
    cpfProprio: null,
  });
  ok(erroPropriaFicha === null, "editar a própria ficha mantendo o e-mail não gera conflito");

  const erroConflitoAtivo = await validarEmailColaboradorLivre(mockDbColaborador as unknown as DbClient, {
    empresaId: "emp-2",
    email: "carlos@grupo.com",
    cpfProprio: "99999999999",
  });
  ok(
    erroConflitoAtivo !== null &&
      erroConflitoAtivo.includes("Carlos Eduardo") &&
      erroConflitoAtivo.includes("Marca Alpha") &&
      erroConflitoAtivo.includes("Empresa 1") &&
      !erroConflitoAtivo.includes("desligado"),
    "conflito com ativo informa nome, marca, empresa e não diz desligado",
  );

  const erroConflitoDesligado = await validarEmailColaboradorLivre(mockDbColaborador as unknown as DbClient, {
    empresaId: "emp-1",
    email: "renata@grupo.com",
    cpfProprio: "99999999999",
  });
  ok(
    erroConflitoDesligado !== null &&
      erroConflitoDesligado.includes("Renata Dias") &&
      erroConflitoDesligado.includes("Marca Beta") &&
      erroConflitoDesligado.includes("Empresa 2") &&
      erroConflitoDesligado.includes("desligado"),
    "conflito com inativo em outra marca informa nome, marca, empresa e indica 'desligado'",
  );

  console.log("\n5. Busca de conflitos fora da tela (buscarConflitosDeEmailNoGrupo)\n");
  const conflitosExternos = await buscarConflitosDeEmailNoGrupo(
    mockDbColaborador as unknown as DbClient,
    ["emp-1"], // tela exibe apenas emp-1
    [
      { id: "colab-tela-1", cpf: "88888888888", email: "renata@grupo.com" }, // colide com colab-20 da emp-2
      { id: "colab-tela-2", cpf: "11111111111", email: "carlos@grupo.com" }, // não colide pois emp-1 está na tela
      { id: "colab-tela-3", cpf: "77777777777", email: "livre@grupo.com" },
    ],
  );
  ok(conflitosExternos.length === 1, "retorna exatamente 1 conflito externo");
  ok(
    conflitosExternos[0]?.email === "renata@grupo.com" &&
      conflitosExternos[0]?.outroColaborador.nome === "Renata Dias" &&
      conflitosExternos[0]?.outroColaborador.empresaNome === "Empresa 2",
    "detalha o colaborador externo causador do conflito",
  );

  console.log("\n6. Integração com encontrarDuplicados (lib/duplicados.ts)\n");
  const basePessoas: PessoaParaComparar[] = [
    {
      id: "p1",
      nome: "Lucas Mendes",
      telefone: "83988881111",
      cpf: "11111111111",
      email: "lucas@empresa.com",
      setorNome: "TI",
      ativo: true,
      temTelegram: false,
    },
    {
      id: "p2",
      nome: "Marcos Lima",
      telefone: "83988882222",
      cpf: "22222222222",
      email: "lucas@empresa.com", // mesmo email de p1, CPFs diferentes
      setorNome: "Operações",
      ativo: true,
      temTelegram: false,
    },
  ];

  const dup = encontrarDuplicados(basePessoas);
  const porEmail = dup.filter((g) => g.motivo === "Mesmo e-mail");
  ok(porEmail.length === 1, "detecta duplicata por 'Mesmo e-mail' para CPFs distintos");
  ok(
    porEmail[0]?.pessoas.map((p) => p.id).sort().join(",") === "p1,p2" ||
      porEmail[0]?.pessoas.some((p) => p.id === "p2"),
    "inclui pessoa com CPF distinto que compartilha o e-mail",
  );
  ok(
    porEmail[0]?.gravidade === "alta",
    "duas pessoas ativas com mesmo e-mail e CPFs distintos é gravidade alta",
  );

  // Um ativo e um desligado dividindo e-mail com CPFs distintos
  const emailAtivoDesligado = encontrarDuplicados([
    {
      id: "d1",
      nome: "Ana Beatriz",
      telefone: "83911110001",
      cpf: "33333333333",
      email: "ana@empresa.com",
      setorNome: "RH",
      ativo: true,
      temTelegram: false,
    },
    {
      id: "d2",
      nome: "Beatriz Santos",
      telefone: "83911110002",
      cpf: "44444444444",
      email: "ana@empresa.com",
      setorNome: "Financeiro",
      ativo: false,
      temTelegram: false,
    },
  ]);
  const dupAtivoDesligado = emailAtivoDesligado.filter((g) => g.motivo === "Mesmo e-mail");
  ok(dupAtivoDesligado.length === 1, "detecta duplicata de e-mail entre ativo e desligado");
  ok(
    dupAtivoDesligado[0]?.gravidade === "media",
    "ativo + desligado com CPFs distintos e mesmo e-mail é gravidade media",
  );

  // Sem falso positivo para quem tem o mesmo CPF (recontratação/duplo vínculo)
  const mesmoCpfDuplo = encontrarDuplicados([
    {
      id: "m1",
      nome: "João Silva",
      telefone: "83999990001",
      cpf: "55555555555",
      email: "joao@empresa.com",
      setorNome: "Vendas",
      ativo: true,
      temTelegram: false,
    },
    {
      id: "m2",
      nome: "João Silva Filho",
      telefone: "83999990002",
      cpf: "55555555555",
      email: "joao@empresa.com",
      setorNome: "Vendas",
      ativo: false,
      temTelegram: false,
    },
  ]);
  const falsoPositivoEmail = mesmoCpfDuplo.filter((g) => g.motivo === "Mesmo e-mail");
  ok(
    falsoPositivoEmail.length === 0,
    "NÃO gera grupo 'Mesmo e-mail' quando o par tem o mesmo CPF (já agrupado em Mesmo CPF)",
  );

  console.log(falhas === 0 ? "\n✅ E-mail único: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
