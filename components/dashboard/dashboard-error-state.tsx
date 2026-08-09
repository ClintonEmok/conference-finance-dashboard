"use client"

import { AlertTriangle } from "lucide-react"

import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"

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

        <DashboardQueryState
          state="error"
          title="Something went wrong"
          message="This section could not be loaded. You can try again or navigate to a different section from the sidebar."
          onRetry={reset}
        />

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

      </div>
    </div>
  )
}
