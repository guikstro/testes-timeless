import { LinhaDeConversaEsqueleto, Skeleton } from "@/components/ui/skeleton";

/**
 * A caixa de entrada tem silhueta própria, três colunas de borda a borda, e o
 * esqueleto genérico do app faria a tela saltar quando o conteúdo chegasse.
 */
export default function CarregandoCaixa() {
  return (
    <div className="grid h-[calc(100dvh-var(--faixa-do-topo))] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="border-r border-line/70 bg-panel">
        <div className="space-y-2.5 border-b border-line/60 p-3">
          <Skeleton className="h-9 w-full rounded-full" />
          <Skeleton className="h-9 w-full rounded-full" />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <LinhaDeConversaEsqueleto key={i} />
        ))}
      </div>

      <div className="hidden flex-col bg-canvas md:flex">
        <div className="flex items-center gap-2.5 border-b border-line/60 bg-panel/60 px-4 py-2.5">
          <div className="flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-1.5 h-3 w-44" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex-1 space-y-3 p-4">
          <Skeleton className="h-14 w-[70%] rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-[60%] rounded-2xl" />
          <Skeleton className="h-10 w-[55%] rounded-2xl" />
          <Skeleton className="ml-auto h-16 w-[68%] rounded-2xl" />
        </div>
        <div className="border-t border-line/60 bg-panel/60 px-4 py-3">
          <Skeleton className="h-11 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
