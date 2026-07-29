// Gera o HTML do Relatório de Clima Organizacional (GPTW).
// Convertido em PDF pela rota /api/rh/[empresaId]/pesquisas/[pesquisaId]/relatorio-clima-pdf.
import { DIMENSOES_GPTW } from "@/lib/constants-rh";
import {
  type ResultadoClima,
  type ResultadoComparativo,
  type EvolucaoCiclo,
  classificarScore,
  classificarNPS,
} from "@/lib/clima";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CORES_DIMENSOES: Record<string, string> = {
  CREDIBILIDADE: "#3b82f6",
  RESPEITO: "#8b5cf6",
  IMPARCIALIDADE: "#06b6d4",
  ORGULHO: "#f59e0b",
  CAMARADAGEM: "#10b981",
  GERAL: "#6b7280",
};

const CORES_NIVEL: Record<string, string> = {
  critico: "#dc2626",
  atencao: "#f59e0b",
  bom: "#22c55e",
  excelente: "#16a34a",
};

function cardKpi(titulo: string, valor: string | number, cor?: string): string {
  return `<div style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:24px;font-weight:700;color:${cor ?? "#111827"}">${valor}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">${titulo}</div>
  </div>`;
}

function barraScore(score: number): string {
  const cls = classificarScore(score);
  return `<div style="background:#e5e7eb;border-radius:4px;height:8px;width:100%">
    <div style="background:${cls.cor};width:${score}%;height:100%;border-radius:4px"></div>
  </div>`;
}

function dimensoesHtml(dimensoes: ResultadoClima["mediaPorDimensao"]): string {
  return dimensoes.map((d) => {
    const cor = CORES_DIMENSOES[d.dimensao] || "#6b7280";
    return `<tr>
        <td style="padding:6px 8px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:8px;height:8px;border-radius:50%;background:${cor}"></div>
            <strong>${esc(d.label)}</strong>
          </div>
        </td>
        <td style="text-align:center">${d.respostas}</td>
        <td style="text-align:center;font-weight:600">${d.media.toFixed(2)}/5</td>
        <td style="text-align:center;font-weight:700;color:${CORES_NIVEL[d.nivel]}">${d.media100}</td>
        <td style="min-width:120px">${barraScore(d.media100)}</td>
        <td style="text-align:center;color:${CORES_NIVEL[d.nivel]};font-weight:600;font-size:10px">${d.nivel.toUpperCase()}</td>
      </tr>`;
  }).join("");
}

function heatmapHtml(heatmap: ResultadoClima["heatmap"]): string {
  if (!heatmap.length) return "<p>Sem dados desagregados de heatmap.</p>";
  const setores = [...new Set(heatmap.map((h) => h.setor))];
  const dimensoes = [...new Set(heatmap.map((h) => h.dimensao))];
  const cab = dimensoes.map((dim) => {
    const label = DIMENSOES_GPTW.find((d) => d.value === dim)?.label ?? dim;
    return `<th>${esc(label)}</th>`;
  }).join("");
  const cel = (setor: string, dim: string) => {
    const c = heatmap.find((h) => h.setor === setor && h.dimensao === dim);
    if (!c) return `<td style="background:#f3f4f6;color:#9ca3af">—</td>`;
    return `<td style="background:${CORES_NIVEL[c.nivel]}1a;text-align:center;font-weight:600;color:${CORES_NIVEL[c.nivel]}">${c.media100}</td>`;
  };
  const linhas = setores.map((setor) => {
    const celulas = dimensoes.map((dim) => cel(setor, dim)).join("");
    return `<tr><td style="font-weight:600">${esc(setor)}</td>${celulas}</tr>`;
  }).join("");
  return `<table><thead><tr><th>Setor</th>${cab}</tr></thead><tbody>${linhas}</tbody></table>`;
}

function perguntasCriticasHtml(perguntas: ResultadoClima["perguntasCriticas"]): string {
  if (!perguntas.length) return "<p>Nenhuma pergunta abaixo do limiar crítico.</p>";
  return "<table>" +
    "<thead><tr><th>#</th><th>Dimensão</th><th>Pergunta</th><th style='text-align:center'>Média</th><th style='text-align:center'>Score</th></tr></thead><tbody>" +
    perguntas.map((p, i) => `<tr>
        <td style="text-align:center;font-weight:700;color:${CORES_NIVEL[classificarScore(p.media100).nivel]}">${i + 1}</td>
        <td>${esc(p.dimensaoLabel)}</td>
        <td>${esc(p.enunciado)}</td>
        <td style="text-align:center">${p.media.toFixed(2)}</td>
        <td style="text-align:center;font-weight:700">${p.media100}</td>
      </tr>`).join("") +
    "</tbody></table>";
}

