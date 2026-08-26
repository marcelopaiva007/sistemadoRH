import { RedefinirSenhaForm } from "./redefinir-senha-form";
import { FastmaiLogo } from "@/components/logo-fastmai";

export default async function RedefinirSenhaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <FastmaiLogo className="text-3xl" />
          <p className="text-sm text-muted-foreground">Redefinir senha</p>
        </div>
        <RedefinirSenhaForm token={token} />
      </div>
    </div>
  );
}
