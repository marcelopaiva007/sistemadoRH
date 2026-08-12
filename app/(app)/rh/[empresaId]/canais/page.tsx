import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { CHAVE_TELEGRAM, PAPEIS_QUE_CONFIGURAM, statusDoSegredo, statusDoSmtp } from "@/lib/segredos";
import { blobConfigurado } from "@/lib/blob";
import { CanaisView } from "./canais-view";

// Canais de envio: token do bot do Telegram e SMTP, hoje só configuráveis
// por variável de ambiente na Vercel (ver AGENTS.md/README sobre isso).
// Mesmo mecanismo cifrado da chave da Anthropic (lib/segredos.ts) — a
// variável de ambiente, quando existe, continua tendo prioridade sobre o que
// for cadastrado aqui.
export default async function CanaisPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const user = await requireEmpresaAccess(empresaId);

  const [telegram, smtp] = await Promise.all([statusDoSegredo(CHAVE_TELEGRAM), statusDoSmtp()]);

  return (
    <CanaisView
      empresaId={empresaId}
      telegram={telegram}
      smtp={smtp}
      arquivosLigado={blobConfigurado()}
      podeConfigurar={PAPEIS_QUE_CONFIGURAM.includes(user.role as string)}
    />
  );
}
