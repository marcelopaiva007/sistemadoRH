"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { moduloDoCaminho, modulosDoPapel, type Modulo } from "@/components/modulos";
import { PARAM } from "@/app/(app)/rh/[empresaId]/filtro-empresas";

/**
 * A porta entre os módulos, no canto esquerdo da barra de topo.
 *
 * Ocupa o lugar do texto fixo "Sistema de RH" que existia ali — e é de
 * propósito: aquele rótulo já respondia "em que sistema estou", só que sem
 * oferecer a saída. Com dois módulos, a mesma pergunta passa a ter duas
 * respostas possíveis, e o lugar onde ela já era respondida é o lugar onde a
 * pessoa vai procurar a troca. Um item a mais no menu de baixo NÃO serviria:
 * aquele menu é a navegação DE DENTRO de onde se está, e módulo não é uma tela
 * entre outras — é o conjunto em que as telas vivem.
 *
 * A etiqueta de versão continua embaixo do nome, no mesmo lugar de antes: é
 * por ela que o RH responde "estou vendo a versão nova?" (ver AGENTS.md).
 *
 * O CNPJ VIAJA JUNTO. Quem está em `/rh/<empresa>/colaboradores` e troca para
 * Processos & Ativos cai em `/processos/<a mesma empresa>`, com o `?empresas=`
 * preservado. Sem isso, trocar de módulo apagaria silenciosamente o contexto de
 * empresa — e a pessoa voltaria a olhar outro CNPJ sem ter pedido, que é
 * exatamente a classe de erro que o seletor de marca/CNPJ causou na v1.105.0.
 */
export function SeletorModulo({
  papel,
  versao,
  empresaIds,
}: {
  papel: string;
  versao: string;
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
  const raizRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);

  // Mesmo trio de fechamentos do seletor de marca/CNPJ (clicar fora, Esc,
  // Voltar do navegador). `popstate` porque este componente vive no layout e
  // não remonta entre rotas — sem ele o painel atravessa a navegação. Fechar
  // por efeito na troca de `pathname` seria setState dentro de efeito, que o
  // eslint do projeto barra (react-hooks/set-state-in-effect).
  useEffect(() => {
    function fechar() {
      setAberto(false);
    }
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) fechar();
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("popstate", fechar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("popstate", fechar);
    };
  }, []);

  const modulos = modulosDoPapel(papel);
  // Um módulo só (ou nenhum) não tem troca a oferecer: volta a ser o rótulo
  // fixo que era antes, sem chevron e sem painel que abre vazio.
  const moduloAtual = moduloDoCaminho(pathname);

  const rotulo = moduloAtual?.nome ?? "Sistema de RH";

  // A versão continua visível no topo (regra do AGENTS.md: é por ela que o RH
  // sabe se está vendo a entrega nova), mas AO LADO da pílula, não empilhada
  // dentro dela — empilhar deixava o seletor de sistema denso e diferente das
  // pílulas de marca/CNPJ. Some no celular; lá ela vive no painel que abre.
  const etiquetaVersao = (
    <span className="hidden font-mono text-[10px] text-muted-foreground/60 lg:inline">{versao}</span>
  );

  if (modulos.length < 2) {
    // Um módulo só (ou nenhum): rótulo fixo, sem pílula clicável nem chevron —
    // não há troca a oferecer. Mesmo par nome+versão, alinhado com o resto.
    return (
      <div className="hidden items-center gap-2 lg:flex">
        <span className="text-sm font-semibold text-foreground/90">{rotulo}</span>
        {etiquetaVersao}
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
    if (destino.slug !== moduloAtual?.slug) {
      // Leva o CNPJ e o filtro de marca junto quando os dois lados são
      // escopados por empresa. Sem empresa na URL (Início, Usuários), ou indo
      // para um módulo que não é escopado, entra pela raiz do módulo — que
      // resolve sozinha para onde mandar.
      const podeLevarEmpresa = empresaIdAtual && destino.escopadoPorEmpresa;
      // SÓ o `?empresas=`, e não a querystring inteira. O resto dela são
      // filtros da TELA de onde a pessoa está saindo (`lacuna=telegram` em
      // Colaboradores, e afins) — no módulo de destino eles não querem dizer
      // nada hoje, e no dia em que quiserem dizer OUTRA coisa com o mesmo nome
      // o valor antigo chegaria lá aplicado, sem ninguém ter pedido.
      const marcas = podeLevarEmpresa ? searchParams.get(PARAM) : null;
      const base = podeLevarEmpresa ? `/${destino.slug}/${empresaIdAtual}` : `/${destino.slug}`;
      router.push(marcas ? `${base}?${PARAM}=${marcas}` : base);
    }
    setAberto(false);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div ref={raizRef} className="relative shrink-0">
        {/* Mesma pílula dos seletores de marca/CNPJ (rounded-[10px], borda,
            bg-card, px-2.5 py-1.5): os três controles lêem como um conjunto, e o
            de sistema deixa de parecer texto solto ao lado das pílulas. */}
        <button
          type="button"
          aria-expanded={aberto}
          title={`${rotulo} — trocar de módulo`}
          onClick={() => setAberto((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/60",
            aberto && "bg-muted/60"
          )}
        >
          <span className="max-w-24 truncate font-semibold text-foreground sm:max-w-40">{rotulo}</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              aberto && "rotate-180"
            )}
          />
        </button>

      {aberto && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-50 w-72 rounded-[10px] bg-popover p-1.5 shadow-lg ring-1 ring-foreground/10">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
            Módulos do sistema
          </p>
          {modulos.map((modulo) => {
            const Icone = modulo.icone;
            const atual = modulo.slug === moduloAtual?.slug;
            return (
              <button
                key={modulo.slug}
                type="button"
                onClick={() => irPara(modulo)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                  atual ? "bg-primary/8" : "hover:bg-accent/50"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[6px]",
                    atual ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"
                  )}
                >
                  <Icone className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      atual ? "font-semibold text-primary" : "font-medium text-foreground"
                    )}
                  >
                    {modulo.nome}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    {modulo.descricao}
                  </span>
                </span>
                {atual && <Check className="mt-1 size-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
          {/* A versão só aparece no botão a partir de lg — no celular ela
              precisa de outro lugar, e este painel é o único que sempre abre. */}
          <p className="border-t border-border/60 px-2 pt-1.5 pb-0.5 font-mono text-[10px] text-muted-foreground/70 lg:hidden">
            {versao}
          </p>
        </div>
      )}
      </div>
      {etiquetaVersao}
    </div>
  );
}
