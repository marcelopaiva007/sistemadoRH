import "server-only";
import { prisma } from "@/lib/prisma";
import { recalcularFechamento } from "@/lib/bonificacao";
import { matchFuncionario, somenteDigitos } from "@/lib/vendedor-match";

// Importação automática das vendas de chip do L&M Movel
// (https://movel.assinelm.com — plataforma própria de gerenciamento de chips,
// com API REST em /api). Diferente do elleven, não há scraping: a API devolve
// JSON com a venda completa (vendedor com nome+CPF, cliente, ICCID, plano,
// status e datas).
//
// Fluxo (syncChipMovel): login -> GET /vendas/sales?year&month (paginado) ->
// snapshot em venda_chip_movel -> agregação por vendedor + casamento com o
// cadastro de Funcionários (CPF -> nome exato -> tokens em ordem) -> regrava os
// LancamentoVenda de origem CHIP_MOVEL do período -> recalcularFechamento.
// Rodar mais de uma vez no mesmo dia/mês não duplica nada (snapshot + regrava).
//
// Variáveis de ambiente:
//   MOVEL_LOGIN, MOVEL_PASSWORD — conta da plataforma (email + senha)
//   MOVEL_API_BASE — opcional, default https://movel.assinelm.com/api

const MOVEL_API_BASE_DEFAULT = "https://movel.assinelm.com/api";

// Valor de `origem` dos lançamentos gerados por esta importação. Os lançamentos
// desse período+origem são regravados a cada sync — nunca misturar com origem
// MANUAL/IMPORTADO, que são preservados.
export const ORIGEM_CHIP_MOVEL = "CHIP_MOVEL";

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

type VendaApi = {
  id: number;
  sellerId?: number | null;
  seller?: { id: number; name: string } | null;
  customer?: { name: string; document: string } | null;
  customerName?: string | null;
  document?: string | null;
  msisdn?: string | null;
  iccid?: string | null;
  planName?: string | null;
  finalPrice?: string | number | null;
  status?: string | null;
  soldAt?: string | null;
  activatedAt?: string | null;
  cancelledAt?: string | null;
  churnedAt?: string | null;
};

type SellerApi = {
  id: number;
  name: string;
  document?: string | null;
};

// Mesmo padrão do ensureRelatorioTable do sync-elleven: o build não roda
// `prisma migrate deploy`, então a tabela é criada sob demanda (idempotente).
let vendaChipTableEnsured = false;
export async function ensureVendaChipTable(): Promise<void> {
  if (vendaChipTableEnsured) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "venda_chip_movel" (
      "id" SERIAL NOT NULL,
      "vendaId" INTEGER NOT NULL,
      "periodo" TEXT NOT NULL,
      "sellerIdMovel" INTEGER,
      "sellerNome" TEXT,
      "sellerCpf" TEXT,
      "clienteNome" TEXT,
      "clienteCpf" TEXT,
      "msisdn" TEXT,
      "iccid" TEXT,
      "planoNome" TEXT,
      "planoPreco" TEXT,
      "status" TEXT,
      "soldAt" TEXT,
      "activatedAt" TEXT,
      "cancelledAt" TEXT,
      "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "venda_chip_movel_pkey" PRIMARY KEY ("id")
    );`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "venda_chip_movel_vendaId_key" ON "venda_chip_movel"("vendaId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "venda_chip_movel_periodo_idx" ON "venda_chip_movel"("periodo");`,
  );
  vendaChipTableEnsured = true;
}

// Venda cancelada/churn não conta como aprovada nem gera bônus — mesmo critério
// do elleven ("Status Contrato" cancelado).
function isCancelada(v: {
  status?: string | null;
  cancelledAt?: string | null;
  churnedAt?: string | null;
}): boolean {
  if (/cancel|churn/i.test(v.status || "")) return true;
  return Boolean(v.cancelledAt || v.churnedAt);
}

