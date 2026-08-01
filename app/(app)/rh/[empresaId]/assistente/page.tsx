import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { CHAVE_ANTHROPIC, statusDoSegredo } from "@/lib/segredos";
import { AssistenteView } from "./assistente-view";

// Assistente de RH: pergunta em linguagem natural sobre os dados da empresa.
// O modelo não recebe acesso ao banco — ele escolhe entre as ferramentas de
// leitura de lib/assistente/ferramentas.ts, e o empresaId é fixado no
// servidor. Toda pergunta entra na trilha de auditoria.
export default async function AssistentePage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const user = await requireEmpresaAccess(empresaId);

  // Só o status desce para o cliente: ligado ou não, de onde vem e os quatro
  // últimos dígitos. A chave em si não sai do servidor em nenhuma hipótese.
  const status = await statusDoSegredo(CHAVE_ANTHROPIC);

  return (
    <AssistenteView
      empresaId={empresaId}
      ligado={status.ligado}
      origem={status.origem}
      dica={status.dica}
      atualizadoPor={status.atualizadoPor}
      // Quem grava a chave passa a poder gastar na conta da Anthropic do
      // grupo — por isso o formulário só existe para o ADMIN. A server action
      // confere de novo; isto aqui é só para não mostrar o que não adianta.
      podeConfigurar={user.role === "ADMIN"}
    />
  );
}
