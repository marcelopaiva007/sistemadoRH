import { ShieldCheck, Eye, Building2, UsersRound } from "lucide-react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PAPEIS = [
  {
    role: "ADMIN",
    icon: ShieldCheck,
    escopo: "Global — todas as empresas e marcas, sem vínculo.",
    pode: [
      "Acessar qualquer empresa/CNPJ sem precisar de vínculo (UserEmpresa)",
      "Criar, editar e desativar usuários — inclusive outros ADMIN",
      "Cadastrar chave da Anthropic, token do Telegram e SMTP (Canais de envio)",
      "Ajustar horário dos lembretes",
      "Único papel que cria/exclui Empresa (CNPJ) — lib/actions/rh-empresas.ts",
    ],
  },
  {
    role: "DIRETORIA",
    icon: Eye,
    escopo: "Global — todas as empresas e marcas, sem vínculo.",
    pode: [
      "Acessar qualquer empresa/CNPJ sem precisar de vínculo",
      "Criar, editar e desativar usuários — inclusive outros ADMIN",
      "Cadastrar chave da Anthropic, token do Telegram e SMTP",
      "Ajustar horário dos lembretes",
    ],
    observacao:
      'O código comenta a intenção de DIRETORIA ser "só consulta", mas nenhuma guarda hoje (requireEmpresaAccess, requireGestaoUsuarios) distingue DIRETORIA de ADMIN para escrita — na prática, os dois papéis têm o mesmo acesso de edição no módulo de RH. Só o CRUD de Empresa (CNPJ) fica exclusivo de ADMIN.',
  },
  {
    role: "RH_MANAGER",
    icon: Building2,
    escopo: "Por empresa (ou por marca inteira, via UserMarca) — precisa de vínculo ativo.",
    pode: [
      "Acessar as empresas onde tem UserEmpresa ativa, ou todos os CNPJs de uma marca vinculada",
      "Gerir colaboradores, pesquisas, benefícios etc. dentro do escopo",
      "Não acessa Canais de envio, Lembretes nem a chave do Assistente (exclusivo ADMIN/DIRETORIA)",
    ],
  },
  {
    role: "GESTOR_SETOR",
    icon: UsersRound,
    escopo: "Por empresa + setor — precisa de vínculo ativo com ambos.",
    pode: [
      "Mesmo escopo de empresa que RH_MANAGER, mais restrito a um setor",
      "Sem empresa/setor ativos no vínculo, a sessão volta para /rh/meu-setor",
      "Não acessa Canais de envio, Lembretes nem a chave do Assistente",
    ],
  },
] as const;

// Somente leitura de propósito — ver AskUserQuestion da sessão que criou esta
// tela: redesenhar autorização de verdade (papéis customizados, permissão
// granular por módulo) é risco alto demais pra fazer sem o dono do sistema
// acompanhando. Isto documenta o que já está em vigor, sem mudar nenhuma
// regra de acesso real (lib/auth-guard.ts, lib/rh-auth-guard.ts).
export default async function PapeisPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const contagem = await prisma.user.groupBy({
    by: ["role"],
    where: { ativo: true },
    _count: true,
  });
  const porPapel = new Map(contagem.map((c) => [c.role, c._count]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Papéis e permissões</h2>
        <p className="text-sm text-muted-foreground">
          O que cada papel pode fazer hoje, direto do código (lib/auth-guard.ts,
          lib/rh-auth-guard.ts) — sem nenhum editor aqui. Mudar quem pode o quê ainda é feito
          direto no código, com deploy.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          Não há papéis customizáveis nem permissão por checkbox — os 4 papéis abaixo são fixos.
          Se essa tela não for suficiente pro que você precisa, é um projeto à parte (redesenho de
          autorização), não um ajuste de configuração.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        {PAPEIS.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.role}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4" />
                  {p.role}
                  <Badge variant="secondary" className="ml-auto font-normal">
                    {porPapel.get(p.role) ?? 0} usuário(s) ativo(s)
                  </Badge>
                </CardTitle>
                <CardDescription>{p.escopo}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {p.pode.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {"observacao" in p && p.observacao && (
                  <Alert>
                    <AlertDescription className="text-xs">{p.observacao}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
