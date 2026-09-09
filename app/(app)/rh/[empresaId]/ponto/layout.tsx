import { prisma } from "@/lib/prisma";
import { AjudaDaTela } from "@/components/ajuda-da-tela";

/**
 * Cabeçalho comum das telas de Ponto Eletrônico.
 *
 * POR QUE EXISTE. Até v1.169.0 o Ponto era UMA tela com sete abas dentro. A
 * consequência aparecia no suporte: para chegar ao histórico de uma batida era
 * preciso saber que ele morava atrás de uma aba, e a lateral só dizia "Ponto
 * Eletrônico". Desde v1.170.0 cada aba é uma tela com endereço próprio, e a
 * lateral lista todas — o que estava escondido virou navegável, favoritável e
 * mandável por link.
 *
 * O que sobrou de comum entre elas é este cabeçalho: o nome do módulo, o CNPJ
 * aberto e o botão de ajuda. Cada página busca só o que a SUA tela usa — antes
 * uma abertura de Ponto disparava as oito consultas de todas as abas, mesmo
 * para quem só ia olhar o monitor de presença.
 */
export default async function PontoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // O guard de empresa é o do layout de /rh/[empresaId] (requireEmpresaAccess),
  // que envolve este — não se repete aqui.
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nome: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1>Ponto Eletrônico &amp; Gestão de Jornada (REP-P)</h1>
          <AjudaDaTela modulo="ponto" />
        </div>
        <p className="text-sm text-muted-foreground">
          {empresa?.nome || "Empresa"} · Portaria MTP nº 671/2021 &amp; CLT
        </p>
      </div>

      {children}
    </div>
  );
}
