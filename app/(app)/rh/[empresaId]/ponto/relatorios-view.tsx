"use client";

import { useState } from "react";
import { AlertTriangle, Download, ShieldCheck } from "lucide-react";
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
          Emissão dos arquivos fiscais AFD e AEJ exigidos pela Portaria MTP 671/2021.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
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
              Gera os registros originais do REP-P. Cada marcação tem um hash SHA-256 gravado no sistema,
              calculado sobre NSR, colaborador, empresa, data/hora, tipo, IP e GPS; ele sai impresso no AEJ — o
              AFD leva NSR, tipo, data, hora e CPF. O arquivo NÃO é assinado digitalmente: o sistema não tem
              certificado ICP-Brasil.
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

        {/* Até 03/09/2026 havia aqui dois cartões com botão — "Exportar Espelho
            da Folha (.CSV / Excel)" e "Imprimir Espelhos em Lote (PDF)". Nenhum
            dos dois tinha onClick: clicar não fazia nada, e nenhuma das duas
            rotinas existe no sistema. O aviso entra NO LUGAR dos botões, nunca
            ao lado deles. Quando a exportação existir, o botão volta ligado. */}
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="text-sm font-medium">Espelho de ponto e exportação para a folha: em implantação</p>
          <p className="mt-1 text-xs text-muted-foreground">
            O sistema ainda não gera o espelho mensal em PDF nem o arquivo de fechamento para a folha de pagamento.
            Até lá, o fechamento sai pelos arquivos AFD e AEJ acima.
          </p>
        </div>
      </div>
    </div>
  );
}
