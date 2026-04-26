import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(121,86,255,0.24),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.1),_transparent_24%),linear-gradient(180deg,_#09090c_0%,_#111116_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.06),transparent_28%,transparent_72%,rgba(255,255,255,0.03))] opacity-70" />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl items-center px-6 py-10 sm:px-8 lg:px-10">
        <div className="w-full rounded-[1.75rem] border border-white/14 bg-white/[0.07] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-8">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white shadow-inner shadow-black/20">
              <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.24em] text-white/55 uppercase">
                Switching scope
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                Loading the next event
              </h1>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="relative overflow-hidden rounded-[1.75rem] border border-white/14 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl"
              >
                <div className="space-y-5">
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-24 rounded-full bg-white/10" />
                    <Skeleton className="h-8 w-44 rounded-2xl bg-white/10" />
                    <Skeleton className="h-4 w-32 rounded-full bg-white/10" />
                  </div>
                  <Skeleton className="h-4 w-full rounded-full bg-white/10" />
                  <Skeleton className="h-4 w-5/6 rounded-full bg-white/10" />
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <Skeleton className="h-4 w-28 rounded-full bg-white/10" />
                  <Skeleton className="h-4 w-16 rounded-full bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
