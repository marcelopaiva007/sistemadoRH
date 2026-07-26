// Limpa marcações de sistema nos nomes JÁ GRAVADOS.
//
// A `limparNome` de lib/importacao-colaboradores.ts protege as importações
// futuras — mas os 208 registros herdados do Elleven entraram antes dela.
// E o efeito é desproporcional ao volume: como a lista ordena por texto, o
// parêntese e o algarismo vêm antes das letras, então os poucos nomes sujos
// aparecem no TOPO — é a primeira coisa que o RH vê ao abrir a tela.
//
// Roda em conferência por padrão; só grava com --aplicar.
//
//   npx tsx scripts/limpar-nomes-importados.ts            (só mostra)
//   npx tsx scripts/limpar-nomes-importados.ts --aplicar  (grava)
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { limparNome } from "../lib/importacao-colaboradores";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const aplicar = process.argv.includes("--aplicar");

/**
 * Além do que a `limparNome` já faz (marcação entre parênteses no início),
 * a base tem número de documento colado antes do nome — ex.:
 * "45.799.041 Rualyson Cavalcante Soares".
 *
 * Só removemos quando o que sobra ainda parece nome completo: pelo menos
 * duas palavras e nenhum algarismo. Nome que legitimamente comece com
 * número não existe, mas a trava evita transformar em nome uma linha que
 * seja só um número.
 */
function limparDocumentoNoInicio(nome: string): string {
  const semDocumento = nome.replace(/^[\d.\-/]{6,}\s+/, "").trim();
  if (semDocumento === nome) return nome;
  const palavras = semDocumento.split(/\s+/);
  if (palavras.length < 2 || /\d/.test(semDocumento)) return nome;
  return semDocumento;
}

function limpar(nome: string): string {
  return limparDocumentoNoInicio(limparNome(nome));
}

async function main() {
  const todos = await prisma.colaborador.findMany({
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  const mudancas = todos
    .map((c) => ({ ...c, novo: limpar(c.nome) }))
    .filter((c) => c.novo !== c.nome);

  console.log(`${todos.length} colaboradores; ${mudancas.length} com nome a corrigir.\n`);
  for (const m of mudancas) {
    console.log(`  antes: "${m.nome}"`);
    console.log(`  novo : "${m.novo}"\n`);
  }

  if (mudancas.length === 0) {
    console.log("Nada a fazer.");
    return;
  }
  if (!aplicar) {
    console.log("Conferência apenas — nada gravado. Rode com --aplicar para gravar.");
    return;
  }

  // Uma transação só: ou todos os nomes ficam certos, ou nenhum muda.
  await prisma.$transaction(
    mudancas.map((m) =>
      prisma.colaborador.update({ where: { id: m.id }, data: { nome: m.novo } }),
    ),
  );

  // A trilha registra QUE o nome mudou e qual virou — nome não é dado
  // sensível como salário ou CID, e sem o valor a correção não é auditável.
  await prisma.auditLog.create({
    data: {
      acao: "ATUALIZAR",
      entidade: "Colaborador",
      resumo: `Limpeza de nomes importados: ${mudancas.length} corrigido(s)`,
      detalhes: { alteracoes: mudancas.map((m) => ({ de: m.nome, para: m.novo })) },
      usuarioNome: "script/limpar-nomes-importados",
    },
  });

  console.log(`${mudancas.length} nome(s) corrigido(s) e registrado(s) na auditoria.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
