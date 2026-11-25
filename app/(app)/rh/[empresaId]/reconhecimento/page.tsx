import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeBrasiliaUTC, marcoDoAno } from "@/lib/reconhecimento/anos-de-casa";
import { ReconhecimentoView } from "./reconhecimento-view";

export default async function ReconhecimentoPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  // Dia de Brasília, não UTC (26/11/2026) — ver lib/reconhecimento/anos-de-casa.ts.
  const hoje = hojeBrasiliaUTC();
  const mes = hoje.getUTCMonth() + 1;
  const ano = hoje.getUTCFullYear();

  const [colaboradores, jaEnviados] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      select: {
        id: true,
        nome: true,
        dataNascimento: true,
        dataAdmissao: true,
        telegramChatId: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
      },
    }),
    prisma.reconhecimento.findMany({
      where: { empresaId, ano },
      select: { colaboradorId: true, tipo: true },
    }),
  ]);

  const enviadoSet = new Set(jaEnviados.map((r) => `${r.colaboradorId}::${r.tipo}`));

  const aniversariantes = colaboradores
    .filter((c) => c.dataNascimento && c.dataNascimento.getUTCMonth() + 1 === mes)
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      setorNome: c.setor.nome,
      posicaoNome: c.posicao.nome,
      dia: c.dataNascimento!.getUTCDate(),
      temTelegram: !!c.telegramChatId,
      jaEnviado: enviadoSet.has(`${c.id}::ANIVERSARIO`),
    }))
    .sort((a, b) => a.dia - b.dia);

  const marcos = colaboradores
    .filter((c) => c.dataAdmissao && c.dataAdmissao.getUTCMonth() + 1 === mes)
    .map((c) => {
      // Os anos que a pessoa COMPLETA no aniversário deste mês, não os que tem
      // hoje (26/11/2026): admitido em 28/11/2016, em 25/11/2026 a linha é do
      // 10º ano — e é ele que é redondo. Com os anos de hoje a tela dizia "9".
      const { anos, redondo } = marcoDoAno(c.dataAdmissao!, hoje);
      return {
        id: c.id,
        nome: c.nome,
        setorNome: c.setor.nome,
        posicaoNome: c.posicao.nome,
        dia: c.dataAdmissao!.getUTCDate(),
        anos,
        redondo,
        temTelegram: !!c.telegramChatId,
        jaEnviado: enviadoSet.has(`${c.id}::TEMPO_CASA`),
      };
    })
    .filter((m) => m.anos >= 1)
    .sort((a, b) => a.dia - b.dia);

  return (
    <ReconhecimentoView empresaId={empresaId} mes={mes} aniversariantes={aniversariantes} marcos={marcos} />
  );
}
