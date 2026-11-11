import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import {
  LEMBRETES_CONFIGURAVEIS,
  LEMBRETES_QUE_NASCEM_DESLIGADOS,
  envioAutomaticoLigado,
  type ChaveLembrete,
} from "@/lib/cron-horario";
import { podeConfigurarSistema } from "@/lib/segredos";
import { CANAL_DOS_LEMBRETES, emailLiberadoPorLembrete } from "@/lib/canal-lembretes";
import { LembretesView } from "./lembretes-view";

// Horário dos crons de comunicação (alertas-rh, enviar-convites,
// lembrete-pesquisa, lembrete-portal) — configuração global do sistema,
// acessada por uma rota de empresa como as demais telas deste grupo (ver
// lib/actions/rh-lembretes.ts sobre o porquê de não ser escopado por
// empresaId).
// A cobrança de cadastro é disparada desta tela por server action, e o laço
// dela é o MESMO do cron (uma chamada ao Telegram mais uma ao SMTP por
// pessoa, em série) — que declara 300 pelo mesmo motivo. Sem isto a action
// herda o padrão da plataforma e morre no meio do lote.
export const maxDuration = 300;

export default async function LembretesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const user = await requireEmpresaAccess(empresaId);

  const [linhas, emailPorChave] = await Promise.all([
    prisma.configuracaoLembrete.findMany({ orderBy: { horario: "asc" } }),
    emailLiberadoPorLembrete(),
  ]);

  const lembretes = (Object.keys(LEMBRETES_CONFIGURAVEIS) as ChaveLembrete[]).map((chave) => ({
    chave,
    label: LEMBRETES_CONFIGURAVEIS[chave].label,
    padroes: LEMBRETES_CONFIGURAVEIS[chave].padroes,
    horarios: linhas
      .filter((l) => l.chave === chave)
      .map((l) => ({ id: l.id, horario: l.horario, ativo: l.ativo })),
    // O estado do interruptor sai da MESMA função que o cron consulta para
    // decidir se roda — tela e comportamento não podem discordar.
    precisaDecisaoDaGestao: LEMBRETES_QUE_NASCEM_DESLIGADOS.has(chave),
    ligado: envioAutomaticoLigado(chave, linhas),
    // Canal de cada lembrete (OS 11/11/2026, item 3).
    canal: CANAL_DOS_LEMBRETES[chave],
    usarEmail: emailPorChave[chave] ?? true,
  }));

  return (
    <LembretesView
      empresaId={empresaId}
      lembretes={lembretes}
      podeConfigurar={await podeConfigurarSistema(user)}
    />
  );
}
