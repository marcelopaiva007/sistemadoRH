import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";

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
  if (!PAPEIS_DO_MODULO.includes(user.role as (typeof PAPEIS_DO_MODULO)[number])) {
    redirect(user.role === "GESTOR_SETOR" ? "/rh/meu-setor" : "/");
  }
  return user;
}

export async function requireProcessosEmpresa(empresaId: string) {
  const user = await requireProcessosAccess();
  if (await usuarioAlcancaEmpresa(user, empresaId)) return user;
  redirect("/");
}
