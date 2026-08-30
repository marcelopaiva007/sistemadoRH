import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { diaBrasilia } from "@/lib/datas";
import { diasAtePrazo, prazoEmTexto } from "@/lib/delegacoes/consultas";
import { semaforoDaDemanda, rotuloCriticidade, type Semaforo } from "@/lib/constants-delegacoes";
import { STATUS_ATIVOS } from "@/lib/delegacoes/estados";
import { demandaEntraNoDigest, diaSemanaIso, type PeriodoDigest } from "@/lib/delegacoes/digest";

// A METADE IMPURA do digest (spec §6.1/§9.1): lê o banco, agrupa por
// SOLICITANTE (é ele quem recebe — o digest é sobre o que ELE delegou),
// filtra pela periodicidade de cada demanda (lib/delegacoes/digest.ts, puro)
// e manda um e-mail por pessoa. Chamado pelo cron demandas-digest, 2x/dia.

/** Hora corrente em Brasília, 0-23 — decide se esta rodada é MANHÃ ou TARDE. */
function horaBrasilia(agora: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(
      agora,
    ),
  );
}

const SELECT_DIGEST = {
  id: true,
  titulo: true,
  status: true,
  prazo: true,
  criticidade: true,
  periodicidadeRetorno: true,
  emRisco: true,
  solicitante: { select: { id: true, nome: true, email: true } },
  responsavel: { select: { nome: true } },
  _count: { select: { repactuacoes: true } },
  // A classificação mais recente — o que decide se este item entra
  // "destacado" no digest (spec §7: em_risco/travado_dependencia).
  interacoes: {
    where: { tipo: "RECEBIDA" as const, classificacaoIa: { not: null } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { classificacaoIa: true },
  },
} as const;

type ItemDigest = {
  titulo: string;
  href: string;
  responsavelNome: string;
  criticidade: number;
  prazoTexto: string;
  diasParaPrazo: number;
  semaforo: Semaforo;
  classificacaoIa: string | null;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const DESTAQUE_IA = new Set(["EM_RISCO", "TRAVADO_DEPENDENCIA", "PRECISA_DECISAO_SUA"]);

function montarEmail(itens: ItemDigest[], periodo: PeriodoDigest): { assunto: string; texto: string; html: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // Exceções primeiro — mesmo critério do Painel da Direção: vermelho e
  // amarelo (ou destacado pela IA) antes do resto.
  const ordenados = [...itens].sort((a, b) => {
    const pa = a.semaforo === "VERMELHO" || DESTAQUE_IA.has(a.classificacaoIa ?? "") ? 0 : a.semaforo === "AMARELO" ? 1 : 2;
    const pb = b.semaforo === "VERMELHO" || DESTAQUE_IA.has(b.classificacaoIa ?? "") ? 0 : b.semaforo === "AMARELO" ? 1 : 2;
    return pa - pb || a.diasParaPrazo - b.diasParaPrazo;
  });

  const linhasTexto = ordenados.map((i) => {
    const marcador = i.semaforo === "VERMELHO" ? "🔴" : i.semaforo === "AMARELO" ? "🟡" : i.semaforo === "CINZA" ? "⚪" : "🟢";
    return `${marcador} ${i.titulo} — com ${i.responsavelNome}, ${rotuloCriticidade(i.criticidade)}, prazo ${i.prazoTexto}`;
  });
  const linhasHtml = ordenados
    .map((i) => {
      const marcador = i.semaforo === "VERMELHO" ? "🔴" : i.semaforo === "AMARELO" ? "🟡" : i.semaforo === "CINZA" ? "⚪" : "🟢";
      return `<li>${marcador} <a href="${appUrl}${i.href}">${esc(i.titulo)}</a> — com ${esc(i.responsavelNome)}, ${rotuloCriticidade(i.criticidade)}, prazo ${i.prazoTexto}</li>`;
    })
    .join("");

  const assunto =
    periodo === "MANHA" ? `[Delegações] Seu resumo de hoje (${itens.length})` : `[Delegações] O que ficou atrasado hoje (${itens.length})`;

  return {
    assunto,
    texto: [`Suas demandas de hoje:`, "", ...linhasTexto, "", `Ver tudo: ${appUrl}/delegacoes/delegadas`].join("\n"),
    html: `<p>Suas demandas de hoje:</p><ul>${linhasHtml}</ul><p><a href="${appUrl}/delegacoes/delegadas">Ver tudo</a></p>`,
  };
}

export type ResultadoDigest = { enviados: number; deduplicados: number; semEmail: number };

/**
 * Monta e manda o digest da rodada atual. Idempotente por `chave`
 * (solicitante+dia+período): rodar duas vezes na mesma janela não duplica.
 */
export async function enviarDigests(agora = new Date()): Promise<ResultadoDigest> {
  const hoje = diaBrasilia(agora);
  const periodo: PeriodoDigest = horaBrasilia(agora) < 12 ? "MANHA" : "TARDE";
  const dow = diaSemanaIso(hoje);

  const demandas = await prisma.demanda.findMany({
    where: { status: { in: [...STATUS_ATIVOS] } },
    select: SELECT_DIGEST,
  });

  const porSolicitante = new Map<
    string,
    { nome: string; email: string | null; itens: ItemDigest[] }
  >();

  for (const d of demandas) {
    const diasParaPrazo = diasAtePrazo(d.prazo, agora);
    if (
      !demandaEntraNoDigest({
        periodicidadeRetorno: d.periodicidadeRetorno,
        diasParaPrazo,
        periodo,
        diaSemanaIso: dow,
      })
    ) {
      continue;
    }
    let grupo = porSolicitante.get(d.solicitante.id);
    if (!grupo) {
      grupo = { nome: d.solicitante.nome, email: d.solicitante.email, itens: [] };
      porSolicitante.set(d.solicitante.id, grupo);
    }
    grupo.itens.push({
      titulo: d.titulo,
      href: `/delegacoes/${d.id}`,
      responsavelNome: d.responsavel.nome,
      criticidade: d.criticidade,
      prazoTexto: prazoEmTexto(d.prazo),
      diasParaPrazo,
      semaforo: semaforoDaDemanda({
        status: d.status,
        diasParaPrazo,
        emRisco: d.emRisco,
        repactuada: d._count.repactuacoes > 0,
      }),
      classificacaoIa: d.interacoes[0]?.classificacaoIa ?? null,
    });
  }

  const resultado: ResultadoDigest = { enviados: 0, deduplicados: 0, semEmail: 0 };
  for (const [solicitanteId, grupo] of porSolicitante) {
    if (!grupo.email) {
      resultado.semEmail++;
      continue;
    }
    const { assunto, texto, html } = montarEmail(grupo.itens, periodo);
    const envio = await sendEmail({
      to: grupo.email,
      fromName: "Delegações",
      subject: assunto,
      text: texto,
      html,
      chave: `delegacoes-digest:${solicitanteId}:${hoje}:${periodo}`,
    });
    if (envio.ok && envio.deduplicado) resultado.deduplicados++;
    else if (envio.ok) resultado.enviados++;
  }

  return resultado;
}
