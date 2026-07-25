"use client";

import { useActionState, type ReactNode } from "react";
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
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
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
    <Campo label={label} className={className}>
      <Input name={name} defaultValue={defaultValue ?? ""} {...props} />
    </Campo>
  );
}

export function CampoData({
  name,
  label,
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: Date | null;
  className?: string;
}) {
  return (
    <Campo label={label} className={className}>
      <Input type="date" name={name} defaultValue={paraInputDate(defaultValue)} />
    </Campo>
  );
}

const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

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
    <Campo label={label} className={className}>
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
  const [state, formAction, isPending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const resultado = await action(prev, formData);
      if (resultado.ok) {
        toast.success(mensagemSucesso);
        onSuccess?.();
      }
      return resultado;
    },
    estadoInicial,
  );

  return (
    <form action={formAction} className={cn("space-y-4", className)}>
      {children}
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end">
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
