import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { ehDirecao } from "@/lib/delegacoes/consultas";
import { DelegacoesNav } from "./delegacoes-nav";

/**
 * Casca do módulo Delegações — o molde de
 * `app/(app)/processos/[empresaId]/layout.tsx`, sem o que é de CNPJ.
 *
 * O que NÃO está aqui, e por quê: não há `params`/`empresaId`, nem consulta da
 * empresa, nem a logo da marca no topo da lateral, nem o override de
 * `--primary` com a cor da marca. Os três existem lá porque quem está em
 * `/rh/<empresa>` ou `/processos/<empresa>` está DENTRO de uma marca, e o
 * sistema se pinta com a cor dela. Uma demanda atravessa o grupo — pintar a
 * tela com a cor de uma marca só seria dizer que ela pertence àquela marca.
 *
 * A guarda é chamada aqui E em cada page/action: layout não é guarda de API.
 */
export default async function DelegacoesLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireDelegacoesAccess();
  // O item "Painel" (Direção) só aparece para quem `ehDirecao` — a mesma
  // pergunta que já recorta o `where` das consultas (§10 da ordem: "direcao
  // vê tudo"). Esconder do menu não é a guarda — a página tem a dela própria.
  const souDirecao = ehDirecao(usuario);

  return (
    <div className="flex gap-6">
      <aside className="sticky top-[52px] hidden h-[calc(100vh-52px)] w-[216px] shrink-0 overflow-y-auto border-r-2 border-border pr-4 pt-3 md:block">
        <DelegacoesNav souDirecao={souDirecao} />
      </aside>

      <div className="min-w-0 flex-1 py-2">
        <div className="mb-4 overflow-x-auto md:hidden">
          <DelegacoesNav souDirecao={souDirecao} />
        </div>
        {children}
      </div>
    </div>
  );
}
