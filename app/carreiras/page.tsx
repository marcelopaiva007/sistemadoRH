import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, HeartHandshake, MapPin, ShieldCheck, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/logo";
import { tipoContratoLabel } from "@/lib/constants-dp";

// Página PÚBLICA de carreiras: um endereço só para divulgar, com todas as
// vagas abertas do grupo. A inscrição em si continua em /vagas/<slug>.
//
// Sem sessão — ver a exceção em auth.config.ts.
//
// É a única tela do sistema que fala com quem está DE FORA. O resto do
// sistema pode ser denso, porque quem usa passa o dia nele; aqui a pessoa
// chega por um link do WhatsApp, decide em segundos se confia, e vai embora
// se não reconhecer a empresa. Por isso o logo oficial vem primeiro.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trabalhe conosco | Grupo LM Telecom",
  description:
    "Vagas abertas no grupo LM Telecom, Centrysol e VAPT. Candidate-se online, é rápido e não precisa criar conta.",
  openGraph: {
    title: "Trabalhe conosco | Grupo LM Telecom",
    description: "Vagas abertas no grupo. Candidate-se online, sem criar conta.",
    type: "website",
  },
};

export default async function CarreirasPage() {
  // Só o que está publicado E aberto. Vaga despublicada não aparece nem aqui
  // nem na página dela — mesma regra dos dois lados.
  const vagas = await prisma.vaga.findMany({
    where: { publicada: true, status: "ABERTA" },
    orderBy: [{ abertaEm: "desc" }],
    select: {
      slug: true,
      titulo: true,
      descricao: true,
      tipoContrato: true,
      faixaSalarial: true,
      quantidade: true,
      empresaId: true,
      setor: { select: { nome: true } },
    },
  });

  // O nome vem da MARCA, não do CNPJ: quem se candidata reconhece "LM
  // Telecom", não a razão social da pessoa jurídica que assina o contrato.
  const empresas = await prisma.empresa.findMany({
    select: { id: true, nome: true, marca: { select: { nome: true } } },
  });
  const marcaDaEmpresa = new Map(empresas.map((e) => [e.id, e.marca?.nome ?? e.nome]));

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <Logo width={200} height={54} className="h-10 w-auto" />
          <span className="text-sm text-muted-foreground">Trabalhe conosco</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12">
        <section className="mb-12">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Venha construir a rede que conecta o Piauí.
          </h1>
          <p className="mt-4 medida-de-leitura text-muted-foreground">
            Somos um grupo de telecomunicações e energia com mais de 400 pessoas, entre LM Telecom,
            Centrysol e VAPT. A candidatura leva poucos minutos e{" "}
            <span className="font-medium text-foreground">você não precisa criar conta</span>.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Destaque
              icone={<Users className="size-4" />}
              titulo="400+ pessoas"
              texto="Três empresas, uma equipe que cresce junto."
            />
            <Destaque
              icone={<ShieldCheck className="size-4" />}
              titulo="Registro em carteira"
              texto="Contrato formal, com toda a segurança da CLT."
            />
            <Destaque
              icone={<HeartHandshake className="size-4" />}
              titulo="Time de campo e de escritório"
              texto="Da instalação na rua à gestão — tem lugar para os dois."
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b pb-3">
            <h2 className="text-xl font-semibold tracking-tight">Vagas abertas</h2>
            {vagas.length > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {vagas.length === 1 ? "1 vaga" : `${vagas.length} vagas`}
              </span>
            )}
          </div>

          {vagas.length === 0 ? (
            <div className="rounded-lg border bg-card p-10 text-center">
              <Briefcase className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h3 className="font-medium">Nenhuma vaga aberta no momento</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Não temos posições em aberto agora. Vale voltar aqui em algumas semanas — o grupo
                contrata ao longo de todo o ano.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {vagas.map((v) => (
                <li key={v.slug}>
                  <Link
                    href={`/vagas/${v.slug}`}
                    className="group block rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-medium">{v.titulo}</h3>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {marcaDaEmpresa.get(v.empresaId) ?? ""}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {v.setor?.nome && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {v.setor.nome}
                        </span>
                      )}
                      {v.tipoContrato && <span>{tipoContratoLabel(v.tipoContrato)}</span>}
                      {v.faixaSalarial && <span>{v.faixaSalarial}</span>}
                      {v.quantidade > 1 && <span>{v.quantidade} posições</span>}
                    </div>

                    {v.descricao && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{v.descricao}</p>
                    )}

                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Ver vaga e candidatar-se
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6 text-xs text-muted-foreground">
          <p className="medida-de-leitura">
            Os dados enviados na candidatura são usados apenas no processo seletivo e para futuras
            oportunidades do grupo. Você pode pedir a exclusão a qualquer momento.
          </p>
          <p className="mt-2">Grupo LM Telecom · Centrysol · VAPT</p>
        </div>
      </footer>
    </div>
  );
}

function Destaque({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-primary">{icone}</div>
      <div className="mt-2 text-sm font-medium">{titulo}</div>
      <p className="mt-0.5 text-xs text-muted-foreground">{texto}</p>
    </div>
  );
}
