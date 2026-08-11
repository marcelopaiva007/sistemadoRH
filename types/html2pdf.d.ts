// html2pdf.js nao publica tipos. Sem esta declaracao o type-check do build
// falha em "Cannot find module" — foi o que segurou o deploy em 03/08/2026
// mesmo depois do revert da feature de pendencias.
declare module "html2pdf.js";
