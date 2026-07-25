"use client";

import { usePathname, useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

/**
 * Troca de empresa sem sair da tela em que se está.
 *
 * A empresa continua na URL (isolamento explícito, link compartilhável), então
 * trocar é reescrever o segmento: quem está em Colaboradores da LM Telecom cai
 * em Colaboradores da Centrysol, não na raiz. Sub-rota some de propósito — o
 * id de um colaborador da empresa A não existe na B.
 */
export function SeletorEmpresa({
  empresaId,
  empresas,
}: {
  empresaId: string;
  empresas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Uma empresa só: não vira seletor, vira rótulo.
  if (empresas.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="size-4 text-muted-foreground" />
        {empresas[0]?.nome ?? ""}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="size-4 shrink-0 text-muted-foreground" />
      <select
        value={empresaId}
        onChange={(e) => {
          const novo = e.target.value;
          const resto = pathname.replace(`/rh/${empresaId}`, "").split("/").filter(Boolean);
          // Só o primeiro segmento sobrevive à troca (a seção), nunca o id de
          // um registro — ele pertence à empresa que ficou para trás.
          const secao = resto[0] ?? "";
          router.push(`/rh/${novo}${secao ? `/${secao}` : ""}`);
        }}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm font-medium outline-none focus-visible:border-ring dark:bg-input/30"
      >
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
