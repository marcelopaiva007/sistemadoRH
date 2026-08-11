"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createCatalogoItem,
  deleteCatalogoItem,
  toggleCatalogoItemAtivo,
} from "@/lib/actions/rh-catalogos";
import type { ActionResult } from "@/lib/constants";

type ItemCustom = {
  id: string;
  nome: string;
  cor: string | null;
  validadeMeses: number | null;
  ativo: boolean;
};
type Categoria = {
  chave: string;
  label: string;
  padroes: readonly { value: string; label: string }[];
  temCor: boolean;
  temValidade: boolean;
  itens: ItemCustom[];
};

const initialState: ActionResult = { ok: true };

export function CatalogosView({ empresaId, categorias }: { empresaId: string; categorias: Categoria[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Catálogos</h2>
        <p className="text-sm text-muted-foreground">
          9 listas usadas em telas de todo o sistema. O catálogo padrão de cada uma continua
          disponível sempre — aqui é só pra somar itens próprios desta empresa.
        </p>
      </div>

      <Tabs defaultValue={categorias[0]?.chave}>
        <TabsList variant="line" className="flex-wrap">
          {categorias.map((c) => (
            <TabsTrigger key={c.chave} value={c.chave}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {categorias.map((c) => (
          <TabsContent key={c.chave} value={c.chave} className="pt-4">
            <CategoriaCard empresaId={empresaId} categoria={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CategoriaCard({ empresaId, categoria }: { empresaId: string; categoria: Categoria }) {
  const [state, formAction, isPending] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const r = await createCatalogoItem(empresaId, categoria.chave, prev, fd);
      if (r.ok) toast.success("Item adicionado.");
      return r;
    },
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{categoria.label}</CardTitle>
        <CardDescription>
          Padrão: {categoria.padroes.map((p) => p.label).join(", ")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {categoria.itens.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categoria.itens.map((item) => (
              <Badge
                key={item.id}
                variant={item.ativo ? "secondary" : "outline"}
                className={`gap-1.5 py-1 pr-1 pl-2.5 text-sm ${!item.ativo ? "text-muted-foreground line-through" : ""}`}
              >
                {categoria.temCor && item.cor && (
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: item.cor }} />
                )}
                {item.nome}
                {categoria.temValidade && item.validadeMeses && (
                  <span className="text-xs text-muted-foreground">({item.validadeMeses}m)</span>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const r = await toggleCatalogoItemAtivo(empresaId, item.id, !item.ativo);
                    if (r.ok) toast.success(item.ativo ? "Pausado." : "Ativado.");
                  }}
                  className="rounded px-1 text-xs no-underline hover:bg-muted-foreground/20"
                >
                  {item.ativo ? "pausar" : "ativar"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await deleteCatalogoItem(empresaId, item.id);
                    if (r.ok) toast.success("Removido.");
                    else toast.error(r.error);
                  }}
                  className="rounded p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Novo item</label>
            <Input name="nome" placeholder="Nome" required className="min-w-40" disabled={isPending} />
          </div>
          {categoria.temCor && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cor</label>
              <input
                type="color"
                name="cor"
                defaultValue="#2563eb"
                className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
            </div>
          )}
          {categoria.temValidade && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Validade (meses)</label>
              <Input name="validadeMeses" type="number" min={1} placeholder="Ex.: 12" className="w-28" disabled={isPending} />
            </div>
          )}
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            <Plus className="size-3.5" />
            Adicionar
          </Button>
        </form>
        {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
