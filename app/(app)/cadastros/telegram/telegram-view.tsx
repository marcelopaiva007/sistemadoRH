"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { vincularTelegramChatId } from "@/lib/actions/cadastros";
import { CARGOS } from "@/lib/constants";

type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  telegramChatId: string | null;
};
type Contato = { chatId: string; nome: string; username: string | null };

const cargoLabel = (cargo: string) => CARGOS.find((c) => c.value === cargo)?.label ?? cargo;

export function TelegramView({
  funcionarios,
  contatos,
  configurado,
  erro,
}: {
  funcionarios: Funcionario[];
  contatos: Contato[];
  configurado: boolean;
  erro: string | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const porChatId = new Map(
    funcionarios
      .filter((f) => f.telegramChatId)
      .map((f) => [f.telegramChatId as string, f]),
  );
  const vinculados = funcionarios.filter((f) => f.telegramChatId);

  return (
    <div className="space-y-6">
      {!configurado && (
        <Alert>
          <AlertDescription>
            O <strong>TELEGRAM_BOT_TOKEN</strong> ainda não está configurado nas
            variáveis de ambiente da Vercel. Configure-o para o bot funcionar e
            esta lista carregar.
          </AlertDescription>
        </Alert>
      )}
      {configurado && erro && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível ler o Telegram: {erro}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Quem iniciou o bot</h2>
        <Button
          variant="outline"
          disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar lista
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome no Telegram</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>chat_id</TableHead>
              <TableHead>Vincular a</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contatos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {configurado
                    ? "Ninguém mandou mensagem para o bot nas últimas ~24h. Peça para a pessoa abrir @lm_vendas_bot, tocar em Iniciar e mandar um “oi”, depois clique em Atualizar lista."
                    : "Configure o token do bot para ver a lista."}
                </TableCell>
              </TableRow>
            )}
            {contatos.map((c) => (
              <ContatoRow
                key={c.chatId}
                contato={c}
                jaVinculadoA={porChatId.get(c.chatId) ?? null}
                funcionarios={funcionarios}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {vinculados.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Vínculos atuais</h2>
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>chat_id</TableHead>
                  <TableHead className="w-32 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vinculados.map((f) => (
                  <VinculoRow key={f.id} funcionario={f} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function ContatoRow({
  contato,
  jaVinculadoA,
  funcionarios,
}: {
  contato: Contato;
  jaVinculadoA: Funcionario | null;
  funcionarios: Funcionario[];
}) {
  const [funcionarioId, setFuncionarioId] = useState("");
  const [saving, startSaving] = useTransition();

  function vincular() {
    if (!funcionarioId) return;
    startSaving(async () => {
      const r = await vincularTelegramChatId(funcionarioId, contato.chatId);
      if (r.ok) toast.success("Telegram vinculado.");
      else toast.error(r.error);
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{contato.nome}</TableCell>
      <TableCell>{contato.username ? `@${contato.username}` : "—"}</TableCell>
      <TableCell className="font-mono text-sm">{contato.chatId}</TableCell>
      <TableCell>
        {jaVinculadoA ? (
          <Badge variant="secondary">Vinculado a {jaVinculadoA.nome}</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Select
              value={funcionarioId}
              onValueChange={(v) => setFuncionarioId(v ?? "")}
              items={Object.fromEntries(funcionarios.map((f) => [f.id, f.nome]))}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Escolha a pessoa" />
              </SelectTrigger>
              <SelectContent>
                {funcionarios.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome} — {cargoLabel(f.cargo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!funcionarioId || saving} onClick={vincular}>
              <Link2 className="size-4" />
              Vincular
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function VinculoRow({ funcionario }: { funcionario: Funcionario }) {
  const [saving, startSaving] = useTransition();

  function desvincular() {
    startSaving(async () => {
      const r = await vincularTelegramChatId(funcionario.id, "");
      if (r.ok) toast.success("Telegram desvinculado.");
      else toast.error(r.error);
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{funcionario.nome}</TableCell>
      <TableCell>{cargoLabel(funcionario.cargo)}</TableCell>
      <TableCell className="font-mono text-sm">{funcionario.telegramChatId}</TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" disabled={saving} onClick={desvincular}>
          <Unlink className="size-4" />
          Desvincular
        </Button>
      </TableCell>
    </TableRow>
  );
}
