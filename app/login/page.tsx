import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">LM Telecom</h1>
          <p className="text-sm text-muted-foreground">
            Sistema de Bonificação de Vendas
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
