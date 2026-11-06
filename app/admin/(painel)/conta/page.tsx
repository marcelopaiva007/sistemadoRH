import { requireAreaAdmin } from "@/lib/grupo-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlterarSenhaForm } from "@/components/alterar-senha-form";

// A senha da conta de administrador. A conta MASTER não usa o sistema do RH
// (o layout de lá a manda para /admin), então a troca de senha que mora em
// /conta precisa de uma porta aqui também — mesmo formulário, mesma action.
export default async function AdminContaPage() {
  const admin = await requireAreaAdmin();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha senha</h1>
        <p className="text-muted-foreground">
          Conta de administrador <span className="font-mono text-foreground">{admin.username}</span>.
          Esqueceu a senha atual? Saia e use &quot;Esqueci minha senha&quot; no login do admin.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trocar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <AlterarSenhaForm />
        </CardContent>
      </Card>
    </div>
  );
}
