// ROTA TEMPORÁRIA DE DIAGNÓSTICO — REMOVER APÓS O USO.
//
// Responde a uma única pergunta: o banco deste app é o mesmo do
// lm-bonificacao? Para isso lista as tabelas do schema public e conta as
// linhas das tabelas do módulo de bonificação. Se elas existirem com dados,
// os dois sistemas estão dividindo o mesmo Postgres.
//
// Somente leitura (information_schema + COUNT). Não expõe host, usuário,
// senha nem connection string. A proteção é a própria URL aleatória.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowlist fixa — os nomes nunca vêm da request, então o queryRawUnsafe
// abaixo não tem superfície de injeção.
const TABELAS_BONIFICACAO = [
  "Cidade",
  "Equipe",
  "Funcionario",
  "RegraBonificacao",
  "LancamentoVenda",
  "ImportLote",
  "FechamentoMensal",
  "BonificacaoCalculada",
  "Ajuste",
  "ContratoAtivacaoElleven",
  "contrato_ativacao_elleven",
  "elleven_relatorio_linha",
  "VendaChipMovel",
];

const TABELAS_RH = [
  "Empresa",
  "Setor",
  "Posicao",
  "Colaborador",
  "Pesquisa",
  "SurveyToken",
  "Resposta",
];

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const existentes = new Set(rows.map((r) => r.table_name));

    async function contar(nomes: string[]) {
      const out: Record<string, number | null> = {};
      for (const t of nomes) {
        if (!existentes.has(t)) {
          out[t] = null; // tabela não existe neste banco
          continue;
        }
        const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*)::bigint AS n FROM "${t}"`,
        );
        out[t] = Number(r[0].n);
      }
      return out;
    }

    const bonificacao = await contar(TABELAS_BONIFICACAO);
    const rh = await contar(TABELAS_RH);

    const tabelasBonifPresentes = Object.entries(bonificacao).filter(
      ([, v]) => v !== null,
    );
    const linhasBonif = tabelasBonifPresentes.reduce(
      (acc, [, v]) => acc + (v ?? 0),
      0,
    );

    return NextResponse.json({
      veredito:
        tabelasBonifPresentes.length === 0
          ? "BANCOS SEPARADOS — nenhuma tabela de bonificação existe aqui"
          : linhasBonif === 0
            ? "MESMO BANCO (ou cópia do schema) — tabelas de bonificação existem, mas estão vazias"
            : "MESMO BANCO — tabelas de bonificação existem e têm dados",
      tabelasBonificacaoPresentes: tabelasBonifPresentes.length,
      linhasBonificacaoTotal: linhasBonif,
      bonificacao,
      rh,
      totalTabelasNoSchema: existentes.size,
      todasAsTabelas: [...existentes].sort(),
    });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
