// Catálogos aditivos por empresa — ver model CatalogoItem no schema.prisma
// pro raciocínio completo de por que só estes 9 (de ~29 catálogos fixos do
// sistema) são seguros de virar configuráveis.
import { prisma } from "@/lib/prisma";
import { DIMENSOES_GPTW } from "@/lib/constants-rh";
import { TIPOS_TURNO } from "@/lib/constants-escala";
import { COMPETENCIAS } from "@/lib/constants-avaliacao";
import { STATUS_META } from "@/lib/constants-metas";
import { ORIGENS_CANDIDATO } from "@/lib/constants-ats";
import { TIPOS_ACIDENTE } from "@/lib/constants-cat";
import { TIPOS_EPI, MOTIVOS_ENTREGA_EPI } from "@/lib/constants-epi";
import { TIPOS_MOVIMENTACAO } from "@/lib/constants-movimentacao";
import { TIPOS_ENTREGA } from "@/lib/constants-entregas";

export const CATEGORIAS_CATALOGO = {
  DIMENSAO_GPTW: { label: "Dimensões GPTW (pesquisas de clima)", padroes: DIMENSOES_GPTW },
  TIPO_TURNO: { label: "Tipos de turno (escalas)", padroes: TIPOS_TURNO, temCor: true },
  COMPETENCIA: { label: "Competências (avaliação de desempenho)", padroes: COMPETENCIAS },
  STATUS_META: { label: "Status de meta", padroes: STATUS_META },
  ORIGEM_CANDIDATO: { label: "Origens de candidato", padroes: ORIGENS_CANDIDATO },
  TIPO_ACIDENTE: { label: "Tipos de acidente", padroes: TIPOS_ACIDENTE },
  TIPO_EPI: { label: "Tipos de EPI", padroes: TIPOS_EPI, temValidade: true },
  MOTIVO_ENTREGA_EPI: { label: "Motivos de entrega de EPI", padroes: MOTIVOS_ENTREGA_EPI },
  TIPO_MOVIMENTACAO: { label: "Tipos de movimentação", padroes: TIPOS_MOVIMENTACAO },
  TIPO_ENTREGA: { label: "Tipos de entrega ao colaborador", padroes: TIPOS_ENTREGA },
} as const;

export type CategoriaCatalogo = keyof typeof CATEGORIAS_CATALOGO;

export function ehCategoriaCatalogo(valor: string): valor is CategoriaCatalogo {
  return valor in CATEGORIAS_CATALOGO;
}

export type OpcaoCatalogo = { value: string; label: string; cor?: string; validadeMeses?: number | null };

/**
 * Opções pra um `<select>`: fixas do código + customizadas ativas desta
 * empresa. Fixas sempre primeiro, na ordem original — muda o menos possível
 * o que já era familiar pra quem usa a tela. `cor`/`validadeMeses` só vêm
 * preenchidos pra TIPO_TURNO/TIPO_EPI — as fixas trazem do próprio catálogo
 * (`t.cor`, `t.validadePadraoMeses`), as customizadas do que foi cadastrado
 * na tela de Catálogos.
 */
export async function opcoesDoCatalogo(
  empresaId: string,
  categoria: CategoriaCatalogo,
): Promise<OpcaoCatalogo[]> {
  const fixas = CATEGORIAS_CATALOGO[categoria].padroes as readonly (OpcaoCatalogo & {
    validadePadraoMeses?: number | null;
  })[];
  const customizadas = await prisma.catalogoItem.findMany({
    where: { empresaId, categoria, ativo: true },
    orderBy: { nome: "asc" },
    select: { nome: true, cor: true, validadeMeses: true },
  });
  return [
    ...fixas.map((f) => ({ value: f.value, label: f.label, cor: f.cor, validadeMeses: f.validadePadraoMeses ?? null })),
    ...customizadas.map((c) => ({
      value: c.nome,
      label: c.nome,
      cor: c.cor ?? undefined,
      validadeMeses: c.validadeMeses,
    })),
  ];
}

/**
 * Todos os values aceitáveis (fixos + customizados ativos) — pra validar no
 * servidor o que o formulário mandou. Mesma filosofia de `tipoValido()` em
 * lib/actions/rh-beneficios.ts: nunca confiar só no que o `<select>` tinha
 * quando a página carregou.
 */
export async function valoresValidosDoCatalogo(
  empresaId: string,
  categoria: CategoriaCatalogo,
): Promise<Set<string>> {
  const opcoes = await opcoesDoCatalogo(empresaId, categoria);
  return new Set(opcoes.map((o) => o.value));
}
