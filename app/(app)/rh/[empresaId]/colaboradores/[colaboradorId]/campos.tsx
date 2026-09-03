"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { paraInputDate } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

// Peças de formulário compartilhadas pelos blocos da ficha e pelos diálogos do
// DP. Tudo aqui é HTML nativo com `name` — os formulários postam FormData
// direto para a server action, sem estado controlado.

export const estadoInicial: ActionResult = { ok: true };

export function Campo({
  label,
  children,
  className,
  required,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Asterisco no rótulo. O `required` do input continua sendo o que valida. */
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label required={required} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function CampoTexto({
  name,
  label,
  defaultValue,
  className,
  ...props
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "defaultValue">) {
  return (
    <Campo label={label} className={className} required={props.required}>
      <Input name={name} defaultValue={defaultValue ?? ""} {...props} />
    </Campo>
  );
}

export function CampoData({
  name,
  label,
  defaultValue,
  className,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: Date | null;
  className?: string;
  required?: boolean;
}) {
  return (
    <Campo label={label} className={className} required={required}>
      <Input type="date" name={name} defaultValue={paraInputDate(defaultValue)} required={required} />
    </Campo>
  );
}

const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CampoSelect({
  name,
  label,
  opcoes,
  defaultValue,
  placeholder = "—",
  required,
  className,
}: {
  name: string;
  label: string;
  opcoes: readonly { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Campo label={label} className={className} required={required}>
      <select name={name} defaultValue={defaultValue ?? ""} required={required} className={classeSelect}>
        <option value="">{placeholder}</option>
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Campo>
  );
}

export function CampoCheckbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {/* value="true" para a action ler `formData.get(name) === "true"` — um
          checkbox desmarcado simplesmente não vai no FormData. */}
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="size-4 rounded border-input accent-primary"
      />
      <span className="font-normal">{label}</span>
    </label>
  );
}

/**
 * Formulário que envia para uma server action, com estado de erro e toast de
 * sucesso. Usado por todos os blocos da ficha e pelos diálogos do DP.
 *
 * A ficha é dividida em vários blocos, cada um com o seu próprio "Salvar" —
 * de propósito, para um bloco nunca apagar o que outro preencheu (ver o
 * comentário no topo de lib/actions/rh-ficha.ts). O preço disso é que dá para
 * editar um bloco, olhar outro, e sair da tela achando que salvou tudo: o
 * toast de sucesso é verdadeiro, só que é do bloco errado. `dirty` rastreia
 * se ESTE formulário tem algo digitado que ainda não foi para o servidor, e
 * avisa antes que a pessoa recarregue ou feche a aba sem ver o aviso.
 */
export function FormularioAction({
  action,
  children,
  textoBotao = "Salvar",
  mensagemSucesso = "Salvo.",
  onSuccess,
  className,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  textoBotao?: string;
  mensagemSucesso?: string;
  onSuccess?: () => void;
  className?: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const resultado = await action(prev, formData);
      if (resultado.ok) {
        toast.success(mensagemSucesso);
        setDirty(false);
        onSuccess?.();
      }
      return resultado;
    },
    estadoInicial,
  );

  // Fecha a aba/recarrega com este bloco editado e não salvo: o navegador
  // pergunta antes de descartar. Sem isso, o F5 do relato original apaga
  // silenciosamente o que só existia no formulário.
  useEffect(() => {
    if (!dirty) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [dirty]);

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      className={cn("space-y-4", className)}
    >
      {children}
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-3">
        {dirty && !isPending ? (
          <span className="text-xs text-muted-foreground">Alterações não salvas neste bloco.</span>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : textoBotao}
        </Button>
      </div>
    </form>
  );
}

/** Par rótulo/valor para as visões só de leitura. */
export function Dado({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{valor ?? "—"}</div>
    </div>
  );
}
