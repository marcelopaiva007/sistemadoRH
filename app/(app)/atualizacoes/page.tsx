import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ATUALIZACOES } from "@/lib/atualizacoes";
import { PROXIMAS_ATUALIZACOES, SITUACAO_LABEL } from "@/lib/proximas-atualizacoes";
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
        <h1>Atualizações do sistema</h1>
        <p className="text-sm text-muted-foreground">
          O que vem a seguir e o histórico do que já foi publicado. A versão no ar é a mesma da
          etiqueta no topo da tela.
        </p>
      </div>

      {/* O que vem, ANTES do histórico: quem abre esta tela pergunta as duas
          coisas, e a resposta sobre o futuro é a que não existia em lugar
          nenhum — vivia na memória de quem participou da conversa. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas atualizações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O que está combinado para as próximas entregas. Quando um item é publicado, ele sai
            desta lista e passa a constar no histórico abaixo, com número de versão.
          </p>
          <ul className="space-y-3">
            {PROXIMAS_ATUALIZACOES.map((p) => (
              <li key={p.titulo} className="border-l-2 border-muted pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{p.titulo}</span>
                  <Badge variant={p.situacao === "EM_ANDAMENTO" ? "default" : "outline"}>
                    {SITUACAO_LABEL[p.situacao]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.descricao}</p>
                {/* Dizer o que trava é o ponto: "aguardando decisão" sem o
                    motivo parece desculpa; com o motivo, é pergunta aberta. */}
                {p.bloqueio && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">O que falta:</span> {p.bloqueio}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-base font-semibold">Histórico de versões</h2>
        {ATUALIZACOES.map((a) => (
          <Card key={a.versao}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">v{a.versao}</span>
                {a.versao === numero && <Badge>No ar</Badge>}
                <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">
                  {a.data}
                  {a.horario && ` · ${a.horario}`}
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
