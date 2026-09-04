import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A tela de endereço que não existe.
 *
 * Até a v1.165.0 o Next servia aqui a página padrão dele — "404: This page
 * could not be found", em inglês, com a fonte e as cores do framework. Num
 * sistema inteiro em português desenhado no Modernist, aquilo lia como se a
 * pessoa tivesse saído do sistema.
 *
 * Sem link para dentro de um módulo específico: quem cai aqui pode ser gente
 * do RH, de Processos ou do portal, e um "voltar para /rh" mandaria metade
 * das pessoas para uma porta fechada. A raiz já redireciona cada perfil para
 * o lugar certo.
 *
 * `Link` com `buttonVariants` e não `<Button>`: o Button deste projeto não
 * aceita `asChild`, e envolver um Link nele quebra a navegação do Next (a
 * mesma nota está em processos/pendencias-view.tsx). O `cn()` em volta não é
 * enfeite: `buttonVariants` emite `border-transparent` da base E `border-border`
 * da variante `outline`, e sem o tailwind-merge para desempatar o contorno do
 * botão secundário sai invisível.
 */
export const metadata = { title: "Endereço não encontrado | FASTMAI" };

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <p className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
        Erro 404
      </p>
      <h1>Este endereço não existe</h1>
      <p className="text-sm text-muted-foreground">
        O link pode estar velho, a tela pode ter mudado de lugar, ou o registro que ele apontava
        pode ter sido apagado. Nada se perdeu por causa disto.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
          Voltar ao início
        </Link>
        <Link href="/portal" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
          Sou colaborador
        </Link>
      </div>
    </main>
  );
}
