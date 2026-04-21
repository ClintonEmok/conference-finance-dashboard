export default function DashboardLoading() {
  return (
    <section className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(113,84,255,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,247,255,0.92))] px-6 py-10 dark:bg-[radial-gradient(circle_at_top,rgba(113,84,255,0.18),transparent_34%),linear-gradient(180deg,rgba(9,9,12,0.95),rgba(12,12,16,0.96))]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="w-full max-w-2xl rounded-[2rem] border border-white/70 bg-white/60 p-8 shadow-[0_24px_80px_rgba(113,84,255,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.24em] text-muted-foreground uppercase">
                Switching scope
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                Loading your event workspace
              </h1>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="h-3 w-2/3 rounded-full bg-muted/60" />
            <div className="h-3 w-5/6 rounded-full bg-muted/50" />
            <div className="h-3 w-1/2 rounded-full bg-muted/40" />
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-dashed border-border/50 bg-background/50 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
