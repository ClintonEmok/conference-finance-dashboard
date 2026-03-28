import { Skeleton } from "@/components/ui/skeleton"

export default function FinancialLoading() {
  return (
    <section className="space-y-6">
      <header className="mb-4">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-52" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-8 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
