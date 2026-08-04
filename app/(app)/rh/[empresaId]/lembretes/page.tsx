import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { LEMBRETES_CONFIGURAVEIS, type ChaveLembrete } from "@/lib/cron-horario";
import { PAPEIS_QUE_CONFIGURAM } from "@/lib/segredos";
import { LembretesView } from "./lembretes-view";

// Horário dos crons de comunicação (alertas-rh, enviar-convites,
// lembrete-pesquisa, lembrete-portal) — configuração global do sistema,
// acessada por uma rota de empresa como as demais telas deste grupo (ver
// lib/actions/rh-lembretes.ts sobre o porquê de não ser escopado por
// empresaId).
export default async function LembretesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const user = await requireEmpresaAccess(empresaId);

  const linhas = await prisma.configuracaoLembrete.findMany({ orderBy: { horario: "asc" } });

  const lembretes = (Object.keys(LEMBRETES_CONFIGURAVEIS) as ChaveLembrete[]).map((chave) => ({
    chave,
    label: LEMBRETES_CONFIGURAVEIS[chave].label,
    padroes: LEMBRETES_CONFIGURAVEIS[chave].padroes,
    horarios: linhas
      .filter((l) => l.chave === chave)
      .map((l) => ({ id: l.id, horario: l.horario, ativo: l.ativo })),
  }));

  return (
    <LembretesView
      empresaId={empresaId}
      lembretes={lembretes}
      podeConfigurar={PAPEIS_QUE_CONFIGURAM.includes(user.role as string)}
    />
  );
}
