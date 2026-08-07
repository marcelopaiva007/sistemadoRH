import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ATUALIZACOES } from "@/lib/atualizacoes";
import { versaoDoSistema } from "@/lib/versao";

// Auditoria das atualizações do sistema: o que cada versão publicada mudou e
// quando. A fonte é lib/atualizacoes.ts, mantido a cada entrega (AGENTS.md) —
// registro editorial versionado no git, não tabela de banco: a trilha de quem
// escreveu o quê já é o próprio histórico de commits do arquivo.
export default async function AtualizacoesPage() {
  await requireGestaoUsuarios();
  const { numero } = versaoDoSistema();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Atualizações do sistema</h1>
        <p className="text-sm text-muted-foreground">
          Histórico das versões publicadas: número, data e o que mudou em cada uma. A versão no ar
          é a mesma da etiqueta no topo da tela.
        </p>
      </div>

      <div className="space-y-4">
        {ATUALIZACOES.map((a) => (
          <Card key={a.versao}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">v{a.versao}</span>
                {a.versao === numero && <Badge>No ar</Badge>}
                <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">
                  {a.data}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{a.titulo}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {a.itens.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
