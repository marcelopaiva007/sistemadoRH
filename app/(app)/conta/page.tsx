import { requireUser } from "@/lib/auth-guard";
import { AlterarSenhaForm } from "./alterar-senha-form";

export default async function ContaPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha Conta</h1>
        <p className="text-muted-foreground">
          {user.name ?? user.username} — {user.role === "ADMIN" ? "Administrativo/Financeiro" : "Diretoria/Gestão"}
        </p>
      </div>
      <AlterarSenhaForm />
    </div>
  );
}
