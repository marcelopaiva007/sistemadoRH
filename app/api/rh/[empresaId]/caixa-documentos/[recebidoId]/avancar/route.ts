// Caixa de documentos — UMA rodada de trabalho num arquivo (ler um bloco de
// páginas, ou encaminhar os documentos já lidos). A tela chama até concluir.
//
// Rota, não server action: o Next despacha server actions uma de cada vez por
// página, então dois arquivos não andariam juntos e cada clique na conferência
// esperaria a leitura em curso terminar.
import { NextResponse, type NextRequest } from "next/server";
import { recebidoDaRota } from "@/lib/caixa-documentos/acesso";
import { obterExtrator } from "@/lib/caixa-documentos/ia";
import { avancarRecebido, progressoDe } from "@/lib/caixa-documentos/processar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; recebidoId: string }> },
) {
  const { empresaId, recebidoId } = await params;
  const acesso = await recebidoDaRota(empresaId, recebidoId);
  if (!acesso.ok) return acesso.resposta;

  const extrator = await obterExtrator();
  if (!extrator) {
    const progresso = await progressoDe(recebidoId);
    return NextResponse.json({ ...progresso, iaDesligada: true });
  }
  const progresso = await avancarRecebido(
    recebidoId,
    { id: acesso.user.id, nome: acesso.user.name ?? null },
    extrator,
  );
  return NextResponse.json(progresso);
}
