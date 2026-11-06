import { notFound } from "next/navigation";
import { obterDadosReciboPublicoAction } from "@/lib/actions/assinatura-contracheque";
import { PaginaAssinaturaClient } from "./pagina-assinatura";

export const metadata = {
  title: "Assinatura de Contracheque | FASTMAI RH",
  description: "Portal seguro para visualização e assinatura eletrônica de contracheques.",
};

export default async function AssinarContrachequePage({
  params,
}: {
  params: { token: string };
}) {
  const dados = await obterDadosReciboPublicoAction(params.token);

  if (!dados.encontrado) {
    notFound();
  }

  return <PaginaAssinaturaClient token={params.token} dados={dados} />;
}
