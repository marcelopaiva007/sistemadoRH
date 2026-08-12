// Foto tirada no momento da batida de ponto — a prova de QUEM bateu.
//
// O Blob é privado: a URL gravada em `RegistroPonto.fotoUrl` não abre nada
// sozinha. A foto só sai por aqui, com sessão validada, escopo de empresa
// conferido e download registrado na auditoria — foto de rosto é dado pessoal
// como RG e atestado, e segue o mesmo caminho deles
// (app/api/rh/[empresaId]/arquivos/[arquivoId]/route.ts).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { baixarDoBlob } from "@/lib/blob";
import { registrarAuditoria } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; registroId: string }> },
) {
  const { empresaId, registroId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Uma linha, uma regra: a MESMA checagem das páginas (ver o histórico das
  // cinco variantes divergentes em rotas de API, corrigido em 11/08/2026).
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const registro = await prisma.registroPonto.findFirst({
    where: { id: registroId, empresaId },
    select: {
      fotoUrl: true,
      nsr: true,
      dataHora: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (!registro) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  if (!registro.fotoUrl) {
    return NextResponse.json({ error: "Esta batida foi registrada sem foto." }, { status: 404 });
  }

  await registrarAuditoria({
    empresaId,
    acao: "BAIXAR_DOCUMENTO",
    entidade: "RegistroPonto",
    entidadeId: registroId,
    resumo: `Foto da batida NSR ${registro.nsr} de ${registro.colaborador.nome} visualizada.`,
  });

  // A coluna aceitava data URL antes de a foto ir para o Blob (nenhuma tela
  // enviava, mas a action gravava o que chegasse). Servir esse formato aqui
  // custa três linhas e garante que linha antiga nenhuma fique sem abrir.
  if (registro.fotoUrl.startsWith("data:")) {
    const virgula = registro.fotoUrl.indexOf(",");
    const bytes = Buffer.from(registro.fotoUrl.slice(virgula + 1), "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  }

  const resultado = await baixarDoBlob(registro.fotoUrl);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }

  return new NextResponse(resultado.bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": "inline",
      // Foto de rosto não pode parar em cache compartilhado; `private` deixa o
      // navegador de quem conferiu guardar só para si.
      "Cache-Control": "private, max-age=300",
    },
  });
}
