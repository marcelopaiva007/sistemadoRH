import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

  const adapter = url.startsWith("postgres")
    ? new PrismaPg({ connectionString: url })
    : new PrismaBetterSqlite3({ url });

  return new PrismaClient({ adapter });
}

export const prisma = globalThis.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}
