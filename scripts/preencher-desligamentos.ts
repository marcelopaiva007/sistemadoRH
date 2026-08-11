// Preenche Colaborador.dataDesligamento nos inativos que estao sem ela.
//
//   npx tsx scripts/preencher-desligamentos.ts            (simulacao)
//   npx tsx scripts/preencher-desligamentos.ts --gravar   (aplica)
//
// Fonte: as tres abas "Funcionarios Demitidos" (2024, 2025, 2026) da planilha
// do RH. Colaborador inativo sem data de desligamento nao entra em relatorio de
// rotatividade nem em calculo de tempo de casa — o registro existe, mas nao
// conta.
//
// So preenche onde esta vazio, e so em quem ja esta inativo: a regra de
// readmissao vale igual (ver scripts/importar-demitidos-2026.ts), entao quem
// voltou e esta ativo nao e tocado.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const ORIGEM = String.raw`C:\Users\User\AppData\Local\Temp\claude\C--LM-Claude\a4532e4d-b800-4386-a837-fa2b3ec6867b\scratchpad\demitidos-todos.json`;
const dig = (s: string | null) => (s ?? "").replace(/\D/g, "");

async function main() {
  const regs: { cpf: string; nome: string; demissao: string; aba: string }[] = JSON.parse(readFileSync(ORIGEM, "utf8"));
  // Mesma pessoa pode aparecer em mais de uma aba (saiu, voltou, saiu). Fica a
  // data MAIS RECENTE, que e o desligamento vigente.
  const porCpf = new Map<string, { demissao: string; aba: string }>();
  for (const r of regs) {
    const atual = porCpf.get(r.cpf);
    if (!atual || r.demissao > atual.demissao) porCpf.set(r.cpf, { demissao: r.demissao, aba: r.aba });
  }

  const semData = await prisma.colaborador.findMany({
    where: { ativo: false, dataDesligamento: null },
    select: { id: true, nome: true, cpf: true, empresa: { select: { nome: true } } },
  });

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULACAO (use --gravar para aplicar)"}\n`);
  console.log(`Inativos sem data de desligamento: ${semData.length}`);

  let ok = 0, semFonte = 0;
  for (const c of semData) {
    const f = porCpf.get(dig(c.cpf));
    if (!f) { semFonte++; continue; }
    console.log(`   ${c.nome.slice(0, 30).padEnd(32)} ${f.demissao}  (${f.aba.replace("Funcionários Demitidos ", "")})`);
    if (GRAVAR) {
      await prisma.colaborador.update({
        where: { id: c.id },
        data: { dataDesligamento: new Date(`${f.demissao}T12:00:00Z`) },
      });
    }
    ok++;
  }
  console.log(`\n=== RESUMO ===`);
  console.log(`  Preenchidos:          ${ok}`);
  console.log(`  Sem data na planilha: ${semFonte}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}
main().finally(() => prisma.$disconnect());
