import { redirect } from "next/navigation";
import { requireAreaAdmin } from "@/lib/grupo-guard";

// /admin abre em Clientes desde a v1.192.0: a Gestão FASTMAI começa pelos
// clientes (LM Telecom, o cliente multimarcas...), e de cada um se chega aos
// usuários dele.
export default async function AdminInicioPage() {
  await requireAreaAdmin();
  redirect("/admin/clientes");
}
