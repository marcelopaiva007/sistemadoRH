// Gera o HTML do Relatório de Clima Organizacional (GPTW).
// Convertido em PDF pela rota /api/rh/[empresaId]/pesquisas/[pesquisaId]/relatorio-clima-pdf.
import { DIMENSOES_GPTW } from "@/lib/constants-rh";
import {
  type ResultadoClima,
  type ResultadoComparativo,
  classificarScore,
  classificarNPS,
  likertTo100,
} from "@/lib/clima";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CORES_DIMENSOES: Record<string, string> = {
  CREDIBILIDADE: "#3b82f6",
  RESPEITO: "#8b5cf6",
  IMPARCIALIDADE: "#06b6d4",
  ORGULHO: "#f59e0b",
  CAMARADAGEM: "#10b981",
  GERAL: "#6b7280",
};

function barraScore(score: number, cor: string): string {
  const cls = classificarScore(score);
  return `<div style="margin:4px 0">
    <div style="display:flex;justify-content:space-between;font-size:10px">
      <span>${score}</span><span>${cls.label}</span>
    </div>
    <div style="background:#e5e7eb;border-radius:4px;height:8px;width:100%">
      <div style="background:${cls.cor};width:${score}%;height:100%;border-radius:4px"></div>
    </div>
  </div>`;
}

function cardKpi(titulo: string, valor: string | number, cor?: string): string {
  return `<div style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:24px;font-weight:700;color:${cor ?? "#111827"}">${valor}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">${titulo}</div>
  </div>`;
}

function dimensoesHtml(dimensoes: ResultadoClima["mediaPorDimensao"]): string {
  return dimensoes
    .map(
      (d) => `<tr>
        <td style="padding:6px 8px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:8px;height:8px;border-radius:50%;background:${CORES_DIMENSOES[d.dimensao] || "#6b7280"}"></div>
            <strong>${esc(d.label)}</strong>
          </div>
        </td>
        <td style="text-align:center;padding:6px 8px">${d.respostas}</td>
        <td style="text-align:center;padding:6px 8px;font-weight:600">${d.media.toFixed(2)}/5</td>
        <td style="text-align:center;padding:6px 8px;font-weight:700;color:${classificarScore(d.media100).cor}">${d.media100}</td>
        <td style="width:180px;padding:6px 8px">${barraScore(d.media100, CORES_DIMENSOES[d.dimensao] || "#6b7280")}</td>
      </tr>`,
    )
    .join("");
}

