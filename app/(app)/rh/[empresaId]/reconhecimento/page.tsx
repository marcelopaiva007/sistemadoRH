import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { anosCompletos, hojeUTC } from "@/lib/datas";
import { ReconhecimentoView } from "./reconhecimento-view";

// Marcos redondos que ganham destaque no tempo de casa — os demais anos
// aparecem na lista, mas sem o realce.
const MARCOS_REDONDOS = new Set([1, 3, 5, 10, 15, 20, 25, 30]);

export default async function ReconhecimentoPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const hoje = hojeUTC();
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
      const anos = anosCompletos(c.dataAdmissao!, hoje);
      return {
        id: c.id,
        nome: c.nome,
        setorNome: c.setor.nome,
        posicaoNome: c.posicao.nome,
        dia: c.dataAdmissao!.getUTCDate(),
        anos,
        redondo: MARCOS_REDONDOS.has(anos),
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
