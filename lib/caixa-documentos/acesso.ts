// Caixa de documentos — quem pode mexer em quê.
//
// Só servidor. As rotas de API da Caixa ficam fora do proxy de autenticação
// (proxy.ts exclui /api) e não podem redirecionar: cada uma chama isto e
// responde 401/403.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, podeOperarEmpresaRH } from "@/lib/rh-auth-guard";

export type UsuarioCaixa = {
  id: string;
  name?: string | null;
  role: string;
  empresas: { empresaId: string; ativo: boolean }[];
};

export async function usuarioDaCaixa(
  empresaId: string,
): Promise<{ ok: true; user: UsuarioCaixa } | { ok: false; resposta: NextResponse }> {
  const session = await auth();
  const user = session?.user as UsuarioCaixa | undefined;
  if (!user) return { ok: false, resposta: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  // Bloqueia GESTOR_SETOR e quem não tem o módulo RH, além de exigir o CNPJ.
  if (!(await podeOperarEmpresaRH(user, empresaId))) {
    return { ok: false, resposta: NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 }) };
  }
  return { ok: true, user };
}

/**
 * O escopo congelado no arquivo: os CNPJs ATIVOS que quem enviou enxergava.
 * Não usa o filtro da barra do topo (?empresas=): um arquivo do contador
 * cobre o grupo inteiro, e um filtro esquecido na tela faria a Caixa dizer
 * "empresa que você não acessa" para quem acessa.
 */
export async function escopoParaCongelar(user: UsuarioCaixa): Promise<string[]> {
  const visiveis = await empresasVisiveis(user);
  const ativas = await prisma.empresa.findMany({ where: { id: { in: visiveis }, ativo: true }, select: { id: true } });
  return ativas.map((e) => e.id);
}

/**
 * O usuário alcança TODO o escopo do arquivo? Só assim vê a fila, as páginas
 * e grava — senão enxergaria (e gravaria em) fichas de um CNPJ que não acessa.
 */
export async function alcancaEscopo(user: UsuarioCaixa, empresasEscopo: string[]): Promise<boolean> {
  const visiveis = new Set(await empresasVisiveis(user));
  return empresasEscopo.every((id) => visiveis.has(id));
}

/** Carrega o arquivo da Caixa conferindo CNPJ do caminho, papel e escopo. */
export async function recebidoDaRota(empresaId: string, recebidoId: string) {
  const acesso = await usuarioDaCaixa(empresaId);
  if (!acesso.ok) return acesso;
  const recebido = await prisma.documentoRecebido.findFirst({ where: { id: recebidoId, empresaId } });
  if (!recebido || !(await alcancaEscopo(acesso.user, recebido.empresasEscopo))) {
    return { ok: false as const, resposta: NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 }) };
  }
  return { ok: true as const, user: acesso.user, recebido };
}
