// "Exportar PDF" da área Desligamentos — o relatório da reunião de gerentes,
// com os MESMOS filtros da tela (período, setor, gestor, ano da meta). Mesmo
// padrão de /indicadores/relatorio-pdf: HTML no servidor, o navegador salva
// como PDF (lib/pdf-browser.ts).
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { podeOperarEmpresaRH } from "@/lib/rh-auth-guard";
import { formatarData } from "@/lib/datas";
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";
import { montarArea } from "@/lib/desligamentos/area";
import { indicadoresDoNegocio } from "@/lib/desligamentos/base";
import { placarDaMeta, quadroPorGestor, quadroPorSetor } from "@/lib/desligamentos/painel";
import { comparacaoAnual, contratacaoErrada, motivosDasSaidas } from "@/lib/desligamentos/analises";
import { gerarHtmlRelatorioDesligamentos } from "@/lib/desligamentos/relatorio";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // A mesma pergunta de `requireEmpresaAccess`, que guarda as telas da área:
  // GESTOR_SETOR não passa (a tela dele é Meu Setor).
  if (!(await podeOperarEmpresaRH(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const parametros = Object.fromEntries(
    ["periodo", "de", "ate", "setor", "gestor", "ano"].flatMap((k) => {
      const v = sp.get(k);
      return v ? [[k, v]] : [];
    }),
  );
  const [area, indicadores] = await Promise.all([montarArea(empresaId, user, parametros), indicadoresDoNegocio(empresaId)]);
  const { fichas, ativosHoje, periodo, hoje, base } = area;
  const anoAtual = area.filtros.anoAtual;

  const html = gerarHtmlRelatorioDesligamentos({
    geradoEm: new Date(),
    recorte: area.nomeDoRecorte ? `Recorte: ${area.nomeDoRecorte}` : "Todos os setores e gestores",
    periodoRotulo: periodo.rotulo,
    config: base.config,
    placar: placarDaMeta(fichas, ativosHoje, area.ano, hoje, base.config),
    setores: quadroPorSetor(fichas, periodo, hoje, base.config),
    gestores: quadroPorGestor(fichas, periodo, hoje, base.config),
    contratacao: contratacaoErrada(fichas, periodo, hoje, formatarData),
    motivos: motivosDasSaidas(fichas, periodo, hoje),
    anos: comparacaoAnual(fichas, ativosHoje, [anoAtual - 2, anoAtual - 1, anoAtual], hoje, indicadores),
    avisos: area.avisos,
  });
  return responderComHtmlRelatorio(html, "Desligamentos — relatório para a reunião de gerentes");
}
