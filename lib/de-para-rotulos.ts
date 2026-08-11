// Tradução de rótulos históricos de pesquisa para o nome canônico de cadastro.
//
// Por que existe: Resposta grava setor e cargo como TEXTO no momento da
// resposta (setorNomeSnapshot / posicaoNomeSnapshot) — de propósito, para o
// resultado de uma pesquisa não mudar retroativamente quando o cadastro muda.
// O custo apareceu na canonização de setores/cargos de ago/2026: cada pesquisa
// gravou o vocabulário da sua época, e são TRÊS vocabulários diferentes
// (medidos no backup de Resposta):
//
//   - NR-01 2026:      "Área Comercial" (45), "Área Administrativa" (35),
//                      "Área Financeira" (4), "Área Comercial/Vendas" (4),
//                      "Equipe de Atendimento - VAPT" (2), "Serviços Gerais" (1)
//   - Clima 2026:      "Comercial" (10) convivendo com "Vendas" (21) na MESMA
//                      pesquisa — o setor foi renomeado no meio da coleta
//   - Pulso 2026 T3:   já gravou os canônicos, com variações só de caixa
//                      ("Atendimento Ao Cliente", "RECURSOS HUMANOS",
//                      "Tecnologia Da Informação (ti)")
//
// Sete desses rótulos não existem em nenhuma linha da tabela Setor. Cruzar
// resposta com setor pelo nome cru falha EM SILÊNCIO em metade da NR-01 —
// cola o clima de um setor no turnover de outro. A tradução acontece NA
// LEITURA (nos motores de agregação), nunca reescrevendo o snapshot gravado.
//
// Funções puras — nada aqui toca o Prisma.
import { normalizarTexto } from "@/lib/text";

export type RotuloCanonizado = {
  nome: string;
  // false = vocabulário que este de-para não conhece. A tela usa isso para
  // avisar "apareceu rótulo novo" em vez de engolir e agrupar errado. O nome
  // devolvido nesse caso é o original (só com trim) — o grupo continua
  // existindo, não some.
  reconhecido: boolean;
};

// Os 9 setores canônicos pós-canonização de ago/2026 + o bucket "Não definido".
// Se a lista mudar no cadastro, atualize aqui — o de-para valida contra ela.
export const SETORES_CANONICOS = [
  "Área Técnica",
  "Vendas",
  "Atendimento ao Cliente",
  "Administrativo",
  "Almoxarifado e Logística",
  "Financeiro",
  "Recursos Humanos",
  "Tecnologia da Informação (TI)",
  "Marketing",
  "Não definido",
] as const;

// Rótulo histórico → setor canônico. A chave é comparada via normalizarTexto
// (trim, caixa, acento), então basta UMA grafia por rótulo aqui.
//
// De onde veio cada rótulo (medido no backup de Resposta):
export const DE_PARA_SETOR: Record<string, string> = {
  // NR-01 2026 — vocabulário "Área X" da época da pesquisa:
  "Área Comercial": "Vendas",
  "Área Comercial/Vendas": "Vendas",
  "Área Administrativa": "Administrativo", // também 1 resposta no Pulso T3
  "Área Financeira": "Financeiro",
  "Equipe de Atendimento - VAPT": "Atendimento ao Cliente",
  // Clima 2026 e Pulso T3 — "Comercial" era o nome do setor antes de virar
  // "Vendas" (no Clima 2026 as duas grafias convivem na mesma pesquisa):
  "Comercial": "Vendas",
  // "Serviços Gerais" (1 resposta na NR-01) fica DE FORA de propósito: o setor
  // sumiu na canonização e não dá para verificar em qual canônico os
  // colaboradores dele foram parar. Melhor aparecer como não-reconhecido (e
  // cair no piso de anonimato) do que colar 1 resposta no setor errado.
};

// Cargo canônico ← rótulo histórico. Só entram mapeamentos VERIFICÁVEIS:
//
//   - "Técnico" → "Técnico Instalador": a canonização consolidou 73 ativos em
//     "Técnico Instalador", e no backup pré-canonização Técnico Instalador (39)
//     + Técnico (34) = exatamente 73. A mesma conta prova que "Técnico de
//     Campo" (6) e "Auxiliar Técnico" (6) NÃO entraram nessa consolidação —
//     por isso ficam de fora.
//   - "Supervisor Comercial" / "Gerente Comercial": a família canônica de
//     vendas tem exatamente um supervisor ("Supervisor de Vendas") e um
//     gerente ("Gerente de Vendas"); esses eram os únicos rótulos de
//     supervisão/gerência comercial no backup.
//
// "Vendedor" (30 respostas na NR-01) fica DE FORA de propósito: foi dividido
// em Vendedor Interno/Externo e o snapshot não diz para qual lado cada
// respondente foi — qualquer escolha aqui inventaria dado.
export const DE_PARA_CARGO: Record<string, string> = {
  "Técnico": "Técnico Instalador",
  "Supervisor Comercial": "Supervisor de Vendas",
  "Gerente Comercial": "Gerente de Vendas",
};

// Cargos que sabemos existir na lista canônica (a lista completa tem 45 nomes
// e mora no cadastro, não aqui — estes são os citados na canonização). Servem
// só para o de-para reconhecer a grafia canônica quando ela mesma aparece no
// snapshot; cargo canônico fora desta lista volta como reconhecido: false,
// o que é inofensivo: o nome devolvido é o próprio rótulo.
const CARGOS_CANONICOS_CONHECIDOS = [
  "Técnico Instalador",
  "Vendedor Interno",
  "Vendedor Externo",
  "Supervisor de Vendas",
  "Gerente de Vendas",
  "Gerente de TI",
  "Inativo",
] as const;

function montarIndice(
  canonicos: readonly string[],
  dePara: Record<string, string>,
): Map<string, string> {
  const indice = new Map<string, string>();
  // Canônicos primeiro: variação de caixa/acento do próprio nome canônico
  // ("RECURSOS HUMANOS", "Tecnologia Da Informação (ti)") resolve para a
  // grafia oficial sem precisar de linha no de-para.
  for (const nome of canonicos) indice.set(normalizarTexto(nome), nome);
  for (const [historico, canonico] of Object.entries(dePara)) {
    indice.set(normalizarTexto(historico), canonico);
  }
  return indice;
}

const INDICE_SETOR = montarIndice(SETORES_CANONICOS, DE_PARA_SETOR);
const INDICE_CARGO = montarIndice(CARGOS_CANONICOS_CONHECIDOS, DE_PARA_CARGO);

function canonizar(rotulo: string, indice: Map<string, string>): RotuloCanonizado {
  const encontrado = indice.get(normalizarTexto(rotulo));
  if (encontrado !== undefined) return { nome: encontrado, reconhecido: true };
  return { nome: rotulo.trim(), reconhecido: false };
}

/** Traduz um snapshot de setor de resposta para o nome canônico de cadastro. */
export function canonizarSetor(rotulo: string): RotuloCanonizado {
  return canonizar(rotulo, INDICE_SETOR);
}

/** Traduz um snapshot de cargo de resposta para o nome canônico de cadastro. */
export function canonizarCargo(rotulo: string): RotuloCanonizado {
  return canonizar(rotulo, INDICE_CARGO);
}
