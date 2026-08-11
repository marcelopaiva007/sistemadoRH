// Migra Sinal.gravidade e Sinal.nivelUnidade de minúsculo para
// UPPERCASE_WITH_UNDERSCORES, alinhando ao restante do sistema (Fase 1 do
// Design System — ver Master Plan).
//
//   npx tsx scripts/migrar-sinal-uppercase.ts            (simulação)
//   npx tsx scripts/migrar-sinal-uppercase.ts --gravar   (aplica)
//
// Rodar DEPOIS do deploy do código que já lê/grava os valores em maiúsculo
// (lib/sinais.ts, lib/alertas.ts, lib/sinais-registro.ts, lib/actions/sinais.ts,
// sinais-view.tsx) — enquanto este script não roda, sinais antigos continuam
// com o valor velho e a tela usa `?? v` como rótulo de fallback (aparece cru,
// não quebra), mas comparações como `corDaGravidade`/`rotuloDoNivel` não vão
// reconhecer a linha antiga até ela ser migrada.
//
// Feature nova (~6 dias de dado no momento em que este script foi escrito) —
// blast radius pequeno, sem necessidade de janela de manutenção.
import "dotenv/config";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");

const GRAVIDADE: Record<string, string> = {
  critica: "CRITICA",
  alta: "ALTA",
  atencao: "ATENCAO",
};

const NIVEL_UNIDADE: Record<string, string> = {
  grupo: "GRUPO",
  marca: "MARCA",
  empresa: "EMPRESA",
  setor: "SETOR",
};

async function main() {
  const sinais = await prisma.sinal.findMany({
    select: { id: true, gravidade: true, nivelUnidade: true, titulo: true },
  });

  const aMigrar = sinais.filter(
    (s) => GRAVIDADE[s.gravidade] !== undefined || NIVEL_UNIDADE[s.nivelUnidade] !== undefined,
  );

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`Sinais no banco: ${sinais.length}`);
  console.log(`Precisam de migração: ${aMigrar.length}\n`);

  for (const s of aMigrar) {
    const novaGravidade = GRAVIDADE[s.gravidade] ?? s.gravidade;
    const novoNivel = NIVEL_UNIDADE[s.nivelUnidade] ?? s.nivelUnidade;
    console.log(
      `  ${s.titulo.slice(0, 50).padEnd(52)} gravidade: ${s.gravidade} -> ${novaGravidade}` +
        (novoNivel !== s.nivelUnidade ? `  nivelUnidade: ${s.nivelUnidade} -> ${novoNivel}` : ""),
    );
    if (GRAVAR) {
      await prisma.sinal.update({
        where: { id: s.id },
        data: { gravidade: novaGravidade, nivelUnidade: novoNivel },
      });
    }
  }

  console.log(`\n${GRAVAR ? "Migrados" : "Migraria"}: ${aMigrar.length}`);
}

main().finally(() => prisma.$disconnect());
