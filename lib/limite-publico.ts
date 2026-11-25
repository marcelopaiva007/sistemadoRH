// Limite de envios por IP nas telas públicas (sem login) — 25/11/2026.
//
// A inscrição em vaga (/vagas/<slug>) e a resposta de pesquisa
// (/responder/<token>) aceitavam envio sem limite nenhum: um robô que gera
// CPFs válidos enchia o banco de candidatos com currículo de 4 MB cada (o
// anexo é gravado no Postgres). Este arquivo é o balde por IP dessas duas
// telas.
//
// Reaproveita a tabela do login (TentativaLogin), como já fazem o PIN do ponto
// (lib/ponto-pin-auth.ts) e o "esqueci minha senha"
// (lib/actions/recuperacao-senha.ts): o prefixo na coluna `username` separa os
// baldes, e a faxina de 24 h do `registrarFalha` limpa estas linhas também.
// Tabela nova seria mais uma migration para guardar exatamente o mesmo par
// (chave, IP, horário).
//
// Como o login: FALHA ABERTA. Se a tabela der erro, o envio passa — um
// candidato não pode perder a vaga, nem um colaborador a pesquisa, por defeito
// de telemetria. O limite é contra robô; o banco fora do ar já barra o resto.
import { prisma } from "@/lib/prisma";
import { registrarFalha } from "@/lib/login-tentativas";

export type LimitePublico = {
  /** Prefixo do balde na coluna `username` da TentativaLogin. */
  chave: string;
  /** Envios aceitos por IP dentro da janela. */
  maximo: number;
  /** Tamanho da janela deslizante, em minutos. */
  janelaMinutos: number;
};

/** Inscrição em vaga: 5 por IP por hora. Uma pessoa se inscreve em poucas
 * vagas; quem manda dezenas por hora do mesmo lugar é robô. */
export const LIMITE_INSCRICAO_VAGA: LimitePublico = {
  chave: "publico:vaga-inscricao",
  maximo: 5,
  janelaMinutos: 60,
};

/** Resposta de pesquisa: 30 por IP por hora. Teto mais alto de propósito —
 * colegas respondem do mesmo Wi-Fi da loja, e todos saem pelo mesmo IP. */
export const LIMITE_RESPOSTA_PESQUISA: LimitePublico = {
  chave: "publico:pesquisa-resposta",
  maximo: 30,
  janelaMinutos: 60,
};

export const MENSAGEM_LIMITE_PUBLICO =
  "Recebemos muitos envios seguidos desta conexão. Aguarde alguns minutos e tente de novo.";

/**
 * Decisão pura (testada em scripts/test-limite-publico.ts, sem banco).
 * `envios` são os horários registrados para o IP — INCLUINDO o envio atual,
 * que é gravado antes da contagem. Gravar antes e contar depois é o que
 * segura a rajada simultânea: cada requisição enxerga a própria linha e as
 * anteriores, então a de número `maximo + 1` é barrada mesmo que todas
 * cheguem no mesmo milissegundo. Contar antes e gravar depois deixaria a
 * rajada inteira passar, porque todas leriam a contagem velha.
 */
export function limiteEstourado(envios: Date[], agora: Date, limite: LimitePublico): boolean {
  const inicio = agora.getTime() - limite.janelaMinutos * 60_000;
  const naJanela = envios.filter((e) => e.getTime() > inicio && e.getTime() <= agora.getTime());
  return naJanela.length > limite.maximo;
}

/**
 * Registra o envio deste IP e diz se ele passou do limite. Envio barrado
 * também fica registrado: robô que insiste continua barrado enquanto
 * insistir, e uma pessoa de verdade não manda seis inscrições por hora.
 * Qualquer erro do banco aqui devolve `false` (falha aberta).
 */
export async function envioPublicoBarrado(
  limite: LimitePublico,
  ip: string,
  agora = new Date(),
): Promise<boolean> {
  try {
    await registrarFalha(limite.chave, ip);
    const desde = new Date(agora.getTime() - limite.janelaMinutos * 60_000);
    const envios = await prisma.tentativaLogin.findMany({
      where: { username: limite.chave, ip, criadoEm: { gt: desde } },
      select: { criadoEm: true },
    });
    // O `agora` da contagem é o instante da leitura: a linha recém-gravada
    // tem `criadoEm` do relógio do banco, que pode estar milissegundos à
    // frente do `agora` do servidor e ficaria fora da janela.
    return limiteEstourado(
      envios.map((e) => e.criadoEm),
      new Date(Math.max(Date.now(), agora.getTime()) + 5_000),
      limite,
    );
  } catch (e) {
    console.error("[limite-publico] contagem falhou; envio liberado:", e);
    return false;
  }
}
