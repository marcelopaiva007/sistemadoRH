import { Alert, AlertDescription } from "@/components/ui/alert";

// Mensagem única para "não tem sessão", "expirou" e "link já usado". Não
// distingue os casos de propósito: para quem chega sem acesso, a instrução é a
// mesma, e detalhar só ajudaria quem está tentando adivinhar link de terceiro.
export function PortalSemSessao({ titulo = "Seu acesso expirou" }: { titulo?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
      <Alert>
        <AlertDescription>
          <p>
            Para entrar no portal, abra o bot do RH no Telegram e envie{" "}
            <strong>/portal</strong>. Você recebe um link novo na hora.
          </p>
          <p className="mt-2">
            O link vale por poucos minutos e abre uma vez só — é assim que seus dados ficam
            protegidos mesmo se a mensagem for encaminhada por engano.
          </p>
        </AlertDescription>
      </Alert>
      <p className="text-sm text-muted-foreground">
        Ainda não conversou com o bot? Envie <strong>/start</strong>{" "}
        e toque em &quot;Compartilhar meu número&quot;. Se não conseguir, procure o RH.
      </p>
    </div>
  );
}
