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
import {
  CHAVE_EMAIL_FROM,
  CHAVE_SMTP_HOST,
  CHAVE_SMTP_PASS,
  CHAVE_SMTP_PORT,
  CHAVE_SMTP_USER,
  segredo,
} from "@/lib/segredos";

// Por que a falha importa para quem chamou: um convite recusado por COTA volta
// amanhã e NÃO pode ser marcado FAILED (FAILED nunca é retentado pelo envio
// automático — marcar assim aposentaria o convite para sempre). Já SUPRIMIDO e
// INVALIDO são permanentes e devem virar FAILED mesmo.
export type MotivoFalhaEmail = "COTA" | "SUPRIMIDO" | "INVALIDO" | "CONFIG" | "ERRO";

export type ResultadoEnvio =
  | { ok: true; deduplicado?: boolean }
  | { ok: false; error: string; motivo: MotivoFalhaEmail };

export const ORIGENS_EMAIL = [
  "CONTRACHEQUE",
  "CONTRACHEQUE_REENVIO",
  "CONTRACHEQUE_COMPROVANTE",
  "CONVITE_PESQUISA",
  "LEMBRETE_PESQUISA",
  "CONVITE_PORTAL",
  "COBRANCA_RH",
  "NOTIFICACAO_PESQUISA",
  "ALERTA_RH",
  "AVISO_GESTOR",
  "INFORMATIVO",
  "REGUA_COBRANCA",
  "CONVITE_USUARIO",
  "REDEFINIR_SENHA_ADMIN",
  "RECUPERACAO_SENHA",
  "LEMBRAR_USUARIO",
  "COBRANCA_CADASTRO",
  "DELEGACOES",
  "OUTRO",
] as const;

export type OrigemEmail = (typeof ORIGENS_EMAIL)[number];

export const STATUS_LOG_EMAIL = [
  "ENVIADO",
  "FALHOU",
  "BLOQUEADO_TETO",
  "SUPRIMIDO",
  "INVALIDO",
] as const;

export type StatusLogEmail = (typeof STATUS_LOG_EMAIL)[number];

export const ROTULO_ORIGEM_EMAIL: Record<OrigemEmail, string> = {
  CONTRACHEQUE: "Contracheque",
  CONTRACHEQUE_REENVIO: "Contracheque (Reenvio)",
  CONTRACHEQUE_COMPROVANTE: "Comprovante Contracheque",
  CONVITE_PESQUISA: "Convite de Pesquisa",
  LEMBRETE_PESQUISA: "Lembrete de Pesquisa",
  CONVITE_PORTAL: "Convite do Portal",
  COBRANCA_RH: "Cobrança RH",
  NOTIFICACAO_PESQUISA: "Notificação de Pesquisa",
  ALERTA_RH: "Alerta RH",
  AVISO_GESTOR: "Aviso do Gestor",
  INFORMATIVO: "Informativo RH",
  REGUA_COBRANCA: "Régua de Cobrança",
  CONVITE_USUARIO: "Convite de Usuário",
  REDEFINIR_SENHA_ADMIN: "Redefinir Senha (Admin)",
  RECUPERACAO_SENHA: "Recuperação de Senha",
  LEMBRAR_USUARIO: "Lembrar Usuário",
  COBRANCA_CADASTRO: "Cobrança de Cadastro",
  DELEGACOES: "Delegações",
  OUTRO: "Outro",
};

export const ROTULO_STATUS_EMAIL: Record<StatusLogEmail, string> = {
  ENVIADO: "Enviado",
  FALHOU: "Falha",
  BLOQUEADO_TETO: "Bloqueado pelo Teto",
  SUPRIMIDO: "Suprimido",
  INVALIDO: "Inválido",
};

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

/** Retorna a meia-noite de Brasília (03:00 UTC) para uma data YYYY-MM-DD específica. */
export function inicioDoDiaBrasiliaDe(ymd: string): Date {
  const [ano, mes, dia] = ymd.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0));
}

/**
 * Converte intervalo de datas YYYY-MM-DD de Brasília para [inicio, fimExclusivo) em Date UTC.
 * Ex: intervaloBrasiliaParaDate("2026-11-09", "2026-11-10") ->
 * [2026-11-09T03:00:00.000Z, 2026-11-11T03:00:00.000Z).
 */
export function intervaloBrasiliaParaDate(inicioYmd: string, fimYmd: string): [Date, Date] {
  const [anoIni, mesIni, diaIni] = inicioYmd.split("-").map(Number);
  const [anoFim, mesFim, diaFim] = fimYmd.split("-").map(Number);
  const inicio = new Date(Date.UTC(anoIni, mesIni - 1, diaIni, 3, 0, 0));
  const fim = new Date(Date.UTC(anoFim, mesFim - 1, diaFim + 1, 3, 0, 0));
  return [inicio, fim];
}

