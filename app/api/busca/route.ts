// Pessoas para a busca global (Ctrl K) da barra de topo.
//
// ESCOPO: `empresasVisiveis(user)` — o mesmo recorte que decide quais CNPJs a
// pessoa enxerga em toda a área logada. Só colaboradores ATIVOS, no máximo
// 20, e o CPF vai MASCARADO: a lista é para achar a ficha, não para ler o
// documento. GESTOR_SETOR não navega em /rh/<empresa>/colaboradores — para
// ele a busca devolve só telas (o componente nem chama esta rota).
//
// `q` com menos de 2 caracteres devolve vazio sem consultar: uma letra
// casaria com a base inteira.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
import { prisma } from "@/lib/prisma";
import { mascararCpf } from "@/lib/cpf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role === "GESTOR_SETOR") return NextResponse.json({ pessoas: [] });
  // Enforcement de MÓDULO, não só de CNPJ: um perfil que só alcança Processos
  // & Ativos não abre /rh/<empresa>/colaboradores — e por isso também não
  // pode receber a lista de pessoas por aqui. Achado da revisão adversarial
  // do PR (03/09/2026): a rota checava empresasVisiveis e esquecia o sistema.
  const sistemas = await sistemasPermitidos(user);
  if (!sistemas.includes("rh")) return NextResponse.json({ pessoas: [] });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ pessoas: [] });

  const visiveis = await empresasVisiveis(user);
  if (visiveis.length === 0) return NextResponse.json({ pessoas: [] });

  const pessoas = await prisma.colaborador.findMany({
    where: { empresaId: { in: visiveis }, ativo: true, nome: { contains: q, mode: "insensitive" } },
    orderBy: { nome: "asc" },
    take: 20,
    select: {
      id: true,
      nome: true,
      cpf: true,
      empresaId: true,
      setor: { select: { nome: true } },
      empresa: { select: { nome: true } },
    },
  });

  return NextResponse.json({
    pessoas: pessoas.map((p) => ({
      id: p.id,
      nome: p.nome,
      cpf: mascararCpf(p.cpf),
      setor: p.setor.nome,
      empresa: p.empresa.nome,
      // A ficha é escopada à empresa DA PESSOA, não à da rota.
      href: `/rh/${p.empresaId}/colaboradores/${p.id}`,
    })),
  });
}
