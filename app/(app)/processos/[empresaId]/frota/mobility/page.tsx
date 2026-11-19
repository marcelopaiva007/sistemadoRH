import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFrotaEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { AcessosMobilityView, type AcessoNaTela } from "./mobility-view";

// Acessos dos motoristas ao app de recarga Mobility (v1.208.0). A senha NÃO
// vem nesta carga: só a dica ("…a1b2"). Ver lib/actions/frota-mobility.ts.
export default async function AcessosMobilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireFrotaEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const [empresa, acessos] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.acessoMobility.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        senhaDica: true,
        placa: true,
        modelo: true,
        veiculoId: true,
        observacao: true,
        ativo: true,
      },
    }),
  ]);
  if (!empresa) notFound();

  const naTela: AcessoNaTela[] = acessos.map((a) => ({
    ...a,
    temSenha: !!a.senhaDica,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1">Acessos Mobility</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Usuário e senha de cada motorista no app de recarga Mobility. A senha fica cifrada e só
          aparece ao clicar em Mostrar — cada visualização fica registrada na auditoria.
        </p>
      </div>

      <AcessosMobilityView empresaId={empresaId} acessos={naTela} />
    </div>
  );
}
