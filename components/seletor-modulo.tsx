"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { MODULOS, moduloDoCaminho, type Modulo } from "@/components/modulos";
import { PARAM } from "@/app/(app)/rh/[empresaId]/filtro-empresas";

/**
 * A porta entre os módulos, no canto esquerdo da barra de topo.
 *
 * Os sistemas ficam LADO A LADO, um clique cada — não atrás de um menu que
 * abre. Foi pedido do dono do sistema em 24/08/2026, e conserta dois problemas
 * de uma vez:
 *
 *  1. Trocar de sistema custava dois passos (abrir, escolher) para uma escolha
 *     entre DUAS opções. Menu suspenso se paga quando esconde muitas opções;
 *     com duas, ele só adiciona um passo e esconde metade do sistema.
 *  2. O painel abria PRESO dentro da barra, com rolagem — porque a linha 1 do
 *     topo ganhou `overflow-x-auto` (para o celular não rolar de lado) e, em
 *     CSS, `overflow-x: auto` força o eixo vertical a virar `auto` também.
 *     Qualquer painel absoluto ali dentro passa a ser recortado. Sem painel,
 *     o problema deixa de existir para este seletor — e o `overflow` saiu da
 *     linha 1 para o seletor de marca também voltar a abrir por cima.
 *
 * O CNPJ VIAJA JUNTO. Quem está em `/rh/<empresa>/colaboradores` e troca para
 * Processos & Ativos cai em `/processos/<a mesma empresa>`, com o `?empresas=`
 * preservado. Sem isso, trocar de sistema apagaria silenciosamente o contexto
 * de empresa — a mesma classe de erro que o seletor de marca causou na
 * v1.105.0.
 */
// Classes das abas. `h-[54px]` com `-mb-0.5` faz a régua de 2px da aba ativa
// cair EM CIMA da régua de 2px da barra (52px + borda), como no desenho —
// sem isso ficava um risco vermelho flutuando 2px acima da linha.
const ABA =
  "flex min-w-0 items-center gap-1.5 border-b-2 px-0.5 text-sm whitespace-nowrap transition-colors";
const ABA_ATIVA = "border-primary font-extrabold text-primary";
const ABA_INATIVA = "border-transparent font-semibold text-muted-foreground hover:text-foreground";

export function SeletorModulo({
  sistemasPermitidos,
  empresaIds,
  role,
}: {
  /** Slugs dos sistemas que ESTE usuário alcança — vem do servidor
   *  (`sistemasPermitidos`), já com o fallback de papel para quem não tem
   *  perfil. Substitui `modulosDoPapel`: a barra mostra o que a pessoa
   *  RECEBEU, e a guarda de módulo bloqueia o resto. */
  sistemasPermitidos: string[];
  /** Ids que este usuário enxerga — a mesma lista que alimenta o seletor de
   *  marca/CNPJ. Serve para reconhecer o CNPJ no caminho SEM adivinhar pelo
   *  formato do segmento: `/rh/meu-setor` e `/rh/empresas` também casam com
   *  `/rh/<algo>`, e um palpite pelo tamanho do texto erraria calado no dia em
   *  que uma rota nova tivesse nome comprido. */
  empresaIds: string[];
  /** Para quem não alcança módulo nenhum (GESTOR_SETOR): a aba única é a tela dele. */
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const modulos = MODULOS.filter((m) => sistemasPermitidos.includes(m.slug));
  const moduloAtual = moduloDoCaminho(pathname);

  // Sem módulo nenhum: é o GESTOR_SETOR, cuja navegação é uma tela só
  // (`/rh/meu-setor`). A aba mostra essa tela em vez de deixar a barra vazia.
  // Outro papel sem módulo não ganha aba: as páginas barram, e aba que não
  // abre é porta trancada com placa.
  if (modulos.length === 0) {
    if (role !== "GESTOR_SETOR") return null;
    const ativo = pathname.startsWith("/rh/meu-setor");
    return (
      <div className="-mb-0.5 flex h-[54px] min-w-0 items-stretch">
        <Link href="/rh/meu-setor" aria-current={ativo ? "page" : undefined} className={cn(ABA, ativo ? ABA_ATIVA : ABA_INATIVA)}>
          Meu Setor
        </Link>
      </div>
    );
  }

  // O CNPJ aberto agora, quando há um. `partes[2]` só é empresa dentro de um
  // módulo escopado — em `/rh/meu-setor` e `/rh/empresas` é outra coisa —, e a
  // confirmação vem da lista real de empresas, não da cara do segmento.
  const partes = pathname.split("/");
  const empresaIdAtual =
    moduloAtual?.escopadoPorEmpresa && empresaIds.includes(partes[2]) ? partes[2] : null;

  function irPara(destino: Modulo) {
    if (destino.slug === moduloAtual?.slug) return;
    // Leva o CNPJ e o filtro de marca junto quando os dois lados são escopados
    // por empresa. Sem empresa na URL (Início, Usuários), ou indo para um
    // módulo que não é escopado, entra pela raiz — que resolve sozinha para
    // onde mandar.
    const podeLevarEmpresa = empresaIdAtual && destino.escopadoPorEmpresa;
    // SÓ o `?empresas=`, e não a querystring inteira. O resto dela são filtros
    // da TELA de onde a pessoa está saindo (`lacuna=telegram` em Colaboradores,
    // e afins) — no módulo de destino eles não querem dizer nada hoje, e no dia
    // em que quiserem dizer OUTRA coisa com o mesmo nome o valor antigo
    // chegaria lá aplicado, sem ninguém ter pedido.
    const marcas = podeLevarEmpresa ? searchParams.get(PARAM) : null;
    const base = podeLevarEmpresa ? `/${destino.slug}/${empresaIdAtual}` : `/${destino.slug}`;
    router.push(marcas ? `${base}?${PARAM}=${marcas}` : base);
  }

  return (
    // Os módulos como ABAS DE TEXTO (v1.155.0), não como pílulas num quadro:
    // a aba ativa em `--primary` peso 800 com a régua vermelha embaixo. Um
    // módulo só também vira aba (ativa) — o rótulo continua dizendo onde se
    // está. No celular ficam só os ícones: três nomes por extenso não cabem
    // em 375px, e o ícone com `title` continua dizendo qual é qual.
    // `min-w-0`, não `shrink-0`: com a caixa travada, a linha apertada faz ela
    // transbordar por cima do vizinho (a classe de defeito da v1.120.1).
    <div role="group" aria-label="Sistema" className="-mb-0.5 flex h-[54px] min-w-0 items-stretch gap-2 sm:gap-4">
      {modulos.map((modulo) => {
        const Icone = modulo.icone;
        const atual = modulo.slug === moduloAtual?.slug;
        return (
          <button
            key={modulo.slug}
            type="button"
            aria-current={atual ? "page" : undefined}
            title={modulo.nome}
            onClick={() => irPara(modulo)}
            className={cn(ABA, atual ? ABA_ATIVA : ABA_INATIVA)}
          >
            <Icone className="size-4 shrink-0 sm:hidden" />
            <span className="hidden max-w-44 truncate sm:inline">{modulo.nome}</span>
          </button>
        );
      })}
    </div>
  );
}
