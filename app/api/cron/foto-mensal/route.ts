// Foto mensal (lib/foto-mensal.ts) — grava o snapshot de headcount,
// admissões, desligamentos e folha da competência que fechou, e nunca o
// reescreve. É a memória que falta ao Painel, que hoje reconstrói o passado a
// partir de campos editáveis (ver o cabeçalho de lib/foto-mensal.ts).
//
// Auth: o mesmo padrão das outras 6 rotas de cron (lib/cron-horario.ts) —
// header Bearer $CRON_SECRET vindo do Vercel Cron, ou ?secret= para disparo
// manual. NÃO passa por `deveRodarAgora`: aquilo é dos crons de comunicação,
// cujo horário o RH ajusta na tela de Lembretes. Este não avisa ninguém, é
// operacional como backup-db e gestao-ciclo-pesquisas.
//
// O vercel.json chama esta rota nos dias 5 a 9 de cada mês. Rodar 5 vezes é
// de propósito: a captura é idempotente (a primeira grava, as outras quatro
// custam uma contagem indexada e saem), então um dia de indisponibilidade
// deixa de significar um mês perdido para sempre. E o mês perdido é o dano
// que importa aqui — a foto de uma competência só pode ser tirada enquanto o
// cadastro ainda descreve aquele mês.
//
// Recuperar um mês mais antigo: GET /api/cron/foto-mensal?secret=...&mes=AAAA-MM
import { NextRequest, NextResponse } from "next/server";
import { capturarFotoMensal, ehCompetencia } from "@/lib/foto-mensal";
import { origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `?mes=` só no disparo manual. O cron nunca escolhe competência: ele
  // fotografa o mês que fechou e mais nada. Deixar o agendador aceitar um mês
  // arbitrário abriria caminho para gravar o estado de hoje com etiqueta de
  // outro mês — que é precisamente o tipo de número que esta tabela existe
  // para impedir.
  const mes = origem === "manual" ? req.nextUrl.searchParams.get("mes") : null;
  if (mes && !ehCompetencia(mes)) {
    return NextResponse.json(
      { ok: false, erro: `mes inválido: "${mes}" — esperado "AAAA-MM".` },
      { status: 400 },
    );
  }

  try {
    const resultado = await capturarFotoMensal(mes ? { competencia: mes } : undefined);

    console.log(
      `cron foto-mensal: ${resultado.competencia} — ` +
        (resultado.jaCapturada
          ? `já capturada (${resultado.linhas} linha(s)), nada a fazer.`
          : `${resultado.gravadas} linha(s) gravada(s), headcount ${resultado.headcount}, ` +
            `${resultado.admissoes} admissão(ões), ${resultado.desligamentos} desligamento(s).`),
    );

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    console.error("cron foto-mensal:", e);
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
