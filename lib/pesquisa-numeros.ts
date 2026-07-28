// Um convite EXCLUIDO não é um convite: é o registro de que aquela pessoa foi
// tirada da pesquisa por não ser funcionária. A linha só continua no banco
// para "Gerar convites" não recriá-la na rodada seguinte (ver
// `excluirDaPesquisa`) — ela não representa ninguém a caminho de responder.
//
// Por isso todo lugar que mostra "Convites (n)" ou divide respostas por
// convites usa este filtro. Sem ele o denominador carrega gente que nunca vai
// responder: a participação da primeira rodada da NR-01 nasceria com 20
// não-funcionários dentro e nunca fecharia em 100%.
export const CONVITES_NA_PESQUISA = { status: { not: "EXCLUIDO" } };

/** Participação em % — 0 quando ainda não há convite válido. */
export function participacaoPct(respostas: number, convites: number): number {
  return convites > 0 ? Math.round((respostas / convites) * 100) : 0;
}

// Mensagem que fica no lugar do erro cru do Telegram depois que o RH limpa um
// vínculo quebrado (ver `vinculoTelegramQuebrado`) — a pessoa some do PENDING
// "aguardando alguma coisa" e o texto diz exatamente o quê.
export const MSG_AGUARDANDO_NOVO_VINCULO =
  "Aguardando novo vínculo — peça para a pessoa mandar /start de novo no bot.";

/**
 * Um chat_id de Telegram que existia e parou de funcionar: a pessoa bloqueou
 * o bot, apagou a conta, ou (mais comum aqui) o número foi digitado errado
 * quando o RH colou o chat_id à mão no cadastro (ver
 * lib/actions/rh-colaboradores.ts). Nos três casos o chat_id salvo está morto
 * e reenviar para ele nunca vai funcionar sozinho — só quando a pessoa mandar
 * /start de novo o bot grava um chat_id válido por cima.
 *
 * As frases são as que o Telegram devolve (Bot API `description`), não texto
 * nosso — por isso o casamento é por trecho, não igualdade exata.
 *
 * Puro, sem I/O de propósito: precisa rodar tanto no servidor (lib/convites.ts,
 * lib/actions/pesquisas.ts) quanto no cliente (a tela de convites decide, por
 * linha, se mostra o botão de limpar) — nenhum dos dois pode arrastar o outro
 * lado junto.
 */
export function vinculoTelegramQuebrado(token: {
  status: string;
  canal: string;
  erro: string | null;
}): boolean {
  if (token.status !== "FAILED" || token.canal !== "TELEGRAM" || !token.erro) return false;
  const erro = token.erro.toLowerCase();
  return (
    erro.includes("chat not found") ||
    erro.includes("bot was blocked") ||
    erro.includes("user is deactivated")
  );
}
