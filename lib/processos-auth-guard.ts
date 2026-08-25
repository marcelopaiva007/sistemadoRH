import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";

/**
 * Guarda do módulo Processos & Ativos.
 *
 * Papéis de escritório: ADMIN opera, DIRETORIA consulta, RH_MANAGER opera — os
 * mesmos três que o registro de módulos (`components/modulos.ts`) usa para
 * decidir se a porta aparece na barra de topo. GESTOR_SETOR fica de fora: a
 * navegação dele é uma tela só (`/rh/meu-setor`), e nada aqui é do recorte de
 * um setor.
 *
 * O ALCANCE À EMPRESA não é reimplementado aqui. Ele mora em
 * `usuarioAlcancaEmpresa` (lib/rh-auth-guard.ts) e cobre os três caminhos que
 * existem — papel global, vínculo por CNPJ e vínculo por MARCA. Foi
 * justamente reimplementar essa regra à mão que, em 11/08/2026, deixou nove
 * rotas de API com cinco variantes diferentes, duas delas esquecendo a
 * DIRETORIA (cujo pivô `UserEmpresa` é vazio POR DESENHO). Módulo novo não
 * recomeça esse erro: pergunta para quem já sabe responder.
 *
 * A diferença para `requireEmpresaAccess` é só o destino da recusa — de lá
 * volta para `/rh`, o que dentro deste módulo seria trocar a pessoa de módulo
 * sem explicar. Daqui volta para a tela inicial, que é a visão do grupo.
 */
const PAPEIS_DO_MODULO = ["ADMIN", "DIRETORIA", "RH_MANAGER"] as const;

export async function requireProcessosAccess() {
  const user = await requireUser();
  // O portão por PAPEL fica ANTES do de sistema DE PROPÓSITO: GESTOR_SETOR não
  // entra em Processos nem com um perfil que conceda `processos:*`. Não é
  // esquecimento — /processos é escopado por empresa e a navegação (seletor de
  // módulo/empresa) não foi desenhada para o gestor de setor, cuja tela é uma
  // só (/rh/meu-setor). Dar-lhe Processos por perfil não teria UX; se um dia
  // tiver, é aqui que o portão por papel sai. Para os papéis de escritório
  // (ADMIN/DIRETORIA/RH_MANAGER), quem manda é o perfil, no check abaixo.
  if (!PAPEIS_DO_MODULO.includes(user.role as (typeof PAPEIS_DO_MODULO)[number])) {
    redirect(user.role === "GESTOR_SETOR" ? "/rh/meu-setor" : "/");
  }
  // Onda 2b: enforcement de módulo. Perfil "só RH" não entra em /processos nem
  // por URL direta — vai para /rh. Usuário sem perfil cai no papel (fallback).
  const sistemas = await sistemasPermitidos(user);
  if (!sistemas.includes("processos")) redirect(sistemas.includes("rh") ? "/rh" : "/");
  return user;
}

export async function requireProcessosEmpresa(empresaId: string) {
  const user = await requireProcessosAccess();
  if (await usuarioAlcancaEmpresa(user, empresaId)) return user;
  redirect("/");
}
