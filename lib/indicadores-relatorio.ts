// Gera o HTML do Relatório de Indicadores (BI de RH). Convertido em PDF por
// /api/rh/[empresaId]/indicadores/relatorio-pdf. Mesmo padrão de
// lib/avaliacao-relatorio.ts — HTML server-side, sem cliente nenhum na
// geração; o corte de escopo original (OS-02) tinha entregado só o CSV, isto
// fecha o pedido de paridade com o PDF que as pesquisas já tinham.
import type { LinhaAbsenteismo, LinhaCusto, LinhaHeadcount, ResultadoTurnover } from "@/lib/bi";
import { formatarReais } from "@/lib/constants-beneficios";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cardKpi(titulo: string, valor: string, cor?: string): string {
  return `<div style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:${cor ?? "#111827"}">${esc(valor)}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">${esc(titulo)}</div>
  </div>`;
}

function corAbsenteismo(pct: number): string {
  if (pct >= 5) return "#dc2626";
  if (pct >= 2) return "#f59e0b";
  return "#16a34a";
}

function barraRelativa(valor: number, max: number, cor: string): string {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return `<div style="background:#e5e7eb;border-radius:4px;height:8px;width:100%">
    <div style="background:${cor};width:${pct}%;height:100%;border-radius:4px"></div>
  </div>`;
}

function tabelaPorSetor(
  headcount: LinhaHeadcount[],
  absenteismoPorSetor: Map<string, number>,
  custoPorSetor: Map<string, number>,
): string {
  if (headcount.length === 0) return "<p>Sem colaboradores ativos.</p>";
  const maiorCusto = Math.max(...headcount.map((h) => custoPorSetor.get(h.setor) ?? 0), 1);
  return (
    "<table><thead><tr><th>Setor</th><th style='text-align:center'>Colaboradores</th>" +
    "<th style='text-align:center'>Absenteísmo</th><th style='text-align:right'>Custo/mês</th>" +
    "<th style='min-width:110px'></th></tr></thead><tbody>" +
    headcount
      .map((h) => {
        const abs = absenteismoPorSetor.get(h.setor) ?? 0;
        const custo = custoPorSetor.get(h.setor) ?? 0;
        return `<tr>
          <td><strong>${esc(h.setor)}</strong></td>
          <td style="text-align:center">${h.total}</td>
          <td style="text-align:center;font-weight:700;color:${corAbsenteismo(abs)}">${abs.toFixed(1)}%</td>
          <td style="text-align:right">${esc(formatarReais(custo))}</td>
          <td>${barraRelativa(custo, maiorCusto, "#2563eb")}</td>
        </tr>`;
      })
      .join("") +
    "</tbody></table>"
  );
}

function tabelaMovimento(movimento: { mes: string; admissoes: number; desligamentos: number }[]): string {
  const relevante = movimento.filter((m) => m.admissoes > 0 || m.desligamentos > 0);
  if (relevante.length === 0) return "<p>Nenhuma admissão ou desligamento nos últimos 12 meses.</p>";
  return (
    "<table><thead><tr><th>Mês</th><th style='text-align:center'>Admissões</th>" +
    "<th style='text-align:center'>Desligamentos</th></tr></thead><tbody>" +
    relevante
      .map(
        (m) => `<tr>
          <td>${esc(m.mes)}</td>
          <td style="text-align:center;color:#16a34a;font-weight:600">${m.admissoes > 0 ? `+${m.admissoes}` : "—"}</td>
          <td style="text-align:center;color:#dc2626;font-weight:600">${m.desligamentos > 0 ? `-${m.desligamentos}` : "—"}</td>
        </tr>`,
      )
      .join("") +
    "</tbody></table>"
  );
}

