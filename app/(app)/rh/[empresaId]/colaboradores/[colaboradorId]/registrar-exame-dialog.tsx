"use client";

import { FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registrarExame } from "@/lib/actions/rh-sst";
import { MIMES_ANEXO_ACEITOS } from "@/lib/constants-dp";
import { RESULTADOS_EXAME, TIPOS_EXAME } from "@/lib/constants-sst";
import { Campo, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";

/**
 * O diálogo "Registrar exame ocupacional" — onde entra o ASO que o médico
 * entregou (arquivo + datas + resultado).
 *
 * Vivia inline no SegurancaCard da ficha. Saiu para cá em 28/09/2026 porque o
 * Relatório de ASO (/rh/<empresa>/aso) passou a abrir o MESMO formulário na
 * linha de cada pessoa: o RH relatou que não achava onde anexar o documento do
 * médico — o caminho era ficha → Segurança → SST → "Registrar exame", três
 * cliques escondidos a partir de uma lista que só mostrava o atraso. Um
 * formulário só, para as duas telas gravarem igual.
 *
 * `empresaId` é SEMPRE o CNPJ do colaborador, nunca o do caminho da tela que
 * abriu o diálogo: o relatório lista várias empresas ao mesmo tempo, e a
 * action recusa (ou pior, grava no lugar errado) se os dois divergirem.
 *
 * `documentoOrigem`: o ASO que já está no Dossiê como documento genérico. O
 * formulário vem com as datas dele e, se tiver arquivo, não pede outro — a
 * action move o arquivo para o exame e tira a linha do Dossiê.
 */
export type DocumentoAsoNoDossie = {
  id: string;
  arquivoNome: string | null;
  emitidoEm: Date | null;
  validoAte: Date | null;
};

export function RegistrarExameDialog({
  empresaId,
  colaboradorId,
  colaboradorNome,
  aberto,
  aoMudarAberto,
  tipoPadrao,
  documentoOrigem,
  aoRegistrar,
}: {
  empresaId: string;
  colaboradorId: string;
  /** Aparece no título — no relatório, é o que confirma de quem é o ASO. */
  colaboradorNome?: string;
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  /** Tipo já escolhido ao abrir (o relatório sugere "Periódico" para quem já teve ASO). */
  tipoPadrao?: string;
  documentoOrigem?: DocumentoAsoNoDossie;
  aoRegistrar?: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar exame ocupacional</DialogTitle>
          {colaboradorNome && <DialogDescription>{colaboradorNome}</DialogDescription>}
        </DialogHeader>
        <FormularioAction
          key={`${colaboradorId}:${documentoOrigem?.id ?? ""}`}
          action={registrarExame.bind(null, empresaId, colaboradorId)}
          textoBotao="Registrar"
          mensagemSucesso="Exame registrado."
          onSuccess={() => {
            aoMudarAberto(false);
            aoRegistrar?.();
          }}
        >
          {documentoOrigem && <input type="hidden" name="documentoOrigemId" value={documentoOrigem.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoSelect
              name="tipo"
              label="Tipo"
              opcoes={TIPOS_EXAME.map((t) => ({ value: t.value, label: t.label }))}
              defaultValue={tipoPadrao}
              required
            />
            <CampoSelect name="resultado" label="Resultado" opcoes={RESULTADOS_EXAME} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoData name="realizadoEm" label="Realizado em" defaultValue={documentoOrigem?.emitidoEm} />
            <CampoData name="validoAte" label="Válido até (opcional)" defaultValue={documentoOrigem?.validoAte} />
          </div>
          <Campo label="Restrições (obrigatório se apto com restrição)">
            <Textarea name="restricoes" rows={2} placeholder="Ex: não pode trabalhar em altura" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto name="medico" label="Médico" />
            <CampoTexto name="crm" label="CRM" />
          </div>
          <CampoTexto name="clinica" label="Clínica" />
          {documentoOrigem?.arquivoNome ? (
            <Campo label="ASO (arquivo)">
              <p className="flex items-center gap-1.5 text-sm">
                <FileText className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{documentoOrigem.arquivoNome}</span>
                <span className="shrink-0 text-xs text-muted-foreground">— vem do Dossiê</span>
              </p>
            </Campo>
          ) : (
            <Campo label="ASO (PDF ou foto, até 4 MB)">
              <Input type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
            </Campo>
          )}
          <Campo label="Observações">
            <Textarea name="observacoes" rows={2} />
          </Campo>
        </FormularioAction>
      </DialogContent>
    </Dialog>
  );
}
