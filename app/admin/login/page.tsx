import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FastmaiLogo } from "@/components/logo-fastmai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { versaoDoSistema } from "@/lib/versao";
import { ehMaster } from "@/lib/grupo";
import { AdminLoginForm } from "./admin-login-form";

/**
 * A porta da área de administração (rh.assinelm.com/admin/login).
 *
 * Mesmo desenho em duas metades do login do sistema (app/login/page.tsx),
 * mas a metade da marca é ESCURA, não vermelha: é outra porta, e a pessoa
 * tem que perceber isso antes de digitar a senha. Sem "Entrar com Google" —
 * a conta MASTER não entra pelo Google (lib/login-google.ts).
 *
 * Quem chega aqui já logado no sistema com outra conta (Diretoria, RH...) vê
 * com quem está e por que não entrou: o proxy e as páginas do painel mandam
 * para cá qualquer conta que não seja a de administrador.
 */
export default async function AdminLoginPage() {
  const session = await auth();
  const user = session?.user;
  if (user && ehMaster(user)) redirect("/admin");
  const outraConta = user ? (user.name ?? user.username) : null;
  const versao = versaoDoSistema();

  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-foreground px-8 py-8 text-background lg:px-14 lg:py-12">
        <div className="flex items-center gap-2">
          <FastmaiLogo className="text-[22px] text-background" />
          <span className="bg-primary px-1.5 py-1 text-[11px] leading-none font-extrabold tracking-[0.08em] text-primary-foreground uppercase">
            Admin
          </span>
        </div>
        <div className="py-12 lg:py-0">
          <h2 className="max-w-[14ch] font-heading text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-[52px] lg:text-[64px]">
            Administração do sistema.
          </h2>
          <p className="mt-6 max-w-md text-base font-semibold text-background/80">
            Contas, grupos e perfis de acesso — quem entra no sistema e quais marcas cada pessoa vê.
          </p>
        </div>
        <p className="font-mono text-xs text-background/70">{versao.rotulo}</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 lg:px-14">
        <div className="w-full max-w-[400px]">
          <h1>Entrar como administrador</h1>
          <p className="mt-1 text-sm text-muted-foreground">Só a conta de administrador entra aqui.</p>
          {outraConta && (
            <Alert className="mt-6">
              <AlertDescription>
                Você está conectado no sistema como <strong>{outraConta}</strong>, que não é a conta de
                administrador. Entre abaixo com a conta de administrador, ou{" "}
                <Link href="/" className="font-semibold text-primary hover:underline">
                  volte ao sistema
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}
          <div className="mt-8">
            <AdminLoginForm />
          </div>
          <div className="mt-10 border-t-2 border-border pt-5 text-sm text-muted-foreground">
            Procurando o sistema do RH?{" "}
            <Link href="/login" className="font-extrabold text-primary hover:underline">
              Ir para o login do sistema →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
