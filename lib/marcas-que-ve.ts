import { prisma } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";

// TELA DE ADMIN — "quais marcas esta conta vê" (pedido do CEO, 05/11/2026).
//
// Grava, de uma vez, o GRUPO da conta e as MARCAS marcadas (`UserMarca`):
// - ADMIN/DIRETORIA: nenhuma marca = o grupo inteiro; com marca marcada, só
//   elas (lib/grupo.ts, `direcaoRestrita`).
// - Gestor de RH: as marcas que ele atende (todos os CNPJs delas, inclusive os
//   cadastrados depois); CNPJ avulso continua em "Vincular".
// - Gestor de setor: fora daqui — o acesso dele é o setor de um CNPJ.
//
// Mudar de grupo desativa os vínculos de CNPJ do grupo antigo, como em Grupos
// (lib/actions/grupos.ts, `moverUsuarioDeGrupo`): nada atravessa a parede de
// sociedade.
//
// Quem pode chamar (só o MASTER) é decidido na action, lib/actions/usuarios.ts
// (`definirMarcasQueVe`). Aqui é só a regra — e por isso fica FORA do arquivo
// "use server": lá, toda função exportada vira endpoint chamável do navegador.

export type ResultadoMarcasQueVe =
  | { ok: true; resumo: string }
  | { ok: false; error: string };

export async function aplicarMarcasQueVe(entrada: {
  userId: string;
  grupoId: string;
  marcaIds: string[];
}): Promise<ResultadoMarcasQueVe> {
  const escolhidas = [...new Set(entrada.marcaIds)];

  const [alvo, grupo, marcas] = await Promise.all([
    prisma.user.findUnique({
      where: { id: entrada.userId },
      select: {
        id: true,
        nome: true,
        role: true,
        ativo: true,
        grupoId: true,
        grupo: { select: { nome: true } },
      },
    }),
    prisma.grupo.findUnique({
      where: { id: entrada.grupoId },
      select: { id: true, nome: true, ativo: true },
    }),
    prisma.marca.findMany({
      where: { id: { in: escolhidas } },
      select: { id: true, nome: true, ativo: true, grupoId: true },
    }),
  ]);

  if (!alvo || alvo.role === "MASTER" || alvo.role === PAPEL_PORTAL) {
    return { ok: false, error: "Usuário não encontrado." };
  }
  if (alvo.role === "GESTOR_SETOR") {
    return {
      ok: false,
      error: "Gestor de setor vê só o próprio setor: o acesso dele é pelo CNPJ e setor, em Vincular.",
    };
  }
  if (!grupo || !grupo.ativo) return { ok: false, error: "Cliente não encontrado." };
  if (
    marcas.length !== escolhidas.length ||
    marcas.some((m) => m.grupoId !== grupo.id || !m.ativo)
  ) {
    return { ok: false, error: "Alguma marca escolhida não é deste cliente." };
  }

  const mudaGrupo = alvo.grupoId !== grupo.id;

  // Mesma trava de Grupos: o grupo de origem não pode ficar sem ADMIN ativo.
  if (mudaGrupo && alvo.role === "ADMIN" && alvo.ativo && alvo.grupoId) {
    const outros = await prisma.user.count({
      where: { role: "ADMIN", ativo: true, grupoId: alvo.grupoId, NOT: { id: alvo.id } },
    });
    if (outros === 0) {
      return { ok: false, error: `${alvo.nome} é o único ADMIN ativo de "${alvo.grupo?.nome}".` };
    }
  }

  // Gestor de RH sem marca e sem CNPJ entra no sistema e não vê nada — melhor
  // recusar aqui do que deixar a pessoa descobrir sozinha.
  if (alvo.role === "RH_MANAGER" && escolhidas.length === 0) {
    const cnpjsNoGrupo = mudaGrupo
      ? 0
      : await prisma.userEmpresa.count({
          where: { userId: alvo.id, ativo: true, empresa: { marca: { grupoId: grupo.id } } },
        });
    if (cnpjsNoGrupo === 0) {
      return {
        ok: false,
        error: "Gestor de RH precisa de pelo menos uma marca (ou de um CNPJ, em Vincular).",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (mudaGrupo) {
      await tx.user.update({
        where: { id: alvo.id },
        data: { grupoId: grupo.id, empresaId: null, setorId: null },
      });
      await tx.userEmpresa.updateMany({
        where: { userId: alvo.id, ativo: true },
        data: { ativo: false, papelPrincipal: false },
      });
    }
    // As marcas escolhidas ficam ativas; qualquer outra sai — a lista da tela
    // é a lista inteira, não um acréscimo. Exceção: vínculo com marca
    // DESATIVADA do mesmo grupo, que a tela não mostra (não tem checkbox) e
    // ainda pode abrir CNPJ ativo dela. Só some quando a conta muda de grupo.
    await tx.userMarca.updateMany({
      where: {
        userId: alvo.id,
        ativo: true,
        marcaId: { notIn: escolhidas },
        ...(mudaGrupo ? {} : { marca: { ativo: true } }),
      },
      data: { ativo: false },
    });
    // O papel do vínculo é o da pessoa: para ADMIN/DIRETORIA é ele que faz da
    // marca uma RESTRIÇÃO (lib/grupo.ts, `PAPEIS_DE_RESTRICAO`) — inclusive
    // quando o admin marca uma marca que já tinha vínculo antigo de gestor.
    for (const marcaId of escolhidas) {
      await tx.userMarca.upsert({
        where: { userId_marcaId: { userId: alvo.id, marcaId } },
        create: { userId: alvo.id, marcaId, role: alvo.role },
        update: { ativo: true, role: alvo.role },
      });
    }
  });

  const nomes = marcas.map((m) => m.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const oQueVe =
    nomes.length > 0
      ? nomes.join(", ")
      : alvo.role === "ADMIN" || alvo.role === "DIRETORIA"
        ? "todas as marcas do cliente"
        : "só os CNPJs vinculados";
  return {
    ok: true,
    resumo:
      `Definiu as marcas que ${alvo.nome} vê: ${oQueVe}` +
      (mudaGrupo ? ` (mudou do cliente "${alvo.grupo?.nome ?? "—"}" para "${grupo.nome}")` : ""),
  };
}
