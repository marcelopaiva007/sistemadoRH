// Relatório de ANÁLISE GERENCIAL de qualquer pesquisa (exceto Clima e NR-01,
// que têm relatório próprio) — versão para imprimir / salvar em PDF.
//
// Até a v1.207 este arquivo gerava só uma tabela de médias por dimensão e por
// setor, sem leitura nenhuma, e nem tinha botão na tela. Agora imprime o mesmo
// objeto que o Dashboard desenha (lib/pesquisa-analise.ts): indicador, resumo
// executivo, setores, assuntos dos comentários, pontos fortes e de atenção,
// evolução e recomendações. Gráficos em HTML/CSS puro — sai igual na tela e
// no papel, sem depender de JavaScript na impressão.
import { formatarData } from "@/lib/datas";
import type { AnaliseGerencial, Tom } from "@/lib/pesquisa-analise";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const COR = {
  texto: "#1e1c1b",
  suave: "#6b6766",
  borda: "#e2dfdf",
  fundo: "#f8f6f6",
  vermelho: "#c8290f",
  cinza: "#8a8686",
  verde: "#2d6a4f",
};
const COR_TOM: Record<Tom, string> = { negativo: COR.vermelho, misto: COR.cinza, positivo: COR.verde };
const ROTULO_TOM: Record<Tom, string> = { negativo: "a melhorar", misto: "neutro / dividido", positivo: "elogio" };

export type DadosRelatorioGeralPesquisa = {
  empresaNome: string;
  pesquisaTitulo: string;
  pesquisaStatus: string;
  iniciadaEm: Date | null;
  encerradaEm: Date | null;
  anonima: boolean;
  analise: AnaliseGerencial;
};

function fmtIndicador(v: number | null, escala: string): string {
  if (v === null) return "—";
  if (escala === "enps") return v > 0 ? `+${v}` : String(v);
  if (escala === "favorabilidade") return `${v}%`;
  return String(v);
}

function barra(pct: number, cor: string, rotulo: string, valor: string): string {
  const w = Math.max(0, Math.min(100, pct));
  return `
    <tr>
      <td style="padding:4px 8px 4px 0;width:38%;font-size:12px;">${esc(rotulo)}</td>
      <td style="padding:4px 0;">
        <div style="background:${COR.fundo};height:14px;width:100%;">
          <div style="background:${cor};height:14px;width:${w}%;"></div>
        </div>
      </td>
      <td style="padding:4px 0 4px 8px;width:70px;text-align:right;font-size:12px;font-weight:600;white-space:nowrap;">${esc(valor)}</td>
    </tr>`;
}

function secao(titulo: string, corpo: string): string {
  return `
  <section style="margin-bottom:22px;page-break-inside:avoid;">
    <h2 style="font-size:15px;margin:0 0 10px 0;padding-bottom:4px;border-bottom:1px solid ${COR.borda};">${esc(titulo.replace(/^\d+\.\s/, ""))}</h2>
    ${corpo}
  </section>`;
}

