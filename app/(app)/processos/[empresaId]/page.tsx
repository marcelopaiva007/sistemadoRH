import { notFound } from "next/navigation";
import {
  Car,
  FileSignature,
  FolderKanban,
  Package,
  Workflow,
  BellRing,
  Construction,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Visão geral do módulo Processos & Ativos.
//
// Enquanto as áreas não existem, esta tela tem uma função e só uma: dizer, para
// quem abriu a porta na barra de topo, o que vai morar aqui e o que ainda não
// mora. É o oposto de um menu com cinco itens que dão em página vazia — que é
// como implantação de GED costuma começar a morrer, prometendo estrutura antes
// de conteúdo. Nada nesta tela grava dado nem lê tabela que ainda não existe.
const AREAS = [
  {
    icone: Workflow,
    titulo: "Processos",
    resumo: "Todo assunto que tem começo, dono, prazo e desfecho — e que hoje vive em conversa de WhatsApp.",
    exemplos: [
      "Abertura e alteração de CNPJ, alvará, licença de prefeitura",
      "Processo trabalhista: vara, audiência, preposto, depósito",
      "Sinistro de veículo, acionamento de seguro",
      "Procedimento interno (POP) com versão, aprovação e ciência de quem leu",
    ],
  },
  {
    icone: FolderKanban,
    titulo: "Documentos",
    resumo: "O arquivo da empresa com validade e responsável — não uma pasta compartilhada onde ninguém sabe qual é a via boa.",
    exemplos: [
      "Certidões que vencem: CND federal, FGTS, trabalhista, municipal",
      "Alvará, licença de operação, apólice de seguro",
      "Ata, procuração, contrato social e alterações",
      "Cada arquivo com data de validade, versão e quem responde por ele",
    ],
  },
  {
    icone: FileSignature,
    titulo: "Contratos",
    resumo: "O ciclo inteiro, do rascunho ao encerramento — com o alerta antes da renovação automática, não depois.",
    exemplos: [
      "Fornecedor, prestador PJ, locação de ponto e de torre",
      "Condomínio, prefeitura, compartilhamento de poste e infraestrutura",
      "Vigência, reajuste, garantia, multa e janela para não renovar",
      "Certidões do fornecedor exigidas e a data de renovar cada uma",
    ],
  },
  {
    icone: Car,
    titulo: "Frota",
    resumo: "A documentação dos carros, que é a que tem prazo legal correndo contra a empresa todo mês.",
    exemplos: [
      "Emplacamento, CRLV e licenciamento anual por final de placa",
      "Multa: quem dirigia, prazo de indicar o condutor e o recurso",
      "Transferência de propriedade e comunicação de venda",
      "IPVA, seguro, condutor responsável e validade da CNH dele",
    ],
  },
  {
    icone: Package,
    titulo: "Patrimônio",
    resumo: "O que a empresa comprou e está na mão de alguém — com termo assinado e conferência periódica.",
    exemplos: [
      "Notebook, celular, chip, ferramenta, equipamento de campo",
      "Termo de responsabilidade e comodato por colaborador",
      "Inventário periódico, transferência entre setores e baixa",
      "O que precisa voltar quando alguém é desligado",
    ],
  },
] as const;

export default async function ProcessosVisaoGeralPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireProcessosEmpresa(empresaId);

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nome: true, marca: { select: { nome: true } } },
  });
  if (!empresa) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Processos & Ativos</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          O módulo de quem cuida do que a empresa <strong className="text-foreground">assina, guarda e possui</strong> —
          processos, documentos, contratos, frota e patrimônio. É a outra metade
          do trabalho do RH deste grupo, que acumula também a função de
          compliance, e que hoje não tem sistema nenhum: vive em pasta de
          computador, e-mail e memória de quem está de férias.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Construction className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <CardTitle className="text-base">Módulo em construção</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            A porta na barra de topo já existe — é por ela que se chega aqui, e
            ela fica. As cinco áreas abaixo ainda <strong className="text-foreground">não guardam dado</strong>:
            esta tela descreve o que cada uma vai controlar, para a ordem de
            construção ser decidida sabendo o que entra em cada uma.
          </p>
          <p className="mt-2">
            Nada do que está no RH mudou. O módulo novo é vizinho, não
            substituto — troca-se de um para o outro pelo seletor ao lado do
            logo, e o CNPJ escolhido vai junto.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((area) => {
          const Icone = area.icone;
          return (
            <Card key={area.titulo} className="h-full">
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icone className="size-4 text-muted-foreground" />
                  {area.titulo}
                </CardTitle>
                <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                  a construir
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{area.resumo}</p>
                <ul className="mt-3 space-y-1.5">
                  {area.exemplos.map((exemplo) => (
                    <li key={exemplo} className="flex gap-2 text-xs text-muted-foreground">
                      <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      <span>{exemplo}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}

        {/* A sexta e a que justifica as outras cinco. Fica no mesmo grid de
            proposito: e uma tela irma das areas, nao um resumo delas. */}
        <Card className="h-full border-primary/40 bg-primary/5">
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4 text-primary" />
              Central de Pendências
            </CardTitle>
            <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
              a construir
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Uma tela só com <strong className="text-foreground">tudo que vence</strong>, das
              cinco áreas juntas, com prazo, dono e o que acontece se passar.
              É ela que faz o módulo valer a pena: as outras cinco guardam, esta
              cobra.
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                "Multa a indicar condutor — o prazo mais curto e mais caro de todos",
                "Licenciamento, IPVA e seguro do mês",
                "Certidão vencendo e contrato entrando na janela de renovação",
                "Processo com data marcada e documento sem responsável",
              ].map((item) => (
                <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
