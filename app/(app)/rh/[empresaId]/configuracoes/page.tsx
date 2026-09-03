import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Clock,
  History,
  ListChecks,
  Send,
  Tags,
  UsersRound,
} from "lucide-react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CHAVE_TELEGRAM, statusDoSegredo, statusDoSmtp } from "@/lib/segredos";
import { LEMBRETES_CONFIGURAVEIS, type ChaveLembrete } from "@/lib/cron-horario";
import { Card, CardContent } from "@/components/ui/card";

// Hub das configurações: um cartão por área, com uma linha de status real
// (não só um link) — "SMTP desligado" aqui evita descobrir isso só quando um
// convite falhar. As telas continuam sendo as donas da edição; isto é o mapa.
export default async function ConfiguracoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [setores, posicoes, marcas, empresas, telegram, smtp, lembretes, tiposBeneficio] =
    await Promise.all([
      prisma.setor.count({ where: { empresaId, ativo: true } }),
      prisma.posicao.count({ where: { empresaId, ativo: true } }),
      prisma.marca.count({ where: { ativo: true } }),
      prisma.empresa.count({ where: { ativo: true } }),
      statusDoSegredo(CHAVE_TELEGRAM),
      statusDoSmtp(),
      prisma.configuracaoLembrete.findMany({ select: { chave: true, ativo: true } }),
      prisma.tipoBeneficio.count({ where: { empresaId, ativo: true } }),
    ]);

  const chavesComHorarioProprio = new Set(lembretes.map(l => l.chave));
  const totalLembretes = Object.keys(LEMBRETES_CONFIGURAVEIS).length;
  const ajustados = (Object.keys(LEMBRETES_CONFIGURAVEIS) as ChaveLembrete[]).filter(c =>
    chavesComHorarioProprio.has(c)
  ).length;

  const canaisLigados = [telegram.ligado, smtp.ligado].filter(Boolean).length;

  const cartoes = [
    {
      slug: "setores",
      titulo: "Setores",
      descricao: "Áreas da empresa — base do organograma e dos filtros.",
      status: `${setores} ativo(s)`,
      alerta: setores === 0,
      icon: UsersRound,
    },
    {
      slug: "posicoes",
      titulo: "Cargos",
      descricao: "Posições que os colaboradores ocupam.",
      status: `${posicoes} ativo(s)`,
      alerta: posicoes === 0,
      icon: ListChecks,
    },
    {
      slug: "estrutura",
      titulo: "Marcas & CNPJs",
      descricao: "Estrutura do grupo: marcas, razões sociais e logos.",
      status: `${marcas} marca(s), ${empresas} CNPJ(s)`,
      alerta: false,
      icon: Building2,
    },
    {
      slug: "canais",
      titulo: "Canais de envio",
      descricao: "Telegram e e-mail — por onde saem convites e lembretes.",
      status:
        canaisLigados === 2
          ? "Telegram e SMTP ligados"
          : canaisLigados === 1
            ? telegram.ligado
              ? "Só Telegram ligado — SMTP desligado"
              : "Só SMTP ligado — Telegram desligado"
            : "Nenhum canal ligado",
      alerta: canaisLigados === 0,
      icon: Send,
    },
    {
      slug: "lembretes",
      titulo: "Lembretes",
      descricao: "Horário dos avisos automáticos (fuso de Brasília).",
      status:
        ajustados === 0
          ? "Todos no horário padrão"
          : `${ajustados} de ${totalLembretes} com horário ajustado`,
      alerta: false,
      icon: Clock,
    },
    {
      slug: "tipos-beneficio",
      titulo: "Tipos de benefício",
      descricao: "Catálogo padrão + tipos próprios desta empresa.",
      status: tiposBeneficio === 0 ? "Só o catálogo padrão" : `${tiposBeneficio} tipo(s) próprio(s)`,
      alerta: false,
      icon: Tags,
    },
    {
      slug: "auditoria",
      titulo: "Auditoria",
      descricao: "Trilha de quem fez o quê — somente leitura.",
      status: "Sempre ativa",
      alerta: false,
      icon: History,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1>Configurações</h1>
        <p className="text-sm text-muted-foreground">
          O estado de cada área de configuração do sistema, num lugar só. Clique num cartão para
          ajustar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cartoes.map(cartao => {
          const Icon = cartao.icon;
          return (
            <Link key={cartao.slug} href={`/rh/${empresaId}/${cartao.slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium">{cartao.titulo}</span>
                    <ChevronRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="text-sm text-muted-foreground">{cartao.descricao}</p>
                  <p
                    className={`mt-auto text-xs font-medium ${
                      cartao.alerta ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {cartao.status}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
