import { Skeleton } from "@/components/ui/skeleton"

export default function SignupLoading() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-10 rounded-full" />
          <Skeleton className="h-10 rounded-full" />
          <Skeleton className="h-10 rounded-full" />
        </div>
      </div>
    </main>
  )
}
