import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ensureFuncionarioContato } from "@/lib/ensure-schema";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // As colunas de contato do Funcionário (email/telegramChatId) são criadas sob
  // demanda — a migração não é aplicada à mão (ver lib/ensure-schema). Como o
  // Prisma passa a selecionar essas colunas em toda leitura de Funcionário,
  // garantimos que existam antes de qualquer página autenticada consultá-las.
  // Best-effort e roda uma vez por processo; nunca bloqueia o acesso.
  try {
    await ensureFuncionarioContato();
  } catch {
    // Se o ALTER falhar (ex.: permissão), seguimos — as telas que usam os
    // campos têm sua própria checagem e o cron roda em modo seguro.
  }
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
