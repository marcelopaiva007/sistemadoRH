// Regras de entrega ao colaborador — as três perguntas que a tela responde.
//
// "Está com a pessoa?", "falta ela confirmar?" e "em que situação está?" são
// lidas em quatro lugares diferentes: o cartão do portal que cobra a
// confirmação, o filtro da tela do RH, o selo de cada linha e a decisão de
// mostrar ou não o botão de apagar. Se cada um decidir por conta própria, um
// notebook devolvido volta a ser cobrado da pessoa que já entregou.
//
// Sem banco de propósito: é função pura, roda em qualquer lugar.

import {
  aguardandoConfirmacao,
  estaEmPoderDoColaborador,
  situacaoDaEntrega,
  tipoEntregaLabel,
  SITUACAO_ENTREGA_BADGE,
  TIPOS_ENTREGA,
} from "../lib/constants-entregas";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

const ONTEM = new Date("2026-08-14T12:00:00Z");
const HOJE = new Date("2026-08-15T12:00:00Z");

// Os quatro estados possíveis de uma linha.
const RECEM_ENTREGUE = { confirmadoEm: null, devolvidoEm: null };
const CONFIRMADA = { confirmadoEm: HOJE, devolvidoEm: null };
const DEVOLVIDA_SEM_CONFIRMAR = { confirmadoEm: null, devolvidoEm: HOJE };
const CONFIRMADA_E_DEVOLVIDA = { confirmadoEm: ONTEM, devolvidoEm: HOJE };

console.log("\nEm poder do colaborador\n");
ok(estaEmPoderDoColaborador(RECEM_ENTREGUE), "entregue e não devolvido está com a pessoa");
ok(estaEmPoderDoColaborador(CONFIRMADA), "confirmada continua com a pessoa");
// Cartão e uniforme nunca voltam: `devolvidoEm` fica nulo para sempre neles, e
// é isso que faz "não devolvido" ser o estado normal, não uma pendência.
ok(
  !estaEmPoderDoColaborador(CONFIRMADA_E_DEVOLVIDA),
  "devolvida sai das mãos da pessoa mesmo tendo sido confirmada antes",
);

console.log("\nAguardando confirmação\n");
ok(aguardandoConfirmacao(RECEM_ENTREGUE), "recém-entregue é o que se cobra");
ok(!aguardandoConfirmacao(CONFIRMADA), "quem já confirmou não é cobrado de novo");
// Esta é a que impede o portal de pedir assinatura no passado: o notebook já
// voltou, cobrar "confirme que recebeu" não faz sentido para ninguém.
ok(
  !aguardandoConfirmacao(DEVOLVIDA_SEM_CONFIRMAR),
  "item já devolvido não vira cobrança de confirmação",
);

console.log("\nSituação da linha\n");
ok(situacaoDaEntrega(RECEM_ENTREGUE) === "AGUARDANDO", "sem confirmação e sem devolução: aguardando");
ok(situacaoDaEntrega(CONFIRMADA) === "CONFIRMADA", "confirmada pelo colaborador");
ok(situacaoDaEntrega(DEVOLVIDA_SEM_CONFIRMAR) === "DEVOLVIDA", "devolvida sem nunca ter confirmado");
// A ordem de precedência é a regra que importa: devolvido ganha de confirmado.
// Sem ela, "quem tem o quê" mentiria justamente no desligamento.
ok(
  situacaoDaEntrega(CONFIRMADA_E_DEVOLVIDA) === "DEVOLVIDA",
  "devolvida ganha de confirmada — a pergunta é onde o item está hoje",
);

console.log("\nCoerência entre as três\n");
for (const [nome, entrega] of [
  ["recém-entregue", RECEM_ENTREGUE],
  ["confirmada", CONFIRMADA],
  ["devolvida sem confirmar", DEVOLVIDA_SEM_CONFIRMAR],
  ["confirmada e devolvida", CONFIRMADA_E_DEVOLVIDA],
] as const) {
  ok(
    aguardandoConfirmacao(entrega) === (situacaoDaEntrega(entrega) === "AGUARDANDO"),
    `${nome}: cobrança do portal e filtro da tela dizem a mesma coisa`,
  );
  ok(
    estaEmPoderDoColaborador(entrega) === (situacaoDaEntrega(entrega) !== "DEVOLVIDA"),
    `${nome}: "está com a pessoa" e o selo da linha dizem a mesma coisa`,
  );
}

console.log("\nSelos e rótulos\n");
ok(
  Object.keys(SITUACAO_ENTREGA_BADGE).length === 3,
  "as três situações têm selo — nenhuma linha cai no fallback de status desconhecido",
);
ok(
  SITUACAO_ENTREGA_BADGE.AGUARDANDO.variant === "destructive",
  "falta de confirmação é vermelha: é o que precisa de telefonema",
);
ok(
  tipoEntregaLabel("CARTAO_BENEFICIOS") === "Cartão de benefícios",
  "tipo padrão vira rótulo legível",
);
// A lista é aditiva por catálogo (CatalogoItem, TIPO_ENTREGA): o RH cadastra
// "cadeira ergonômica" sem deploy, e a tela precisa mostrar isso sem quebrar.
ok(
  tipoEntregaLabel("CADEIRA_ERGONOMICA") === "CADEIRA_ERGONOMICA",
  "tipo cadastrado pelo RH aparece como está, em vez de sumir da tela",
);
ok(
  new Set(TIPOS_ENTREGA.map((t) => t.value)).size === TIPOS_ENTREGA.length,
  "nenhum tipo padrão repetido (dois itens iguais no catálogo da empresa)",
);

console.log(falhas === 0 ? "\n✅ Entregas: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
