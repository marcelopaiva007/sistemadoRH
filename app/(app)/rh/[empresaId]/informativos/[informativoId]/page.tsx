import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { escopoDosInformativos } from "@/lib/informativos-escopo";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DestinatariosTabela } from "./destinatarios-tabela";

export const maxDuration = 300;

// Um informativo enviado: o texto e, pessoa a pessoa, por onde foi e se já
// deu ciência. Escopo igual ao da lista — informativo de fora da marca
// visível responde 404, não "sem permissão" (não confirma que existe).
export default async function InformativoPage({
  params,
}: {
  params: Promise<{ empresaId: string; informativoId: string }>;
}) {
  const { empresaId, informativoId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const escopo = await escopoDosInformativos(usuario, empresaId);

  const informativo = await prisma.informativo.findFirst({
    where: { id: informativoId, empresaId: { in: escopo } },
    select: {
      id: true,
      titulo: true,
      mensagem: true,
      publico: true,
      enviadoPorNome: true,
      createdAt: true,
      destinatarios: {
        // Só quem está em CNPJ que o usuário vê — "Todos" de uma marca pode
        // ter gente de CNPJ que este usuário não alcança.
        where: { empresaId: { in: escopo } },
        select: {
          id: true,
          canal: true,
          envioErro: true,
          enviadoEm: true,
          cienteEm: true,
          cientePor: true,
          colaborador: { select: { nome: true, setor: { select: { nome: true } }, empresa: { select: { nome: true } } } },
        },
        orderBy: { colaborador: { nome: "asc" } },
      },
    },
  });
  if (!informativo) notFound();

  const d = informativo.destinatarios;
  const cientes = d.filter((x) => x.cienteEm).length;
  const semCanal = d.filter((x) => !x.canal && !x.cienteEm).length;

  return (
    <div className="space-y-6">
      <Link
        href={`/rh/${empresaId}/informativos`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Informativos
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{informativo.titulo}</CardTitle>
          <CardDescription>
            {formatarDataHoraBrasilia(informativo.createdAt)}
            {informativo.enviadoPorNome ? ` · ${informativo.enviadoPorNome}` : ""} · Para: {informativo.publico}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{informativo.mensagem}</p>
        </CardContent>
      </Card>

      <DestinatariosTabela
        empresaId={empresaId}
        informativoId={informativo.id}
        resumo={{ total: d.length, cientes, semCanal }}
        linhas={d.map((x) => ({
          id: x.id,
          nome: x.colaborador.nome,
          setor: x.colaborador.setor?.nome ?? "",
          empresa: x.colaborador.empresa.nome,
          canal: x.canal,
          envioErro: x.envioErro,
          enviadoEm: x.enviadoEm,
          cienteEm: x.cienteEm,
          cientePor: x.cientePor,
        }))}
      />
    </div>
  );
}
