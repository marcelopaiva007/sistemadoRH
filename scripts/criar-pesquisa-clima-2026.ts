// Cria uma pesquisa de Clima Organizacional para LM Telecom, Centrysol ou VAPT.
// Estrutura GPTW (5 dimensões: Credibilidade, Respeito, Imparcialidade,
// Orgulho, Camaradagem, 4 perguntas cada) + NPS final. Anônima, Likert 1-5.
//
// Feita para ser rodada 1-2 vezes por ano — cada execução cria um ciclo novo,
// fechando o anterior automaticamente. Usa a mesma estrutura de perguntas
// (template imutável) de forma que os resultados sejam comparáveis ao longo
// do tempo — como fazem Gallup, CultureAmp, Mercer.
//
// Usar assim:
//   DATABASE_URL="postgresql://..." EMPRESA_ID="cmruyzwsb00006worlf1dx02k" \
//   npx tsx scripts/criar-pesquisa-clima-2026.ts
//
// Se EMPRESA_ID não for passado, cria para a LM Telecom.

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const empresaId = process.env.EMPRESA_ID || "cmruyzwsb00006worlf1dx02k"; // LM Telecom padrão

// Template de perguntas — IMUTÁVEL. Mesmo a cada ciclo anual, para comparabilidade.
// Baseado no modelo GPTW (Great Place to Work).
const TEMPLATE_PERGUNTAS = [
  // Credibilidade — Gestão íntegra, comunicação honesta, promessas cumpridas
  {
    dimensao: "CREDIBILIDADE",
    enunciados: [
      "A empresa cumpre os compromissos que assume com os colaboradores",
      "A liderança é honesta e transparente na comunicação",
      "Existe coerência entre o que é dito e o que é feito na empresa",
      "A empresa oferece benefícios e remuneração justos",
    ],
  },
  // Respeito — Equidade, desenvolvimento, reconhecimento da pessoa
  {
    dimensao: "RESPEITO",
    enunciados: [
      "Sua opinião é ouvida e considerada nas decisões que afetam seu trabalho",
      "A empresa respeita a vida pessoal e o tempo livre dos colaboradores",
      "As pessoas são tratadas com equidade, independentemente de cargo ou origem",
      "A empresa valoriza o desenvolvimento profissional dos colaboradores",
    ],
  },
  // Imparcialidade — Justiça, merecimento, não favoritismo
  {
    dimensao: "IMPARCIALIDADE",
    enunciados: [
      "As decisões sobre promoções e aumentos são justas e imparciais",
      "A empresa oferece igualdade de oportunidades para todos",
      "As políticas e regras são aplicadas de forma consistente",
      "Não há favoritismo nas decisões de gestão",
    ],
  },
  // Orgulho — Propósito, qualidade, reputação, identidade
  {
    dimensao: "ORGULHO",
    enunciados: [
      "Você se sente orgulhoso em trabalhar para esta empresa",
      "A empresa oferece produtos/serviços de qualidade que você valoriza",
      "O propósito e a missão da empresa fazem sentido",
      "Você recomendaria esta empresa como um bom lugar para trabalhar",
    ],
  },
  // Camaradagem — Conexão, colaboração, confiança, convivência
  {
    dimensao: "CAMARADAGEM",
    enunciados: [
      "Você tem bom relacionamento com seus colegas de trabalho",
      "Há espírito de trabalho em equipe e colaboração",
      "As pessoas se ajudam para resolver problemas",
      "Existe um ambiente de confiança entre os colaboradores",
    ],
  },
];

async function main() {
  try {
    console.log("🔄 Criando ciclo de Pesquisa de Clima Organizacional\n");

    // Validar empresa
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, nome: true },
    });
    if (!empresa) {
      console.error(`❌ Empresa ${empresaId} não encontrada.`);
      process.exit(1);
    }
    console.log(`✓ Empresa: ${empresa.nome}`);

    // Fecha pesquisa anterior (se houver ACTIVE) — muda para FINISHED
    const pesquisaAnterior = await prisma.pesquisa.findFirst({
      where: {
        empresaId,
        modelo: "CLIMA",
        status: "ACTIVE",
      },
    });
    if (pesquisaAnterior) {
      await prisma.pesquisa.update({
        where: { id: pesquisaAnterior.id },
        data: { status: "FINISHED", encerradaEm: new Date() },
      });
      console.log(
        `✓ Pesquisa anterior (${pesquisaAnterior.titulo}) foi encerrada (FINISHED)`
      );
    }

    // Criar nova pesquisa
    const ano = new Date().getFullYear();
    const pesquisa = await prisma.pesquisa.create({
      data: {
        empresaId,
        titulo: `Pesquisa de Clima Organizacional ${ano}`,
        descricao:
          "Avaliação anônima e confidencial do clima organizacional. Sua opinião honesta é valiosa e nos ajuda a melhorar. " +
          "Sem identificação, sem represálias.",
        modelo: "CLIMA",
        anonima: true,
        status: "DRAFT",
      },
    });
    console.log(`✓ Novo ciclo criado: ${pesquisa.id}\n`);

    // Popular com o template de perguntas
    let numeroTotal = 0;
    for (const secao of TEMPLATE_PERGUNTAS) {
      console.log(`📊 ${secao.dimensao}`);
      for (const enunciado of secao.enunciados) {
        numeroTotal++;
        await prisma.pergunta.create({
          data: {
            pesquisaId: pesquisa.id,
            ordem: numeroTotal - 1,
            enunciado,
            tipo: "LIKERT_5",
            dimensaoGPTW: secao.dimensao,
            obrigatoria: true,
          },
        });
        console.log(`   ${numeroTotal}. ${enunciado}`);
      }
    }

    // Pergunta final: NPS / recomendação
    numeroTotal++;
    await prisma.pergunta.create({
      data: {
        pesquisaId: pesquisa.id,
        ordem: numeroTotal - 1,
        enunciado:
          "Qual é a probabilidade de você recomendar a empresa como um bom lugar para trabalhar? (0 = não recomenda, 10 = recomenda fortemente)",
        tipo: "NPS_10",
        dimensaoGPTW: "GERAL",
        obrigatoria: true,
      },
    });
    console.log(`   ${numeroTotal}. [NPS 0-10] Probabilidade de recomendar\n`);

    console.log(
      `✅ Ciclo pronto! ${numeroTotal} perguntas (template GPTW) — mesma estrutura todos os anos.\n`
    );
    console.log(
      `📋 Próximos passos:\n` +
        `   1. Abra: https://sistemado-rh-two.vercel.app/rh/${empresa.id}/pesquisas/${pesquisa.id}\n` +
        `   2. Aba "Estrutura" → Clique "Ativar pesquisa"\n` +
        `   3. Aba "Convites" → Clique "Gerar convites para todos"\n` +
        `   4. Clique "Enviar convites" (ou deixa o automático de amanhã)\n\n` +
        `💡 No próximo ciclo (próximo ano), rode este script de novo e automaticamente:\n` +
        `   • A pesquisa do ano passado muda de ACTIVE para FINISHED (respostas congeladas)\n` +
        `   • Uma nova pesquisa com as MESMAS perguntas é criada (comparável ao histórico)\n`
    );
  } catch (error) {
    console.error("❌ Erro:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
