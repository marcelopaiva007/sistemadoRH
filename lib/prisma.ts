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
  const adapter = url.startsWith("postgres")
    ? new PrismaPg({ connectionString: url })
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

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}
