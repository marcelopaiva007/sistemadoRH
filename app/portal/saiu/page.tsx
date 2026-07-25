import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SaiuPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Você saiu do portal</h1>
      <Alert>
        <AlertDescription>
          Sua sessão foi encerrada neste aparelho. Para entrar de novo, envie <strong>/portal</strong>{" "}
          para o bot do RH no Telegram.
        </AlertDescription>
      </Alert>
    </div>
  );
}
