import { prisma } from "@/lib/prisma";

// Matrícula do colaborador: sequência única no grupo, a partir de 2000.
//
// Vem de uma sequence do Postgres (`rh.matricula_seq`), não de MAX+1: dois
// cadastros simultâneos — o RH numa aba, a importação em lote na outra —
// leriam o mesmo máximo e gerariam a mesma matrícula. `nextval` é atômico.
//
// Número pulado (transação que deu rollback) é irrelevante; número repetido
// não, porque matrícula identifica a pessoa em holerite e ponto.
//
// Única no grupo inteiro e não por empresa: a mesma pessoa pode mudar de CNPJ
// dentro do grupo — são 11 razões sociais para 3 marcas — e continua sendo ela.

type ClientePrisma = Pick<typeof prisma, "$queryRaw">;

/**
 * Próxima matrícula livre. Aceita o cliente de transação (`tx`) para o número
 * sair na mesma transação da admissão.
 */
export async function proximaMatricula(cliente: ClientePrisma = prisma): Promise<string> {
  const linhas = await cliente.$queryRaw<{ valor: bigint }[]>`
    SELECT nextval('"rh"."matricula_seq"') AS valor
  `;
  return String(linhas[0].valor);
}
