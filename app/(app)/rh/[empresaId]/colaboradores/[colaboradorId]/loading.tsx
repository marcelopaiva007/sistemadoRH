import { Skeleton } from "@/components/ui/skeleton";

// A ficha é a tela mais pesada do sistema (dezenas de consultas para montar
// todas as abas), então é a que mais precisa de um esqueleto próprio — o
// genérico da empresa não tem a forma de ficha e o "pulo" no fim incomodaria.
export default function CarregandoFicha() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando ficha">
      <Skeleton className="h-4 w-32" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-7 w-24" />
        ))}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
