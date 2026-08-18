import { prisma } from "@/lib/prisma";
import { lerSessaoPonto } from "@/lib/ponto-pin-auth";
import { EntrarPontoForm } from "./entrar-form";
import { PontoTela } from "./ponto-tela";

// Gateia SÓ pela sessão do ponto (lerSessaoPonto), nunca pela do portal:
// sessão do Telegram não abre este app sem PIN, e vice-versa — para o
// colaborador são dois sistemas. Quem aceita as duas, só para REGISTRAR a
// batida, é lib/ponto-identidade.ts, usado pelas actions.
export default async function PontoPage() {
  const sessao = await lerSessaoPonto();
  if (!sessao) return <EntrarPontoForm />;

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { nome: true, empresa: { select: { nome: true } } },
  });
  if (!colaborador) return <EntrarPontoForm />;

  return <PontoTela nome={colaborador.nome} empresa={colaborador.empresa.nome} />;
}
