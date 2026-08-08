import { NextResponse } from "next/server";

/**
 * Envia o HTML do relatório diretamente para o navegador com estilos de impressão A4
 * e acionamento automático da janela de salvar como PDF / impressão.
 *
 * Esta abordagem elimina totalmente a dependência de binaries do Chromium no ambiente
 * serverless da Vercel (evitando crashes de memória, falta de bibliotecas .so do Linux
 * e timeouts de gateway HTTP 504), entregando vetores perfeitos em milissegundos.
 */
export function responderComHtmlRelatorio(html: string, titulo: string): NextResponse {
  const barraEModaisImpressao = `
<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#0f172a;color:#f8fafc;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:99999;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
  <div style="display:flex;align-items:center;gap:12px;">
    <span style="font-size:18px;">📄</span>
    <div>
      <div style="font-weight:600;font-size:14px;color:#ffffff;">${titulo}</div>
      <div style="font-size:12px;color:#94a3b8;">Use o botão ao lado ou Ctrl+P / Cmd+P para Salvar como PDF</div>
    </div>
  </div>
  <div style="display:flex;gap:10px;">
    <button onclick="window.print()" style="background:#2563eb;color:#ffffff;border:none;padding:8px 18px;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background 0.2s;">
      🖨️ Imprimir / Salvar em PDF
    </button>
  </div>
</div>
<style>
  @media print {
    .no-print { display: none !important; }
    body { padding-top: 0 !important; margin: 0 !important; }
  }
  @media screen {
    body { padding-top: 64px !important; }
  }
</style>
<script>
  window.addEventListener('load', function() {
    setTimeout(function() {
      window.print();
    }, 400);
  });
</script>
`;

  // Insere a barra de controle antes do fechamento da tag </body> ou ao final do HTML
  const htmlFinal = html.includes("</body>")
    ? html.replace("</body>", `${barraEModaisImpressao}</body>`)
    : `${html}${barraEModaisImpressao}`;

  return new NextResponse(htmlFinal, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
