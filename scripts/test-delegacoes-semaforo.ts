// A prova do semáforo do Painel da Direção (spec §9.3) —
// lib/constants-delegacoes.ts::semaforoDaDemanda. Eixo DIFERENTE de
// severidadeDoPrazo: cruza status/emRisco/repactuação, não só dias restantes.
//
//   npx tsx scripts/test-delegacoes-semaforo.ts

import { semaforoDaDemanda } from "../lib/constants-delegacoes";

let falhas = 0;
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = recebido === esperado;
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${esperado}, recebido: ${recebido}`);
    falhas++;
  }
}

const base = { status: "EM_EXECUCAO", diasParaPrazo: 5, emRisco: false, repactuada: false };

console.log("\nSemáforo — os 4 estados da spec §9.3\n");
{
  igual(semaforoDaDemanda(base), "VERDE", "sem risco, sem atraso, sem repactuação: verde");
  igual(semaforoDaDemanda({ ...base, status: "ENVIADA" }), "CINZA", "ENVIADA (aguardando aceite): cinza, sempre — nem olha prazo");
  igual(semaforoDaDemanda({ ...base, status: "ENVIADA", diasParaPrazo: -5 }), "CINZA", "ENVIADA atrasada no aceite AINDA é cinza — é outro relógio (regra 5)");
  igual(semaforoDaDemanda({ ...base, diasParaPrazo: -1 }), "VERMELHO", "prazo estourado: vermelho");
  igual(semaforoDaDemanda({ ...base, emRisco: true }), "AMARELO", "emRisco ligado: amarelo, mesmo dentro do prazo");
  igual(semaforoDaDemanda({ ...base, repactuada: true }), "AMARELO", "repactuada: amarelo, mesmo dentro do prazo e sem emRisco");
  igual(
    semaforoDaDemanda({ ...base, diasParaPrazo: -1, emRisco: true }),
    "VERMELHO",
    "atraso manda mais que risco — já não importa mais o aviso, importa o fato",
  );
}

console.log("\nENTREGUE e ENCERRADA — o relógio do responsável já parou\n");
{
  igual(
    semaforoDaDemanda({ ...base, status: "ENTREGUE", diasParaPrazo: -3 }),
    "VERDE",
    "ENTREGUE com o prazo já vencido não é vermelho — quem entregou não está mais atrasado",
  );
  igual(
    semaforoDaDemanda({ ...base, status: "ENCERRADA", diasParaPrazo: -10 }),
    "VERDE",
    "ENCERRADA nunca é vermelho, por mais velha que a demanda seja",
  );
  igual(
    semaforoDaDemanda({ ...base, status: "ENTREGUE", emRisco: true }),
    "AMARELO",
    "mas emRisco ainda pesa em ENTREGUE — o risco foi sinalizado antes de entregar",
  );
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
