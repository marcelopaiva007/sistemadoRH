import { notFound } from "next/navigation";
import { obterDadosReciboPublicoAction } from "@/lib/actions/assinatura-contracheque";
import { PaginaAssinaturaClient } from "./pagina-assinatura";

export const metadata = {
  title: "Assinatura de Contracheque | FASTMAI RH",
  description: "Portal seguro para visualização e assinatura eletrônica de contracheques.",
};

export default async function AssinarContrachequePage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const dados = await obterDadosReciboPublicoAction(token);

  if (!dados.encontrado) {
    notFound();
  }

  return <PaginaAssinaturaClient token={token} dados={dados} />;
}
