// Gera a lista de quem precisa dar /start no bot do RH.
//
//   npx tsx scripts/lista-campanha-telegram.ts
//
// Read-only: não escreve nada.
//
// O sistema NÃO consegue iniciar conversa no Telegram — quem dá o primeiro
// passo é sempre o colaborador. Depois do /start, o webhook casa o contato
// compartilhado com Colaborador.telefone e grava o chatId sozinho. Por isso
// quem já tem telefone cadastrado só depende da campanha; sem telefone, a
// pessoa ainda consegue entrar digitando o CPF, mas o caminho é mais chato.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

async function main() {
  const alvo = await prisma.colaborador.findMany({
    where: { ativo: true, telegramChatId: null },
    select: { nome: true, telefone: true, email: true, empresa: { select: { nome: true } }, setor: { select: { nome: true } } },
    orderBy: [{ empresa: { nome: "asc" } }, { nome: "asc" }],
  });

  const comTel = alvo.filter((a) => a.telefone);
  const semTel = alvo.filter((a) => !a.telefone);
  const semNada = semTel.filter((a) => !a.email);

  console.log(`Ativos sem Telegram: ${alvo.length}`);
  console.log(`  com telefone (mandar link por WhatsApp): ${comTel.length}`);
  console.log(`  sem telefone, mas com e-mail:            ${semTel.length - semNada.length}`);
  console.log(`  sem telefone e sem e-mail:               ${semNada.length}  <- coleta manual`);

  const linhas = [
    "empresa;setor;nome;telefone;email",
    ...alvo.map((a) =>
      [a.empresa.nome, a.setor.nome, a.nome, a.telefone ?? "", a.email ?? ""].join(";"),
    ),
  ];
  const saida = "campanha-telegram.csv";
  writeFileSync(saida, "﻿" + linhas.join("\r\n"), "utf8");
  console.log(`\nArquivo gerado: ${saida} (${alvo.length} linhas)`);
}

main().finally(() => prisma.$disconnect());
