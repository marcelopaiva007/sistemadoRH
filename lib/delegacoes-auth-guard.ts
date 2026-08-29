import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";

/**
 * Guarda do módulo Delegações.
 *
 * Duas diferenças em relação a `lib/processos-auth-guard.ts`, e as duas são
 * decisões, não esquecimento:
 *
 * 1. NÃO existe `requireDelegacoesEmpresa`. `usuarioAlcancaEmpresa` responde
 *    "esta pessoa alcança este CNPJ?", e a demanda não tem CNPJ: ela tem dono
 *    (um `User`) e, no máximo, uma marca como etiqueta de filtro. Inventar um
 *    escopo de empresa aqui seria dar à `Demanda.marcaId` um poder de acesso
 *    que ela não tem.
 *
 * 2. NÃO há portão por PAPEL. Em Processos ele existe para manter o
 *    GESTOR_SETOR fora de uma navegação escopada por empresa que não foi
 *    desenhada para ele. Aqui o gestor de setor é justamente quem RECEBE
 *    demanda — barrá-lo por papel mataria metade do produto. Quem decide
 *    continua sendo o perfil: sem `delegacoes:*`, ninguém entra; e quem ainda
 *    não tem perfil nenhum cai no fallback por papel de `components/modulos.ts`
 *    (hoje: só ADMIN e DIRETORIA).
 *
 * ISTO NÃO É A REGRA DE QUEM VÊ O QUÊ. Esta guarda responde "você entra no
 * módulo?". Quem responde "você enxerga ESTA demanda?" é o `where` de cada
 * consulta (`demandasVisiveisPara`, em lib/delegacoes/consultas.ts), e quem
 * responde "você pode ESTA ação?" é a máquina de estados. São três perguntas
 * diferentes e nenhuma cobre a outra.
 */
export async function requireDelegacoesAccess() {
  const user = await requireUser();
  const sistemas = await sistemasPermitidos(user);
  if (!sistemas.includes("delegacoes")) {
    // Mesma escada de recusa do módulo de Processos: devolve a pessoa para um
    // sistema que ela alcança, em vez de deixá-la numa tela vazia.
    redirect(
      sistemas.includes("rh")
        ? "/rh"
        : sistemas.includes("processos")
          ? "/processos"
          : "/",
    );
  }
  return user;
}
