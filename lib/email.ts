// Envio de e-mail via SMTP (nodemailer). Config em SMTP_HOST, SMTP_PORT (587
// STARTTLS ou 465 TLS), SMTP_USER, SMTP_PASS, EMAIL_FROM (ex.: "RH LM Telecom
// <rh@assinelm.com.br>") — como env var ou, na ausência dela, cadastrada pela
// tela de Canais de envio (lib/segredos.ts, mesmo mecanismo cifrado da chave
// da Anthropic).
// Sem configuração, retorna erro claro (mesmo contrato de lib/telegram.ts) —
// o convite fica FAILED com o motivo visível na tela da pesquisa.
//
// ESTE É O ÚNICO PORTÃO DE SAÍDA. Todo e-mail do sistema passa por sendEmail():
// convite de pesquisa, lembrete, campanha do portal, notificação de ciclo e
// convite de usuário. O teto diário, o dedupe e a lista de supressão moram aqui
// justamente por isso — em qualquer outro lugar seriam contornáveis.
//
// Antes de 01/08/2026 o teto era conferido só em lib/convites.ts, contando
// SurveyToken. Os outros quatro caminhos não criam SurveyToken e gastavam cota
// sem aparecer no contador: em 28/07 saíram 118+ e-mails num dia de teto 100,
// dos quais ~60 foram a campanha do portal disparada em 8 segundos.
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { LIMITE_DIARIO_ENVIOS } from "@/lib/constants-rh";
import { CHAVE_EMAIL_FROM, CHAVE_SMTP_HOST, CHAVE_SMTP_PASS, CHAVE_SMTP_PORT, CHAVE_SMTP_USER, segredo } from "@/lib/segredos";

// Por que a falha importa para quem chamou: um convite recusado por COTA volta
// amanhã e NÃO pode ser marcado FAILED (FAILED nunca é retentado pelo envio
// automático — marcar assim aposentaria o convite para sempre). Já SUPRIMIDO e
// INVALIDO são permanentes e devem virar FAILED mesmo.
export type MotivoFalhaEmail = "COTA" | "SUPRIMIDO" | "INVALIDO" | "CONFIG" | "ERRO";

export type ResultadoEnvio =
  | { ok: true; deduplicado?: boolean }
  | { ok: false; error: string; motivo: MotivoFalhaEmail };

// Início do dia corrente no fuso de Brasília (o servidor roda em UTC). O teto
// do provedor vira à meia-noite UTC, mas quem lê o relatório pensa em dia de
// Brasília — e usar a janela mais conservadora das duas nunca estoura a cota.
export function inicioDoDiaSaoPaulo(agora = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // 00:00 em São Paulo = 03:00 UTC (UTC-3, sem horário de verão desde 2019).
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 3, 0, 0));
}

// Formato bem básico de propósito: não é validação de existência, só evita
// gastar uma conexão SMTP com lixo óbvio (campo em branco, nome sem @).
const FORMATO_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Quantos e-mails ainda cabem hoje. Conta o que REALMENTE saiu (ok = true) —
// uma falha de conexão não consumiu cota do provedor e não deve descontar.
export async function orcamentoRestanteHoje(): Promise<number> {
  const enviadosHoje = await prisma.emailEnviado.count({
    where: { ok: true, enviadoEm: { gte: inicioDoDiaSaoPaulo() } },
  });
  return Math.max(0, LIMITE_DIARIO_ENVIOS - enviadosHoje);
}

