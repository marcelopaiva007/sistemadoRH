// Gera o HTML do Relatório de Avaliação de Desempenho (visão consolidada da
// campanha). Convertido em PDF por
// /api/rh/[empresaId]/avaliacoes/painel/relatorio-pdf. Mesmo padrão de
// lib/clima-relatorio.ts — HTML server-side, sem cliente nenhum na geração.
import type { PainelAvaliacao } from "@/lib/avaliacao-painel";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CORES_FAIXA: Record<string, string> = {
  BAIXO: "#dc2626",
  MEDIO: "#f59e0b",
  ALTO: "#16a34a",
};

function corParticipacao(pct: number): string {
  if (pct < 60) return "#dc2626";
  if (pct < 90) return "#f59e0b";
  return "#16a34a";
}

function cardKpi(titulo: string, valor: string, cor?: string): string {
  return `<div style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:${cor ?? "#111827"}">${esc(valor)}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">${esc(titulo)}</div>
  </div>`;
}

function barraPct(pct: number): string {
  return `<div style="background:#e5e7eb;border-radius:4px;height:8px;width:100%">
    <div style="background:${corParticipacao(pct)};width:${pct}%;height:100%;border-radius:4px"></div>
  </div>`;
}

function tabelaParticipacao(
  linhas: { chave: string; total: number; concluidas: number; participacaoPct: number }[],
): string {
  if (linhas.length === 0) return "<p>Sem dados.</p>";
  return (
    "<table><thead><tr><th>Grupo</th><th style='text-align:center'>Concluídas</th>" +
    "<th style='text-align:center'>Participação</th><th style='min-width:120px'></th></tr></thead><tbody>" +
    linhas
      .map(
        (l) => `<tr>
          <td><strong>${esc(l.chave)}</strong></td>
          <td style="text-align:center">${l.concluidas}/${l.total}</td>
          <td style="text-align:center;font-weight:700;color:${corParticipacao(l.participacaoPct)}">${l.participacaoPct}%</td>
          <td>${barraPct(l.participacaoPct)}</td>
        </tr>`,
      )
      .join("") +
    "</tbody></table>"
  );
}

function tabelaDestaques(
  linhas: PainelAvaliacao["destaques"]["abaixoDaMedia"],
  cor: string,
): string {
  if (linhas.length === 0) return "<p>Nenhum(a).</p>";
  return (
    "<table><thead><tr><th>Colaborador</th><th>CNPJ</th><th>Setor</th><th style='text-align:center'>Nota</th></tr></thead><tbody>" +
    linhas
      .map(
        (l) => `<tr>
          <td><strong>${esc(l.nome)}</strong></td>
          <td>${esc(l.empresaNome)}</td>
          <td>${esc(l.setor)}</td>
          <td style="text-align:center;font-weight:700;color:${cor}">${l.notaFinal.toFixed(2)}</td>
        </tr>`,
      )
      .join("") +
    "</tbody></table>"
  );
}

export function gerarHtmlRelatorioAvaliacao(params: {
  campanha: string;
  geradoEm: Date;
  dados: PainelAvaliacao;
}): string {
  const { campanha, geradoEm, dados } = params;

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
</style>
</head>
<body>
  <h1>Relatório de Avaliação de Desempenho</h1>
  <p style="color:#6b7280">${esc(campanha)} — gerado em ${geradoEm.toLocaleDateString("pt-BR")}</p>

  <div class="kpis">
    ${cardKpi("Participação geral", `${dados.participacaoPct}%`, corParticipacao(dados.participacaoPct))}
    ${cardKpi("Concluídas", `${dados.totalConcluidas} de ${dados.totalAvaliacoes}`)}
    ${cardKpi("Nota média (gestor)", dados.mediaGeral !== null ? dados.mediaGeral.toFixed(2) : "—")}
    ${cardKpi("Desvio padrão", dados.desvioPadrao !== null ? dados.desvioPadrao.toFixed(2) : "—")}
  </div>

  <h2>Participação por CNPJ</h2>
  ${tabelaParticipacao(dados.porEmpresa)}

  <h2>Participação por setor</h2>
  ${tabelaParticipacao(dados.porSetor)}

  <h2>Distribuição de notas (avaliação do gestor)</h2>
  ${
    dados.amostraNotas === 0
      ? "<p>Nenhuma avaliação de gestor concluída ainda.</p>"
      : `<table><thead><tr><th>Faixa</th><th style="text-align:center">Quantidade</th></tr></thead><tbody>${dados.distribuicaoNotas
          .map(
            (d) =>
              `<tr><td style="color:${CORES_FAIXA[d.faixa]};font-weight:600">${esc(d.label)}</td><td style="text-align:center">${d.qtd}</td></tr>`,
          )
          .join("")}</tbody></table>`
  }

  <h2>Abaixo da média (mais de 1 desvio padrão)</h2>
  ${tabelaDestaques(dados.destaques.abaixoDaMedia, CORES_FAIXA.BAIXO)}

  <h2>Acima da média (mais de 1 desvio padrão)</h2>
  ${tabelaDestaques(dados.destaques.acimaDaMedia, CORES_FAIXA.ALTO)}

  <p class="rodape">
    Nota média e destaques consideram só avaliações do tipo Gestor, concluídas — é a fonte oficial
    de desempenho, a mesma que já alimenta o nine-box de cada ciclo. Com menos de 3 avaliações de
    gestor concluídas, esses campos ficam vazios.
  </p>
</body>
</html>`;
}
