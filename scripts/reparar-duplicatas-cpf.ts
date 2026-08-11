// Repara as duplicatas criadas pela sincronização de 31/07/2026.
//
//   npx tsx scripts/reparar-duplicatas-cpf.ts            (simulação)
//   npx tsx scripts/reparar-duplicatas-cpf.ts --gravar   (aplica)
//
// A causa: rh."Colaborador".cpf guarda dois formatos — 75 registros com
// pontuação ("068.806.214-81") e 282 só com dígitos. A sincronização comparou
// dígitos contra o valor bruto do banco, não achou os formatados e criou
// registro novo para quem já existia.
//
// O reparo mantém o registro ANTIGO (é ele que tem férias, documentos e demais
// vínculos), transfere para ele o que a planilha trouxe de novo — empresa,
// setor, cargo, admissão — e apaga o que foi criado hoje. Também normaliza o
// CPF para só dígitos, para o problema não voltar na próxima carga.
import "dotenv/config";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const CORTE = new Date("2026-07-31T00:00:00Z");

const dig = (s: string | null) => (s ?? "").replace(/\D/g, "");

async function main() {
  const todos = await prisma.colaborador.findMany({
    select: {
      id: true,
      nome: true,
      cpf: true,
      ativo: true,
      createdAt: true,
      empresaId: true,
      setorId: true,
      posicaoId: true,
      dataAdmissao: true,
      empresa: { select: { nome: true } },
    },
  });

  const porDigitos = new Map<string, typeof todos>();
  for (const c of todos) {
    const d = dig(c.cpf);
    if (!d) continue;
    if (!porDigitos.has(d)) porDigitos.set(d, [] as unknown as typeof todos);
    porDigitos.get(d)!.push(c);
  }

  const pares = [...porDigitos.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([d, v]) => ({
      digitos: d,
      antigo: v.filter((c) => c.createdAt < CORTE).sort((a, b) => +a.createdAt - +b.createdAt)[0],
      novos: v.filter((c) => c.createdAt >= CORTE),
    }))
    .filter((p) => p.antigo && p.novos.length > 0);

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`Pares a reparar: ${pares.length}\n`);

  let reparados = 0;
  let apagados = 0;
  for (const p of pares) {
    const novo = p.novos[0];
    const a = p.antigo;

    // O registro novo carrega o destino correto vindo da planilha; o antigo
    // carrega o histórico. Levamos o destino para o antigo.
    const mudouEmpresa = a.empresaId !== novo.empresaId;
    console.log(
      `  ${a.nome.slice(0, 28).padEnd(30)} ${a.empresa.nome.slice(0, 16).padEnd(18)}` +
        `${mudouEmpresa ? `-> ${novo.empresa.nome.slice(0, 16)}` : "(mesma empresa)"}` +
        `${a.cpf !== p.digitos ? "  [cpf normalizado]" : ""}`,
    );

    if (GRAVAR) {
      // Antes de apagar: nada pode estar pendurado no registro novo. Ele nasceu
      // hoje, então não deveria ter nada — conferir é barato e evita perda.
      const [fer, doc] = await Promise.all([
        prisma.solicitacaoFerias.count({ where: { colaboradorId: novo.id } }),
        prisma.documentoColaborador.count({ where: { colaboradorId: novo.id } }),
      ]);
      if (fer > 0 || doc > 0) {
        console.log(`     ! tem ${fer} férias e ${doc} documentos — NÃO apagado, revisar à mão`);
        continue;
      }

      // Apagar ANTES de atualizar: a unicidade e (empresaId, cpf), e normalizar
      // o CPF do antigo colidiria com o novo enquanto os dois existissem na
      // mesma empresa.
      await prisma.$transaction([
        prisma.colaborador.delete({ where: { id: novo.id } }),
        prisma.colaborador.update({
          where: { id: a.id },
          data: {
            cpf: p.digitos,
            empresaId: novo.empresaId,
            setorId: novo.setorId,
            posicaoId: novo.posicaoId,
            dataAdmissao: a.dataAdmissao ?? novo.dataAdmissao,
          },
        }),
        prisma.solicitacaoFerias.updateMany({
          where: { colaboradorId: a.id },
          data: { empresaId: novo.empresaId },
        }),
        prisma.documentoColaborador.updateMany({
          where: { colaboradorId: a.id },
          data: { empresaId: novo.empresaId },
        }),
      ]);
      apagados++;
    }
    reparados++;
  }

  // Normaliza o que sobrou de CPF formatado, mesmo sem duplicata.
  const formatados = todos.filter((c) => c.cpf && /\D/.test(c.cpf) && !pares.some((p) => p.antigo.id === c.id));
  console.log(`\nCPFs formatados sem duplicata, a normalizar: ${formatados.length}`);
  if (GRAVAR) {
    for (const c of formatados) {
      await prisma.colaborador.update({ where: { id: c.id }, data: { cpf: dig(c.cpf) } });
    }
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`  Pares reparados:   ${reparados}`);
  console.log(`  Registros apagados:${GRAVAR ? ` ${apagados}` : ` ${pares.length} (simulado)`}`);
  console.log(`  CPFs normalizados: ${formatados.length + reparados}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
