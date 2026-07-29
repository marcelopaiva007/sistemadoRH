import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const empresaId = process.env.EMPRESA_ID || "cmruyzwsb00006worlf1dx02k";

async function main() {
  const pesquisas = await prisma.pesquisa.findMany({
    where: { empresaId, modelo: "CLIMA" },
    include: { perguntas: { select: { id: true, enunciado: true, dimensaoGPTW: true, tipo: true } } },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Pesquisas de clima encontradas: ${pesquisas.length}\n`);

  for (const p of pesquisas) {
    console.log(`📊 ${p.titulo} (${p.status}) — ${p.perguntas.length} perguntas`);
    const comDimensao = p.perguntas.filter(q => q.dimensaoGPTW).length;
    console.log(`   ✓ Com dimensaoGPTW: ${comDimensao}/${p.perguntas.length}`);

    if (p.perguntas.length > 0) {
      console.log(`   Primeiras 3 perguntas:`);
      p.perguntas.slice(0, 3).forEach(q => {
        console.log(`     - ${q.enunciado.substring(0, 60)}... [${q.tipo}] dim=${q.dimensaoGPTW}`);
      });
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(console.error);
