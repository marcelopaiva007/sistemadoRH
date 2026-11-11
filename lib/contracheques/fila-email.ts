// Fila do teto diário de e-mail dos contracheques — OS 11/11/2026, item 1.
//
// O problema: em 10/11 os envios de LM e Centrysol/VAPT bateram no teto de
// e-mails do dia (LIMITE_DIARIO_ENVIOS). A mensagem dizia "o envio continua
// amanhã", mas nada continuava: o recibo ficava com o erro gravado e o RH teve
// que reenviar um a um.
//
// Como funciona agora: quando `sendEmail` recusa o aviso por COTA, o recibo
// ganha `emailNaFilaDesde` (lib/contracheques/envio.ts). Este módulo, chamado
// pelo cron /api/cron/fila-email-contracheque, manda de novo SÓ o e-mail — o
// Telegram, se havia, já saiu na hora — do mais antigo para o mais novo,
// enquanto houver saldo no dia. Conseguiu: limpa a fila. Bateu no teto de
// novo: para e tenta na próxima rodada. Falha permanente (endereço inválido,
// suprimido): sai da fila com o erro gravado, para o RH ver na linha.
//
// O link é o MESMO token que já estava no recibo — sem rotacionar. O e-mail
// precisa sair mesmo quando o Telegram avisou: o aviso do Telegram só diz que
// o contracheque "chegou no e-mail", e o link de assinatura vai no e-mail.

import { prisma } from "@/lib/prisma";
import { orcamentoRestanteHoje, sendEmail } from "@/lib/email";
import { gerarTokenAssinatura } from "./token-auth";
import { rotuloDoContracheque } from "./situacao";
import { montarCorpoEmailContracheque, obterUrlBase } from "./envio";

/** Teto de e-mails por rodada — cabe nos 300 s da função com folga. */
const MAXIMO_POR_RODADA = 150;

function primeiroNome(nome: string): string {
  return (nome.split(" ")[0] ?? "").toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
}

/** Quantos contracheques estão esperando o e-mail — para o aviso na tela. */
export async function contarFilaEmailContracheque(empresaIds: string[]): Promise<number> {
  return prisma.reciboContracheque.count({
    where: {
      emailNaFilaDesde: { not: null },
      confirmadoEm: null,
      empresaId: { in: empresaIds },
    },
  });
}

export async function processarFilaEmailContracheque(): Promise<{
  naFila: number;
  enviados: number;
  aindaNaFila: number;
  falhas: number;
  saldoInicial: number;
}> {
  const saldoInicial = await orcamentoRestanteHoje();
  const fila = await prisma.reciboContracheque.findMany({
    where: { emailNaFilaDesde: { not: null } },
    orderBy: { emailNaFilaDesde: "asc" },
    take: MAXIMO_POR_RODADA,
    select: {
      id: true,
      empresaId: true,
      competencia: true,
      tipoFolha: true,
      tokenAssinatura: true,
      canal: true,
      confirmadoEm: true,
      colaborador: {
        select: {
          nome: true,
          email: true,
          ativo: true,
          empresa: { select: { marca: { select: { nome: true } } } },
        },
      },
    },
  });

  let enviados = 0;
  let falhas = 0;
  let bateuNoTeto = saldoInicial <= 0;

  for (const r of fila) {
    // Assinou por outro caminho, saiu da empresa ou perdeu o e-mail: não há
    // mais o que mandar — só tira da fila.
    if (r.confirmadoEm || !r.colaborador.ativo || !r.colaborador.email) {
      await prisma.reciboContracheque.update({
        where: { id: r.id },
        data: { emailNaFilaDesde: null },
      });
      continue;
    }
    if (bateuNoTeto) break;

    const marca = r.colaborador.empresa.marca.nome;
    const token = r.tokenAssinatura ?? gerarTokenAssinatura();
    const link = `${obterUrlBase()}/assinar/${token}`;
    const ref = rotuloDoContracheque(r.competencia, r.tipoFolha);
    const tpl = montarCorpoEmailContracheque(primeiroNome(r.colaborador.nome), ref, marca, link);

    const res = await sendEmail({
      to: r.colaborador.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      fromName: `RH ${marca}`,
      origem: "CONTRACHEQUE",
      empresaId: r.empresaId,
      marcaNome: marca,
    });

    if (res.ok) {
      enviados++;
      await prisma.reciboContracheque.update({
        where: { id: r.id },
        data: {
          tokenAssinatura: token,
          emailNaFilaDesde: null,
          envioErro: null,
          canal: r.canal === "TELEGRAM" || r.canal === "AMBOS" ? "AMBOS" : "EMAIL",
          // O prazo de 5 dias conta de quando o link chegou de fato.
          enviadoEm: new Date(),
        },
      });
    } else if (res.motivo === "COTA") {
      bateuNoTeto = true;
    } else {
      falhas++;
      await prisma.reciboContracheque.update({
        where: { id: r.id },
        data: { emailNaFilaDesde: null, envioErro: `E-mail: ${res.error}` },
      });
    }
  }

  const aindaNaFila = await prisma.reciboContracheque.count({ where: { emailNaFilaDesde: { not: null } } });
  return { naFila: fila.length, enviados, aindaNaFila, falhas, saldoInicial };
}
