// Gera o HTML do Relatório Técnico de Avaliação de Riscos Psicossociais
// (NR-01 / PGR) — convertido em PDF pela rota
// /api/rh/[empresaId]/pesquisas/[pesquisaId]/relatorio-pdf.
// HTML auto-contido (CSS inline), pensado para impressão A4.
import {
  NIVEIS_RISCO,
  type NivelRisco,
  type ResultadoGrupo,
  type ResultadoNR01,
} from "@/lib/nr01";
import {
  DIMENSOES_NR01,
  PLANO_ACAO_NR01,
  PERGUNTAS_NR01,
  type DimensaoNR01,
} from "@/lib/nr01-modelo";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";

const ORDEM_NIVEL: NivelRisco[] = ["BAIXO", "MEDIO", "ALTO", "CRITICO"];
const PRAZO_SUGERIDO: Record<NivelRisco, string> = {
  CRITICO: "30 dias",
  ALTO: "60 dias",
  MEDIO: "90 dias",
  BAIXO: "monitorar",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function celulaNivel(nr: number, nivel: NivelRisco): string {
  const cfg = NIVEIS_RISCO[nivel];
  return `<td style="text-align:center;background:${cfg.corBg};color:#1f2937;font-weight:600">${nr} · ${cfg.label}</td>`;
}

function tabelaMatriz(grupo: ResultadoGrupo): string {
  const linhas = grupo.dimensoes
    .map(
      (d) => `<tr>
        <td>${esc(d.label)}</td>
        <td style="text-align:center">${d.mediaRisco.toFixed(2)}</td>
        <td style="text-align:center">${Math.round(d.pctExpostos)}%</td>
        <td style="text-align:center">${d.probabilidade}</td>
        <td style="text-align:center">${d.severidade}</td>
        ${celulaNivel(d.nr, d.nivel)}
      </tr>`,
    )
    .join("");
  return `<table>
    <thead><tr><th>Dimensão psicossocial</th><th>Média (0-4)</th><th>% Expostos</th><th>P</th><th>S</th><th>NR = P×S</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

function tabelaGrupos(grupos: ResultadoGrupo[], rotulo: string): string {
  const dims = Object.keys(DIMENSOES_NR01) as DimensaoNR01[];
  const cab = dims.map((d) => `<th>${esc(DIMENSOES_NR01[d].label.split(" ")[0])}</th>`).join("");
  const linhas = grupos
    .map((g) => {
      if (g.amostraInsuficiente) {
        return `<tr><td>${esc(g.grupo)}</td><td style="text-align:center">${g.respostas}</td>
          <td colspan="${dims.length + 1}" style="text-align:center;color:#6b7280">amostra insuficiente (mín. ${AMOSTRA_MINIMA_ANONIMATO})</td></tr>`;
      }
      const células = g.dimensoes.map((d) => celulaNivel(d.nr, d.nivel)).join("");
      return `<tr><td>${esc(g.grupo)}</td><td style="text-align:center">${g.respostas}</td>${células}${celulaNivel(Math.round(g.indiceGeral100), g.nivelGeral)}</tr>`;
    })
    .join("");
  return `<table>
    <thead><tr><th>${esc(rotulo)}</th><th>Respostas</th>${cab}<th>Geral</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

export function gerarHtmlRelatorioNR01(dados: {
  empresaNome: string;
  pesquisaTitulo: string;
  pesquisaStatus: string;
  iniciadaEm: Date | null;
  encerradaEm: Date | null;
  convites: number;
  resultado: ResultadoNR01;
}): string {
  const { empresaNome, resultado, convites } = dados;
  const geral = resultado.geral;
  const hoje = new Date().toLocaleDateString("pt-BR");
  const participacao = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;

  const dimensoesOrdenadas = [...geral.dimensoes].sort(
    (a, b) => ORDEM_NIVEL.indexOf(b.nivel) - ORDEM_NIVEL.indexOf(a.nivel) || b.nr - a.nr,
  );
  const criticas = dimensoesOrdenadas.filter((d) => d.nivel === "ALTO" || d.nivel === "CRITICO");
  const emAtencao = dimensoesOrdenadas.filter((d) => d.nivel !== "BAIXO");

  const resumoNivel = geral.amostraInsuficiente
    ? "amostra insuficiente para análise"
    : `nível geral <strong>${NIVEIS_RISCO[geral.nivelGeral].label.toUpperCase()}</strong> (índice ${Math.round(geral.indiceGeral100)}/100)`;

  const fatoresCriticos = geral.amostraInsuficiente
    ? ""
    : emAtencao
        .map((d) => {
          const info = DIMENSOES_NR01[d.dimensao];
          return `<div class="fator">
            <h3>${esc(d.label)} — <span style="color:${NIVEIS_RISCO[d.nivel].cor}">${NIVEIS_RISCO[d.nivel].label}</span> (NR ${d.nr})</h3>
            <p class="mut">${esc(info.descricao)}</p>
            <p>${Math.round(d.pctExpostos)}% dos respondentes expostos (escore individual ≥ 2,0); intensidade média ${d.mediaRisco.toFixed(2)}/4.</p>
            ${
              d.perguntaCritica
                ? `<p><strong>Item mais crítico:</strong> Q${esc(d.perguntaCritica.codigo)} — "${esc(d.perguntaCritica.enunciado)}" (risco médio ${d.perguntaCritica.mediaRisco.toFixed(2)}/4)</p>`
                : ""
            }
          </div>`;
        })
        .join("");

  const planoAcao = geral.amostraInsuficiente
    ? ""
    : emAtencao
        .map((d) => {
          const acoes = PLANO_ACAO_NR01[d.dimensao]
            .map(
              (a) => `<tr>
                <td>${esc(a)}</td>
                <td style="text-align:center">${NIVEIS_RISCO[d.nivel].label}</td>
                <td style="text-align:center">${PRAZO_SUGERIDO[d.nivel]}</td>
                <td style="min-width:110px"></td>
              </tr>`,
            )
            .join("");
          return `<h3>${esc(d.label)}</h3>
            <table><thead><tr><th>Ação recomendada</th><th>Prioridade</th><th>Prazo sugerido</th><th>Responsável</th></tr></thead>
            <tbody>${acoes}</tbody></table>`;
        })
        .join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111827; margin: 24px 28px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 8px; border-bottom: 2px solid #111827; padding-bottom: 3px; }
  h3 { font-size: 12px; margin: 14px 0 6px; }
  p { margin: 4px 0; }
  .mut { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  th, td { border: 1px solid #d1d5db; padding: 4px 6px; font-size: 10.5px; text-align: left; }
  th { background: #f3f4f6; }
  .capa { border-bottom: 3px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
  .kpis { display: flex; gap: 10px; margin: 10px 0; }
  .kpi { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; text-align: center; }
  .kpi b { font-size: 16px; display: block; }
  .fator { border-left: 3px solid #d1d5db; padding-left: 10px; margin: 10px 0; }
  .quebra { page-break-before: always; }
  .legenda td { text-align: center; font-weight: 600; color: #1f2937; }
</style></head><body>

<div class="capa">
  <h1>Relatório de Avaliação de Riscos Psicossociais — NR-01 / PGR</h1>
  <p><strong>Empresa:</strong> ${esc(empresaNome)} &nbsp;|&nbsp; <strong>Instrumento:</strong> ${esc(dados.pesquisaTitulo)}</p>
  <p><strong>Emissão:</strong> ${hoje}
    ${dados.iniciadaEm ? ` &nbsp;|&nbsp; <strong>Aplicação:</strong> ${dados.iniciadaEm.toLocaleDateString("pt-BR")}${dados.encerradaEm ? ` a ${dados.encerradaEm.toLocaleDateString("pt-BR")}` : " (em andamento)"}` : ""}</p>
</div>

<h2>1. Resumo Executivo</h2>
<div class="kpis">
  <div class="kpi"><b>${resultado.totalRespostas}/${convites}</b>Respostas (${participacao}%)</div>
  <div class="kpi"><b>${geral.amostraInsuficiente ? "—" : Math.round(geral.indiceGeral100)}</b>Índice geral (0-100)</div>
  <div class="kpi"><b>${geral.amostraInsuficiente ? "—" : NIVEIS_RISCO[geral.nivelGeral].label}</b>Nível geral</div>
  <div class="kpi"><b>${geral.amostraInsuficiente ? "—" : criticas.length}</b>Dimensões Alto/Crítico</div>
</div>
<p>A avaliação de fatores de risco psicossociais da empresa ${esc(empresaNome)}, aplicada por meio de
questionário anônimo de 35 itens em 6 dimensões (escala de frequência 0-4), resultou em ${resumoNivel}.
${
  geral.amostraInsuficiente
    ? ""
    : criticas.length > 0
      ? `Requerem atenção prioritária as dimensões: ${criticas.map((d) => `<strong>${esc(d.label)}</strong>`).join(", ")}.`
      : "Nenhuma dimensão atingiu nível Alto ou Crítico na visão geral da empresa; recomenda-se monitoramento contínuo e atenção aos recortes por setor/cargo."
}</p>

${geral.amostraInsuficiente ? "" : `
<h2>2. Matriz de Risco — Empresa</h2>
${tabelaMatriz(geral)}
<p class="mut">P (Probabilidade, 1-5): função da % de trabalhadores expostos. S (Severidade, 1-5): função da
intensidade média entre os expostos. NR = P×S: 1-4 Baixo, 5-9 Médio, 10-16 Alto, 17-25 Crítico.</p>

<h2>3. Análise dos Fatores Críticos</h2>
${fatoresCriticos || "<p>Nenhuma dimensão em nível Médio ou superior.</p>"}

<h2 class="quebra">4. Matriz de Risco por Setor</h2>
${tabelaGrupos(resultado.porSetor, "Setor")}

<h2>5. Matriz de Risco por Cargo</h2>
${tabelaGrupos(resultado.porCargo, "Cargo")}

<h2 class="quebra">6. Plano de Ação Recomendado</h2>
<p class="mut">Ações sugeridas a partir das dimensões em nível Médio ou superior, para validação e
detalhamento pelo responsável técnico do PGR. Prazos contados a partir da apresentação deste relatório.</p>
${planoAcao || "<p>Sem ações obrigatórias — manter monitoramento periódico (reavaliação anual recomendada).</p>"}
`}

<h2>${geral.amostraInsuficiente ? "2" : "7"}. Nota Metodológica</h2>
<p>Instrumento com ${PERGUNTAS_NR01.length} itens em 6 dimensões psicossociais (Demanda e Carga de Trabalho;
Autonomia e Controle; Suporte do Gestor e Emocional; Suporte dos Colegas; Clima, Conflitos e Perseguição;
Clareza de Papel, Mudanças e Propósito), escala de frequência 0 (Nunca) a 4 (Sempre).
Itens de fator de proteção têm pontuação invertida (risco = 4 − resposta).
Exposição individual: escore médio ≥ 2,0 na dimensão. A matriz Probabilidade × Severidade segue a
sistemática de gradação de risco do PGR (NR-01, itens 1.5.4 e 1.5.7).</p>
<p>Anonimato e LGPD: as respostas são coletadas de forma anônima e tratadas exclusivamente de forma
agregada; grupos com menos de ${AMOSTRA_MINIMA_ANONIMATO} respostas não têm resultados exibidos.
Este relatório subsidia o inventário de riscos e o plano de ação do PGR e deve ser avaliado pelo
responsável técnico de SST da empresa.</p>

<table class="legenda" style="width:60%"><tr>
  <td style="background:${NIVEIS_RISCO.BAIXO.corBg}">Baixo (1-4)</td>
  <td style="background:${NIVEIS_RISCO.MEDIO.corBg}">Médio (5-9)</td>
  <td style="background:${NIVEIS_RISCO.ALTO.corBg}">Alto (10-16)</td>
  <td style="background:${NIVEIS_RISCO.CRITICO.corBg}">Crítico (17-25)</td>
</tr></table>

</body></html>`;
}
