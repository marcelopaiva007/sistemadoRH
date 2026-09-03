"use client";

import { useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, ShieldCheck, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { exportarArquivoAFDRH, exportarArquivoAEJRH } from "@/app/actions/rh-ponto";

export function RelatoriosPontoView({ empresaId }: { empresaId: string }) {
  const [downloadingAFD, setDownloadingAFD] = useState(false);
  const [downloadingAEJ, setDownloadingAEJ] = useState(false);
  // Aviso de NSR repetido — vem junto com o arquivo, não no lugar dele. Fica na
  // tela depois do download porque é isso que a pessoa precisa ler ANTES de
  // entregar o arquivo à contabilidade (ver avisoDeNsrRepetido em rh-ponto.ts).
  const [aviso, setAviso] = useState<string | null>(null);

  const handleDownloadAFD = async () => {
    setDownloadingAFD(true);
    const res = await exportarArquivoAFDRH(empresaId);
    setAviso(res.aviso ?? null);
    if (res.sucesso && res.conteudoAFD) {
      const blob = new Blob([res.conteudoAFD], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.nomeArquivo || "AFD_REGISTROS.txt";
      a.click();
      URL.revokeObjectURL(url);
    } else if (res.erro) {
      alert(res.erro);
    }
    setDownloadingAFD(false);
  };

  const handleDownloadAEJ = async () => {
    setDownloadingAEJ(true);
    const res = await exportarArquivoAEJRH(empresaId);
    setAviso(res.aviso ?? null);
    if (res.sucesso && res.conteudoAEJ) {
      const blob = new Blob([res.conteudoAEJ], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.nomeArquivo || "AEJ_JORNADA.txt";
      a.click();
      URL.revokeObjectURL(url);
    } else if (res.erro) {
      alert(res.erro);
    }
    setDownloadingAEJ(false);
  };

  return (
    <div className="space-y-4">
      {aviso && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{aviso}</span>
          </p>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold">Relatórios & Exportações Fiscais de Ponto</h2>
        <p className="text-xs text-muted-foreground">
          Emissão de arquivos regulatórios regulamentados pela Portaria MTP 671/2021 e integração com a Folha de Pagamento.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card AFD / AEJ MTP 671 */}
        <Card className="border shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-sm">Arquivo Fiscal AFD / AEJ (MTP 671/2021)</CardTitle>
                <CardDescription className="text-xs">
                  Arquivo Fonte de Dados inviolável para auditoria do Fiscal do Trabalho.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Gera a cadeia de registros originais do REP-P com Hash SHA-256 e assinado no padrão ICP-Brasil.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={handleDownloadAFD} disabled={downloadingAFD} className="gap-2 text-xs">
                <Download className="w-4 h-4" />
                {downloadingAFD ? "Gerando..." : "Baixar AFD (.txt)"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadAEJ} disabled={downloadingAEJ} className="gap-2 text-xs">
                <Download className="w-4 h-4" />
                {downloadingAEJ ? "Gerando..." : "Baixar AEJ (.txt)"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card Exportação Folha de Pagamento */}
        <Card className="border shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-card text-success rounded-lg">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-sm">Exportação para Folha de Pagamento</CardTitle>
                <CardDescription className="text-xs">
                  Horas extras (50%/100%), adicionais noturnos, atrasos e DSR.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Layout unificado de fechamento de ponto compatível com os principais sistemas de folha do mercado.
            </p>
            <Button size="sm" variant="outline" className="w-full gap-2 text-xs">
              <FileSpreadsheet className="w-4 h-4" /> Exportar Espelho da Folha (.CSV / Excel)
            </Button>
          </CardContent>
        </Card>

        {/* Card Espelho de Ponto Individual / Em Lote */}
        <Card className="border shadow-xs sm:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-card text-foreground rounded-lg">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-sm">Espelho de Ponto Mensal (Impressão / PDF)</CardTitle>
                <CardDescription className="text-xs">
                  Relatório detalhado da jornada mensal do colaborador pronto para assinatura digital.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground max-w-lg">
              Emita os espelhos de ponto de todos os funcionários da empresa com resumo de horas trabalhadas, crédito/débito em banco e atestados abonados.
            </p>
            <Button size="sm" variant="secondary" className="gap-2 text-xs">
              <Printer className="w-4 h-4" /> Imprimir Espelhos em Lote (PDF)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
