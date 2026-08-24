import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { EstruturaView } from "./estrutura-view";

// Marcas & CNPJs — configuração do GRUPO, não de uma empresa.
//
// A empresa continua na URL para o menu lateral e o botão voltar seguirem
// funcionando, mas a tela mostra a estrutura inteira: seria pior esconder do
// gestor de uma marca que existem outras, e o cadastro de CNPJ é justamente o
// lugar onde se enxerga o grupo por inteiro.
export default async function EstruturaPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  // Criar, editar e excluir CNPJ é do ADMIN (ver lib/actions/rh-estrutura.ts).
  // A tela precisa saber disso: botão que aparece e falha ao clicar é pior que
  // botão ausente — ensina que o sistema está quebrado, não que falta permissão.
  const podeMexerEmCnpj = usuario.role === "ADMIN";

  const marcas = await prisma.marca.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      logoUrl: true,
      corPrimaria: true,
      ativo: true,
      empresas: {
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
          ativo: true,
          razaoSocial: true,
          nomeFantasia: true,
          cnpj: true,
          inscricaoEstadual: true,
          cidade: true,
          uf: true,
          // Contagem, não a lista: esta tela mostra o tamanho de cada CNPJ,
          // e carregar 208 fichas para exibir um número seria desperdício.
          _count: { select: { colaboradores: true } },
        },
      },
    },
  });

  return <EstruturaView marcas={marcas} podeMexerEmCnpj={podeMexerEmCnpj} empresaAtualId={empresaId} />;
}
