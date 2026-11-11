import type { Cliente } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

// Unicidade de e-mail no grupo — colaboradores ativos e inativos de todas as
// marcas pertencentes ao mesmo Grupo empresarial não podem dividir o mesmo
// e-mail, exceto se forem a mesma pessoa física (mesmo CPF válido de 11 dígitos).
//
// O e-mail é usado para convites de pesquisa, envio de links do portal e
// recibos/contracheques — duplicata de e-mail entre pessoas distintas mistura
// comunicações e expõe dados sigilosos.

export type DbClient = Cliente;

export type ConflitoEmailExterno = {
  colaboradorId: string;
  email: string;
  outroColaborador: {
    id: string;
    nome: string;
    ativo: boolean;
    empresaId: string;
    empresaNome: string;
    marcaNome: string;
  };
};

/**
 * Normaliza e-mail: remove espaços nas pontas e converte para minúsculas.
 * Retorna null se vazio ou não informado.
 */
export function normalizarEmailColaborador(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const limpo = email.trim().toLowerCase();
  return limpo.length > 0 ? limpo : null;
}

/**
 * Avalia se há conflito de e-mail entre duas pessoas.
 *
 * Conflito existe a menos que AMBAS as fichas carreguem um CPF válido de 11
 * dígitos e os números normalizados sejam idênticos (mesma pessoa física em
 * transferência, recontratação ou duplo vínculo no grupo).
 * Se qualquer uma não tiver CPF válido, ou os CPFs divergirem, é conflito.
 */
export function ehConflitoDeEmailEntrePessoas(
  alvo: { id?: string; cpf: string | null | undefined },
  outro: { id: string; cpf: string | null | undefined },
): boolean {
  if (alvo.id && outro.id && alvo.id === outro.id) return false;
  const cpfAlvo = alvo.cpf?.replace(/\D/g, "") ?? "";
  const cpfOutro = outro.cpf?.replace(/\D/g, "") ?? "";
  const validoAlvo = /^\d{11}$/.test(cpfAlvo);
  const validoOutro = /^\d{11}$/.test(cpfOutro);

  if (validoAlvo && validoOutro && cpfAlvo === cpfOutro) {
    return false;
  }
  return true;
}

export const encontrarConflitoDeEmailEntreCandidatos = ehConflitoDeEmailEntrePessoas;

/**
 * Retorna os IDs de todas as empresas pertencentes ao mesmo grupo da empresa dada.
 * Se a empresa não tiver grupo vinculado, retorna apenas o ID da própria empresa.
 */
export async function empresaIdsDoGrupoDaEmpresa(
  db: {
    empresa: {
      findUnique: (args: {
        where: { id: string };
        select: { marca: { select: { grupoId: true } } };
      }) => Promise<{ marca?: { grupoId?: string | null } | null } | null>;
      findMany: (args: {
        where: { marca: { grupoId: string } };
        select: { id: true };
      }) => Promise<Array<{ id: string }>>;
    };
  },
  empresaId: string,
): Promise<string[]> {
  const emp = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { marca: { select: { grupoId: true } } },
  });
  const grupoId = emp?.marca?.grupoId;
  if (!grupoId) return [empresaId];

  const empresas = await db.empresa.findMany({
    where: { marca: { grupoId } },
    select: { id: true },
  });
  const ids = empresas.map((e) => e.id);
  return ids.length > 0 ? ids : [empresaId];
}

/**
 * Valida se um e-mail está livre para uso na empresa (ou grupo).
 *
 * Retorna string com mensagem de erro explicativa se houver conflito,
 * ou null se o e-mail for válido e puder ser gravado.
 */
