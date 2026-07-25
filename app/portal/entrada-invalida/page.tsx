import { PortalSemSessao } from "../sem-sessao";

// Destino do link de entrada recusado (expirado, já usado ou inexistente). O
// motivo vem na query só para o título; o corpo da mensagem é o mesmo dos
// demais casos — quem chega aqui precisa da mesma instrução.
const TITULOS: Record<string, string> = {
  expirado: "Esse link expirou",
  usado: "Esse link já foi usado",
  invalido: "Link inválido",
};

export default async function EntradaInvalidaPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  return <PortalSemSessao titulo={TITULOS[motivo ?? ""] ?? "Link inválido"} />;
}
