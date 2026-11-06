import { redirect } from "next/navigation";
import { requireAreaAdmin } from "@/lib/grupo-guard";

// /admin abre direto em Usuários — a tela que motivou a área.
export default async function AdminInicioPage() {
  await requireAreaAdmin();
  redirect("/admin/usuarios");
}
