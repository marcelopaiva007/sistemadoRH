import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { gestorSetorPodeAbrirMeuSetor } from "@/lib/usuarios-regras";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";

// DIRETORIA entra na lista: o papel é global e de consulta — barrá-lo aqui
// fazia todo clique em empresa voltar para a home, sem mensagem nenhuma.
const RH_ROLES = ["ADMIN", "DIRETORIA", "RH_MANAGER", "GESTOR_SETOR"] as const;

export async function requireRHAccess() {
  const user = await requireUser();
  if (!RH_ROLES.includes(user.role as (typeof RH_ROLES)[number])) redirect("/");
  // Onda 2b: enforcement de módulo. Quem não tem o sistema 'rh' no perfil é
  // barrado de verdade — não só escondido na barra. Vai para o outro sistema
  // se tiver, senão para a home. Usuário sem perfil cai no papel (fallback em
  // sistemasPermitidos), então ninguém logado hoje perde acesso.
  const sistemas = await sistemasPermitidos(user);
  if (!sistemas.includes("rh")) redirect(sistemas.includes("processos") ? "/processos" : "/");
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
  // GESTOR_SETOR não navega em /rh/[empresaId] nem opera as actions escopadas
  // por empresa: a tela dele é /rh/meu-setor, confinada ao próprio time. Barrar
  // AQUI fecha as DUAS portas de uma vez — a página (o layout de /rh/[empresaId]
  // chama isto) e a chamada DIRETA de server action (o redirect aborta antes de
  // qualquer gravação). Até 27/08/2026 o confinamento era só o redirect da home
  // e esconder o seletor no topo — nada impedia o gestor de digitar a URL de
  // outro setor/empresa ou fazer um POST à mão na action, e ele lia e editava a
  // empresa inteira (achado ALTA do pentest). A exceção legítima — agir sobre um
  // SUBORDINADO do próprio time, como gerar a trilha de integração de um
  // recém-chegado — passa por requireAcessoAoColaborador, não por aqui.
  if (user.role === "GESTOR_SETOR") redirect("/rh/meu-setor");
  if (await usuarioAlcancaEmpresa(user, empresaId)) return user;
  redirect("/rh");
}

/**
 * Guarda de AÇÃO que um GESTOR_SETOR pode fazer sobre alguém do seu TIME.
 *
 * `requireEmpresaAccess` barra o gestor de /rh/[empresaId] por inteiro, mas a
 * tela "Meu time" (dentro de /rh/meu-setor) oferece ações legítimas sobre um
 * subordinado direto — hoje, gerar a trilha de integração de um recém-chegado.
 * O vínculo que autoriza é `supervisorId`, NÃO o setor do papel: um gestor pode
 * liderar gente de outro setor ou de outro CNPJ (mesma regra de
 * `montarTimeDoGestor` e do portal). Fora do próprio time, volta para a tela do
 * gestor. Para os demais papéis, é exatamente `requireEmpresaAccess`.
 */
export async function requireAcessoAoColaborador(empresaId: string, colaboradorId: string) {
  const user = await requireRHAccess();
  if (user.role === "GESTOR_SETOR") {
    const eu = await prisma.user.findUnique({
      where: { id: user.id },
      select: { colaboradorId: true },
    });
    const alvo = eu?.colaboradorId
      ? await prisma.colaborador.findUnique({
          where: { id: colaboradorId },
          select: { supervisorId: true },
        })
      : null;
    if (alvo && alvo.supervisorId === eu!.colaboradorId) return user;
    redirect("/rh/meu-setor");
  }
  if (await usuarioAlcancaEmpresa(user, empresaId)) return user;
  redirect("/rh");
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

/**
 * O escopo de uma tela consolidada: a INTERSEÇÃO entre o `?empresas=` da URL e
 * o que o usuário de fato enxerga. Sem filtro, tudo que ele enxerga.
 *
 * A interseção é regra de segurança, não conveniência: um id digitado à mão na
 * URL não pode virar acesso. A conta existia inline em ~20 telas do RH (e é lá
 * que continua, por ora); virou helper em 23/08/2026 porque o módulo Processos
 * & Ativos ia criar as cópias 18ª a 21ª — e a 22ª seria a que esquece o
 * `.includes`, mostrando número plausível e errado de outro CNPJ, a classe de
 * defeito da v1.105.0. Tela consolidada nova usa isto; migrar as antigas é
 * limpeza para outra hora.
 */
export async function escopoDeEmpresas(
  user: { id?: string; role: string; empresas: { empresaId: string; ativo: boolean }[] },
  empresasParam: string | undefined,
): Promise<string[]> {
  const visiveis = await empresasVisiveis(user);
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  return pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));
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

/**
 * Guarda de "Meu Setor" — a tela do GESTOR_SETOR.
 *
 * NÃO devolve o gestor para a home quando falta empresa/setor no vínculo, e é
 * isso que importa aqui: a home MANDA todo GESTOR_SETOR para esta tela
 * (`app/(app)/page.tsx`, `app/(app)/rh/page.tsx`, e o fallback de
 * `requireEmpresaAccess` logo acima). Até 15/08/2026 esta função respondia com
 * `redirect("/")`, e as duas pontas ficavam se empurrando: a home mandava para
 * cá, daqui voltava para a home, sem fim. Quem via isso via a TELA EM BRANCO —
 * o navegador nunca chegava a renderizar página nenhuma, e não havia mensagem
 * de erro em lugar nenhum para explicar o que faltava.
 *
 * Agora esta rota é TERMINAL para quem é GESTOR_SETOR: com vínculo completo
 * mostra o setor, sem vínculo completo mostra o que falta e a quem pedir.
 * Redirecionar daqui só acontece para quem NÃO é gestor de setor — e a home
 * renderiza normalmente para todos os outros papéis, então não há volta.
 *
 * Como o vínculo fica incompleto: convite de gestor sem setor, promoção a
 * gestor pela tela de edição, ou o único vínculo desativado depois. As duas
 * primeiras portas foram fechadas em `lib/actions/usuarios.ts`; esta função
 * cobre o que já existe no banco e o que a desativação ainda cria.
 */
export async function requireGestorSetor() {
  const user = await requireUser();
  if (user.role !== "GESTOR_SETOR") redirect("/");

  if (!gestorSetorPodeAbrirMeuSetor(user)) {
    return { pronto: false as const, user };
  }
  return {
    pronto: true as const,
    user: user as typeof user & { empresaAtivaId: string; setorAtivaId: string },
  };
}