function recomendacoesHtml(recomendacoes: ResultadoClima["recomendacoes"]): string {
  const acoes = recomendacoes.filter((r) => r.nivel === "critico" || r.nivel === "atencao");
  if (!acoes.length) return "<p>Nenhuma ação prioritária — clima geral classificado como Bom/Excelente.</p>";
  return acoes.map((r) => {
    const cor = CORES_NIVEL[r.nivel];
    return `<div style="border-left:4px solid ${cor};padding:8px 12px;margin:8px 0;background:#f9fafb">
      <h3 style="margin:0;color:${cor}">${esc(r.dimensaoLabel)} — ${r.score} (${r.nivel.toUpperCase()})</h3>
      <ul style="margin:6px 0;padding-left:20px">${r.acoes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    </div>`;
  }).join("");
}

function comentariosHtml(comentarios: ResultadoClima["comentarios"]): string {
  if (!comentarios.length) return "<p>Nenhum comentário textual.</p>";
  return comentarios.map((c) => `<div style="border-left:2px solid #d1d5db;padding:4px 8px;margin:4px 0;font-size:10.5px">
    <em>${esc(c.texto)}</em> <span style="color:#6b7280;font-size:9px">— ${esc(c.setor)}</span>
  </div>`).join("");
}

function evolucaoHtml(evolucao: EvolucaoCiclo[]): string {
  if (evolucao.length < 2) return "<p>Histórico insuficiente para análise temporal.</p>";
  const pontos = evolucao.map((e) => `${e.encerradaEm.toLocaleDateString("pt-BR")} <strong>${e.scoreGeral}</strong>`).join(" · ");
  return `<p><strong>Ciclos encerrados:</strong> ${pontos}</p>
    <p>Linha do tempo visualizada em gráfico de linha no dashboard interativo.</p>`;
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
  evolucao: EvolucaoCiclo[];
}): string {
  const { resultado, comparativo, convites, evolucao } = dados;
  const clsGeral = classificarScore(resultado.scoreGeral);
  const participacao = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;
  const hoje = new Date().toLocaleDateString("pt-BR");

  const npsHtml = resultado.nps
    ? `<div style="display:flex;gap:8px;align-items:center;margin:8px 0">
        <div style="text-align:center;min-width:80px">
          <div style="font-size:28px;font-weight:700;color:${classificarNPS(resultado.nps.score).cor}">${resultado.nps.score}</div>
          <div style="font-size:10px;color:#6b7280">NPS</div>
        </div>
        <div style="flex:1">
          <div style="display:flex;gap:8px;font-size:10px;margin-bottom:4px">
            <span style="color:#16a34a">■ Promotores ${resultado.nps.promotores} (${Math.round((resultado.nps.promotores / resultado.nps.total) * 100)}%)</span>
            <span style="color:#f59e0b">■ Neutros ${resultado.nps.neutros} (${Math.round((resultado.nps.neutros / resultado.nps.total) * 100)}%)</span>
            <span style="color:#6b7280">■ Detratores ${resultado.nps.detratores} (${Math.round((resultado.nps.detratores / resultado.nps.total) * 100)}%)</span>
          </div>
          <div style="background:#e5e7eb;border-radius:4px;height:10px;display:flex">
            <div style="background:#16a34a;width:${Math.round((resultado.nps.promotores / resultado.nps.total) * 100)}%;border-radius:4px 0 0 4px"></div>
            <div style="background:#f59e0b;width:${Math.round((resultado.nps.neutros / resultado.nps.total) * 100)}%"></div>
            <div style="background:#6b7280;width:${Math.round((resultado.nps.detratores / resultado.nps.total) * 100)}%;border-radius:0 4px 4px 0"></div>
          </div>
        </div>
      </div>`
    : "";

  const alertas = resultado.mediaPorDimensao.filter((d) => d.nivel === "critico" || d.nivel === "atencao");

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
  .alerta { border: 1px solid #f59e0b; background: #fffbeb; padding: 8px 12px; border-radius: 6px; margin: 8px 0; }
</style></head><body>

<div class="capa">
  <h1>Relatório Executivo de Clima Organizacional</h1>
  <p><strong>Empresa:</strong> ${esc(dados.empresaNome)} &nbsp;|&nbsp; <strong>Pesquisa:</strong> ${esc(dados.pesquisaTitulo)}</p>
  <p><strong>Emissão:</strong> ${hoje}
    ${dados.iniciadaEm ? ` &nbsp;|&nbsp; <strong>Período:</strong> ${dados.iniciadaEm.toLocaleDateString("pt-BR")}${dados.encerradaEm ? ` a ${dados.encerradaEm.toLocaleDateString("pt-BR")}` : " (em andamento)"}` : ""}</p>
</div>

<h2>1. Resumo Executivo</h2>
<div class="kpis">
  ${cardKpi("Respostas", `${resultado.totalRespostas}/${convites} (${participacao}%)`)}
  ${cardKpi("Score Geral", `${resultado.scoreGeral}`, clsGeral.cor)}
  ${cardKpi("Classificação", clsGeral.label, clsGeral.cor)}
  ${cardKpi("Dimensões em Alerta", `${alertas.length}`, alertas.length > 0 ? "#dc2626" : "#22c55e")}
</div>
${npsHtml}

${alertas.length > 0 ? `
<div class="alerta">
  <strong>⚠️ Atenção prioritária:</strong> ${alertas.length} dimensão${alertas.length === 1 ? "" : "es"} ${alertas.length === 1 ? "está" : "estão"} em nível Crítico ou Atenção — ${alertas.map((a) => `<strong>${esc(a.label)}</strong>`).join(", ")}. Ver recomendações na seção 6.
</div>` : `<div class="alerta" style="background:#ecfdf5;border-color:#22c55e"><strong>✓ Sem alertas:</strong> todas as dimensões classificadas como Bom ou Excelente.</div>`}

<h2>2. Scores por Dimensão GPTW</h2>
<table>
  <thead><tr><th>Dimensão</th><th style="text-align:center">Respostas</th><th style="text-align:center">Média (1-5)</th><th style="text-align:center">Score (0-100)</th><th>Evolução</th><th style="text-align:center">Nível</th></tr></thead>
  <tbody>${dimensoesHtml(resultado.mediaPorDimensao)}</tbody>
</table>
<p style="color:#6b7280;font-size:10px">Crítico 0-39 · Atenção 40-59 · Bom 60-74 · Excelente 75-100</p>

<h2>3. Heatmap — Setor × Dimensão</h2>
${heatmapHtml(resultado.heatmap)}

<h2>4. Perguntas Críticas (Top 5 piores)</h2>
${perguntasCriticasHtml(resultado.perguntasCriticas)}

<h2>5. Resultados por Setor — Ranking</h2>
<table>
  <thead><tr><th>#</th><th>Setor</th><th style="text-align:center">Respostas</th><th style="text-align:center">Score</th><th>Nível</th></tr></thead>
  <tbody>
    ${resultado.porSetor.map((s) => `<tr>
      <td style="text-align:center;font-weight:700">${s.ranking}</td>
      <td>${esc(s.setor)}</td>
      <td style="text-align:center">${s.respostas}${s.amostraInsuficiente ? " <em style='color:#f59e0b'>(amostra baixa)</em>" : ""}</td>
      <td style="text-align:center;font-weight:700;color:${CORES_NIVEL[s.media100 < 40 ? "critico" : s.media100 < 60 ? "atencao" : s.media100 < 75 ? "bom" : "excelente"]}">${s.media100}</td>
      <td>${classificarScore(s.media100).label}</td>
    </tr>`).join("")}
  </tbody>
</table>

<h2 class="quebra">6. Plano de Ação Recomendado</h2>
${recomendacoesHtml(resultado.recomendacoes)}

<h2>7. Evolução Histórica</h2>
${evolucaoHtml(evolucao)}

<h2>8. Comentários dos Colaboradores</h2>
${comentariosHtml(resultado.comentarios)}

<h2>9. Nota Metodológica</h2>
<p>Instrumento de clima organizacional baseado no modelo Great Place to Work (GPTW): 21 perguntas
em escala Likert 1-5 distribuídas em 5 dimensões (Credibilidade, Respeito, Imparcialidade, Orgulho,
Camaradagem) + 1 pergunta NPS (Net Promoter Score, 0-10).</p>
<p><strong>Score:</strong> Likert 1-5 convertido para 0-100 (1 → 0, 3 → 50, 5 → 100). Score geral = média
dos scores das dimensões. <strong>NPS:</strong> promotores (9-10) · neutros (7-8) · detratores (0-6).
<strong>Heatmap:</strong> cruzamento setor × dimensão com cores conforme classificação.</p>
<p><strong>Anonimato:</strong> grupos com menos de 3 respostas não têm desagregação exibida.
<strong>Plano de ação:</strong> gerado automaticamente a partir das dimensões em nível Crítico ou Atenção
— sugestões para validação pelo RH/diretoria, não plano fechado.</p>

</body></html>`;
}
