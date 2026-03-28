import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <section className="space-y-6">
      <header className="mb-4">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-64" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[rgba(113,84,255,0.4)] bg-[linear-gradient(145deg,rgba(113,84,255,0.92),rgba(83,56,171,0.88))] p-5 shadow-[0_12px_32px_rgba(78,52,166,0.14)]"
          >
            <Skeleton className="h-3 w-16 bg-white/20" />
            <Skeleton className="mt-3 h-8 w-24 bg-white/30" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 pb-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border/20 text-left text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 text-right font-semibold">Orders</th>
                  <th className="px-4 py-3 text-right font-semibold">Gross</th>
                  <th className="px-4 py-3 text-right font-semibold">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-3 w-24" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="ml-auto h-3 w-8" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="ml-auto h-3 w-16" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="ml-auto h-3 w-16" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <Skeleton className="h-3 w-24" />
            <div className="mt-3 space-y-4 rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="mb-2 flex items-center justify-between">
                    <Skeleton className="h-2.5 w-12" />
                    <Skeleton className="h-2.5 w-8" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Skeleton className="h-3 w-28" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/40 p-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"
                >
                  <Skeleton className="size-7 shrink-0 rounded-md" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
