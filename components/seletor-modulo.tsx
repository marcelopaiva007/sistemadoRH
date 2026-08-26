"use client";

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
export function SeletorModulo({
  sistemasPermitidos,
  empresaIds,
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
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const modulos = MODULOS.filter((m) => sistemasPermitidos.includes(m.slug));
  const moduloAtual = moduloDoCaminho(pathname);

  // Um módulo só (ou nenhum): não há troca a oferecer, então é rótulo, não
  // controle. Fingir um botão que não leva a lugar nenhum é pior que texto.
  if (modulos.length < 2) {
    return (
      <span className="hidden text-sm font-semibold text-foreground/90 lg:inline">
        {moduloAtual?.nome ?? "Sistema de RH"}
      </span>
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
    <div className="flex min-w-0 items-center gap-2">
      {/* Mesma moldura das pílulas de marca/CNPJ (rounded-[10px], borda,
          bg-card), dividida em segmentos — os dois sistemas visíveis ao mesmo
          tempo, e o de dentro marcado. No celular ficam só os ícones: dois
          nomes por extenso não cabem em 375px, e o ícone com `title` continua
          dizendo qual é qual. */}
      {/* `min-w-0`, não `shrink-0`: com a caixa travada, a linha apertada faz
          ela transbordar por cima do vizinho (a mesma classe de defeito do
          seletor de marca na v1.120.1). Os rótulos já truncam; deixá-los
          encolher é o que mantém a linha 1 sem sobreposição em toda largura. */}
      <div
        role="group"
        aria-label="Sistema"
        className="flex min-w-0 items-stretch overflow-hidden rounded-[10px] border border-border bg-card"
      >
        {modulos.map((modulo, i) => {
          const Icone = modulo.icone;
          const atual = modulo.slug === moduloAtual?.slug;
          return (
            <button
              key={modulo.slug}
              type="button"
              aria-current={atual ? "true" : undefined}
              title={modulo.nome}
              onClick={() => irPara(modulo)}
              className={cn(
                "flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-sm transition-colors sm:px-2.5",
                i > 0 && "border-l border-border",
                atual
                  ? "bg-primary/10 font-semibold text-primary dark:text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icone className="size-3.5 shrink-0" />
              <span className="hidden max-w-40 truncate sm:inline">{modulo.nome}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
