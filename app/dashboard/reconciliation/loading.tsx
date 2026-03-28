import { Skeleton } from "@/components/ui/skeleton"

export default function ReconciliationLoading() {
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
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-border/20 text-left text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Attendee</th>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 text-right font-semibold">Expected</th>
              <th className="px-4 py-3 text-right font-semibold">Received</th>
              <th className="px-4 py-3 text-right font-semibold">
                Outstanding
              </th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3">
                  <Skeleton className="mb-1.5 h-3 w-24" />
                  <Skeleton className="h-2 w-28" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3 w-20" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Skeleton className="ml-auto h-3 w-14" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Skeleton className="ml-auto h-3 w-14" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Skeleton className="ml-auto h-3 w-14" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-7 w-16 rounded-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
