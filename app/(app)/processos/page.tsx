import { redirect } from "next/navigation";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { requireProcessosAccess } from "@/lib/processos-auth-guard";

// Porta de entrada do módulo sem CNPJ no caminho — o que acontece quando a
// pessoa troca de módulo estando numa tela que não tem empresa (Início,
// Usuários, Atualizações) ou digita `/processos` direto.
//
// Entra no primeiro CNPJ que ela enxerga, em vez de mostrar mais uma lista de
// empresas: a escolha de marca/CNPJ já é o seletor da barra de topo, visível
// em toda a área logada, e uma segunda tela de escolha só somaria um clique
// para chegar ao mesmo lugar. Vindo do seletor de módulo com um CNPJ aberto,
// esta rota nem é usada — a troca leva o CNPJ junto.
export default async function ProcessosRaizPage() {
  const usuario = await requireProcessosAccess();
  const visiveis = await empresasVisiveis(usuario);

  // `empresasVisiveis` devolve ids sem ordem definida; ordenar por nome faz a
  // entrada ser sempre a mesma empresa, e não uma a cada login.
  const primeira = await prisma.empresa.findFirst({
    where: { id: { in: visiveis }, ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true },
  });

  // Sem nenhuma empresa alcançável não há módulo para abrir. A tela inicial já
  // sabe explicar o que falta no vínculo — não vale duplicar a explicação aqui.
  if (!primeira) redirect("/");
  redirect(`/processos/${primeira.id}`);
}
