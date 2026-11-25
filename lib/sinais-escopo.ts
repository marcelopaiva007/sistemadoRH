import { prisma } from "@/lib/prisma";
import { direcaoRestrita, grupoDoUsuario } from "@/lib/grupo";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { ID_GRUPO } from "@/lib/anomalias";

/**
 * Quem enxerga um Sinal SEM empresa (`empresaId` nulo — sinal de marca ou de
 * grupo). Escrito em 25/11/2026.
 *
 * Até aqui a Central de Sinais mostrava todo sinal sem empresa para qualquer
 * leitor, de qualquer grupo (`OR: [{ empresaId: null }, ...]`), e as actions
 * aceitavam agir sobre ele sem conferir nada. Com dois clientes no sistema,
 * isso vazava o pico de desligamentos de uma marca de OUTRO cliente — nome da
 * marca e números — e deixava descartá-lo ou virar plano de lá.
 *
 * A regra agora, pelo `nivelUnidade` e `unidadeId` do sinal:
 *   - MARCA: aparece para quem enxerga ao menos um CNPJ da marca. Mantém a
 *     intenção original ("o pico da marca é contexto do próprio CNPJ") sem
 *     atravessar marca nem grupo.
 *   - GRUPO com `unidadeId` = id de um Grupo: aparece para quem é desse grupo.
 *     É o formato que o cron grava desde esta data (lib/sinais-registro.ts).
 *   - GRUPO LEGADO (`unidadeId` = "grupo", gravado antes, quando o radar somava
 *     os funcionários de TODOS os clientes numa unidade só): não há como saber
 *     de qual grupo ele é — e, a rigor, ele é de todos. Fica visível SÓ para
 *     ADMIN/DIRETORIA não restritos a marcas. Para de ser gerado; os que
 *     existem envelhecem e saem da tela pelo fluxo normal (descartar).
 *   - Qualquer outra coisa sem empresa: ninguém (falha fechada).
 */
export type EscopoSinaisSemEmpresa = {
  grupoId: string | null;
  marcas: string[];
  veLegado: boolean;
};

type UsuarioDoEscopo = Parameters<typeof empresasVisiveis>[0];

export async function escopoDeSinaisSemEmpresa(usuario: UsuarioDoEscopo): Promise<EscopoSinaisSemEmpresa> {
  const [grupoId, visiveis, restrita] = await Promise.all([
    grupoDoUsuario(usuario.id),
    empresasVisiveis(usuario),
    direcaoRestrita(usuario),
  ]);
  const empresas = visiveis.length
    ? await prisma.empresa.findMany({ where: { id: { in: visiveis } }, select: { marcaId: true } })
    : [];
  return {
    grupoId,
    marcas: [...new Set(empresas.map((e) => e.marcaId))],
    veLegado:
      grupoId !== null && (usuario.role === "ADMIN" || usuario.role === "DIRETORIA") && !restrita,
  };
}

/** As cláusulas de `OR` para os sinais SEM empresa que este escopo enxerga. */
export function whereSinaisSemEmpresa(e: EscopoSinaisSemEmpresa) {
  const ors: { empresaId: null; nivelUnidade: string; unidadeId: string | { in: string[] } }[] = [];
  if (e.marcas.length > 0) {
    ors.push({ empresaId: null, nivelUnidade: "MARCA", unidadeId: { in: e.marcas } });
  }
  if (e.grupoId) ors.push({ empresaId: null, nivelUnidade: "GRUPO", unidadeId: e.grupoId });
  if (e.veLegado) ors.push({ empresaId: null, nivelUnidade: "GRUPO", unidadeId: ID_GRUPO });
  return ors;
}

/** A mesma pergunta de `whereSinaisSemEmpresa`, para um sinal já carregado (actions). */
export function sinalSemEmpresaVisivel(
  e: EscopoSinaisSemEmpresa,
  sinal: { nivelUnidade: string; unidadeId: string },
): boolean {
  if (sinal.nivelUnidade === "MARCA") return e.marcas.includes(sinal.unidadeId);
  if (sinal.nivelUnidade === "GRUPO") {
    if (e.grupoId && sinal.unidadeId === e.grupoId) return true;
    return e.veLegado && sinal.unidadeId === ID_GRUPO;
  }
  return false;
}
