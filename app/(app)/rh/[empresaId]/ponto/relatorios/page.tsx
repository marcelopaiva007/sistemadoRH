import { RelatoriosPontoView } from "../relatorios-view";

/**
 * Relatórios e arquivos fiscais do ponto (AFD e AEJ, Portaria MTP 671/2021).
 *
 * Era a aba "Relatórios & Fiscal (AFD)"; virou página em v1.170.0. Não consulta
 * nada aqui: os dois arquivos são gerados sob demanda pelas actions
 * `exportarArquivoAFDRH` e `exportarArquivoAEJRH` quando alguém clica.
 */
export default async function PontoRelatoriosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  return <RelatoriosPontoView empresaId={empresaId} />;
}
