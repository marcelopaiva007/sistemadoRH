"use server";

// Portal — confirmar o recebimento do contracheque com foto. A regra vive em
// lib/contracheques/confirmar.ts; aqui só a sessão e a origem da requisição.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { ipDaRequisicao } from "@/lib/login-tentativas";
import { confirmarRecebimento } from "@/lib/contracheques/confirmar";

export async function confirmarContrachequePortal(
  reciboId: string,
  fotoBase64: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sessão expirada. Peça um novo link com /portal no Telegram." };
  if (!sessao.verificado) return { ok: false, error: "Confirme seu CPF no portal antes." };
  const h = await headers();
  const r = await confirmarRecebimento({
    reciboId,
    colaboradorId: sessao.colaboradorId,
    fotoDataUrl: fotoBase64,
    // Mesma leitura de IP do login e do ponto (não confia no que o cliente manda).
    ip: ipDaRequisicao(h),
    dispositivo: h.get("user-agent"),
  });
  if (r.ok) revalidatePath("/portal");
  return r;
}
