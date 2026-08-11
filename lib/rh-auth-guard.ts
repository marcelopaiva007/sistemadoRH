import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

// DIRETORIA entra na lista: o papel é global e de consulta — barrá-lo aqui
// fazia todo clique em empresa voltar para a home, sem mensagem nenhuma.
const RH_ROLES = ["ADMIN", "DIRETORIA", "RH_MANAGER", "GESTOR_SETOR"] as const;

export async function requireRHAccess() {
  const user = await requireUser();
  if (!RH_ROLES.includes(user.role as (typeof RH_ROLES)[number])) redirect("/");
  return user;
}

// ADMIN acessa qualquer empresa. RH_MANAGER/GESTOR_SETOR precisam ter uma
// UserEmpresa ativa apontando para a empresaId solicitada. ADMIN e DIRETORIA
// também podem acessar — ADMIN livre, DIRETORIA só para consulta (read-only
// no módulo RH).
/**
 * A pergunta "esta pessoa alcança esta empresa?", isolada da RESPOSTA.
 *
 * Existe porque a resposta difere por contexto: uma página redireciona, uma
 * rota de API devolve 403 — `redirect()` dentro de um handler de API vira
 * resposta quebrada. Antes disso, cada rota em app/api reimplementava a regra
 * à mão, e em 11/08/2026 havia CINCO variantes diferentes espalhadas por nove
 * rotas. Duas delas esqueciam DIRETORIA, cujo pivô `UserEmpresa` é vazio POR
 * DESENHO — resultado: todo diretor tomava 403 ao gerar qualquer PDF de
 * pesquisa, e não conseguia baixar anexo nenhum do sistema.
 *
 * Regra nova: rota de API não decide acesso sozinha. Chama isto.
 */
export async function usuarioAlcancaEmpresa(
  user: { id?: string; role: string; empresas: { empresaId: string; ativo: boolean }[] },
  empresaId: string,
): Promise<boolean> {
  if (!RH_ROLES.includes(user.role as (typeof RH_ROLES)[number])) return false;
  // Papel global: ADMIN opera, DIRETORIA consulta. Nenhum dos dois passa pelo
  // pivô — exigir vínculo deles devolvia a diretoria para a home a cada clique.
  if (user.role === "ADMIN" || user.role === "DIRETORIA") return true;
  if (user.empresas.some((e) => e.empresaId === empresaId && e.ativo)) return true;

  // Pode não ter vínculo com este CNPJ e ainda assim alcançá-lo pela marca.
  // Vem de `UserMarca` — e não de cruzar as empresas da marca com o pivô, que
  // é o erro que as rotas de API cometiam: são tabelas diferentes, e quem tem
  // acesso só por marca não aparece no pivô.
  const porMarca = await empresasDasMarcasDoUsuario(user.id);
  return porMarca.includes(empresaId);
}

export async function requireEmpresaAccess(empresaId: string) {
  const user = await requireRHAccess();
  if (await usuarioAlcancaEmpresa(user, empresaId)) return user;
  redirect(user.role === "GESTOR_SETOR" ? "/rh/meu-setor" : "/rh");
}

// Empresas que o usuário enxerga no módulo de RH — a base do filtro por
// marca/CNPJ, que consolida tudo por padrão.
//
// ADMIN e DIRETORIA têm papel GLOBAL: o pivô UserEmpresa fica vazio para eles.
// Montar a lista a partir do pivô devolveria lista nenhuma — e uma tela que
// depende dela some, ou responde 404 achando que a empresa não existe.
export async function empresasVisiveis(user: {
  id?: string;
  role: string;
  empresas: { empresaId: string; ativo: boolean }[];
}): Promise<string[]> {
  if (user.role === "ADMIN" || user.role === "DIRETORIA") {
    const todas = await prisma.empresa.findMany({
      where: { ativo: true },
      select: { id: true },
    });
    return todas.map((e) => e.id);
  }

  const porEmpresa = user.empresas.filter((e) => e.ativo).map((e) => e.empresaId);
  const porMarca = await empresasDasMarcasDoUsuario(user.id);
  return [...new Set([...porEmpresa, ...porMarca])];
}

// CNPJs que o usuário alcança por ter acesso à MARCA inteira. Consultado a cada
// request, e não lido do JWT, justamente para que um CNPJ cadastrado depois
// entre no acesso sem exigir novo login — é o que o vínculo por marca promete.
async function empresasDasMarcasDoUsuario(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const vinculos = await prisma.userMarca.findMany({
    where: { userId, ativo: true },
    select: { marcaId: true },
  });
  if (vinculos.length === 0) return [];
  const empresas = await prisma.empresa.findMany({
    where: { marcaId: { in: vinculos.map((v) => v.marcaId) }, ativo: true },
    select: { id: true },
  });
  return empresas.map((e) => e.id);
}

// GESTOR_SETOR com empresa ativa + setor ativo no JWT. Se faltarem (cookie
// expirado, pivô desativado), manda pra home — UI de troca fica na Fase 7.
export async function requireGestorSetor() {
  const user = await requireUser();
  if (
    user.role !== "GESTOR_SETOR" ||
    !user.empresaAtivaId ||
    !user.setorAtivaId ||
    !user.empresas.some((e) => e.empresaId === user.empresaAtivaId && e.ativo)
  ) {
    redirect("/");
  }
  return user as typeof user & { empresaAtivaId: string; setorAtivaId: string };
}
