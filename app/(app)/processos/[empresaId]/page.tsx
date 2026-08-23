import { notFound } from "next/navigation";
import {
  Car,
  FileSignature,
  FolderKanban,
  Package,
  Workflow,
  BellRing,
  Construction,
  Flag,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Visão geral do módulo Processos & Ativos.
//
// Enquanto as áreas não existem, esta tela tem uma função e só uma: dizer, para
// quem abriu a porta na barra de topo, o que vai morar aqui, em que ordem, e
// POR QUE nessa ordem. É o oposto de um menu com cinco itens que dão em página
// vazia — que é como implantação de GED costuma começar a morrer, prometendo
// estrutura antes de conteúdo. Nada nesta tela grava dado nem lê tabela que
// ainda não existe.
//
// O conteúdo vem do estudo de 23/08/2026 (`estudo-modulo-processos-ativos.md`
// no workspace), que verificou cada base legal citada aqui contra fonte
// primária. A ordem das ondas é a do estudo, e o critério dela é um só: quanto
// dinheiro sai hoje, de forma certa e recorrente, se continuar sem controle.
//
// Valor em reais NÃO entra nesta tela de propósito: multa é reajustada, e uma
// tela que envelhece sozinha perde a confiança de quem lê.
type Area = {
  icone: typeof Car;
  titulo: string;
  onda: string;
  resumo: string;
  exemplos: string[];
  /** Primeira a ser construída dentro da onda — ganha borda. */
  destaque?: boolean;
  /** A Central. Única com fundo tingido: ela não é uma área entre as outras. */
  coracao?: boolean;
};

const AREAS: Area[] = [
  {
    icone: Car,
    titulo: "Frota",
    onda: "Onda 1",
    destaque: true,
    resumo:
      "A documentação dos carros — o único prejuízo certo, recorrente e contável que o grupo já tem hoje.",
    exemplos: [
      "Multa: indicar o condutor em 30 dias. Não indicou, a empresa paga 3× (CTB, art. 257, §§7º e 8º)",
      "Quem estava com a placa naquele dia e hora — é essa resposta que torna a indicação automática",
      "Licenciamento vencido: infração gravíssima, com remoção do veículo (CTB, art. 230, V)",
      "CNH, EAR, pontos do condutor e o curso que zera a pontuação antes da suspensão",
    ],
  },
  {
    icone: BellRing,
    titulo: "Central de Pendências",
    onda: "Onda 1",
    coracao: true,
    resumo:
      "Uma tela só com tudo que vence, dos cinco domínios, com data e dono. É ela que faz o módulo valer a pena: as outras guardam, esta cobra.",
    exemplos: [
      "Cada pendência tem uma pessoa com nome — nunca \"o RH\", nunca um setor",
      "Cada uma tem um botão que RESOLVE, não que abre para ver",
      "Cada uma pode ser dispensada com motivo escrito — sem isso, um alarme falso fica eterno",
      "Substituto definido: as férias de quem cuida não podem congelar 40 prazos legais",
    ],
  },
  {
    icone: FileSignature,
    titulo: "Contratos",
    onda: "Onda 2",
    resumo:
      "O ciclo inteiro, do rascunho ao encerramento — com o aviso antes da renovação automática, não depois.",
    exemplos: [
      "Janela de denúncia: passou a data, o contrato se renova sozinho e cria passivo novo",
      "Fornecedor, prestador PJ, condomínio, prefeitura, locação de ponto e compartilhamento de poste",
      "Certidão do fornecedor: o CRF do FGTS vale 30 dias, a CND e a CNDT valem 180 — prazos diferentes",
      "Reajuste anual, garantia, apólice e o gestor nomeado de cada contrato",
    ],
  },
  {
    icone: Package,
    titulo: "Patrimônio",
    onda: "Onda 2",
    resumo:
      "O que a empresa comprou e está na mão de alguém — com termo assinado que sustenta desconto, e conferência periódica.",
    exemplos: [
      "Notebook, celular, chip, ferramenta e equipamento de campo, com etiqueta e QR",
      "Termo com cláusula expressa de desconto por dano: sem ela o desconto é ilícito (CLT, art. 462, §1º)",
      "Desligamento dispara a devolução ANTES da rescisão — hoje o bem some junto com a pessoa",
      "Inventário periódico, transferência entre setores e baixa com aprovação",
    ],
  },
  {
    icone: FolderKanban,
    titulo: "Documentos",
    onda: "Onda 3",
    resumo:
      "O arquivo da empresa com validade e responsável — não uma pasta compartilhada onde ninguém sabe qual é a via boa.",
    exemplos: [
      "Certidões, alvarás, licenças, apólices, atas, procurações e contrato social",
      "Prazo de guarda calculado por tipo, e a lista do que já pode ser eliminado",
      "Eliminação nunca automática: sugestão, dois aprovadores e termo assinado",
      "Versão que não se sobrescreve, e verificação de que o arquivo não foi trocado",
    ],
  },
  {
    icone: Workflow,
    titulo: "Processos",
    onda: "Onda 3",
    resumo:
      "Todo assunto com começo, dono, prazo e desfecho — que hoje vive em conversa de WhatsApp e na memória de quem está de férias.",
    exemplos: [
      "Abertura e alteração de CNPJ, alvará, licença de prefeitura, sinistro de veículo",
      "Número, responsável, o que já aconteceu e o que falta acontecer",
      "Processo parado esperando terceiro não suja o prazo — mas prazo de juiz nunca para",
      "Processo trabalhista entra como acompanhamento, com audiência e provisão",
    ],
  },
];

// O que NÃO depende de software nenhum e já está custando dinheiro. Fica na
// tela porque quem lê aqui é exatamente quem pode fazer — e a primeira linha
// perde desconto toda semana que passa.
const ANTES_DO_SISTEMA = [
  "Aderir ao SNE (notificação eletrônica de multa) para toda a frota: o desconto de 40% só vale se a adesão for ANTERIOR à notificação. Cada semana sem aderir é desconto perdido para sempre.",
  "Emitir termo de responsabilidade de veículo com período de posse para todo mundo que dirige — é o documento que permite indicar o condutor sem a assinatura dele.",
  "Conferir o cadastro de cada CNPJ no Domicílio Judicial Eletrônico: o prazo para pessoa jurídica privada venceu em 30/09/2024.",
  "Incluir cláusula de aceite de meio eletrônico nos contratos novos — destrava a assinatura simples e evita exigir certificado ICP-Brasil em cada documento.",
  "Designar por escrito o encarregado de LGPD, com substituto. Custa uma folha assinada e hoje não existe.",
];

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
          O módulo de quem cuida do que a empresa{" "}
          <strong className="text-foreground">assina, guarda e possui</strong> — processos,
          documentos, contratos, frota e patrimônio. É a outra metade do trabalho do RH deste
          grupo, que acumula também a função de compliance, e que hoje não tem sistema nenhum:
          vive em pasta de computador, e-mail e memória de quem está de férias.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Construction className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <CardTitle className="text-base">Módulo em construção</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A porta na barra de topo já existe — é por ela que se chega aqui, e ela fica. As áreas
            abaixo ainda <strong className="text-foreground">não guardam dado</strong>. A ordem
            das ondas não é de gosto: é quanto dinheiro sai hoje, de forma certa e recorrente, se
            continuar sem controle.
          </p>
          <p>
            Nada do módulo de RH mudou. Este é vizinho, não substituto — troca-se de um para o
            outro pelo seletor ao lado do logo, e o CNPJ escolhido vai junto.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((area) => {
          const Icone = area.icone;
          const primeiraOnda = area.onda === "Onda 1";
          return (
            <Card
              key={area.titulo}
              className={
                area.coracao
                  ? "h-full border-primary/40 bg-primary/5"
                  : area.destaque
                    ? "h-full border-primary/30"
                    : "h-full"
              }
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icone className={area.coracao ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
                  {area.titulo}
                </CardTitle>
                <Badge
                  variant={primeiraOnda ? "default" : "outline"}
                  className={primeiraOnda ? "shrink-0" : "shrink-0 font-normal text-muted-foreground"}
                >
                  {area.onda}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{area.resumo}</p>
                <ul className="mt-3 space-y-1.5">
                  {area.exemplos.map((exemplo) => (
                    <li key={exemplo} className="flex gap-2 text-xs text-muted-foreground">
                      <span
                        aria-hidden
                        className={
                          area.coracao
                            ? "mt-1.5 size-1 shrink-0 rounded-full bg-primary/60"
                            : "mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50"
                        }
                      />
                      <span>{exemplo}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Flag className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle className="text-base">O que já dá para fazer, sem esperar o sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cinco ações que não dependem de tela nenhuma, custam quase nada e já estão custando
            dinheiro enquanto não são feitas.
          </p>
          <ol className="mt-3 space-y-2">
            {ANTES_DO_SISTEMA.map((item, i) => (
              <li key={item} className="flex gap-2.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground/70"
                >
                  {i + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