async function movelFetch(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<Response> {
  const base = process.env.MOVEL_API_BASE || MOVEL_API_BASE_DEFAULT;
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

async function movelLogin(): Promise<string> {
  const email = process.env.MOVEL_LOGIN;
  const senha = process.env.MOVEL_PASSWORD;
  if (!email || !senha) {
    throw new Error("MOVEL_LOGIN/MOVEL_PASSWORD não configurados nas env vars.");
  }
  const res = await movelFetch("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) {
    throw new Error(`Login no L&M Movel falhou (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Login no L&M Movel não retornou token.");
  return data.token;
}

async function fetchVendasDoMes(
  token: string,
  year: number,
  month: number,
  log: (s: string) => void,
): Promise<VendaApi[]> {
  const vendas: VendaApi[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await movelFetch(
      `/vendas/sales?year=${year}&month=${month}&page=${page}&limit=${PAGE_LIMIT}`,
      token,
    );
    if (!res.ok) {
      throw new Error(
        `GET /vendas/sales (page ${page}) falhou (HTTP ${res.status}).`,
      );
    }
    const body = (await res.json()) as {
      data?: VendaApi[];
      pagination?: { page: number; pages: number; total: number };
    };
    const lote = body.data ?? [];
    vendas.push(...lote);
    const pages = body.pagination?.pages ?? 1;
    if (page === 1) {
      log(
        `Mês ${String(month).padStart(2, "0")}/${year}: ${body.pagination?.total ?? lote.length} venda(s) em ${pages} página(s).`,
      );
    }
    if (page >= pages || lote.length === 0) break;
  }
  return vendas;
}

// Vendedores do L&M Movel (nome + CPF) — usados para resolver o CPF do
// vendedor de cada venda, já que a venda traz só seller.{id,name}. O endpoint
// pagina com limit default 20, por isso o loop até pagination.pages.
async function fetchVendedores(token: string): Promise<Map<number, SellerApi>> {
  const vendedores = new Map<number, SellerApi>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await movelFetch(
      `/vendedores?page=${page}&limit=${PAGE_LIMIT}`,
      token,
    );
    if (!res.ok) break;
    const body = (await res.json()) as {
      data?: SellerApi[];
      pagination?: { pages: number };
    };
    for (const s of body.data ?? []) vendedores.set(s.id, s);
    const pages = body.pagination?.pages ?? 1;
    if (page >= pages || (body.data ?? []).length === 0) break;
  }
  return vendedores;
}

export type LinhaChipMovel = {
  sellerNome: string;
  sellerCpf: string | null;
  funcionarioId: string | null;
  funcionarioNome: string | null;
  quantidade: number;
  aprovado: number;
  cancelado: number;
};

export type ResumoAplicacaoChip = {
  aplicado: boolean;
  motivo?: string;
  linhas: LinhaChipMovel[];
  lancamentosGravados: number;
  naoMapeados: string[];
};

// Agrega as vendas salvas do período por vendedor e casa com o cadastro.
async function agregarPorVendedor(periodo: string): Promise<LinhaChipMovel[]> {
  const [vendas, funcionarios] = await Promise.all([
    prisma.vendaChipMovel.findMany({ where: { periodo } }),
    prisma.funcionario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, cpf: true },
    }),
  ]);

  type Grupo = {
    sellerCpf: string | null;
    quantidade: number;
    aprovado: number;
    cancelado: number;
  };
  const porVendedor = new Map<string, Grupo>();
  for (const v of vendas) {
    const nome = (v.sellerNome || "").trim() || "(sem vendedor na venda)";
    const g =
      porVendedor.get(nome) ??
      ({ sellerCpf: null, quantidade: 0, aprovado: 0, cancelado: 0 } as Grupo);
    g.sellerCpf = g.sellerCpf || v.sellerCpf || null;
    g.quantidade++;
    if (isCancelada(v)) g.cancelado++;
    else g.aprovado++;
    porVendedor.set(nome, g);
  }

  const linhas: LinhaChipMovel[] = [];
  for (const [sellerNome, g] of porVendedor) {
    const match = matchFuncionario(funcionarios, {
      nome: sellerNome,
      cpf: g.sellerCpf,
    });
    linhas.push({
      sellerNome,
      sellerCpf: g.sellerCpf,
      funcionarioId: match?.id ?? null,
      funcionarioNome: match?.nome ?? null,
      quantidade: g.quantidade,
      aprovado: g.aprovado,
      cancelado: g.cancelado,
    });
  }
  linhas.sort((a, b) => b.quantidade - a.quantidade);
  return linhas;
}

// Preview para a tela de conferência (não grava nada).
export async function previewChipMovel(periodo: string) {
  await ensureVendaChipTable();
  const linhas = await agregarPorVendedor(periodo);
  const ultimaSync = await prisma.vendaChipMovel.aggregate({
    where: { periodo },
    _max: { syncedAt: true },
    _count: true,
  });
  return {
    linhas,
    totalVendas: ultimaSync._count,
    ultimaSync: ultimaSync._max.syncedAt,
  };
}

// Regrava os lançamentos CHIP_MOVEL do período a partir do snapshot e recalcula
// o fechamento. Mês FECHADO não é alterado.
export async function aplicarLancamentosChip(
  periodo: string,
): Promise<ResumoAplicacaoChip> {
  const linhas = await agregarPorVendedor(periodo);
  const naoMapeados = linhas
    .filter((l) => !l.funcionarioId)
    .map((l) => l.sellerNome);

  const fechamento = await prisma.fechamentoMensal.findUnique({
    where: { periodo },
  });
  if (fechamento?.status === "FECHADO") {
    return {
      aplicado: false,
      motivo: `Mês ${periodo} já está FECHADO — lançamentos não alterados.`,
      linhas,
      lancamentosGravados: 0,
      naoMapeados,
    };
  }

  const mapeadas = linhas.filter(
    (l): l is LinhaChipMovel & { funcionarioId: string } =>
      Boolean(l.funcionarioId),
  );

  await prisma.$transaction(async (tx) => {
    await tx.lancamentoVenda.deleteMany({
      where: { periodo, origem: ORIGEM_CHIP_MOVEL },
    });
    if (mapeadas.length > 0) {
      // Só a quantidade de chips gera bônus (meta 15 -> R$5/venda); valores
      // monetários ficam zerados de propósito — o preço do plano é receita
      // recorrente, não "valor instalado", e não pode vazar para a regra de
      // 50% de demais serviços do Atendimento/ADM.
      await tx.lancamentoVenda.createMany({
        data: mapeadas.map((l) => ({
          funcionarioId: l.funcionarioId,
          periodo,
          quantidade: l.quantidade,
          aprovado: l.aprovado,
          cancelado: l.cancelado,
          qtdChip: l.aprovado,
          origem: ORIGEM_CHIP_MOVEL,
        })),
      });
    }
  });

  await recalcularFechamento(periodo);

  return {
    aplicado: true,
    linhas,
    lancamentosGravados: mapeadas.length,
    naoMapeados,
  };
}

export type ResultadoSyncChip = {
  ok: boolean;
  periodo: string;
  vendasSalvas: number;
  aplicacao: ResumoAplicacaoChip | null;
  log: string[];
};

// Sincroniza um mês: busca as vendas na API, regrava o snapshot do período e
// aplica os lançamentos. Usado pelo cron diário e pelo botão "Sincronizar
// agora" da tela de conferência.
export async function syncChipMovel(
  year: number,
  month: number,
): Promise<ResultadoSyncChip> {
  const periodo = `${year}-${String(month).padStart(2, "0")}`;
  const log: string[] = [];
  const step = (s: string) => {
    const line = `[${new Date().toISOString()}] ${s}`;
    log.push(line);
    console.log(line);
  };

  await ensureVendaChipTable();

  step("Autenticando na API do L&M Movel...");
  const token = await movelLogin();

  step(`Buscando vendas de ${periodo}...`);
  const [vendas, vendedores] = await Promise.all([
    fetchVendasDoMes(token, year, month, step),
    fetchVendedores(token),
  ]);

  const registros = vendas.map((v) => {
    const seller = v.sellerId != null ? vendedores.get(v.sellerId) : undefined;
    return {
      vendaId: v.id,
      periodo,
      sellerIdMovel: v.sellerId ?? v.seller?.id ?? null,
      sellerNome: v.seller?.name ?? seller?.name ?? null,
      sellerCpf: somenteDigitos(seller?.document) || null,
      clienteNome: v.customer?.name ?? v.customerName ?? null,
      clienteCpf: somenteDigitos(v.customer?.document ?? v.document) || null,
      msisdn: v.msisdn ?? null,
      iccid: v.iccid ?? null,
      planoNome: v.planName ?? null,
      planoPreco: v.finalPrice != null ? String(v.finalPrice) : null,
      status: v.status ?? null,
      soldAt: v.soldAt ?? null,
      activatedAt: v.activatedAt ?? null,
      cancelledAt: v.cancelledAt ?? v.churnedAt ?? null,
    };
  });

  // Snapshot do período: remove tanto o período quanto quaisquer vendaIds que
  // tenham mudado de mês desde o último sync, depois regrava tudo de uma vez.
  await prisma.$transaction(async (tx) => {
    await tx.vendaChipMovel.deleteMany({
      where: {
        OR: [
          { periodo },
          { vendaId: { in: registros.map((r) => r.vendaId) } },
        ],
      },
    });
    if (registros.length > 0) {
      await tx.vendaChipMovel.createMany({
        data: registros,
        skipDuplicates: true,
      });
    }
  });
  step(`${registros.length} venda(s) salvas no snapshot de ${periodo}.`);

  step("Aplicando lançamentos de chip...");
  const aplicacao = await aplicarLancamentosChip(periodo);
  if (aplicacao.aplicado) {
    step(
      `${aplicacao.lancamentosGravados} lançamento(s) gravados; ${aplicacao.naoMapeados.length} vendedor(es) não mapeado(s).`,
    );
  } else {
    step(aplicacao.motivo || "Aplicação não realizada.");
  }
  if (aplicacao.naoMapeados.length > 0) {
    step(`Não mapeados: ${aplicacao.naoMapeados.join(", ")}`);
  }

  return {
    ok: true,
    periodo,
    vendasSalvas: registros.length,
    aplicacao,
    log,
  };
}
