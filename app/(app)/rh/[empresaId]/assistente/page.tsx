import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
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
  await requireEmpresaAccess(empresaId);

  // Ler a env aqui (server component) evita expor a chave e evita um
  // round-trip só para descobrir se o recurso está ligado.
  const ligado = Boolean(process.env.ANTHROPIC_API_KEY);

  return <AssistenteView empresaId={empresaId} ligado={ligado} />;
}
