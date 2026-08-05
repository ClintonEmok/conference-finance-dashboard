import { Skeleton } from "@/components/ui/skeleton"

export default function AccommodationLoading() {
  return (
    <main className="min-w-0 space-y-5">
      <div className="space-y-3 border-b border-border/60 pb-5">
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-border/60 p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3 border-b border-border/60 pb-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card p-6">
            <Skeleton className="h-6 w-44" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-6">
            <Skeleton className="h-6 w-40" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
