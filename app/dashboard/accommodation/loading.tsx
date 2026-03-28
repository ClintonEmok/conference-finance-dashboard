import { Skeleton } from "@/components/ui/skeleton"

export default function AccommodationLoading() {
  return (
    <section className="space-y-6">
      <header className="mb-4">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-2 h-4 w-56" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-2.5 w-28" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/60 bg-white/40 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="size-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
