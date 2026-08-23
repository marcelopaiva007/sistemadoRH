import type { LucideIcon } from "lucide-react";
import { Users, FolderKanban } from "lucide-react";

/**
 * Os MÓDULOS do sistema — o primeiro segmento da URL depois da raiz.
 *
 * Até 23/08/2026 existia um módulo só, e por isso ele não tinha nome em lugar
 * nenhum: a barra de topo escrevia "Sistema de RH" como texto fixo, o menu de
 * baixo era `navByRole` e pronto. Com o segundo módulo (Processos & Ativos), a
 * pergunta "em que parte do sistema eu estou, e como vou para a outra?" passa a
 * existir — e ela precisa de UM lugar que responda, senão vira link solto
 * dentro de uma tela que só quem já sabe encontra.
 *
 * Este arquivo é esse lugar. Quem depende dele:
 *
 * - `components/seletor-modulo.tsx` — o seletor da barra de topo (a porta);
 * - `components/seletor-marca-empresa.tsx` — para saber que `/processos/<id>`
 *   também é "dentro de uma empresa", e não jogar quem troca de CNPJ de volta
 *   no RH;
 * - as guardas de cada rota, que continuam mandando de verdade. O que está
 *   aqui decide o que APARECE; nada aqui concede acesso.
 *
 * Módulo NOVO se cadastra aqui e ganha porta em toda a área logada de uma vez.
 */
export type Modulo = {
  /** Primeiro segmento da URL: `/rh/...`, `/processos/...`. */
  slug: string;
  /** O que o seletor mostra. Curto: divide a linha 1 da barra com o seletor de marca. */
  nome: string;
  /** Uma linha no painel do seletor — o que a pessoa vai achar lá dentro. */
  descricao: string;
  icone: LucideIcon;
  /**
   * Papéis que enxergam a porta. Espelha a guarda da rota; não substitui.
   * GESTOR_SETOR fica de fora dos dois: a navegação dele é uma tela só
   * (`/rh/meu-setor`), e o seletor nem chega a ser renderizado.
   */
  papeis: string[];
  /**
   * Usa `/<slug>/<empresaId>`? Decide duas coisas: se a troca de módulo leva o
   * CNPJ atual junto, e se o seletor de marca/CNPJ funciona lá dentro.
   */
  escopadoPorEmpresa: boolean;
};

const PAPEIS_DE_ESCRITORIO = ["ADMIN", "DIRETORIA", "RH_MANAGER"];

export const MODULOS: Modulo[] = [
  {
    slug: "rh",
    nome: "Pessoas (RH)",
    descricao: "Colaboradores, ponto, folha, férias, desempenho e SST.",
    icone: Users,
    papeis: PAPEIS_DE_ESCRITORIO,
    escopadoPorEmpresa: true,
  },
  {
    slug: "processos",
    nome: "Processos & Ativos",
    descricao: "Processos, documentos, contratos, frota e patrimônio.",
    icone: FolderKanban,
    papeis: PAPEIS_DE_ESCRITORIO,
    escopadoPorEmpresa: true,
  },
];

/** Slugs que vivem em `/<slug>/<empresaId>` — o que conta como "dentro de uma empresa". */
export const SLUGS_COM_EMPRESA = MODULOS.filter((m) => m.escopadoPorEmpresa).map((m) => m.slug);

/**
 * Em que módulo este caminho está — ou `undefined` nas telas que não pertencem
 * a módulo nenhum (Início, Usuários, Produtividade RH, Atualizações, Conta).
 * Fora de um módulo o seletor mostra o rótulo do sistema, não um módulo errado.
 */
export function moduloDoCaminho(pathname: string): Modulo | undefined {
  const primeiro = pathname.split("/")[1];
  return MODULOS.find((m) => m.slug === primeiro);
}

/** Os módulos que este papel enxerga, na ordem de cadastro. */
export function modulosDoPapel(papel: string): Modulo[] {
  return MODULOS.filter((m) => m.papeis.includes(papel));
}
