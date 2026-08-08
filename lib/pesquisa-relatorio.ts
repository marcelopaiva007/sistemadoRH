import { formatarData } from "@/lib/datas";
import { calcularResultadoEnps } from "@/lib/pesquisa-enps-resultado";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DadosRelatorioGeralPesquisa = {
  empresaNome: string;
  pesquisaTitulo: string;
  pesquisaModelo: string;
  pesquisaStatus: string;
  iniciadaEm: Date | null;
  encerradaEm: Date | null;
  convites: number;
  respostas: {
    setorNomeSnapshot: string;
    itens: {
      valorNumerico: number | null;
      valorTexto: string | null;
      pergunta: {
        id: string;
        enunciado: string;
        tipo: string;
        dimensao: string | null;
        dimensaoGPTW: string | null;
      };
    }[];
  }[];
};

export function gerarHtmlRelatorioGeralPesquisa(dados: DadosRelatorioGeralPesquisa): string {
  const totalRespostas = dados.respostas.length;
  const taxaParticipacao =
    dados.convites > 0 ? Math.round((totalRespostas / dados.convites) * 100) : 0;

  // eNPS se houver pergunta NPS_10
  const itensNps = dados.respostas.flatMap((r) =>
    r.itens.filter((i) => i.pergunta.tipo === "NPS_10"),
  );
  const resultadoEnps = itensNps.length > 0 ? calcularResultadoEnps(itensNps) : null;
  const promotoresPct = resultadoEnps && resultadoEnps.total > 0 ? Math.round((resultadoEnps.promotores / resultadoEnps.total) * 100) : 0;
  const neutrosPct = resultadoEnps && resultadoEnps.total > 0 ? Math.round((resultadoEnps.neutros / resultadoEnps.total) * 100) : 0;
  const detratoresPct = resultadoEnps && resultadoEnps.total > 0 ? Math.round((resultadoEnps.detratores / resultadoEnps.total) * 100) : 0;

  // Médias por dimensão e por setor
  const somaPorChave = new Map<string, { soma: number; qtd: number }>();
  const acumular = (chave: string, valor: number) => {
    const atual = somaPorChave.get(chave) ?? { soma: 0, qtd: 0 };
    atual.soma += valor;
    atual.qtd += 1;
    somaPorChave.set(chave, atual);
  };

  for (const r of dados.respostas) {
    for (const item of r.itens) {
      if (item.valorNumerico == null) continue;
      const dim = item.pergunta.dimensaoGPTW || item.pergunta.dimensao || "Geral";
      acumular(`dim:${dim}`, item.valorNumerico);
      acumular(`setor:${r.setorNomeSnapshot || "Não informado"}`, item.valorNumerico);
    }
  }

  const dimensoes = [...somaPorChave.entries()]
    .filter(([k]) => k.startsWith("dim:"))
    .map(([k, v]) => ({ nome: k.replace("dim:", ""), media: v.soma / v.qtd, total: v.qtd }));

  const setores = [...somaPorChave.entries()]
    .filter(([k]) => k.startsWith("setor:"))
    .map(([k, v]) => ({ nome: k.replace("setor:", ""), media: v.soma / v.qtd, total: v.qtd }));

  const blocoEnps = resultadoEnps
    ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;">
      <h3 style="margin:0 0 12px 0;font-size:16px;color:#0f172a;">Resultado eNPS</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center;">
        <div style="background:#fff;padding:12px;border-radius:6px;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;">Pontuação eNPS</div>
          <div style="font-size:24px;font-weight:700;color:${resultadoEnps.score >= 50 ? "#16a34a" : resultadoEnps.score >= 0 ? "#ca8a04" : "#dc2626"};">
            ${resultadoEnps.score > 0 ? `+${resultadoEnps.score}` : resultadoEnps.score}
          </div>
        </div>
        <div style="background:#fff;padding:12px;border-radius:6px;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;">Promotores (9-10)</div>
          <div style="font-size:20px;font-weight:600;color:#16a34a;">${promotoresPct}% (${resultadoEnps.promotores})</div>
        </div>
        <div style="background:#fff;padding:12px;border-radius:6px;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;">Neutros (7-8)</div>
          <div style="font-size:20px;font-weight:600;color:#ca8a04;">${neutrosPct}% (${resultadoEnps.neutros})</div>
        </div>
        <div style="background:#fff;padding:12px;border-radius:6px;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;">Detratores (0-6)</div>
          <div style="font-size:20px;font-weight:600;color:#dc2626;">${detratoresPct}% (${resultadoEnps.detratores})</div>
        </div>
      </div>
    </div>`
    : "";

  const tabelaDimensoes =
    dimensoes.length > 0
      ? `
    <h3 style="font-size:15px;color:#0f172a;margin:24px 0 12px 0;">Média por Dimensão</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px 12px;border:1px solid #cbd5e1;">Dimensão</th>
          <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Média</th>
          <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Respostas</th>
        </tr>
      </thead>
      <tbody>
        ${dimensoes
          .map(
            (d) => `
          <tr>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc(d.nome)}</td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:600;">${d.media.toFixed(2)}</td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;">${d.total}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
      : "";

  const tabelaSetores =
    setores.length > 0
      ? `
    <h3 style="font-size:15px;color:#0f172a;margin:24px 0 12px 0;">Média por Setor</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px 12px;border:1px solid #cbd5e1;">Setor</th>
          <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Média</th>
          <th style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">Respostas</th>
        </tr>
      </thead>
      <tbody>
        ${setores
          .map(
            (s) => `
          <tr>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc(s.nome)}</td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:600;">${s.media.toFixed(2)}</td>
            <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;">${s.total}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório - ${esc(dados.pesquisaTitulo)}</title>
  <style>
    @page { size: A4; margin: 12mm 10mm; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; line-height: 1.5; font-size: 13px; }
  </style>
</head>
<body>
  <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
    <div>
      <h1 style="margin: 0; font-size: 20px; color: #0f172a;">${esc(dados.pesquisaTitulo)}</h1>
      <div style="color: #64748b; font-size: 13px; margin-top: 4px;">${esc(dados.empresaNome)} · Relatório de Pesquisa</div>
    </div>
    <div style="text-align: right; color: #64748b; font-size: 11px;">
      Gerado em ${formatarData(new Date())}
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; color: #64748b;">Status</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${dados.pesquisaStatus}</div>
    </div>
    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; color: #64748b;">Convites Enviados</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${dados.convites}</div>
    </div>
    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; color: #64748b;">Respostas Recebidas</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${totalRespostas}</div>
    </div>
    <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; color: #64748b;">Taxa de Adesão</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${taxaParticipacao}%</div>
    </div>
  </div>

  ${blocoEnps}
  ${tabelaDimensoes}
  ${tabelaSetores}

  <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center; color: #94a3b8; font-size: 11px;">
    Sistema de Gestão de RH · Documento gerado automaticamente
  </div>
</body>
</html>`;
}
