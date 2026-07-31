// Preenche Colaborador.telefone a partir da coluna CONTATO da planilha do RH.
//
//   npx tsx scripts/preencher-telefones.ts            (simulação)
//   npx tsx scripts/preencher-telefones.ts --gravar   (aplica)
//
// Por que importa: o webhook do Telegram (app/api/telegram/webhook) captura o
// chatId casando o contato compartilhado com Colaborador.telefone. Sem telefone
// cadastrado, quem dá /start cai no caminho alternativo de digitar o CPF — e o
// sistema não consegue iniciar conversa, então essa gente simplesmente não é
// alcançada por pesquisa, convite ou portal.
//
// Só preenche onde está vazio: telefone já cadastrado é dado de quem trabalha
// com a pessoa, e a planilha não tem autoridade para sobrescrever.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const ORIGEM = String.raw`C:\Users\User\AppData\Local\Temp\claude\C--LM-Claude\a4532e4d-b800-4386-a837-fa2b3ec6867b\scratchpad\lista.json`;

const dig = (s: string | null) => (s ?? "").replace(/\D/g, "");

// "83 9 9828-4112", "(83)93500-2598" e "83 9888-5795" viram o mesmo formato.
// Guardamos com DDD e só dígitos; o webhook compara pelo sufixo, então nono
// dígito ausente não atrapalha o casamento.
function normalizarTelefone(bruto: string): string | null {
  const d = dig(bruto);
  if (d.length < 10 || d.length > 13) return null;
  // Tira o 55 do país, se veio.
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

async function main() {
  const regs: { cpf: string; nome: string; contato: string }[] = JSON.parse(readFileSync(ORIGEM, "utf8"));
  const porCpf = new Map(regs.map((r) => [r.cpf, r]));

  const semTelefone = await prisma.colaborador.findMany({
    where: { ativo: true, telefone: null },
    select: { id: true, nome: true, cpf: true, email: true, telegramChatId: true },
  });

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`Ativos sem telefone: ${semTelefone.length}`);

  let preenchidos = 0;
  let semDado = 0;
  let invalidos = 0;
  for (const c of semTelefone) {
    const reg = porCpf.get(dig(c.cpf));
    if (!reg?.contato?.trim()) {
      semDado++;
      continue;
    }
    const tel = normalizarTelefone(reg.contato);
    if (!tel) {
      console.log(`   ? ${c.nome.slice(0, 28).padEnd(30)} "${reg.contato}" — não parece telefone, pulado`);
      invalidos++;
      continue;
    }
    console.log(`   ${c.nome.slice(0, 28).padEnd(30)} ${tel}`);
    if (GRAVAR) await prisma.colaborador.update({ where: { id: c.id }, data: { telefone: tel } });
    preenchidos++;
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`  Preenchidos:            ${preenchidos}`);
  console.log(`  Sem dado na planilha:   ${semDado}`);
  console.log(`  Formato não reconhecido:${invalidos}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
