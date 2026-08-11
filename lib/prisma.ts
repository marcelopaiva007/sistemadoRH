import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Client normal OU `tx` de dentro de `prisma.$transaction(async (tx) => ...)`
// — mesma interface pra quem só precisa ler/escrever, sem se importar se tá
// dentro de uma transação. Usado por qualquer módulo que precise ser
// testável em transação com rollback (ver scripts/smoke-*.ts) sem duplicar
// a assinatura em cada arquivo.
export type Cliente = PrismaClient | Prisma.TransactionClient;

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

  // Durante o build do Next.js (coleta de páginas) a DATABASE_URL pode não
  // estar disponível no ambiente. Se cair no fallback SQLite, o adapter
  // conflito com o provider `postgres` do schema — então só instanciamos
  // o client de Postgres se a URL for explicitamente Postgres; caso
  // contrário, retornamos um proxy lazy que falha só ao ser usado em runtime
  // (e em dev local com SQLite de verdade).
  // `max` explícito. O padrão do `pg` é 10 conexões POR POOL, dimensionado para
  // um servidor longevo — numa lambda, que atende uma requisição por vez, 10 é
  // desperdício que só aparece quando várias instâncias sobem juntas e o banco
  // recusa a conexão (P2037).
  //
  // Não é 1: várias telas abrem consultas em paralelo de propósito
  // (pendenciasPorEmpresa dispara ~14 groupBy num Promise.all, a página de
  // Ponto dispara 6). Com pool de 1 elas viram fila e a tela fica lenta. 5
  // mantém o paralelismo dentro de uma requisição e corta o pico pela metade.
  const adapter = url.startsWith("postgres")
    ? new PrismaPg({
        connectionString: url,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        // Conexão ociosa devolvida rápido: instância de lambda fica de pé
        // depois de responder, e a conexão parada continua ocupando vaga.
        idleTimeoutMillis: 10_000,
      })
    : null;

  if (!adapter) {
    // Retorna um proxy que lança erro informativo ao primeiro uso.
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        throw new Error(
          `PrismaClient.${String(prop)} chamado sem DATABASE_URL. ` +
            `Defina DATABASE_URL no ambiente (ex.: .env.local) e tente de novo.`,
        );
      },
    });
  }

  return new PrismaClient({ adapter });
}

export const prisma = globalThis.prismaGlobal ?? createPrismaClient();

// Guardado no global TAMBÉM em produção. Antes era só fora dela, e a razão
// original (sobreviver ao hot-reload do dev) escondia que em produção o efeito
// é outro: numa lambda, cada módulo que instancia o client abre mais um pool
// de `max` conexões contra o mesmo banco. Com o global, é um por instância.
//
// Isso é metade do conserto do P2037 ("Too many database connections opened")
// que derrubava /api/cron/enviar-convites e /api/cron/lembrete-pesquisa; a
// outra metade é o escalonamento dos crons em vercel.json, que antes subiam
// cinco lambdas no mesmo minuto.
globalThis.prismaGlobal = prisma;