export function gerarHtmlRelatorioIndicadores(params: {
  /** Nome da marca quando o escopo é uma só; "Grupo inteiro" quando são
   *  várias — ver `lib/escopo-marca.ts::rotuloDoEscopo`. Nunca assuma marca. */
  rotuloEscopo: string;
  qtdEmpresas: number;
  geradoEm: Date;
  totalAtivos: number;
  totalHistorico: number;
  comSalarioPreenchido: number;
  turnover: ResultadoTurnover;
  movimento: { mes: string; admissoes: number; desligamentos: number }[];
  headcount: LinhaHeadcount[];
  absenteismo: LinhaAbsenteismo[];
  custo: LinhaCusto[];
}): string {
  const {
    rotuloEscopo,
    qtdEmpresas,
    geradoEm,
    totalAtivos,
    totalHistorico,
    comSalarioPreenchido,
    turnover,
    movimento,
    headcount,
    absenteismo,
    custo,
  } = params;

  const custoTotal = custo.reduce((t, c) => t + c.total, 0);
  const absenteismoGeral =
    absenteismo.length > 0 ? absenteismo.reduce((t, a) => t + a.taxaPct, 0) / absenteismo.length : 0;
  const absenteismoPorSetor = new Map(absenteismo.map((a) => [a.setor, a.taxaPct]));
  const custoPorSetor = new Map(custo.map((c) => [c.setor, c.total]));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12px; margin: 0; padding: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e5e7eb; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; text-align: left; }
  th { color: #6b7280; font-weight: 600; text-transform: uppercase; font-size: 10px; }
  .kpis { display: flex; gap: 10px; margin-top: 10px; }
  .rodape { margin-top: 28px; font-size: 10px; color: #9ca3af; }
  .aviso { margin-top: 14px; padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 11px; color: #92400e; }
</style>
</head>
<body>
  <h1>Relatório de Indicadores — RH</h1>
  <p style="color:#6b7280">
    ${esc(rotuloEscopo)}${qtdEmpresas > 1 ? ` — consolidado de ${qtdEmpresas} CNPJs` : ""}
    — gerado em ${geradoEm.toLocaleDateString("pt-BR")}
  </p>

  <div class="kpis">
    ${cardKpi("Colaboradores ativos", String(totalAtivos))}
    ${cardKpi("Turnover (12 meses)", `${turnover.taxaPct.toFixed(1)}%`)}
    ${cardKpi("Absenteísmo médio (30 dias)", `${absenteismoGeral.toFixed(1)}%`, corAbsenteismo(absenteismoGeral))}
    ${cardKpi("Custo de pessoal/mês", formatarReais(custoTotal))}
  </div>

  ${
    comSalarioPreenchido < totalAtivos
      ? `<div class="aviso">Só ${comSalarioPreenchido} de ${totalAtivos} colaboradores ativos têm salário preenchido na ficha — o custo de pessoal abaixo está subestimado até a base ser completada.</div>`
      : ""
  }

  <h2>Por setor</h2>
  ${tabelaPorSetor(headcount, absenteismoPorSetor, custoPorSetor)}

  <h2>Turnover (últimos 12 meses)</h2>
  <table>
    <thead><tr><th>Admissões</th><th>Desligamentos</th><th>Headcount início</th><th>Headcount fim</th></tr></thead>
    <tbody><tr>
      <td style="color:#16a34a;font-weight:700">+${turnover.admissoes}</td>
      <td style="color:#dc2626;font-weight:700">-${turnover.desligados}</td>
      <td>${turnover.headcountInicio}</td>
      <td>${turnover.headcountFim}</td>
    </tr></tbody>
  </table>

  <h2>Movimento mensal</h2>
  ${tabelaMovimento(movimento)}

  <p class="rodape">
    Turnover reconstrói o headcount do início do período a partir do de agora (aproximação, assume
    ninguém reativado no meio do caminho). Absenteísmo considera só falta não abonada, janela de 30
    dias. Total histórico de colaboradores: ${totalHistorico}.
  </p>
</body>
</html>`;
}
