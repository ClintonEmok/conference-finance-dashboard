"use client"

import { AlertTriangle, RefreshCcw } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-black text-foreground antialiased">
        <div className="w-full max-w-md space-y-6 px-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Application error
            </h1>
            <p className="text-sm text-muted-foreground">
              The app ran into an unexpected problem. Try refreshing the page.
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

          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-[linear-gradient(135deg,#7154ff,#5238aa)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-opacity hover:opacity-90"
          >
            <RefreshCcw className="size-4" />
            Reload app
          </button>
        </div>
      </body>
    </html>
  )
}
