import { EsqueciSenhaForm } from "./esqueci-senha-form";
import { Logo } from "@/components/logo";

export default function EsqueciSenhaPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <Logo width={240} height={64} className="h-14 w-auto" />
          <p className="text-sm text-muted-foreground">Esqueci minha senha</p>
        </div>
        <EsqueciSenhaForm />
      </div>
    </div>
  );
}
