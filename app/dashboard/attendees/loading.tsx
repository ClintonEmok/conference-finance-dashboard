import { Skeleton } from "@/components/ui/skeleton"

export default function AttendeesLoading() {
  return (
    <section className="space-y-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-52" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </header>

      <div className="flex gap-3">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-border/20 text-left text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Attendee</th>
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Room</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3">
                  <Skeleton className="mb-1.5 h-3 w-24" />
                  <Skeleton className="h-2 w-32" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3 w-28" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3 w-20" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="mb-1.5 h-3 w-16" />
                  <Skeleton className="h-2 w-20" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-14 rounded-full" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
