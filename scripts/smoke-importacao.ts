// Fumaça do importador de colaboradores (Fase 6, etapa C).
//
// Parte 1 — validação pura (sem banco): cada regra de linha exercitada com uma
// planilha sintética que mistura acertos e todos os tipos de erro.
// Parte 2 — contra o banco de verdade, em transação com rollback: o
// planejamento criar/atualizar casando por CPF e por matrícula.
//
//   npx tsx scripts/smoke-importacao.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gerarCsv } from "../lib/csv";
import { validarPlanilhaColaboradores } from "../lib/importacao-colaboradores";

class RollbackProposital extends Error {}

let falhas = 0;
function conferir(condicao: boolean, mensagem: string) {
  if (!condicao) {
    console.log(`  FALHOU — ${mensagem}`);
    falhas++;
  } else {
    console.log(`  ok — ${mensagem}`);
  }
}

// ------------------------------------------------------------- parte 1: pura

console.log("validação da planilha (sem banco)");

// CPF válido de teste: 111.444.777-35 (dígitos verificadores corretos).
const csv = gerarCsv(
  ["Nome", "CPF", "Setor", "Cargo", "Data Admissão", "Salário Base", "Tipo Contrato"],
  [
    ["Maria Boa", "111.444.777-35", "Comercial", "Vendedora", "01/03/2026", "2.500,00", "CLT"],
    ["João Sem CPF", "", "Técnico", "Instalador", "", "", ""],
    ["Ana CPF Ruim", "111.444.777-99", "Comercial", "Vendedora", "", "", ""],
    ["Beto Data Ruim", "", "Técnico", "Instalador", "31/02/2026", "", ""],
    ["Carla Salário Ruim", "", "Técnico", "Instaladora", "", "abc", ""],
    ["Duda Contrato Ruim", "", "Técnico", "Instaladora", "", "", "MENSALISTA"],
    ["", "", "Técnico", "Instalador", "", "", ""],
    ["Edu Duplicado", "111.444.777-35", "Técnico", "Instalador", "", "", ""],
  ],
);
const bytes = new TextEncoder().encode(csv);
const r = validarPlanilhaColaboradores(bytes, null);

conferir(r.erroGeral === null, "planilha com as colunas obrigatórias passa da triagem");
conferir(r.validas.length === 2, `2 linhas válidas (veio ${r.validas.length})`);
conferir(r.problemas.length === 6, `6 linhas com problema (veio ${r.problemas.length})`);
conferir(r.validas[0].salarioBase === 2500, "salário \"2.500,00\" vira 2500");
conferir(r.validas[0].dataAdmissao === "2026-03-01", "data brasileira vira ISO");
conferir(r.validas[0].cpf === "11144477735", "CPF guardado só com dígitos");

const mensagensDe = (nome: string) =>
  r.problemas.find((p) => p.nome === nome)?.mensagens.join("; ") ?? "(linha não achada)";
conferir(mensagensDe("Ana CPF Ruim").includes("inválido"), "CPF com dígito errado é apontado");
conferir(mensagensDe("Beto Data Ruim").includes("não existe no calendário"), "31/02 é apontado");
conferir(mensagensDe("Carla Salário Ruim").includes("não é um número"), "salário 'abc' é apontado");
conferir(mensagensDe("Duda Contrato Ruim").includes("não reconhecido"), "contrato desconhecido é apontado");
conferir(mensagensDe("Edu Duplicado").includes("repetido"), "CPF repetido aponta a linha original");

// Coluna obrigatória ausente
const semSetor = validarPlanilhaColaboradores(
  new TextEncoder().encode(gerarCsv(["Nome", "Cargo"], [["X", "Y"]])),
  null,
);
conferir(semSetor.erroGeral !== null && semSetor.erroGeral.includes("setor"), "falta de coluna obrigatória é erro geral");

// CNPJ na linha sem CNPJ na empresa
const comCnpj = validarPlanilhaColaboradores(
  new TextEncoder().encode(
    gerarCsv(["Nome", "Setor", "Cargo", "CNPJ"], [["X", "S", "C", "33.000.167/0001-01"]]),
  ),
  null,
);
conferir(
  comCnpj.problemas[0]?.mensagens.join(" ").includes("Marcas & CNPJs"),
  "linha com CNPJ e empresa sem número orienta a cadastrar primeiro",
);

// CNPJ divergente do da empresa
const cnpjErrado = validarPlanilhaColaboradores(
  new TextEncoder().encode(
    gerarCsv(["Nome", "Setor", "Cargo", "CNPJ"], [["X", "S", "C", "60.701.190/0001-04"]]),
  ),
  "33000167000101",
);
conferir(
  cnpjErrado.problemas[0]?.mensagens.join(" ").includes("empresa atual"),
  "linha apontando para OUTRO CNPJ é barrada, nunca redirecionada",
);

// ------------------------------------------------------- parte 2: com banco

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("planejamento criar/atualizar (com banco, rollback)");
  try {
    await prisma.$transaction(async (tx) => {
      const marca = await tx.marca.create({ data: { nome: `__smokeimp_${Date.now()}` } });
      const empresa = await tx.empresa.create({
        data: { nome: `__smokeimp_e_${Date.now()}`, marcaId: marca.id },
      });
      const setor = await tx.setor.create({ data: { nome: "Campo", empresaId: empresa.id } });
      const cargo = await tx.posicao.create({ data: { nome: "Instalador", empresaId: empresa.id } });
      await tx.colaborador.create({
        data: {
          nome: "Pessoa Existente",
          cpf: "11144477735",
          empresaId: empresa.id,
          setorId: setor.id,
          posicaoId: cargo.id,
        },
      });
      await tx.colaborador.create({
        data: {
          nome: "Pessoa Por Matrícula",
          matricula: "M-77",
          empresaId: empresa.id,
          setorId: setor.id,
          posicaoId: cargo.id,
        },
      });

      // O mesmo cruzamento que a action faz (reimplementado aqui de propósito:
      // a action exige sessão; a regra que interessa é o casamento por chave).
      const linhas = [
        { cpf: "11144477735", matricula: null, nome: "Pessoa Existente Atualizada" },
        { cpf: null, matricula: "M-77", nome: "Pessoa Por Matrícula" },
        { cpf: null, matricula: null, nome: "Pessoa Nova" },
      ];
      const existentes = await tx.colaborador.findMany({
        where: { empresaId: empresa.id },
        select: { id: true, cpf: true, matricula: true },
      });
      const porCpf = new Map(existentes.filter((c) => c.cpf).map((c) => [c.cpf!, c.id]));
      const porMat = new Map(existentes.filter((c) => c.matricula).map((c) => [c.matricula!, c.id]));

      const decisoes = linhas.map((l) =>
        l.cpf && porCpf.has(l.cpf) ? "atualiza" : l.matricula && porMat.has(l.matricula) ? "atualiza" : "cria",
      );
      conferir(decisoes[0] === "atualiza", "linha com CPF conhecido atualiza");
      conferir(decisoes[1] === "atualiza", "linha sem CPF casa pela matrícula");
      conferir(decisoes[2] === "cria", "linha sem chave nenhuma cria");

      throw new RollbackProposital();
    });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }

  const residuo = await prisma.marca.count({ where: { nome: { startsWith: "__smokeimp_" } } });
  conferir(residuo === 0, "rollback não deixou resíduo");

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
