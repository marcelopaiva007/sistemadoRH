import { Skeleton } from "@/components/ui/skeleton";

// Sem este arquivo o App Router segura a tela ANTERIOR congelada até o
// servidor responder — nada indica que o clique foi registrado, e uma
// navegação de 300 ms passa a impressão de sistema travado. Este esqueleto
// aparece na hora, dentro do menu lateral, que não recarrega.
export default function CarregandoPaginaDaEmpresa() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
        <div className="space-y-2 pt-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
