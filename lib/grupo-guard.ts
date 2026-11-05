import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { direcaoRestrita, ehMaster, grupoDoUsuario } from "@/lib/grupo";

/**
 * ADMIN de cadastro (marcas, CNPJs) — e o GRUPO em que ele manda.
 *
 * `requireAdmin` responde "você é ADMIN?"; isto responde também "de qual
 * grupo?". Toda action que cria, edita ou apaga marca/CNPJ passa por aqui e
 * confere o alvo com `marcaDoGrupo`/`empresaDoGrupo` — o ADMIN de um grupo
 * (sociedade — lib/grupo.ts) não toca na estrutura do outro.
 */
export async function requireAdminDoGrupo() {
  const user = await requireAdmin();
  // ADMIN preso a algumas marcas pela tela de admin não mexe na estrutura: com
  // ela, bastaria mudar um CNPJ de outra marca para a sua e passar a vê-lo.
  if (await direcaoRestrita(user)) redirect("/");
  const grupoId = await grupoDoUsuario(user.id);
  if (!grupoId) redirect("/");
  return { user, grupoId };
}

export async function marcaDoGrupo(
  marcaId: string,
  grupoId: string,
): Promise<boolean> {
  const m = await prisma.marca.findUnique({
    where: { id: marcaId },
    select: { grupoId: true },
  });
  return m?.grupoId === grupoId;
}

export async function empresaDoGrupo(
  empresaId: string,
  grupoId: string,
): Promise<boolean> {
  const e = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { marca: { select: { grupoId: true } } },
  });
  return e?.marca.grupoId === grupoId;
}

/** Só o MASTER: administra grupos e usuários, sem abrir dado de grupo nenhum. */
export async function requireMaster() {
  const user = await requireUser();
  if (!ehMaster(user)) redirect("/");
  return user;
}