export function gerarHtmlRelatorioGeralPesquisa(dados: DadosRelatorioGeralPesquisa): string {
  const a = dados.analise;
  const escala = a.indicador.escala;
  const periodo = [
    dados.iniciadaEm ? `de ${formatarData(dados.iniciadaEm)}` : "",
    dados.encerradaEm ? `a ${formatarData(dados.encerradaEm)}` : "(em andamento)",
  ]
    .filter(Boolean)
    .join(" ");

  const kpi = (rotulo: string, valor: string, detalhe = "", cor = COR.texto) => `
    <div style="background:${COR.fundo};border:1px solid ${COR.borda};padding:10px 12px;">
      <div style="font-size:11px;color:${COR.suave};">${esc(rotulo)}</div>
      <div style="font-size:22px;font-weight:700;color:${cor};">${esc(valor)}</div>
      ${detalhe ? `<div style="font-size:11px;color:${COR.suave};">${esc(detalhe)}</div>` : ""}
    </div>`;

  const comp = a.comparativo;
  const kpis = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px;">
      ${kpi("Participação", `${a.participacao}%`, `${a.respostas} de ${a.convites} convidados`, a.nivelParticipacao === "baixa" ? COR.vermelho : COR.texto)}
      ${kpi(a.indicador.nome, fmtIndicador(a.indicador.valor, escala), a.indicador.zona ? `Zona ${a.indicador.zona.rotulo}` : "", a.indicador.zona?.cor ?? COR.texto)}
      ${kpi(
        "Frente ao ciclo anterior",
        comp?.variacao != null ? (comp.variacao > 0 ? `+${comp.variacao}` : String(comp.variacao)) : "—",
        comp ? `${comp.tituloAnterior}: ${fmtIndicador(comp.indicadorAnterior, escala)}` : "Primeiro ciclo deste tipo",
        comp?.tendencia === "queda" ? COR.vermelho : comp?.tendencia === "melhora" ? COR.verde : COR.texto,
      )}
      ${kpi("Comentários", String(a.totalComentarios), a.temas[0] ? `Mais citado: ${a.temas[0].tema}` : "")}
    </div>`;

  const resumo = secao(
    "1. Resumo executivo",
    a.resumo.map((f) => `<p style="margin:0 0 6px 0;">${esc(f)}</p>`).join(""),
  );

  let indicador = "";
  if (a.enps) {
    const e = a.enps;
    const pct = (n: number) => Math.round((n / e.total) * 100);
    const perguntaNps = a.perguntas.find((p) => p.tipo === "NPS_10");
    const maxQtd = Math.max(1, ...(perguntaNps?.distribuicao.map((d) => d.quantidade) ?? [1]));
    const colunas = Array.from({ length: 11 }, (_, n) => {
      const q = perguntaNps?.distribuicao.find((d) => d.rotulo === String(n))?.quantidade ?? 0;
      const cor = n >= 9 ? COR.verde : n >= 7 ? COR.cinza : COR.vermelho;
      return `<td style="vertical-align:bottom;text-align:center;padding:0 3px;">
        <div style="font-size:10px;">${q || ""}</div>
        <div style="background:${cor};height:${Math.round((q / maxQtd) * 90)}px;"></div>
        <div style="font-size:11px;color:${COR.suave};border-top:1px solid ${COR.borda};">${n}</div>
      </td>`;
    }).join("");
    indicador = secao(
      "2. eNPS — promotores, neutros e detratores",
      `
      <div style="display:flex;height:22px;margin-bottom:6px;">
        ${[
          [e.promotores, COR.verde],
          [e.neutros, COR.cinza],
          [e.detratores, COR.vermelho],
        ]
          .map(([n, c]) => (Number(n) > 0 ? `<div style="width:${pct(Number(n))}%;background:${c};color:#fff;font-size:11px;text-align:center;line-height:22px;">${pct(Number(n)) >= 8 ? `${pct(Number(n))}%` : ""}</div>` : ""))
          .join("")}
      </div>
      <p style="font-size:12px;margin:0 0 12px 0;">
        <b style="color:${COR.verde}">${e.promotores} promotores</b> (9-10) ·
        <b style="color:${COR.cinza}">${e.neutros} neutros</b> (7-8) ·
        <b style="color:${COR.vermelho}">${e.detratores} detratores</b> (0-6) —
        eNPS = %promotores − %detratores = <b>${fmtIndicador(e.score, "enps")}</b>${e.zona ? ` (zona ${esc(e.zona.rotulo)})` : ""}.
      </p>
      <table style="width:100%;border-collapse:collapse;height:130px;"><tr>${colunas}</tr></table>
      <p style="font-size:11px;color:${COR.suave};margin:4px 0 0 0;">Distribuição das notas de 0 a 10.</p>`,
    );
  } else {
    const comNota = a.perguntas.filter((p) => p.nota100 !== null);
    if (comNota.length) {
      indicador = secao(
        `2. ${a.indicador.nome}${a.favorabilidade !== null ? `: ${a.favorabilidade}%` : ""} — nota por pergunta (0 a 100)`,
        `<table style="width:100%;border-collapse:collapse;">${comNota
          .map((p) =>
            barra(
              p.nota100 as number,
              (p.nota100 as number) >= 75 ? COR.verde : (p.nota100 as number) >= 60 ? COR.cinza : COR.vermelho,
              `${p.ordem}. ${p.enunciado}`,
              `${p.nota100}`,
            ),
          )
          .join("")}</table>`,
      );
    }
  }

  // Perguntas de múltipla escolha: distribuição (não têm média).
  const multipla = a.perguntas.filter((p) => p.tipo === "MULTIPLE_CHOICE" && p.distribuicao.length);
  const blocoMultipla = multipla.length
    ? secao(
        "Respostas de múltipla escolha",
        multipla
          .map(
            (p) => `<p style="margin:8px 0 4px 0;font-weight:600;font-size:12px;">${p.ordem}. ${esc(p.enunciado)} <span style="font-weight:400;color:${COR.suave};">(${p.respondentes})</span></p>
            <table style="width:100%;border-collapse:collapse;">${p.distribuicao.map((f) => barra(f.percentual, COR.texto, f.rotulo, `${f.quantidade} · ${f.percentual}%`)).join("")}</table>`,
          )
          .join(""),
      )
    : "";

  const comNumero = a.setores.filter((s) => !s.amostraInsuficiente);
  const ocultos = a.setores.filter((s) => s.amostraInsuficiente);
  const setores = secao(
    `3. Resultado por setor`,
    `${
      comNumero.length
        ? `<table style="width:100%;border-collapse:collapse;">${comNumero
            .map((s) => {
              const v = escala === "enps" ? s.enps : s.nota100;
              const pct = escala === "enps" ? ((v ?? 0) + 100) / 2 : (v ?? 0);
              const cor =
                escala === "enps"
                  ? (v ?? 0) >= 31 ? COR.verde : (v ?? 0) >= 0 ? COR.cinza : COR.vermelho
                  : (v ?? 0) >= 75 ? COR.verde : (v ?? 0) >= 60 ? COR.cinza : COR.vermelho;
              return barra(pct, cor, `${s.setor} (${s.respostas})`, fmtIndicador(v, escala === "enps" ? "enps" : "nota"));
            })
            .join("")}</table>`
        : `<p style="font-size:12px;color:${COR.suave};">Nenhum setor com respostas suficientes para mostrar sem identificar ninguém.</p>`
    }
    ${
      ocultos.length
        ? `<p style="font-size:11px;color:${COR.suave};margin-top:6px;">Sem número para proteger o anonimato (poucas respostas): ${ocultos
            .map((s) => `${esc(s.setor)} (${s.respostas})`)
            .join(", ")}.</p>`
        : ""
    }`,
  );

  const maxTema = Math.max(1, ...a.temas.map((t) => t.quantidade));
  const temas = a.temas.length
    ? secao(
        `4. O que dizem os ${a.totalComentarios} comentários`,
        `<table style="width:100%;border-collapse:collapse;margin-bottom:10px;">${a.temas
          .map((t) => barra((t.quantidade / maxTema) * 100, COR_TOM[t.tom], t.tema, `${t.quantidade} · ${ROTULO_TOM[t.tom]}`))
          .join("")}</table>
        ${a.temas
          .map(
            (t) => `
          <div style="border:1px solid ${COR.borda};padding:8px 10px;margin-bottom:8px;page-break-inside:avoid;">
            <div style="font-weight:600;font-size:12px;">${esc(t.tema)}
              <span style="font-weight:400;color:${COR.suave};"> — ${t.quantidade} comentário(s), ${t.percentual}%, <span style="color:${COR_TOM[t.tom]}">${ROTULO_TOM[t.tom]}</span>${
                a.enps ? ` · ${t.porGrupo.promotor} promotores, ${t.porGrupo.neutro} neutros, ${t.porGrupo.detrator} detratores` : ""
              }</span>
            </div>
            ${t.exemplos.map((e) => `<div style="font-size:11px;font-style:italic;margin-top:4px;color:#444;">“${esc(e)}”</div>`).join("")}
          </div>`,
          )
          .join("")}
        <p style="font-size:10px;color:${COR.suave};">Assuntos identificados por palavras-chave; um comentário pode tocar em mais de um assunto. Os exemplos são trechos literais, sem identificação de quem escreveu.</p>`,
      )
    : "";

  const lista = (itens: { titulo: string; detalhe: string }[], cor: string) =>
    itens.length
      ? itens
          .map(
            (p) => `<div style="border-left:3px solid ${cor};padding:2px 0 2px 8px;margin-bottom:6px;">
              <div style="font-size:12px;font-weight:600;">${esc(p.titulo)}</div>
              <div style="font-size:11px;color:${COR.suave};">${esc(p.detalhe)}</div></div>`,
          )
          .join("")
      : `<div style="font-size:12px;color:${COR.suave};">—</div>`;
  const pontos =
    a.pontosFortes.length || a.pontosAtencao.length
      ? secao(
          "5. Pontos fortes e pontos de atenção",
          `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div><div style="font-size:12px;font-weight:700;color:${COR.verde};margin-bottom:6px;">Pontos fortes</div>${lista(a.pontosFortes, COR.verde)}</div>
            <div><div style="font-size:12px;font-weight:700;color:${COR.vermelho};margin-bottom:6px;">Pontos de atenção</div>${lista(a.pontosAtencao, COR.vermelho)}</div>
          </div>`,
        )
      : "";

  const evolucao =
    a.serie.length >= 2
      ? secao(
          "6. Evolução entre ciclos",
          `<table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:${COR.fundo};text-align:left;">
              <th style="padding:6px 8px;border:1px solid ${COR.borda};">Ciclo</th>
              <th style="padding:6px 8px;border:1px solid ${COR.borda};text-align:center;">${esc(a.indicador.nome)}</th>
              <th style="padding:6px 8px;border:1px solid ${COR.borda};text-align:center;">Participação</th>
            </tr></thead>
            <tbody>${a.serie
              .map(
                (p, i) => `<tr${i === a.serie.length - 1 ? ' style="font-weight:700;"' : ""}>
                <td style="padding:6px 8px;border:1px solid ${COR.borda};">${esc(p.titulo)}${p.data ? ` <span style="color:${COR.suave};font-weight:400;">(${formatarData(p.data)})</span>` : ""}</td>
                <td style="padding:6px 8px;border:1px solid ${COR.borda};text-align:center;">${fmtIndicador(p.indicador, escala)}</td>
                <td style="padding:6px 8px;border:1px solid ${COR.borda};text-align:center;">${p.participacao}%</td>
              </tr>`,
              )
              .join("")}</tbody>
          </table>`,
        )
      : "";

  const corPrioridade = { alta: COR.vermelho, media: "#b7791f", baixa: COR.cinza } as const;
  const rotuloPrioridade = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;
  const recomendacoes = a.recomendacoes.length
    ? secao(
        `${a.serie.length >= 2 ? "7" : "6"}. Recomendações para a gestão`,
        `<table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:${COR.fundo};text-align:left;">
            <th style="padding:6px 8px;border:1px solid ${COR.borda};width:24px;">#</th>
            <th style="padding:6px 8px;border:1px solid ${COR.borda};">Ação</th>
            <th style="padding:6px 8px;border:1px solid ${COR.borda};width:70px;">Prioridade</th>
            <th style="padding:6px 8px;border:1px solid ${COR.borda};width:150px;">Responsável sugerido</th>
          </tr></thead>
          <tbody>${a.recomendacoes
            .map(
              (r, i) => `<tr style="page-break-inside:avoid;">
              <td style="padding:6px 8px;border:1px solid ${COR.borda};vertical-align:top;">${i + 1}</td>
              <td style="padding:6px 8px;border:1px solid ${COR.borda};vertical-align:top;"><b>${esc(r.titulo)}</b><br><span style="color:${COR.suave};">${esc(r.detalhe)}</span></td>
              <td style="padding:6px 8px;border:1px solid ${COR.borda};vertical-align:top;color:${corPrioridade[r.prioridade]};font-weight:700;">${rotuloPrioridade[r.prioridade]}</td>
              <td style="padding:6px 8px;border:1px solid ${COR.borda};vertical-align:top;">${esc(r.responsavel)}</td>
            </tr>`,
            )
            .join("")}</tbody>
        </table>
        <p style="font-size:10px;color:${COR.suave};">Recomendações geradas a partir dos números e comentários desta pesquisa — ponto de partida para a reunião de gestão, não decisão pronta. Registre as ações adotadas em Planos de ação.</p>`,
      )
    : "";

  const semRespostas =
    a.respostas === 0
      ? `<p style="padding:20px;background:${COR.fundo};text-align:center;">A pesquisa ainda não recebeu respostas — não há o que analisar.</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Análise gerencial - ${esc(dados.pesquisaTitulo)}</title>
  <style>
    @page { size: A4; margin: 12mm 10mm; }
    body { font-family: system-ui, -apple-system, sans-serif; color: ${COR.texto}; line-height: 1.5; font-size: 13px; max-width: 900px; margin: 70px auto 20px; padding: 0 16px; }
    @media print { body { margin: 0 auto; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div style="border-bottom:2px solid ${COR.texto};padding-bottom:10px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
    <div>
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${COR.suave};">Relatório de análise gerencial</div>
      <h1 style="margin:2px 0 0 0;font-size:21px;">${esc(dados.pesquisaTitulo)}</h1>
      <div style="color:${COR.suave};font-size:12px;margin-top:2px;">${esc(dados.empresaNome)} · ${esc(periodo)}${dados.anonima ? " · pesquisa anônima" : ""}</div>
    </div>
    <div style="text-align:right;color:${COR.suave};font-size:11px;white-space:nowrap;">Gerado em ${formatarData(new Date())}</div>
  </div>

  ${semRespostas || `${kpis}${resumo}${indicador}${blocoMultipla}${setores}${temas}${pontos}${evolucao}${recomendacoes}`}

  <div style="margin-top:30px;border-top:1px solid ${COR.borda};padding-top:10px;text-align:center;color:${COR.suave};font-size:10px;">
    Documento gerado automaticamente a partir das respostas. Setores com menos de ${AMOSTRA_MINIMA_ANONIMATO} respostas não têm número próprio, para proteger o anonimato.
  </div>
</body>
</html>`;
}
