// O ÚNICO lugar que aceita as duas sessões para fins de PONTO.
//
// Duas portas levam à batida: o portal via Telegram (sessão portal_sessao,
// exige CPF confirmado) e o app /ponto via CPF+PIN (sessão ponto_sessao).
// As actions de registrar/consultar batida chamam este resolver e mais nada —
// assim, quando alguém estender aquelas actions no futuro, este arquivo é o
// único ponto a auditar sobre "quem pode chegar aqui".
//
// O que este resolver NÃO faz, de propósito: a página /ponto gateia só por
// lerSessaoPonto(), e o /portal só por lerSessaoPortal(). Sessão do Telegram
// não abre o app de ponto sem PIN, nem o contrário — para o colaborador são
// dois sistemas separados.
import { lerSessaoPortal } from "@/lib/portal-auth";
import { lerSessaoPonto } from "@/lib/ponto-pin-auth";

export type IdentidadeDePonto = {
  colaboradorId: string;
  origem: "PORTAL_TELEGRAM" | "PIN";
};

export async function resolverIdentidadeDePonto(): Promise<IdentidadeDePonto | null> {
  const portal = await lerSessaoPortal();
  if (portal?.verificado) {
    return { colaboradorId: portal.colaboradorId, origem: "PORTAL_TELEGRAM" };
  }

  const pin = await lerSessaoPonto();
  if (pin) return { colaboradorId: pin.colaboradorId, origem: "PIN" };

  return null;
}
