/**
 * Mostra EXATAMENTE as mensagens que os gestores receberiam — sem enviar nada.
 *
 * Rode isto antes de ligar o envio real. O motor manda mensagem para pessoas:
 * uma regra errada não produz tela feia, produz a chefia inteira recebendo
 * aviso indevido, e mensagem enviada não volta. A simulação usa a MESMA função
 * do envio real (`executarAvisosDoGestor`), então o que aparece aqui é o que
 * sairia — não uma segunda implementação que pode divergir.
 *
 *   npx tsx scripts/simular-avisos-gestor.ts
 *
 * Precisa de DATABASE_URL apontando para o banco que se quer inspecionar — e é
 * por isso que ele NÃO é o caminho principal. Quem responde pelos avisos usa o
 * sistema pelo navegador e não tem o projeto instalado; mandá-lo ao terminal é
 * pedir o que não se pode entregar. A conferência de verdade mora na tela
 * "Avisos ao gestor" (Departamento pessoal), que mostra o mesmo conteúdo.
 * Este script fica para quem já está no código.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { executarAvisosDoGestor, DIAS_ENTRE_AVISOS, DIAS_AVISO_CONTRATO } from "../lib/aviso-gestor";

async function main() {
  console.log("=== SIMULAÇÃO DE AVISOS AO GESTOR — NADA SERÁ ENVIADO ===\n");
  console.log(`Régua: contrato vencendo em até ${DIAS_AVISO_CONTRATO} dias;`);
  console.log(`       mesmo assunto não se repete antes de ${DIAS_ENTRE_AVISOS} dias.\n`);

  const r = await executarAvisosDoGestor({ enviar: false });

  console.log(`Gestores com equipe:        ${r.gestoresAvaliados}`);
  console.log(`Gestores com algo a receber: ${r.comItens}`);
  console.log(`Sem Telegram (não receberiam): ${r.semCanal}`);
  console.log(`Itens silenciados (já avisados): ${r.silenciados}\n`);

  if (r.simulacao.length === 0) {
    console.log("Nenhuma mensagem sairia agora.");
    console.log("Isso pode ser bom sinal (nada vencendo) ou sinal de que a régua");
    console.log("está apertada demais. Confira contra a tela de Férias e a de");
    console.log("Colaboradores antes de concluir.\n");
    return;
  }

  console.log(`${r.simulacao.length} mensagem(ns) sairia(m):\n`);
  for (const s of r.simulacao) {
    console.log("─".repeat(70));
    console.log(`PARA: ${s.gestor}`);
    console.log("─".repeat(70));
    console.log(s.mensagem);
    console.log();
  }

  console.log("─".repeat(70));
  console.log("Leia mensagem por mensagem. Procure por: nome errado, data que não");
  console.log("bate com a ficha, aviso sobre quem já saiu, ou a mesma pessoa");
  console.log("aparecendo em dois gestores diferentes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
