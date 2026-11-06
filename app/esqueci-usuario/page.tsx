import { EsqueciUsuarioForm } from "./esqueci-usuario-form";
import { FastmaiLogo } from "@/components/logo-fastmai";

// "Esqueci meu usuário" (v1.191.0): o acesso passou a ser só pelo nome de
// usuário, e quem só lembrava do e-mail precisa de um jeito de descobrir o
// usuário sem depender de alguém. Pública, como o "Esqueci minha senha"
// (auth.config.ts).
export default function EsqueciUsuarioPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <FastmaiLogo className="text-3xl" />
          <p className="text-sm text-muted-foreground">Esqueci meu usuário</p>
        </div>
        <EsqueciUsuarioForm />
      </div>
    </div>
  );
}
