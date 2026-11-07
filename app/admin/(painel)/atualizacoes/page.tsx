import { AtualizacoesDoSistema } from "@/components/atualizacoes-do-sistema";
import { requireAreaAdmin } from "@/lib/grupo-guard";

// Atualizações do sistema na GESTÃO FASTMAI (v1.200.0, pedido do CEO em
// 07/11/2026): a conta master acompanha o que entrou em cada versão e o que vem
// a seguir sem sair da Gestão. Mesmo conteúdo da tela do RH (/atualizacoes).
export default async function AtualizacoesGestaoPage() {
  await requireAreaAdmin();
  return <AtualizacoesDoSistema />;
}