export async function validarEmailColaboradorLivre(
  db: DbClient,
  params: {
    empresaId: string;
    email: string | null | undefined;
    colaboradorIdExcluir?: string;
    cpfProprio?: string | null;
  },
): Promise<string | null> {
  const emailNormalizado = normalizarEmailColaborador(params.email);
  if (!emailNormalizado) return null;

  const empresaIds = await empresaIdsDoGrupoDaEmpresa(db, params.empresaId);

  const where: Prisma.ColaboradorWhereInput = {
    empresaId: { in: empresaIds },
    email: { equals: emailNormalizado, mode: "insensitive" },
  };
  if (params.colaboradorIdExcluir) {
    where.id = { not: params.colaboradorIdExcluir };
  }

  const existentes = await db.colaborador.findMany({
    where,
    select: {
      id: true,
      nome: true,
      cpf: true,
      ativo: true,
      empresa: {
        select: {
          nome: true,
          marca: { select: { nome: true } },
        },
      },
    },
  });

  for (const outro of existentes) {
    const conflito = ehConflitoDeEmailEntrePessoas(
      { id: params.colaboradorIdExcluir, cpf: params.cpfProprio },
      outro,
    );
    if (conflito) {
      const marcaNome = outro.empresa?.marca?.nome ?? "Marca";
      const empresaNome = outro.empresa?.nome ?? "Empresa";
      const statusDesligado = outro.ativo ? "" : " · desligado";
      return `Este e-mail já está em uso por ${outro.nome} (${marcaNome} · ${empresaNome}${statusDesligado}).`;
    }
  }

  return null;
}

/**
 * Busca conflitos de e-mail no grupo entre colaboradores exibidos na tela e
 * colaboradores de outras empresas fora da tela.
 *
 * Retorna APENAS fichas de fora da tela cujo e-mail colida com algum colaborador
 * exibido e com CPF divergente/ausente, preservando total sigilo contra vazamento
 * cross-tenant.
 */
export async function buscarConflitosDeEmailNoGrupo(
  db: DbClient,
  empresaIdsNaTela: string[],
  candidatos: Array<{ id: string; cpf: string | null; email: string | null }>,
): Promise<ConflitoEmailExterno[]> {
  if (!empresaIdsNaTela.length || !candidatos.length) return [];

  const comEmail = candidatos
    .map((c) => ({ ...c, emailNorm: normalizarEmailColaborador(c.email) }))
    .filter((c): c is typeof c & { emailNorm: string } => c.emailNorm !== null);

  if (comEmail.length === 0) return [];

  const todosEmpresaIdsSet = new Set<string>();
  for (const id of empresaIdsNaTela) {
    const ids = await empresaIdsDoGrupoDaEmpresa(db, id);
    ids.forEach((eId) => todosEmpresaIdsSet.add(eId));
  }
  const foraDaTela = Array.from(todosEmpresaIdsSet).filter(
    (id) => !empresaIdsNaTela.includes(id),
  );
  if (foraDaTela.length === 0) return [];

  const emailsBuscados = Array.from(new Set(comEmail.map((c) => c.emailNorm)));
  const where: Prisma.ColaboradorWhereInput = {
    empresaId: { in: foraDaTela },
  };
  if (emailsBuscados.length === 1) {
    where.email = { equals: emailsBuscados[0], mode: "insensitive" };
  } else {
    where.OR = emailsBuscados.map((em) => ({
      email: { equals: em, mode: "insensitive" },
    }));
  }

  const existentes = await db.colaborador.findMany({
    where,
    select: {
      id: true,
      nome: true,
      cpf: true,
      email: true,
      ativo: true,
      empresaId: true,
      empresa: {
        select: {
          nome: true,
          marca: { select: { nome: true } },
        },
      },
    },
  });

  const conflitos: ConflitoEmailExterno[] = [];
  for (const c of comEmail) {
    for (const outro of existentes) {
      if (normalizarEmailColaborador(outro.email) !== c.emailNorm) continue;
      if (ehConflitoDeEmailEntrePessoas(c, outro)) {
        conflitos.push({
          colaboradorId: c.id,
          email: c.emailNorm,
          outroColaborador: {
            id: outro.id,
            nome: outro.nome,
            ativo: outro.ativo,
            empresaId: outro.empresaId,
            empresaNome: outro.empresa?.nome ?? "Empresa",
            marcaNome: outro.empresa?.marca?.nome ?? "Marca",
          },
        });
      }
    }
  }

  return conflitos;
}
