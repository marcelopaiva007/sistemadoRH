// Exposição de SST por CNPJ — a agregação que faltava na tela de Conformidade.
//
// A tela de Conformidade já faz a parte difícil (matriz de exigência por
// função, cadastro de RequisitoNR, cruzamento requisito×evidência) — só que
// escopada a UM CNPJ, como a maioria das telas RH. Neste grupo isso é um
// problema real: quem lidera não vê o quadro todo sem abrir 8 telas.
//
// "Cadastrar requisito" continua fora daqui de propósito — decidir que NR
// vale para que função é conhecimento de segurança do trabalho, tem peso
// jurídico, e a tela de Conformidade já tem esse formulário. Este arquivo só
// LÊ e soma; nunca escreve requisito.
import { prisma } from "@/lib/prisma";
import { conformidadeDoColaborador, situacaoDoExame } from "@/lib/conformidade";

export type ExposicaoDaEmpresa = {
  empresaId: string;
  empresaNome: string;
  ativos: number;
  /** Tem pelo menos uma NR exigida na função — os outros não entram na conta de regularidade. */
  comRequisitoNR: number;
  regularesNR: number;
  examesEmDia: number;
};

/**
 * Uma consulta por CNPJ (posições+requisitos, colaboradores+certificados+
 * exames) — o mesmo par que `conformidade/page.tsx` já faz para um CNPJ só,
 * repetido pelo recorte. Até 8 CNPJs neste grupo: 16 consultas pequenas numa
 * tela que não é hot path, mais barato que inventar uma junção cross-CNPJ.
 */
export async function exposicaoSstPorEmpresa(empresaIds: string[]): Promise<ExposicaoDaEmpresa[]> {
  const empresas = await prisma.empresa.findMany({
    where: { id: { in: empresaIds } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return Promise.all(
    empresas.map(async (empresa) => {
      const [posicoes, colaboradores] = await Promise.all([
        prisma.posicao.findMany({
          where: { empresaId: empresa.id, ativo: true },
          select: { id: true, requisitosNR: { select: { norma: true, validadeMeses: true } } },
        }),
        prisma.colaborador.findMany({
          where: { empresaId: empresa.id, ativo: true },
          select: {
            posicaoId: true,
            certificados: { select: { norma: true, realizadoEm: true, validoAte: true } },
            exames: {
              select: { tipo: true, realizadoEm: true, validoAte: true, resultado: true, restricoes: true },
            },
          },
        }),
      ]);

      const requisitosPorPosicao = new Map(posicoes.map((p) => [p.id, p.requisitosNR]));

      let comRequisitoNR = 0;
      let regularesNR = 0;
      let examesEmDia = 0;
      for (const c of colaboradores) {
        const requisitos = requisitosPorPosicao.get(c.posicaoId) ?? [];
        if (requisitos.length > 0) {
          comRequisitoNR++;
          if (conformidadeDoColaborador(requisitos, c.certificados).regular) regularesNR++;
        }
        const exame = situacaoDoExame(c.exames);
        if (exame.situacao === "EM_DIA" || exame.situacao === "VENCENDO") examesEmDia++;
      }

      return {
        empresaId: empresa.id,
        empresaNome: empresa.nome,
        ativos: colaboradores.length,
        comRequisitoNR,
        regularesNR,
        examesEmDia,
      };
    }),
  );
}
