import { requireDirecaoOuMaster } from "@/lib/auth-guard";
import { AtualizacoesDoSistema } from "@/components/atualizacoes-do-sistema";

// Auditoria das atualizações do sistema: o que cada versão publicada mudou e
// quando. A fonte é lib/atualizacoes.ts, mantido a cada entrega (AGENTS.md) —
// registro editorial versionado no git, não tabela de banco: a trilha de quem
// escreveu o quê já é o próprio histórico de commits do arquivo.
export default async function AtualizacoesPage() {
  // Toda a Diretoria e Administrativo, inclusive quem está preso a algumas
  // marcas: o histórico de versões não dá poder sobre o grupo.
  await requireDirecaoOuMaster();
  return <AtualizacoesDoSistema />;
}
