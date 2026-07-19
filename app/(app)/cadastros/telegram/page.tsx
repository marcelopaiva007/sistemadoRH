import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { buscarUpdatesTelegram, telegramConfigurado } from "@/lib/notificacoes";
import { TelegramView } from "./telegram-view";

export const dynamic = "force-dynamic";

export default async function TelegramPage() {
  await requireAdmin();

  const configurado = telegramConfigurado();
  const [funcionarios, updates] = await Promise.all([
    prisma.funcionario.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, cargo: true, telegramChatId: true },
    }),
    configurado
      ? buscarUpdatesTelegram()
      : Promise.resolve({ ok: false as const, erro: "TELEGRAM_BOT_TOKEN não configurado" }),
  ]);

  const contatos = updates.ok ? updates.contatos : [];
  const erro = updates.ok ? null : updates.erro;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vincular Telegram</h1>
        <p className="text-muted-foreground">
          Para receber a cobrança de meta pelo Telegram, cada pessoa precisa abrir
          o bot <strong>@lm_vendas_bot</strong>, tocar em <strong>Iniciar</strong> e
          mandar qualquer mensagem. Depois, ela aparece na lista abaixo e você
          vincula ao funcionário com um clique.
        </p>
      </div>
      <TelegramView
        funcionarios={funcionarios}
        contatos={contatos}
        configurado={configurado}
        erro={erro}
      />
    </div>
  );
}
