import Link from "next/link";
import { LoginForm } from "./login-form";
import { FastmaiLogo } from "@/components/logo-fastmai";
import { versaoDoSistema } from "@/lib/versao";

/**
 * A porta de entrada, em duas metades (arquétipo G do handoff Modernist).
 *
 * Esquerda, em vermelho: o wordmark, uma frase e os nomes das marcas do grupo
 * — é a única superfície do sistema pintada de vermelho inteira, e por isso
 * a frase pode ser grande (64px em peso 800: sobre o fill, o texto claro
 * mede 3,76:1, o bastante para texto grande). Direita: o formulário sem
 * cartão, sobre o papel. Abaixo de `lg` a metade vermelha vira uma faixa no
 * topo e o formulário ocupa a tela.
 *
 * A versão fica no rodapé da metade vermelha, e não no formulário: ela
 * responde "estou vendo a versão nova?" sem precisar entrar — mas não
 * disputa espaço com o campo de senha.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const versao = versaoDoSistema();
  // Erro do próprio NextAuth volta para cá com `?error=` (auth.config.ts,
  // `pages.error`), no lugar da página de erro em inglês dele.
  const { error } = await searchParams;
  const erroInicial = error ? "Não foi possível entrar. Tente de novo." : null;

  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-primary px-8 py-8 text-primary-foreground lg:px-14 lg:py-12">
        {/* A logo herda a cor do texto: sobre o vermelho, "FAST" e o símbolo
            ficam claros; o "MAI" continua no vermelho do wordmark e some no
            fundo — por isso o `[&_*]:!text-current` força tudo claro. */}
        <FastmaiLogo className="text-[22px] [&_span]:!text-current" />
        <div className="py-12 lg:py-0">
          <h2 className="max-w-[12ch] font-heading text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-[52px] lg:text-[64px]">
            Pessoas, processos e delegações do grupo.
          </h2>
          <p className="mt-6 text-base font-semibold opacity-90">L&amp;M Telecom · Centrysol · VAPT</p>
        </div>
        <p className="font-mono text-xs opacity-80">{versao.rotulo}</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 lg:px-14">
        <div className="w-full max-w-[400px]">
          <h1>Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesso do RH, diretoria e gestores, com o seu usuário e senha.
          </p>
          <div className="mt-8">
            <LoginForm erroInicial={erroInicial} />
          </div>
          {/* Um usuário por grupo (v1.191.0): quem trabalha na L&M e nas demais
              marcas tem dois, e é o usuário que diz em qual grupo se entra. */}
          <p className="mt-6 text-xs text-muted-foreground">
            Trabalha na L&amp;M e nas demais marcas? Você tem um usuário para cada — entre com o do
            grupo em que vai trabalhar. Para trocar, use <strong>Sair / trocar de usuário</strong> no
            menu do seu nome e entre com o outro.
          </p>
          <div className="mt-10 border-t-2 border-border pt-5 text-sm text-muted-foreground">
            É colaborador? O portal é pelo celular.{" "}
            <Link href="/portal" className="font-extrabold text-primary hover:underline">
              Abrir portal →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
