// As três listas que classificam cada pendência pela NATUREZA DA AÇÃO.
//
// Moram num arquivo próprio, SEM importar o Prisma, porque a tela de
// Pendências (app/(app)/rh/[empresaId]/pendencias-view.tsx, "use client")
// precisa delas no navegador — e lib/pendencias.ts, onde nasceram, importa o
// cliente do banco. Importar valores de lá num Client Component derrubou o
// build da Vercel na v1.156.0 ("the chunking context does not support
// external modules: node:module"), com type-check e lint verdes: o erro só
// aparece no bundle. lib/pendencias.ts reexporta as listas e mantém a prova
// de cobertura (o tipo que obriga cada pendência a estar em exatamente um
// grupo) — ela precisa de `keyof Pendencias`, que fica lá.

/**
 * As 27 pendências separadas por NATUREZA DA AÇÃO.
 *
 * POR QUE ISTO EXISTE. A tela inicial mostrava as 19 somadas num número só. O
 * efeito ficou evidente em 12/08/2026: "163 cadastros incompletos" e "6
 * documentos aguardando conferência" moravam dentro do mesmo total — e o
 * segundo, que é gente esperando resposta do RH hoje, sumia dentro do
 * primeiro, que não tem data fatal nenhuma. Número que mistura urgência com
 * ruído não é fila de trabalho; é um número grande que se aprende a ignorar.
 *
 * A régua de cada grupo é UMA pergunta:
 *   DECIDIR  — "tem alguém esperando uma resposta minha?" (o RH é o gargalo)
 *   PRAZO    — "tem data correndo contra?" (a data é o gargalo)
 *   CADASTRO — "falta dado?" (nada trava hoje; é qualidade de base)
 *
 * `satisfies` com a lista de chaves obriga o TypeScript a cobrar: pendência
 * nova que não entre em exatamente um grupo não compila. Sem isso, a próxima
 * pendência entraria no total e não apareceria em grupo nenhum — que é
 * justamente o tipo de omissão silenciosa que esta separação veio corrigir.
 */
export const PENDENCIAS_DECIDIR = [
  "aprovacoes",
  "documentosAConferir",
  // CAT tem prazo legal de 1 dia útil (Lei 8.213/91, art. 22) — é decisão que
  // não espera, não "acompanhamento".
  "catPendente",
  // As três de 19/08/2026: em todas há uma PESSOA do outro lado esperando o
  // RH — quem pediu ajuste de ponto, quem escreveu pelo portal e quem foi
  // advertido (a assinatura é do colaborador, mas colhê-la é diligência do
  // RH). É a definição do grupo.
  //
  // `entregasNaoConfirmadas` ENTROU aqui em 19/08 e SAIU em 20/08: confirmar o
  // recebimento é ação do COLABORADOR no portal, não decisão do RH — um lote
  // de 171 uniformes registrado de uma vez fazia o "aguardando você" da home e
  // do e-mail diário saltar +171 sem nenhuma ação do RH capaz de baixar o
  // número. Foi para PRAZO: a prova da entrega envelhece como um vencimento.
  "ajustesPontoPendentes",
  "mensagensSemResposta",
  "disciplinarSemAssinatura",
] as const;

export const PENDENCIAS_PRAZO = [
  "asoVencendo",
  "certificadosVencendo",
  "epiVencido",
  "feriasVencidas",
  "contratosVencendo",
  "avisoPrevio",
  "integracoesAtrasadas",
  "desligamentosIncompletos",
  "ciclosAvaliacaoAEncerrar",
  "horasExtrasExcedidas",
  // 19/08/2026. `planosAcaoVencidos` e `desligamentosSemEntrevista` têm data
  // que já passou; `desligamentosSemChecklist` cobra também quem está em aviso
  // prévio (a saída está marcada e o checklist já precisa existir);
  // `sinaisAbertos` entra aqui e não em DECIDIR porque o sinal carrega prazo e
  // gravidade próprios e ninguém, pessoalmente, está do outro lado esperando —
  // é condição detectada correndo contra o relógio. `entregasNaoConfirmadas`
  // veio de DECIDIR em 20/08 (ver o comentário lá em cima).
  "planosAcaoVencidos",
  "desligamentosSemChecklist",
  "desligamentosSemEntrevista",
  "sinaisAbertos",
  "entregasNaoConfirmadas",
] as const;

export const PENDENCIAS_CADASTRO = [
  "cadastrosIncompletos",
  "semSetor",
  "fichasDesatualizadas",
  "dependentesSemCpf",
  "atestadosSemDocumento",
  "semTelegram",
  "pesquisasAbertas",
] as const;