export function formatarDataHoraBrasilia(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function escaparCsv(valor: unknown): string {
  const str = String(valor ?? "");
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Gera conteúdo CSV compatível com Excel (separador ';' e BOM UTF-8) para logs de e-mail.
 */
export function montarCsvLogsEmail(linhas: Array<Record<string, unknown>>): string {
  const cabecalho = [
    "Data/Hora (Brasília)",
    "Destinatário",
    "Origem",
    "Assunto",
    "Marca",
    "Empresa",
    "Status",
    "Erro",
  ];

  const linhasTexto = linhas.map((l) => {
    const dataHora =
      l.dataHoraBrasilia != null
        ? String(l.dataHoraBrasilia)
        : l.enviadoEm instanceof Date || typeof l.enviadoEm === "string"
        ? formatarDataHoraBrasilia(l.enviadoEm)
        : "";
    const destinatario = String(l.destinatario ?? l.para ?? "");
    const origem = String(l.origem ?? "");
    const assunto = String(l.assunto ?? "");
    const marca = String(l.marca ?? l.marcaNome ?? "");
    const empresa = String(l.empresa ?? l.empresaNome ?? l.empresaId ?? "");
    const status = String(l.status ?? (l.ok ? "ENVIADO" : "FALHOU"));
    const erro = String(l.erro ?? "");

    return [
      escaparCsv(dataHora),
      escaparCsv(destinatario),
      escaparCsv(origem),
      escaparCsv(assunto),
      escaparCsv(marca),
      escaparCsv(empresa),
      escaparCsv(status),
      escaparCsv(erro),
    ].join(";");
  });

  return "\uFEFF" + [cabecalho.join(";"), ...linhasTexto].join("\r\n");
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

async function registrarLogEmail(dados: {
  para: string;
  chave?: string | null;
  assunto: string;
  origem?: OrigemEmail | string | null;
  empresaId?: string | null;
  marcaNome?: string | null;
  ok: boolean;
  status: StatusLogEmail;
  erro?: string | null;
}): Promise<void> {
  try {
    if (!prisma.emailEnviado?.create) return;
    await prisma.emailEnviado.create({
      data: {
        para: dados.para,
        assunto: dados.assunto.slice(0, 300),
        chave: dados.chave ?? null,
        origem: dados.origem ?? null,
        empresaId: dados.empresaId ?? null,
        marcaNome: dados.marcaNome ?? null,
        ok: dados.ok,
        status: dados.status,
        erro: dados.erro?.slice(0, 500) ?? null,
      },
    });
  } catch (e) {
    console.error("[email] falha ao registrar log de e-mail:", e);
  }
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
  /**
   * Cópia — endereço inválido é descartado em silêncio (quem importa para o
   * dedupe/teto/supressão é `to`; `cc` nunca bloqueia nem conta feedback de
   * erro próprio). Usado hoje só pela cobrança de pendências do RH
   * (lib/cobranca-rh-pendencias.ts), para o gestor acompanhar em cópia.
   */
  cc?: string[];
  /** Arquivos anexos (ex: contracheque assinado em PDF). */
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  /** Origem/funcionalidade do sistema que disparou o envio. */
  origem?: OrigemEmail;
  /** ID da empresa escopada, quando disponível. */
  empresaId?: string | null;
  /** Nome da marca vinculada, quando disponível. */
  marcaNome?: string | null;
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
    const error = `E-mail inválido: ${params.to}`;
    await registrarLogEmail({
      para: params.to,
      chave: params.chave ?? null,
      assunto: params.subject,
      origem: params.origem,
      empresaId: params.empresaId,
      marcaNome: params.marcaNome,
      ok: false,
      status: "INVALIDO",
      erro: error,
    });
    return { ok: false, motivo: "INVALIDO", error };
  }

  const suprimido = await prisma.emailSuprimido.findUnique({ where: { email: para } });
  if (suprimido) {
    const error = `Endereço na lista de supressão (${suprimido.motivo}).`;
    await registrarLogEmail({
      para,
      chave: params.chave ?? null,
      assunto: params.subject,
      origem: params.origem,
      empresaId: params.empresaId,
      marcaNome: params.marcaNome,
      ok: false,
      status: "SUPRIMIDO",
      erro: error,
    });
    return { ok: false, motivo: "SUPRIMIDO", error };
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
    const error =
      `Teto diário de ${LIMITE_DIARIO_ENVIOS} e-mails atingido — ` +
      `o envio continua amanhã.`;
    await registrarLogEmail({
      para,
      chave: params.chave ?? null,
      assunto: params.subject,
      origem: params.origem,
      empresaId: params.empresaId,
      marcaNome: params.marcaNome,
      ok: false,
      status: "BLOQUEADO_TETO",
      erro: error,
    });
    return {
      ok: false,
      motivo: "COTA",
      error,
    };
  }

  let erro: string | null = null;
  try {
    const transporter = getTransporter(host, port, user, pass);
    // Troca só o nome de exibição, preservando o endereço configurado.
    const remetente = params.fromName
      ? `${params.fromName} <${String(from).match(/<(.+)>/)?.[1] ?? from}>`
      : from;
    const cc = params.cc?.map(normalizarEmail).filter((e) => FORMATO_EMAIL.test(e));
    await transporter.sendMail({
      from: remetente,
      to: para,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      ...(cc && cc.length > 0 ? { cc } : {}),
      ...(params.attachments && params.attachments.length > 0 ? { attachments: params.attachments } : {}),
    });
  } catch (e) {
    erro = `Falha ao enviar e-mail: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Registra tentativa e sucesso/falha
  await registrarLogEmail({
    para,
    chave: params.chave ?? null,
    assunto: params.subject,
    origem: params.origem,
    empresaId: params.empresaId,
    marcaNome: params.marcaNome,
    ok: erro === null,
    status: erro === null ? "ENVIADO" : "FALHOU",
    erro: erro?.slice(0, 500) ?? null,
  });

  return erro === null ? { ok: true } : { ok: false, motivo: "ERRO", error: erro };
}
