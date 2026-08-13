"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderLock, KeyRound, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  removerSmtp,
  removerTelegramToken,
  salvarSmtp,
  salvarTelegramToken,
} from "@/lib/actions/rh-segredos";
import type { OrigemSegredo, StatusSmtp } from "@/lib/segredos";

type StatusTelegram = {
  ligado: boolean;
  origem: OrigemSegredo | null;
  dica: string | null;
  atualizadoPor: string | null;
};

export function CanaisView({
  empresaId,
  telegram,
  smtp,
  arquivosLigado,
  podeConfigurar,
}: {
  empresaId: string;
  telegram: StatusTelegram;
  smtp: StatusSmtp;
  arquivosLigado: boolean;
  podeConfigurar: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Canais de envio</h2>
        <p className="text-sm text-muted-foreground">
          Telegram e e-mail são os dois caminhos de convite, lembrete e acesso ao portal do
          colaborador. Sem nenhum dos dois ligado, essas telas ficam sem como avisar ninguém.
        </p>
      </div>

      {!podeConfigurar && !telegram.ligado && !smtp.ligado && (
        <Alert>
          <AlertDescription>
            Nenhum canal de envio está ligado. Peça a um administrador ou à diretoria para
            configurar o Telegram ou o SMTP.
          </AlertDescription>
        </Alert>
      )}

      {podeConfigurar && (
        <>
          <CartaoTelegram empresaId={empresaId} status={telegram} />
          <CartaoSmtp empresaId={empresaId} status={smtp} />
        </>
      )}

      <CartaoArquivos ligado={arquivosLigado} />
    </div>
  );
}

