import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import { EntregasView } from "./entregas-view";

/**
 * Entregas ao colaborador — o que a empresa deu, e quem confirmou ter recebido.
 *
 * A pergunta que esta tela responde e nenhuma outra respondia: "quem ainda não
 * confirmou?". O checklist de admissão tem "Entrega do notebook" como tarefa
 * do RH; a ficha de EPI é da NR-06. Nenhum dos dois diz o que a pessoa tem
 * hoje nem traz confirmação vinda dela.
 */

// O registro em lote manda um aviso de Telegram POR PESSOA, em série (ver
// registrarEntregas) — mesmo laço e mesmo teto da cobrança de cadastro na
// ficha. Sem isto, um lote de 171 morre no timeout padrão da plataforma com
// metade dos avisos enviada.
export const maxDuration = 300;

export default async function EntregasPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const visiveis = await empresasVisiveis(usuario);

  const [entregas, colaboradores, tipos, empresa] = await Promise.all([
    // Escopo por empresasVisiveis, não pela empresa da rota: a lista de
    // colaboradores da tela mistura CNPJs da marca, e uma entrega registrada
    // para alguém de outro CNPJ do grupo precisa aparecer para quem a fez.
    prisma.entregaAoColaborador.findMany({
      where: { empresaId: { in: visiveis } },
      orderBy: [{ confirmadoEm: "asc" }, { dataEntrega: "desc" }],
      select: {
        id: true, tipo: true, descricao: true, dataEntrega: true,
        confirmadoEm: true, devolvidoEm: true, entreguePorNome: true, observacoes: true,
        colaborador: { select: { id: true, nome: true, setor: { select: { nome: true } } } },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId: { in: visiveis }, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, setor: { select: { nome: true } } },
    }),
    opcoesDoCatalogo(empresaId, "TIPO_ENTREGA"),
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } }),
  ]);

  return (
    <div className="space-y-4">
      {/* O "Como usar esta tela" não é montado aqui: o layout do módulo
          (app/(app)/rh/[empresaId]/layout.tsx) acha o roteiro pela rota em
          lib/guias.ts — a entrada de slug "entregas" já está lá. */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Entregas ao colaborador</h1>
        <p className="text-sm text-muted-foreground">
          {empresa?.nome ?? "Empresa"} · cartão de benefícios, notebook, uniforme e o que mais a
          empresa entregar
        </p>
      </div>

      <EntregasView
        empresaId={empresaId}
        entregas={entregas}
        colaboradores={colaboradores}
        tipos={tipos.map((t) => ({ value: t.value, label: t.label }))}
      />
    </div>
  );
}