// Transporter com pool reutilizado entre envios do mesmo processo — sem isso,
// cada e-mail paga um handshake TLS/SMTP completo (~1s), o que inviabiliza o
// envio em lote dentro do tempo de uma server action.
let cached: { key: string; transporter: Transporter } | null = null;
function getTransporter(host: string, port: number, user: string, pass: string): Transporter {
  const key = `${host}:${port}:${user}`;
  if (cached?.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 2,
  });
  cached = { key, transporter };
  return transporter;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  /** Versão em texto puro. Melhora a entrega e atende quem lê sem HTML. */
  text?: string;
  /**
   * Nome exibido no remetente. O endereço é sempre o mesmo (é o domínio
   * verificado), mas o nome varia por marca — quem é da Centrysol não deve ver
   * "RH LM Telecom" na caixa de entrada.
   */
  fromName?: string;
  /**
   * Chave de deduplicação do dia. Dois envios com a mesma chave no mesmo
   * dia-calendário de Brasília só gastam cota uma vez: o segundo volta
   * `{ ok: true, deduplicado: true }` sem tocar no SMTP.
   *
   * É o que impede o reenvio manual pela tela de duplicar o que o cron já
   * mandou — em 28/07 houve gente que recebeu o mesmo convite 3x no mesmo dia.
   * Omitir a chave desliga o dedupe (use quando o reenvio é o objetivo).
   */
  chave?: string;
}): Promise<ResultadoEnvio> {
  const [host, portRaw, user, pass, fromRaw] = await Promise.all([
    segredo(CHAVE_SMTP_HOST),
    segredo(CHAVE_SMTP_PORT),
    segredo(CHAVE_SMTP_USER),
    segredo(CHAVE_SMTP_PASS),
    segredo(CHAVE_EMAIL_FROM),
  ]);
  const port = Number(portRaw || 587);

  if (!host || !user || !pass) {
    return {
      ok: false,
      motivo: "CONFIG",
      error: "SMTP não configurado (defina SMTP_HOST, SMTP_USER e SMTP_PASS).",
    };
  }
  const from = fromRaw || user;

  const para = normalizarEmail(params.to);
  if (!FORMATO_EMAIL.test(para)) {
    return { ok: false, motivo: "INVALIDO", error: `E-mail inválido: ${params.to}` };
  }

  const suprimido = await prisma.emailSuprimido.findUnique({ where: { email: para } });
  if (suprimido) {
    return {
      ok: false,
      motivo: "SUPRIMIDO",
      error: `Endereço na lista de supressão (${suprimido.motivo}).`,
    };
  }

  const inicioDoDia = inicioDoDiaSaoPaulo();

  if (params.chave) {
    const jaSaiuHoje = await prisma.emailEnviado.findFirst({
      where: { chave: params.chave, ok: true, enviadoEm: { gte: inicioDoDia } },
      select: { id: true },
    });
    if (jaSaiuHoje) return { ok: true, deduplicado: true };
  }

  // Teto do dia. A checagem não é atômica com o INSERT lá embaixo — dois envios
  // simultâneos podem ler o mesmo total e passar juntos. Tolerável de propósito:
  // LIMITE_DIARIO_ENVIOS já embute folga sob a cota real do provedor, e um lock
  // por linha aqui serializaria todo o envio em lote.
  const enviadosHoje = await prisma.emailEnviado.count({
    where: { ok: true, enviadoEm: { gte: inicioDoDia } },
  });
  if (enviadosHoje >= LIMITE_DIARIO_ENVIOS) {
    return {
      ok: false,
      motivo: "COTA",
      error:
        `Teto diário de ${LIMITE_DIARIO_ENVIOS} e-mails atingido — ` +
        `o envio continua amanhã.`,
    };
  }

  let erro: string | null = null;
  try {
    const transporter = getTransporter(host, port, user, pass);
    // Troca só o nome de exibição, preservando o endereço configurado.
    const remetente = params.fromName
      ? `${params.fromName} <${String(from).match(/<(.+)>/)?.[1] ?? from}>`
      : from;
    await transporter.sendMail({
      from: remetente,
      to: para,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    });
  } catch (e) {
    erro = `Falha ao enviar e-mail: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Registra tentativa e sucesso. Fora do try do envio de propósito: o registro
  // é a fonte do orçamento, e perder uma linha aqui faria o teto contar a menos
  // e liberar envio além da cota. Se o próprio INSERT falhar, o envio já
  // aconteceu — então falhamos fechado, devolvendo erro em vez de seguir.
  try {
    await prisma.emailEnviado.create({
      data: {
        para,
        assunto: params.subject.slice(0, 300),
        chave: params.chave ?? null,
        ok: erro === null,
        erro: erro?.slice(0, 500) ?? null,
      },
    });
  } catch (e) {
    console.error("[email] não consegui registrar o envio no orçamento:", e);
    if (erro === null) {
      return {
        ok: false,
        motivo: "ERRO",
        error: "E-mail enviado, mas o registro do orçamento falhou — verifique antes de reenviar.",
      };
    }
  }

  return erro === null ? { ok: true } : { ok: false, motivo: "ERRO", error: erro };
}
