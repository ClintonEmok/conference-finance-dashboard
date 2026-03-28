import { Skeleton } from "@/components/ui/skeleton"

export default function AttendeeDetailLoading() {
  return (
    <section className="space-y-6">
      <header className="mb-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-52" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
            <Skeleton className="mb-4 h-4 w-28" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
