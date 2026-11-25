import { escopoDeEmpresas, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { eventosEsocial } from "@/lib/esocial";
import { hojeBrasilia } from "@/lib/datas";
import { ESOCIAL_PRAZOS_DESDE } from "@/lib/prazos-legais";
import { EsocialView } from "./esocial-view";

// Prazos eSocial (26/11/2026): os eventos que o escritório contábil precisa
// transmitir — admissão, desligamento, CAT e afastamento — com o prazo legal
// de cada um, a exportação dos dados e a marcação de "enviado ao escritório".
// O sistema não transmite nada ao eSocial (decisão desta fase).
//
// A lista sai de lib/esocial.ts::eventosEsocial, a MESMA função que conta o
// cartão "eSocial a enviar" da tela de Pendências e que monta o CSV: os três
// números não têm como divergir.
export default async function EsocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  // Interseção de `?empresas=` com o que o usuário enxerga — id digitado à
  // mão na URL não vira acesso. Sem filtro, tudo que ele vê (como Pendências).
  const escopo = await escopoDeEmpresas(usuario, empresasParam);
  const eventos = await eventosEsocial(escopo);

  return (
    <EsocialView
      empresaId={empresaId}
      escopo={escopo}
      eventos={eventos}
      hoje={hojeBrasilia()}
      desde={ESOCIAL_PRAZOS_DESDE}
    />
  );
}
