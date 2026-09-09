import type { LucideIcon } from "lucide-react";
import { Users, FolderKanban, ClipboardCheck } from "lucide-react";

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
  /**
   * Módulo ABERTO a todo usuário logado — o perfil não é consultado para
   * entrar. `sistemasPermitidos` (lib/permissoes/efetivas.ts) soma estes
   * slugs ao que os grants concedem, e é por isso que a abertura vale de uma
   * vez para o seletor da barra, a busca global e as guardas de rota: todos
   * fazem a mesma pergunta no mesmo lugar.
   *
   * Não confundir com "sem controle nenhum": continua valendo quem enxerga
   * QUAL registro dentro do módulo (no caso de Delegações, o `where` de
   * `demandasVisiveisPara`). Isto abre a PORTA, não o conteúdo.
   */
  abertoATodos?: boolean;
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
  {
    slug: "delegacoes",
    nome: "Delegações",
    descricao: "Demandas com dono, prazo, evidência e cobrança automática.",
    icone: ClipboardCheck,
    // RH_MANAGER entrou em 09/09/2026, junto com `delegacoes:*` no
    // perfil-semente Gestor de RH: a decisão que o comentário antigo dizia
    // caber à tela de Perfis foi tomada pelo CEO — o RH trabalha com
    // delegações e não enxergava o módulo.
    //
    // Este campo é o FALLBACK de quem ainda não tem perfil, e
    // `scripts/test-permissoes.ts` exige que ele case EXATAMENTE com o alcance
    // do perfil-semente do papel. Por isso os dois mudaram no mesmo commit:
    // mexer só aqui (ou só lá) quebra o teste de equivalência — que é
    // justamente o alarme de "papel e perfil discordam sobre quem entra onde".
    papeis: PAPEIS_DE_ESCRITORIO,
    // ABERTO A TODOS desde 09/09/2026, por decisão do CEO ("libere para todos
    // os usuários, independente das permissões"), horas depois da concessão
    // acima — que fica de pé como rede: se um dia esta linha sair, o Gestor de
    // RH continua entrando pelo perfil, em vez de todo mundo perder o acesso
    // de uma vez.
    //
    // Delegação atravessa o grupo e todo usuário do sistema é dono ou
    // destinatário de alguma — fechar a porta por perfil deixava de fora
    // justamente quem recebe a cobrança. O que continua recortado por pessoa é
    // QUAL demanda cada um enxerga (`demandasVisiveisPara`).
    abertoATodos: true,
    // O PRIMEIRO módulo não escopado por CNPJ. A demanda atravessa o grupo:
    // ela tem dono (um `User`) e, no máximo, uma MARCA como etiqueta de filtro
    // — não um empregador. Por isso a rota é `/delegacoes` inteira, sem
    // `<empresaId>`, e o seletor de módulo entra por ela sem levar o CNPJ.
    escopadoPorEmpresa: false,
  },
];

/** Slugs abertos a todo usuário logado, sem passar pelo perfil. */
export const SLUGS_ABERTOS_A_TODOS = MODULOS.filter((m) => m.abertoATodos).map((m) => m.slug);

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
