"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_DO_MODULO } from "@/app/(app)/rh/[empresaId]/rh-empresa-nav";

/**
 * Trilha de navegação ("breadcrumb") das telas de detalhe.
 *
 * O problema que resolve: das 9 telas de detalhe do sistema, 4 tinham um
 * "← Módulo" solto e 5 — todas as de dentro de uma pesquisa (convites,
 * perguntas, resultados, dashboard de clima) — não tinham caminho de volta
 * NENHUM até 11/08/2026. São justamente as mais fundas: três níveis abaixo do
 * início, com o menu lateral marcando só "Pesquisas de clima", sem dizer em
 * que pesquisa nem em que parte dela a pessoa está.
 *
 * Ganha do "← Módulo" em duas coisas: mostra o NOME do registro aberto (o link
 * de volta não diz de quem é a ficha que você está lendo) e cobre o degrau do
 * meio, que é o que faltava nas telas de pesquisa.
 *
 * Os rótulos do módulo vêm de ROTULO_DO_MODULO (rh-empresa-nav.tsx), a mesma
 * lista que desenha o menu: se um módulo for renomeado, menu e trilha mudam
 * juntos, em vez de a trilha dizer "Candidatos" enquanto o menu diz "Talentos".
 *
 * O que a página precisa passar: `atual` (o nome do registro) e, quando houver
 * um degrau no meio, `intermediarios` — só ela carregou esses dados.
 */
export function Trilha({
  empresaId,
  atual,
  intermediarios,
  className,
}: {
  empresaId: string;
  /** Nome do registro aberto. Vira o último degrau, sem link (já estamos nele). */
  atual?: string;
  /** Degraus entre o módulo e o atual — ex.: o nome da pesquisa, em Convites. */
  intermediarios?: { rotulo: string; href: string }[];
  className?: string;
}) {
  const pathname = usePathname();
  const base = `/rh/${empresaId}`;

  // "/rh/abc/colaboradores/xyz" → ["colaboradores", "xyz"]. Só o primeiro
  // pedaço vira degrau clicável: os intermediários de rota dinâmica são ids,
  // que não têm nome para mostrar nem tela própria que valha um link.
  const depoisDaBase = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const slug = depoisDaBase.split("/").filter(Boolean)[0];
  const rotuloModulo = slug ? ROTULO_DO_MODULO[slug] : undefined;

  // Sem módulo reconhecido não há trilha para mostrar — melhor nada do que uma
  // trilha com o slug cru ("planos-acao") no lugar do nome.
  if (!rotuloModulo) return null;

  // Degraus com link, na ordem: módulo e o que a página informar de intermediário.
  const comLink = [
    { rotulo: rotuloModulo, href: `${base}/${slug}` },
    ...(intermediarios ?? []),
  ];
  // Sem `atual`, o último degrau clicável é a própria página — vira texto.
  const ultimoSemLink = atual ?? comLink.pop()!.rotulo;

  return (
    <nav aria-label="Trilha de navegação" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <li>
          <Link href={base} className="hover:text-foreground hover:underline">
            Início
          </Link>
        </li>
        {comLink.map(d => (
          <li key={d.href} className="flex items-center gap-1">
            <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
            <Link href={d.href} className="hover:text-foreground hover:underline">
              {d.rotulo}
            </Link>
          </li>
        ))}
        <li aria-current="page" className="flex min-w-0 items-center gap-1">
          <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
          {/* truncate porque título de pesquisa passa fácil de 60 caracteres e
              empurraria a trilha para uma segunda linha. */}
          <span className="truncate font-medium text-foreground">{ultimoSemLink}</span>
        </li>
      </ol>
    </nav>
  );
}
