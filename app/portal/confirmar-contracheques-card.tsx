"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, FileText, ReceiptText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmarContrachequePortal } from "@/lib/actions/portal-contracheques";
import { reduzirFoto } from "./selfie";

export type ContrachequeAConfirmar = {
  id: string;
  rotulo: string;
  /** Já abriu antes (em outra visita): pode confirmar direto. */
  aberto: boolean;
};

/**
 * "Confirme o recebimento do seu contracheque" — no TOPO do portal, como o
 * cartão de entregas: é ação com prazo, não consulta.
 *
 * Dois passos, nesta ordem: abrir o contracheque (a rota marca que abriu) e
 * confirmar com uma selfie — o "recebi" assinado, com a mesma câmera da batida
 * de ponto. O servidor recusa confirmar sem ter aberto.
 */
export function ConfirmarContrachequesCard({ contracheques }: { contracheques: ContrachequeAConfirmar[] }) {
  const router = useRouter();
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(contracheques.filter((c) => c.aberto).map((c) => c.id)));
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const alvo = useRef<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  if (contracheques.length === 0) return null;

  const tirarFoto = (id: string) => {
    alvo.current = id;
    setErro(null);
    inputFoto.current?.click();
  };

  async function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    const id = alvo.current;
    if (!arquivo || !id) return;
    setEnviando(id);
    const foto = await reduzirFoto(arquivo);
    if (!foto) {
      setEnviando(null);
      setErro("Não consegui ler a foto. Tente tirar de novo.");
      return;
    }
    const r = await confirmarContrachequePortal(id, foto);
    setEnviando(null);
    if (r.ok) {
      toast.success("Recebimento confirmado. Obrigado!");
      router.refresh();
    } else setErro(r.error);
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="size-4 text-primary" />
          {contracheques.length === 1 ? "Confirme o recebimento do seu contracheque" : `Confirme ${contracheques.length} contracheques`}
        </CardTitle>
        <CardDescription className="text-xs">
          Abra o contracheque, confira e confirme com uma foto sua, como na batida de ponto. Se algo estiver errado, fale com
          o RH antes de confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Câmera frontal do próprio aparelho, sem getUserMedia — a mesma do ponto. */}
        <input ref={inputFoto} type="file" accept="image/*" capture="user" className="hidden" onChange={aoEscolherFoto} />
        {erro && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{erro}</p>}
        {contracheques.map((c) => {
          const jaAbriu = abertos.has(c.id);
          return (
            <div key={c.id} className="space-y-2 rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Contracheque de {c.rotulo}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={jaAbriu ? "outline" : "default"}
                  size="sm"
                  nativeButton={false}
                  render={<a href={`/api/portal/contracheques/${c.id}`} target="_blank" rel="noreferrer" />}
                  onClick={() => setAbertos((s) => new Set(s).add(c.id))}
                >
                  <FileText className="size-4" aria-hidden /> {jaAbriu ? "Abrir de novo" : "1. Abrir o contracheque"}
                </Button>
                <Button size="sm" disabled={!jaAbriu || enviando !== null} onClick={() => tirarFoto(c.id)}>
                  <Camera className="size-4" aria-hidden /> {enviando === c.id ? "Confirmando..." : "2. Confirmar com foto"}
                </Button>
              </div>
              {!jaAbriu && <p className="text-xs text-muted-foreground">Abra o contracheque primeiro — a confirmação libera depois.</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