function comparativoHtml(comp: ResultadoComparativo | null): string {
  if (!comp) return "<p>Sem ciclo anterior para comparar.</p>";

  const linhas = comp.variacao
    .map((v) => {
      const cor = v.variacaoPontos > 0 ? "#22c55e" : v.variacaoPontos < 0 ? "#dc2626" : "#6b7280";
      const seta = v.variacaoPontos > 0 ? "▲" : v.variacaoPontos < 0 ? "▼" : "–";
      const label = DIMENSOES_GPTW.find((d) => d.value === v.dimensao)?.label ?? v.dimensao;
      return `<tr>
        <td style="padding:6px 8px">${esc(label)}</td>
        <td style="text-align:center">${v.anterior}</td>
        <td style="text-align:center;font-weight:600">${v.atual}</td>
        <td style="text-align:center;font-weight:700;color:${cor}">${seta} ${Math.abs(v.variacaoPontos)}</td>
      </tr>`;
    })
    .join("");

  return `<table>
    <thead><tr><th>Dimensão</th><th style="text-align:center">Anterior</th><th style="text-align:center">Atual</th><th style="text-align:center">Variação</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

export function gerarHtmlRelatorioClima(dados: {
  empresaNome: string;
  pesquisaTitulo: string;
  pesquisaStatus: string;
  iniciadaEm: Date | null;
  encerradaEm: Date | null;
  convites: number;
  resultado: ResultadoClima;
  comparativo: ResultadoComparativo | null;
}): string {
  const { resultado, comparativo, convites } = dados;
  const clsGeral = classificarScore(resultado.scoreGeral);
  const participacao = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;
  const hoje = new Date().toLocaleDateString("pt-BR");

  const npsHtml = resultado.nps
    ? `<div style="display:flex;gap:8px;align-items:center">
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:700;color:${classificarNPS(resultado.nps.score).cor}">${resultado.nps.score}</div>
          <div style="font-size:10px;color:#6b7280">NPS</div>
        </div>
        <div style="flex:1">
          <div style="display:flex;gap:4px;font-size:10px">
            <span style="color:#dc2626">■ Promotores ${resultado.nps.promotores} (${Math.round((resultado.nps.promotores / resultado.nps.total) * 100)}%)</span>
            <span style="color:#f59e0b">■ Neutros ${resultado.nps.neutros} (${Math.round((resultado.nps.neutros / resultado.nps.total) * 100)}%)</span>
            <span style="color:#6b7280">■ Detratores ${resultado.nps.detratores} (${Math.round((resultado.nps.detratores / resultado.nps.total) * 100)}%)</span>
          </div>
          <div style="background:#e5e7eb;border-radius:4px;height:8px;margin-top:4px;display:flex">
            <div style="background:#16a34a;width:${Math.round((resultado.nps.promotores / resultado.nps.total) * 100)}%;border-radius:4px 0 0 4px"></div>
            <div style="background:#f59e0b;width:${Math.round((resultado.nps.neutros / resultado.nps.total) * 100)}%"></div>
            <div style="background:#6b7280;width:${Math.round((resultado.nps.detratores / resultado.nps.total) * 100)}%;border-radius:0 4px 4px 0"></div>
          </div>
        </div>
      </div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111827; margin: 24px 28px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 8px; border-bottom: 2px solid #111827; padding-bottom: 3px; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  th, td { border: 1px solid #d1d5db; padding: 4px 6px; font-size: 10.5px; }
  th { background: #f3f4f6; }
  .capa { border-bottom: 3px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
  .kpis { display: flex; gap: 10px; margin: 10px 0; }
  .quebra { page-break-before: always; }
</style></head><body>

<div class="capa">
  <h1>Relatório de Clima Organizacional</h1>
  <p><strong>Empresa:</strong> ${esc(dados.empresaNome)} &nbsp;|&nbsp; <strong>Pesquisa:</strong> ${esc(dados.pesquisaTitulo)}</p>
  <p><strong>Emissão:</strong> ${hoje}
    ${dados.iniciadaEm ? ` &nbsp;|&nbsp; <strong>Período:</strong> ${dados.iniciadaEm.toLocaleDateString("pt-BR")}${dados.encerradaEm ? ` a ${dados.encerradaEm.toLocaleDateString("pt-BR")}` : " (em andamento)"}` : ""}</p>
</div>

<h2>1. Resumo Executivo</h2>
<div class="kpis">
  ${cardKpi("Respostas", `${resultado.totalRespostas}/${convites} (${participacao}%)`)}
  ${cardKpi("Score Geral", `${resultado.scoreGeral}`, clsGeral.cor)}
  ${cardKpi("Classificação", clsGeral.label, clsGeral.cor)}
  ${cardKpi("Dimensões", resultado.mediaPorDimensao.length, "#3b82f6")}
</div>
${npsHtml}

<h2>2. Scores por Dimensão GPTW</h2>
<table>
  <thead><tr><th>Dimensão</th><th style="text-align:center">Respostas</th><th style="text-align:center">Média (1-5)</th><th style="text-align:center">Score (0-100)</th><th>Evolução</th></tr></thead>
  <tbody>${dimensoesHtml(resultado.mediaPorDimensao)}</tbody>
</table>
<p style="color:#6b7280;font-size:10px">Score: 0-39 Crítico, 40-59 Atenção, 60-74 Bom, 75-100 Excelente</p>

${resultado.porSetor.length > 0 ? `
<h2>3. Resultados por Setor</h2>
<table>
  <thead><tr><th>Setor</th><th style="text-align:center">Respostas</th><th style="text-align:center">Score</th><th>Evolução</th></tr></thead>
  <tbody>
    ${resultado.porSetor
      .map(
        (s) => `<tr>
          <td>${esc(s.setor)}</td>
          <td style="text-align:center">${s.respostas}${s.amostraInsuficiente ? " <em style='color:#f59e0b'>(amostra baixa)</em>" : ""}</td>
          <td style="text-align:center;font-weight:700;color:${classificarScore(s.media100).cor}">${s.media100}</td>
          <td>${barraScore(s.media100, classificarScore(s.media100).cor)}</td>
        </tr>`,
      )
      .join("")}
  </tbody>
</table>` : ""}

<h2 class="quebra">4. Comparativo com Ciclo Anterior</h2>
${comparativoHtml(comparativo)}

<h2>5. Nota Metodológica</h2>
<p>Instrumento de clima organizacional baseado no modelo Great Place to Work (GPTW), com perguntas
em escala Likert 1-5 em 5 dimensões: Credibilidade, Respeito, Imparcialidade, Orgulho e Camaradagem,
além de uma pergunta NPS (Net Promoter Score) de 0 a 10.</p>
<p>O score de cada dimensão é convertido para escala 0-100: 1 → 0, 3 → 50, 5 → 100.
O score geral é a média dos scores das dimensões. NPS: promotores (9-10), neutros (7-8), detratores (0-6).
Anonimato: grupos com menos de 3 respostas não têm resultados desagregados exibidos.</p>

</body></html>`;
}
