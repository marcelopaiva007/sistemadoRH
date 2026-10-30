import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { escopoDosInformativos } from "@/lib/informativos-escopo";
import { InformativosView } from "./informativos-view";

// O envio roda dentro da server action desta tela: uma chamada ao Telegram ou
// ao SMTP por pessoa. Uma marca inteira não cabe no tempo padrão da
// plataforma — mesmo motivo do maxDuration da lista de Colaboradores.
export const maxDuration = 300;

// Informativos do RH: escrever um comunicado e mandar para uma pessoa, um
// setor, um CNPJ ou a marca inteira, e acompanhar quem recebeu e quem deu
// ciência.
//
// ESCOPO: a MARCA do caminho ∩ o que o usuário enxerga
// (escopoDosInformativos). A action recalcula o mesmo escopo — o que esta
// tela manda para o navegador é só para montar a escolha.
export default async function InformativosPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const escopo = await escopoDosInformativos(usuario, empresaId);

  const [empresas, setores, pessoas, informativos] = await Promise.all([
    prisma.empresa.findMany({
      where: { id: { in: escopo } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.setor.findMany({
      where: { empresaId: { in: escopo }, ativo: true },
      select: { id: true, nome: true, empresaId: true },
      orderBy: { nome: "asc" },
    }),
    // `select` explícito: a lista vai inteira para o navegador. Nome, setor,
    // CNPJ e se há canal — nada de CPF, telefone ou e-mail em si.
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo }, ativo: true },
      select: { id: true, nome: true, empresaId: true, setorId: true, telegramChatId: true, email: true },
      orderBy: { nome: "asc" },
    }),
    prisma.informativo.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        titulo: true,
        publico: true,
        enviadoPorNome: true,
        createdAt: true,
        _count: { select: { destinatarios: true } },
      },
    }),
  ]);

  // Contagens de canal e ciência por informativo numa consulta só, em vez de
  // trazer cada destinatário de 50 envios para a tela.
  const contagens = informativos.length
    ? await prisma.informativoDestinatario.groupBy({
        by: ["informativoId"],
        where: { informativoId: { in: informativos.map((i) => i.id) } },
        _count: { canal: true, cienteEm: true },
      })
    : [];
  const porInformativo = new Map(contagens.map((c) => [c.informativoId, c._count]));

  return (
    <InformativosView
      empresaId={empresaId}
      empresas={empresas}
      setores={setores}
      pessoas={pessoas.map((p) => ({
        id: p.id,
        nome: p.nome,
        empresaId: p.empresaId,
        setorId: p.setorId,
        canal: p.telegramChatId ? "TELEGRAM" : p.email ? "EMAIL" : null,
      }))}
      enviados={informativos.map((i) => ({
        id: i.id,
        titulo: i.titulo,
        publico: i.publico,
        enviadoPorNome: i.enviadoPorNome,
        createdAt: i.createdAt,
        total: i._count.destinatarios,
        alcancados: porInformativo.get(i.id)?.canal ?? 0,
        cientes: porInformativo.get(i.id)?.cienteEm ?? 0,
      }))}
    />
  );
}