// Status do armazenamento de arquivos (Vercel Blob) — só leitura, de propósito.
//
// Diferente do Telegram e do SMTP, o token do Blob não se digita: ele nasce no
// painel da Vercel, no ato de conectar um store ao projeto, e o código o lê
// direto do ambiente (lib/blob.ts). Um campo de texto aqui convidaria a colar
// um token que não funcionaria.
//
// POR QUE O CARTÃO EXISTE. Em 12/08/2026 dois colaboradores ficaram sem
// conseguir enviar documento pelo portal porque o store nunca tinha sido
// conectado em produção — e não havia NENHUMA tela onde essa falta aparecesse:
// o RH só soube por print de Telegram. Configuração que só se descobre quando
// quebra na mão do colaborador não é configuração, é armadilha.
function CartaoArquivos({ ligado }: { ligado: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderLock className="size-4" />
          Armazenamento de arquivos
          <span
            className={
              ligado
                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                : "rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive"
            }
          >
            {ligado ? "Ligado" : "Desligado"}
          </span>
        </CardTitle>
        <CardDescription>
          Onde ficam os documentos enviados pelo portal e as fotos das batidas de ponto —
          armazenamento privado, fora do banco.
        </CardDescription>
      </CardHeader>
      {!ligado && (
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Com ele desligado, o portal recusa documentos</strong> (&ldquo;Armazenamento de
            arquivos não configurado&rdquo;) e as batidas de ponto ficam sem foto. As batidas em si
            continuam valendo.
          </p>
          <p className="text-muted-foreground">
            Para ligar, no painel da Vercel: <strong>Storage</strong> → abra (ou crie) o store
            Blob → <strong>Connect Project</strong> → projeto <strong>sistemado-rh</strong> →
            marque <strong>All Environments</strong>. Isso cria a variável{" "}
            <code className="rounded bg-muted px-1">BLOB_READ_WRITE_TOKEN</code> sozinho. Depois é
            preciso um deploy novo para valer.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function CartaoTelegram({ empresaId, status }: { empresaId: string; status: StatusTelegram }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [trocando, setTrocando] = useState(false);

  async function salvar() {
    if (!token.trim() || salvando) return;
    setSalvando(true);
    try {
      const r = await salvarTelegramToken(empresaId, token);
      if (r.ok) {
        setToken("");
        setTrocando(false);
        toast.success("Token cadastrado. O bot do Telegram está ligado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível salvar — verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setSalvando(true);
    try {
      const r = await removerTelegramToken(empresaId);
      if (r.ok) {
        toast.success("Token removido. O bot do Telegram ficou desligado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível remover — verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (status.ligado && !trocando) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground">
        <Send className="size-4 shrink-0 text-muted-foreground" />
        <span>
          Bot do Telegram ativo
          {status.origem === "ambiente" ? (
            <span className="text-muted-foreground"> — vindo das variáveis de ambiente</span>
          ) : (
            <span className="text-muted-foreground">
              {status.dica ? ` (final ${status.dica})` : ""}
              {status.atualizadoPor ? `, cadastrado por ${status.atualizadoPor}` : ""}
            </span>
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTrocando(true)}>
            Trocar
          </Button>
          {status.origem === "sistema" && (
            <Button size="sm" variant="ghost" disabled={salvando} onClick={remover}>
              Remover
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4" />
          {status.ligado ? "Trocar o token do bot" : "Ligar o Telegram"}
        </CardTitle>
        <CardDescription>
          Crie um bot com o @BotFather e cole o token aqui. Ele é gravado cifrado e não volta a
          aparecer na tela — para trocar, cole um novo por cima. Depois de salvar, rode{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            npx tsx scripts/configurar-telegram-webhook.ts
          </code>{" "}
          para registrar o webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.origem === "ambiente" && (
          <Alert>
            <AlertDescription>
              Já existe um token nas variáveis de ambiente, e <strong>ele tem preferência</strong>.
              O que for cadastrado aqui fica guardado, mas só passa a valer quando a variável sair
              do projeto na Vercel.
            </AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
          className="flex flex-wrap gap-2"
        >
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456:ABC-DEF..."
            className="min-w-64 flex-1"
            disabled={salvando}
          />
          <Button type="submit" disabled={salvando || !token.trim()}>
            {salvando ? "Conferindo..." : "Salvar token"}
          </Button>
          {status.ligado && (
            <Button type="button" variant="ghost" disabled={salvando} onClick={() => setTrocando(false)}>
              Cancelar
            </Button>
          )}
        </form>
        <p className="text-xs text-muted-foreground">
          O token é testado no Telegram antes de ser gravado — se estiver errado ou revogado, você
          descobre agora e não no primeiro convite.
        </p>
      </CardContent>
    </Card>
  );
}

function CartaoSmtp({ empresaId, status }: { empresaId: string; status: StatusSmtp }) {
  const router = useRouter();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [trocando, setTrocando] = useState(false);

  async function salvar() {
    if (!host.trim() || !user.trim() || !pass.trim() || salvando) return;
    setSalvando(true);
    try {
      const r = await salvarSmtp(empresaId, { host, port, user, pass, from });
      if (r.ok) {
        setHost("");
        setPort("587");
        setUser("");
        setPass("");
        setFrom("");
        setTrocando(false);
        toast.success("SMTP cadastrado. O envio de e-mail está ligado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível salvar — verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setSalvando(true);
    try {
      const r = await removerSmtp(empresaId);
      if (r.ok) {
        toast.success("SMTP removido. O envio de e-mail ficou desligado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível remover — verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (status.ligado && !trocando) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground">
        <Mail className="size-4 shrink-0 text-muted-foreground" />
        <span>
          SMTP ativo
          {status.origem === "ambiente" ? (
            <span className="text-muted-foreground"> — vindo das variáveis de ambiente</span>
          ) : (
            <span className="text-muted-foreground">
              {status.host ? ` (${status.host}, usuário ${status.user})` : ""}
              {status.atualizadoPor ? `, cadastrado por ${status.atualizadoPor}` : ""}
            </span>
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTrocando(true)}>
            Trocar
          </Button>
          {status.origem === "sistema" && (
            <Button size="sm" variant="ghost" disabled={salvando} onClick={remover}>
              Remover
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          {status.ligado ? "Trocar o SMTP" : "Ligar o e-mail"}
        </CardTitle>
        <CardDescription>
          Host, porta (587 para STARTTLS ou 465 para TLS), usuário e senha do provedor de e-mail.
          A senha é gravada cifrada e não volta a aparecer na tela.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.origem === "ambiente" && (
          <Alert>
            <AlertDescription>
              Já existe configuração de SMTP nas variáveis de ambiente, e <strong>ela tem
              preferência</strong>. O que for cadastrado aqui fica guardado, mas só passa a valer
              quando as variáveis saírem do projeto na Vercel.
            </AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
          className="space-y-2"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.seuprovedor.com"
              disabled={salvando}
            />
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="587"
              inputMode="numeric"
              disabled={salvando}
            />
          </div>
          <Input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="usuário (geralmente o e-mail completo)"
            disabled={salvando}
          />
          <Input
            type="password"
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="senha"
            disabled={salvando}
          />
          <Input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder='Remetente exibido (opcional) — ex.: "RH LM Telecom <rh@empresa.com.br>"'
            disabled={salvando}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={salvando || !host.trim() || !user.trim() || !pass.trim()}>
              {salvando ? "Conferindo..." : "Salvar SMTP"}
            </Button>
            {status.ligado && (
              <Button type="button" variant="ghost" disabled={salvando} onClick={() => setTrocando(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
        <p className="text-xs text-muted-foreground">
          A conexão é testada no provedor antes de ser gravada (sem mandar e-mail nenhum) — se
          algo estiver errado, você descobre agora e não no primeiro convite.
        </p>
      </CardContent>
    </Card>
  );
}
