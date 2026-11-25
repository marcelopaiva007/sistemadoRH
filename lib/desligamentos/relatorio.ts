// O relatório da área Desligamentos para a reunião de gerentes — HTML gerado
// no servidor e entregue por /api/rh/[empresaId]/desligamentos/relatorio-pdf
// (o navegador salva como PDF; mesmo padrão de lib/indicadores-relatorio.ts).
// Função pura: recebe os números já calculados, com os MESMOS filtros da tela.
//
// Sem nome de cliente ou marca em texto fixo — o sistema é vendido a outros
// clientes. Todo texto que vem do banco (setor, gestor, pessoa) passa por esc().
import { causaDesligamentoLabel } from "@/lib/constants-dp";
import type { ConfigDaArea, LinhaDoQuadro, PlacarDaMeta } from "@/lib/desligamentos/painel";
import {
  ORDEM_DAS_CAUSAS,
  SEM_CAUSA,
  type ContratacaoErrada,
  type LinhaAno,
  type Motivos,
} from "@/lib/desligamentos/analises";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pct(v: number | null, sinal = false): string {
  if (v === null) return "—";
  const t = `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return sinal && v > 0 ? `+${t}` : t;
}

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const COR_FAIXA = { verde: "#15803d", amarelo: "#b45309", vermelho: "#b91c1c" } as const;
const TEXTO_FAIXA = {
  verde: "abaixo da meta",
  amarelo: "acima da meta, abaixo do limite",
  vermelho: "acima do limite",
} as const;

function kpi(titulo: string, valor: string, detalhe = "", cor = "#111827"): string {
  return `<div class="kpi"><div class="valor" style="color:${cor}">${esc(valor)}</div><div class="titulo">${esc(titulo)}</div>${
    detalhe ? `<div class="detalhe">${esc(detalhe)}</div>` : ""
  }</div>`;
}

function tabelaQuadro(rotulo: string, linhas: LinhaDoQuadro[], limitePct: number): string {
  if (linhas.length === 0) return "<p>Nada a mostrar neste recorte.</p>";
  return `<table><thead><tr><th>${esc(rotulo)}</th><th class="n">Ativos</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Saldo</th><th class="n">Turnover 12m</th><th class="n">&lt; 1 ano</th><th class="n">Empresa × pedido</th><th class="n">Custo</th></tr></thead><tbody>${linhas
    .map(
      (l) => `<tr>
      <td>${esc(l.nome)}${l.saidasPeloSetor ? `<div class="sub">${l.saidasPeloSetor} saída(s) atribuída(s) pelo setor</div>` : ""}</td>
      <td class="n">${l.ativos}</td><td class="n">${l.entradas}</td><td class="n">${l.saidas}</td>
      <td class="n">${l.saldo > 0 ? `+${l.saldo}` : l.saldo}</td>
      <td class="n" style="${l.turnover12mPct !== null && l.turnover12mPct > limitePct ? "color:#b91c1c;font-weight:700" : ""}">${pct(l.turnover12mPct)}</td>
      <td class="n">${pct(l.pctMenosDeUmAno)}</td>
      <td class="n">${l.dispensasEmpresa} × ${l.pedidos}${l.outrosMotivos ? ` (+${l.outrosMotivos})` : ""}</td>
      <td class="n">${reais(l.custo)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

export function gerarHtmlRelatorioDesligamentos(p: {
  geradoEm: Date;
  recorte: string;
  periodoRotulo: string;
  config: ConfigDaArea;
  placar: PlacarDaMeta;
  setores: LinhaDoQuadro[];
  gestores: LinhaDoQuadro[];
  contratacao: ContratacaoErrada;
  motivos: Motivos;
  anos: LinhaAno[];
  avisos: string[];
}): string {
  const { placar, config, contratacao, motivos } = p;
  const faixa = placar.faixa;
  const causas = ORDEM_DAS_CAUSAS.filter((c) => (motivos.geral.porCausa[c] ?? 0) > 0);
  const rotuloCausa = (c: string) => (c === SEM_CAUSA ? "Sem causa registrada" : causaDesligamentoLabel(c));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Desligamentos — relatório</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12px; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e5e7eb; break-after: avoid; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { padding: 5px 7px; border-bottom: 1px solid #e5e7eb; font-size: 11px; text-align: left; vertical-align: top; }
  th { color: #6b7280; font-weight: 600; text-transform: uppercase; font-size: 9.5px; }
  .n { text-align: right; white-space: nowrap; }
  .sub { font-size: 9.5px; color: #6b7280; }
  .kpis { display: flex; gap: 8px; margin-top: 8px; }
  .kpi { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; text-align: center; }
  .kpi .valor { font-size: 18px; font-weight: 700; }
  .kpi .titulo { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .kpi .detalhe { font-size: 9.5px; color: #6b7280; margin-top: 2px; }
  .selo { display: inline-block; padding: 3px 10px; border-radius: 4px; color: #fff; font-weight: 700; }
  .principio { font-style: italic; color: #4b5563; margin-top: 8px; }
  .avisos { margin-top: 20px; font-size: 10px; color: #6b7280; }
  tr { break-inside: avoid; }
</style>
</head>
<body>
  <h1>Desligamentos — relatório para a reunião de gerentes</h1>
  <p style="color:#6b7280">${esc(p.recorte)} · tabelas: ${esc(p.periodoRotulo)} · meta do ano ${placar.ano} · gerado em ${p.geradoEm.toLocaleDateString("pt-BR")}</p>
  <p class="principio">“Cada gestor é responsável pela equipe que tem — temos que contratar bem para demitir menos.”</p>

  <h2>Placar da meta — ${placar.ano}</h2>
  <p><span class="selo" style="background:${COR_FAIXA[faixa]}">${pct(placar.realizadoPct)} · ${TEXTO_FAIXA[faixa]}</span>
     &nbsp;Meta ${pct(config.metaPct)} e limite ${pct(config.limitePct)} do quadro médio. Transferência entre empresas do grupo não conta.</p>
  <div class="kpis">
    ${kpi(`Desligamentos em ${placar.ano}`, String(placar.desligamentos), `quadro médio ${placar.quadroMedio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`)}
    ${kpi(`Meta (${pct(config.metaPct)})`, `${placar.metaPessoas} pessoas`, placar.mesMetaUltrapassada ? `ultrapassada em ${placar.mesMetaUltrapassada}` : "não ultrapassada")}
    ${kpi(`Limite (${pct(config.limitePct)})`, `${placar.limitePessoas} pessoas`, placar.mesLimiteUltrapassado ? `ultrapassado em ${placar.mesLimiteUltrapassado}` : "não ultrapassado", placar.mesLimiteUltrapassado ? COR_FAIXA.vermelho : undefined)}
    ${kpi("Projeção até 31/12", placar.projecao ? String(placar.projecao.desligamentos) : "—", placar.projecao ? `${pct(placar.projecao.pct)} pelo ritmo atual` : "ano fechado", placar.projecao ? COR_FAIXA[placar.projecao.faixa] : undefined)}
  </div>

  <h2>Custo dos desligamentos — ${placar.ano}</h2>
  <div class="kpis">
    ${kpi("Custo total", reais(placar.custo.total), `${placar.desligamentos} × ${reais(placar.custo.porDesligamento)}`)}
    ${kpi("Acima da meta", reais(placar.custo.acimaDaMeta), `o que passou de ${placar.metaPessoas} desligamentos`)}
    ${kpi("Acima do limite", reais(placar.custo.acimaDoLimite), `o que passou de ${placar.limitePessoas} desligamentos`, placar.custo.acimaDoLimite > 0 ? COR_FAIXA.vermelho : undefined)}
  </div>
  <p class="sub">Custo mínimo por desligamento${config.personalizada ? " definido pela diretoria" : " (valor padrão)"}: piso, não conta exata.</p>

  <h2>Quadro por setor</h2>
  <p class="sub">Entradas, saídas e custo: ${esc(p.periodoRotulo)}. Turnover: últimos 12 meses. Em vermelho, acima do limite.</p>
  ${tabelaQuadro("Setor", p.setores, config.limitePct)}

  <h2>Quadro por gestor</h2>
  ${tabelaQuadro("Gestor", p.gestores, config.limitePct)}

  <h2>Contratação errada</h2>
  <p>${contratacao.total.ate90} saída(s) com menos de 90 dias de casa e ${contratacao.total.ate180} com menos de 180, de ${contratacao.total.saidas}.
     Das ${contratacao.total.admissoes} contratações do período, ${contratacao.total.admissoesQueSairam} já saíram (${pct(contratacao.total.pctAdmissoesQueSairam)}).</p>
  ${
    contratacao.porSetor.length === 0
      ? ""
      : `<table><thead><tr><th>Setor</th><th class="n">Saídas</th><th class="n">&lt; 90 dias</th><th class="n">&lt; 180 dias</th><th class="n">Contratações</th><th class="n">Já saíram</th></tr></thead><tbody>${contratacao.porSetor
          .map(
            (l) =>
              `<tr><td>${esc(l.nome)}</td><td class="n">${l.saidas}</td><td class="n">${l.ate90}</td><td class="n">${l.ate180}</td><td class="n">${l.admissoes}</td><td class="n">${l.admissoesQueSairam} (${pct(l.pctAdmissoesQueSairam)})</td></tr>`,
          )
          .join("")}</tbody></table>`
  }

  <h2>Motivos das saídas</h2>
  <p>${motivos.geral.total} saída(s) no período: ${motivos.geral.empresa} dispensa(s) pela empresa, ${motivos.geral.pedido} pedido(s) de demissão, ${motivos.geral.outros} outro(s).</p>
  ${
    motivos.geral.total === 0
      ? ""
      : `<table><thead><tr><th>Setor</th><th class="n">Saídas</th>${causas.map((c) => `<th class="n">${esc(rotuloCausa(c))}</th>`).join("")}</tr></thead><tbody>${motivos.porSetor
          .map(
            (l) =>
              `<tr><td>${esc(l.nome)}</td><td class="n">${l.total}</td>${causas.map((c) => `<td class="n">${l.porCausa[c] ?? 0}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table>`
  }

  <h2>Ano contra ano</h2>
  <table><thead><tr><th>Ano</th><th class="n">Desligamentos</th><th class="n">Dispensas pela empresa</th><th class="n">Admissões</th><th class="n">Ativos no fim</th><th class="n">% do quadro</th><th class="n">Quadro × ano anterior</th><th class="n">Clientes</th><th class="n">Faturamento</th></tr></thead><tbody>${p.anos
    .map(
      (a) =>
        `<tr><td>${a.ano}${a.emAndamento ? " (até hoje)" : ""}</td><td class="n">${a.desligamentos}</td><td class="n">${a.dispensasEmpresa}</td><td class="n">${a.admissoes}</td><td class="n">${a.ativosNoFim}</td><td class="n">${pct(a.pct)}</td><td class="n">${pct(a.crescimentoQuadroPct, true)}</td><td class="n">${pct(a.crescimentoClientesPct, true)}</td><td class="n">${pct(a.crescimentoFaturamentoPct, true)}</td></tr>`,
    )
    .join("")}</tbody></table>

  ${p.avisos.length > 0 ? `<div class="avisos">${p.avisos.map((a) => `<p>• ${esc(a)}</p>`).join("")}</div>` : ""}
</body>
</html>`;
}
