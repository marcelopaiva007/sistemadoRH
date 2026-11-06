// PERFIS POR CLIENTE (v1.199.0, Fase 1 da Gestão FASTMAI).
//
// A FASTMAI mantém MODELOS de perfil (Perfil sem grupoId); cada cliente tem
// a sua CÓPIA, que ajusta sem afetar os outros. Cliente novo nasce com uma
// cópia de cada modelo — sem isso, ninguém dele teria perfil para receber.
//
// Sem "server-only": o smoke roda isto direto contra o Postgres do CI.
import { createHash } from "node:crypto";
import { prisma, type Cliente } from "@/lib/prisma";

/**
 * O id da cópia de um modelo num cliente — o MESMO que a migration
 * 20261106220000_perfis_por_cliente gerou ('pc_' || md5(modelo:cliente)).
 * Determinístico: copiar de novo não duplica.
 */
export function idDaCopia(modeloId: string, grupoId: string): string {
  return `pc_${createHash("md5").update(`${modeloId}:${grupoId}`).digest("hex")}`;
}

/**
 * Dá ao cliente uma cópia de cada modelo FASTMAI que ele ainda não tem (pelo
 * id derivado, e pulando nome que o cliente já usa). Devolve quantos copiou.
 */
export async function copiarModelosParaCliente(grupoId: string, cliente: Cliente = prisma): Promise<number> {
  const [modelos, existentes] = await Promise.all([
    cliente.perfil.findMany({ where: { grupoId: null } }),
    cliente.perfil.findMany({ where: { grupoId }, select: { id: true, nome: true } }),
  ]);
  const ids = new Set(existentes.map((p) => p.id));
  const nomes = new Set(existentes.map((p) => p.nome.toLowerCase()));
  let copiados = 0;
  for (const m of modelos) {
    const id = idDaCopia(m.id, grupoId);
    if (ids.has(id) || nomes.has(m.nome.toLowerCase())) continue;
    await cliente.perfil.create({
      data: { id, grupoId, nome: m.nome, descricao: m.descricao, grants: m.grants, sistema: m.sistema, ativo: m.ativo },
    });
    copiados++;
  }
  return copiados;
}
