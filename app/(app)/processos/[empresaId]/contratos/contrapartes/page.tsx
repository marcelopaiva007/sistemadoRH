import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { ContrapartesView, type ContraparteNaTela } from "./contrapartes-view";

// Quem assina do outro lado — locador, prefeitura, condomínio, fornecedor,
// prestador PJ, cliente B2B.
//
// Esta é a ÚNICA tela do módulo que NÃO é escopada por empresa, e é de
// propósito: a contraparte é do grupo. O mesmo locador aluga torre para duas
// empresas, o mesmo prestador atende três. Duplicar por CNPJ é como o endereço
// de notificação formal fica certo numa ficha e desatualizado na outra — e a
// notificação de denúncia vai para o endereço errado.
export default async function ContrapartesPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireProcessosEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const [empresa, contrapartes] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.contraparte.findMany({
      orderBy: { razaoSocial: "asc" },
      select: {
        id: true,
        tipoPessoa: true,
        razaoSocial: true,
        nomeFantasia: true,
        cnpjCpf: true,
        papeis: true,
        criticidade: true,
        emailNotificacaoFormal: true,
        telefone: true,
        endereco: true,
        observacoes: true,
        // A contagem é do que a PESSOA enxerga, não do grupo inteiro: mostrar
        // "8 contratos" para quem só alcança 2 é dar um número que ela não
        // consegue conferir em lugar nenhum da tela.
        _count: { select: { contratos: { where: { empresaId: { in: escopo } } } } },
      },
    }),
  ]);
  if (!empresa) notFound();

  const naTela: ContraparteNaTela[] = contrapartes.map((c) => ({
    id: c.id,
    tipoPessoa: c.tipoPessoa,
    razaoSocial: c.razaoSocial,
    nomeFantasia: c.nomeFantasia,
    cnpjCpf: c.cnpjCpf,
    papeis: c.papeis,
    criticidade: c.criticidade,
    emailNotificacaoFormal: c.emailNotificacaoFormal,
    telefone: c.telefone,
    endereco: c.endereco,
    observacoes: c.observacoes,
    contratosNoEscopo: c._count.contratos,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Contrapartes</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Cadastro único do grupo — quem assina do outro lado serve a todos os CNPJs. A contagem de
          contratos ao lado é a dos contratos que você enxerga.
        </p>
      </div>

      <ContrapartesView empresaId={empresaId} contrapartes={naTela} />
    </div>
  );
}
