import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * GRUPO — a fronteira de sociedade (ver o model `Grupo` no schema).
 *
 * Toda conta de trabalho pertence a um grupo, e NADA cruza essa parede: uma
 * pessoa do grupo "Demais marcas" não enxerga, não soma e não recebe e-mail
 * sobre a LM Telecom, e vice-versa — nem sendo ADMIN ou DIRETORIA, que passam
 * a ser "globais dentro do grupo".
 *
 * O grupo é lido do BANCO a cada request (memorizado por request com `cache`),
 * nunca do JWT: se o MASTER mudar alguém de grupo, a troca vale no próximo
 * clique, não no próximo login. Mesmo raciocínio de `UserMarca`.
 */

/** Papel de quem administra os grupos. Só administra: não abre dado de grupo nenhum. */
export const PAPEL_MASTER = "MASTER";

export function ehMaster(user: { role: string }): boolean {
  return user.role === PAPEL_MASTER;
}

/** O grupo do usuário, ou null (MASTER, ou conta sem grupo — que não enxerga nada). */
export const grupoDoUsuario = cache(
  async (userId: string | undefined): Promise<string | null> => {
    if (!userId) return null;
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { grupoId: true, role: true },
    });
    if (!u || u.role === PAPEL_MASTER) return null;
    return u.grupoId ?? null;
  },
);

/**
 * Papel gravado no `UserMarca` quando a tela de admin PRENDE uma Diretoria ou
 * um Administrativo a uma marca. É o que separa a restrição do vínculo de
 * trabalho de gestor (RH_MANAGER/GESTOR_SETOR): vínculo antigo de gestor que
 * ficou numa conta depois promovida a Diretoria não restringe nada — e por isso
 * esta regra não prende ninguém de surpresa no dia em que entra no ar.
 */
export const PAPEIS_DE_RESTRICAO: string[] = ["ADMIN", "DIRETORIA"];

/**
 * Marcas MARCADAS pelo admin para este login dentro do próprio grupo — o que a
 * tela de admin chama de "marcas que vê" (`UserMarca` ativo com papel de
 * restrição). Vínculo com marca de OUTRO grupo não conta: a parede de grupo
 * vem antes de tudo.
 *
 * Para ADMIN e DIRETORIA, lista vazia quer dizer "o grupo inteiro"; com alguma
 * marca marcada, a pessoa fica SÓ nelas (decisão do CEO em 05/11/2026: "tem
 * usuário que só vê uma daquelas marcas"). Para RH e gestor de setor nada muda:
 * eles sempre viram só os próprios vínculos.
 */
export const marcasMarcadasNoGrupo = cache(
  async (userId: string | undefined): Promise<string[]> => {
    if (!userId) return [];
    const grupoId = await grupoDoUsuario(userId);
    if (!grupoId) return [];
    const vinculos = await prisma.userMarca.findMany({
      where: { userId, ativo: true, role: { in: PAPEIS_DE_RESTRICAO }, marca: { grupoId } },
      select: { marcaId: true },
    });
    return vinculos.map((v) => v.marcaId);
  },
);

/**
 * ADMIN ou DIRETORIA preso a algumas marcas do grupo (ver
 * `marcasMarcadasNoGrupo`). Quem está restrito deixa de ser "global no grupo":
 * enxerga só as marcas marcadas e não administra contas — senão bastaria criar
 * uma conta de Diretoria nova, ou desmarcar a própria restrição, para voltar a
 * ver tudo.
 */
export async function direcaoRestrita(user: {
  id?: string;
  role: string;
}): Promise<boolean> {
  if (user.role !== "ADMIN" && user.role !== "DIRETORIA") return false;
  return (await marcasMarcadasNoGrupo(user.id)).length > 0;
}

/** CNPJs ativos do grupo. Grupo nulo = lista vazia (falha fechada). */
export const empresasDoGrupo = cache(
  async (grupoId: string | null): Promise<string[]> => {
    if (!grupoId) return [];
    const empresas = await prisma.empresa.findMany({
      where: { ativo: true, marca: { grupoId } },
      select: { id: true },
    });
    return empresas.map((e) => e.id);
  },
);

/** Marcas do grupo (ativas ou não — quem filtra `ativo` é a tela). */
export const marcasDoGrupo = cache(
  async (grupoId: string | null): Promise<string[]> => {
    if (!grupoId) return [];
    const marcas = await prisma.marca.findMany({
      where: { grupoId },
      select: { id: true },
    });
    return marcas.map((m) => m.id);
  },
);

/** O grupo dono de um CNPJ (null se o CNPJ não existe). */
export const grupoDaEmpresa = cache(
  async (empresaId: string): Promise<string | null> => {
    const e = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { marca: { select: { grupoId: true } } },
    });
    return e?.marca.grupoId ?? null;
  },
);

/** Os usuários de um grupo — para rotinas que avisam "a direção" ou "os ADMINs". */
export function noGrupo(grupoId: string | null) {
  // `{ in: [] }` quando não há grupo: falha fechada, ninguém recebe.
  return grupoId ? { grupoId } : { id: { in: [] as string[] } };
}

/** O grupo dono da ficha de um funcionário (null se a ficha não existe). */
export async function grupoDoColaborador(
  colaboradorId: string,
): Promise<string | null> {
  const c = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { empresa: { select: { marca: { select: { grupoId: true } } } } },
  });
  return c?.empresa.marca.grupoId ?? null;
}

/**
 * "Estas duas contas são do mesmo grupo?" — a recusa que mora no SERVIDOR para
 * qualquer ação que liga uma pessoa a outra (delegar, transferir, favoritar).
 * A tela já só lista gente do grupo; isto barra o POST montado à mão.
 */
export async function mesmoGrupo(
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([
    grupoDoUsuario(userIdA),
    grupoDoUsuario(userIdB),
  ]);
  return a !== null && a === b;
}

// ── Recortes de `where` "do mesmo grupo que <userId>" ──────────────────────
// Escritos só com o id de quem pergunta: entram direto num `findMany` sem uma
// ida prévia ao banco. Quem não tem grupo (MASTER, conta órfã) casa com nada.

/** Usuários do mesmo grupo que `userId`. */
export function whereUsuariosDoGrupoDe(userId: string) {
  return { grupo: { usuarios: { some: { id: userId } } } };
}

/** Fichas de funcionário do mesmo grupo que `userId`. */
export function whereColaboradoresDoGrupoDe(userId: string) {
  return {
    empresa: { marca: { grupo: { usuarios: { some: { id: userId } } } } },
  };
}

/** Marcas do mesmo grupo que `userId`. */
export function whereMarcasDoGrupoDe(userId: string) {
  return { grupo: { usuarios: { some: { id: userId } } } };
}

/** CNPJs do mesmo grupo que `userId`. */
export function whereEmpresasDoGrupoDe(userId: string) {
  return { marca: { grupo: { usuarios: { some: { id: userId } } } } };
}

/** Usuários do GRUPO dono do CNPJ `empresaId` — para seletores de responsável numa tela de empresa. */
export function whereUsuariosDoGrupoDaEmpresa(empresaId: string) {
  return {
    grupo: { marcas: { some: { empresas: { some: { id: empresaId } } } } },
  };
}
