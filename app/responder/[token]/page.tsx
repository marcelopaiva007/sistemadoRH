import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/logo";
import { ResponderForm } from "./responder-form";

export default async function ResponderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const surveyToken = await prisma.surveyToken.findUnique({
    where: { token },
    include: {
      pesquisa: { include: { perguntas: { orderBy: { ordem: "asc" }, include: { opcoes: { orderBy: { ordem: "asc" } } } } } },
    },
  });
  if (!surveyToken) notFound();

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-6 py-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <Logo width={200} height={52} className="h-10 w-auto" />
        </div>

        {surveyToken.pesquisa.status !== "ACTIVE" ? (
          <p className="text-center text-muted-foreground">
            Esta pesquisa não está mais aceitando respostas.
          </p>
        ) : surveyToken.status === "RESPONDED" ? (
          <p className="text-center text-muted-foreground">
            Você já respondeu esta pesquisa. Obrigado pela participação!
          </p>
        ) : (
          <ResponderForm token={token} pesquisa={surveyToken.pesquisa} />
        )}
      </div>
    </div>
  );
}
