// Exportação dos dados de um tipo de evento do eSocial para o escritório
// contábil (26/11/2026) — S2200, S2299, S2210 ou S2230 no caminho.
//
// NÃO é o XML do eSocial nem o leiaute de importação de nenhum sistema de
// folha: o sistema não transmite eventos (decisão desta fase). É um CSV
// legível com o que a ficha tem para o escritório montar o evento — UTF-8 com
// BOM e `;`, que o Excel em português abre direto. Campo que o sistema não
// guarda não entra.
//
// As linhas são EXATAMENTE os eventos da tela /rh/<empresa>/esocial (mesma
// função, lib/esocial.ts::eventosEsocial). Por padrão só os pendentes;
// `?enviados=1` inclui os já marcados.
//
// ESCOPO: a interseção de `?empresas=` com o que o usuário enxerga
// (escopoDeEmpresas) — a mesma conta da tela. Sem filtro, tudo que ele vê.
//
// Como todo download de dado pessoal no sistema, entra na trilha de auditoria.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { escopoDeEmpresas, podeOperarEmpresaRH } from "@/lib/rh-auth-guard";
import { neutralizarFormulaCsv } from "@/lib/csv";
import { registrarAuditoria } from "@/lib/audit";
import { eventosEsocial, planilhaDoEvento } from "@/lib/esocial";
import { ehTipoEventoEsocial, rotuloEventoEsocial } from "@/lib/prazos-legais";
import { diaBrasilia } from "@/lib/datas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Escapa campo de CSV: neutraliza fórmula, dobra aspas e cita quando precisa. */
function campo(v: string): string {
  const s = neutralizarFormulaCsv(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ empresaId: string; tipo: string }> },
) {
  const { empresaId, tipo } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // A mesma pergunta das telas de /rh/<empresa> — e das demais rotas do RH
  // desde a v1.210.0 (scripts/test-guarda-rotas-rh.ts varre esta pasta).
  if (!(await podeOperarEmpresaRH(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }
  if (!ehTipoEventoEsocial(tipo)) {
    return NextResponse.json({ error: "Tipo de evento inválido." }, { status: 400 });
  }

  const url = new URL(req.url);
  const escopo = await escopoDeEmpresas(user, url.searchParams.get("empresas") ?? undefined);
  const incluirEnviados = url.searchParams.get("enviados") === "1";

  const eventos = (await eventosEsocial(escopo)).filter(
    (e) => e.tipo === tipo && (incluirEnviados || e.envio === null),
  );
  const planilha = await planilhaDoEvento(tipo, eventos);

  await registrarAuditoria({
    empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: "EventoEsocialEnvio",
    entidadeId: tipo,
    resumo: `Exportação ${rotuloEventoEsocial(tipo)} para o escritório baixada (${planilha.linhas.length} evento(s), ${escopo.length} CNPJ(s)${incluirEnviados ? ", com enviados" : ""}).`,
  });

  // BOM para o Excel reconhecer UTF-8 e não quebrar acento.
  const corpo =
    "﻿" +
    [planilha.cabecalho.map(campo).join(";"), ...planilha.linhas.map((l) => l.map(campo).join(";"))].join("\r\n") +
    "\r\n";
  const nome = `esocial-${tipo.toLowerCase()}-${diaBrasilia(new Date())}.csv`;

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
