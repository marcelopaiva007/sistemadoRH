// Endpoint TEMPORÁRIO de diagnóstico do módulo Vendas de Chip.
//
// Uma Route Handler NÃO tem a redação de erro que o Next aplica em Server
// Components/Actions, então aqui capturamos e devolvemos a mensagem REAL (name,
// message, stack, code do Prisma, digest) como JSON legível. Protegido por um
// token simples via ?k=. Remover assim que a causa raiz for identificada.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { previewChipMovel } from "@/lib/chip-movel";
import { periodoAtual } from "@/lib/periodo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "lmdiag2026";

function fmt(e: unknown) {
  if (e instanceof Error) {
    const anyE = e as Error & { digest?: unknown; code?: unknown; meta?: unknown };
    return {
      name: e.name,
      message: e.message,
      code: anyE.code ?? null,
      meta: anyE.meta ?? null,
      digest: anyE.digest ?? null,
      stack: (e.stack || "").split("\n").slice(0, 8),
    };
  }
  return { value: String(e) };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("k") !== TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const out: Record<string, unknown> = {};

  // 1) Autenticação
  try {
    const s = await auth();
    out.auth = {
      ok: true,
      hasUser: !!s?.user,
      role: (s?.user as { role?: string } | undefined)?.role ?? null,
    };
  } catch (e) {
    out.auth = { ok: false, ...fmt(e) };
  }

  // 2) requireUser (captura redirect via digest)
  try {
    const { requireUser } = await import("@/lib/auth-guard");
    const u = await requireUser();
    out.requireUser = { ok: true, role: (u as { role?: string }).role ?? null };
  } catch (e) {
    out.requireUser = { ok: false, ...fmt(e) };
  }

  // 3) requireAdmin (captura redirect via digest)
  try {
    const { requireAdmin } = await import("@/lib/auth-guard");
    const u = await requireAdmin();
    out.requireAdmin = { ok: true, role: (u as { role?: string }).role ?? null };
  } catch (e) {
    out.requireAdmin = { ok: false, ...fmt(e) };
  }

  // 4) Preview (o que a tela chama e falha)
  try {
    const periodo = periodoAtual();
    const r = await previewChipMovel(periodo);
    out.preview = {
      ok: true,
      periodo,
      totalVendas: r.totalVendas,
      linhas: r.linhas.length,
    };
  } catch (e) {
    out.preview = { ok: false, ...fmt(e) };
  }

  return NextResponse.json(out, { status: 200 });
}
