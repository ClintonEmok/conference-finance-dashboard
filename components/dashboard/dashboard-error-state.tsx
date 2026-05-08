"use client"

import { AlertTriangle, RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

type DashboardErrorStateProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export function DashboardErrorState({
  error,
  reset,
}: DashboardErrorStateProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground">
            This section could not be loaded. You can try again or navigate to a
            different section from the sidebar.
          </p>
        </div>

        {error?.message && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-destructive/70 uppercase">
              Error detail
            </p>
            <p className="mt-1 text-xs break-words text-destructive/90">
              {error.message}
            </p>
          </div>
        )}

        <Button
          onClick={reset}
          className="gap-2 rounded-lg bg-[linear-gradient(135deg,#7154ff,#5238aa)] text-white shadow-lg shadow-primary/20 hover:opacity-90"
        >
          <RefreshCcw className="size-4" />
          Try again
        </Button>
      </div>
    </div>
  )
}
