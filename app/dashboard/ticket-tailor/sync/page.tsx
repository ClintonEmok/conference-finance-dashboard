"use client"

import { FormEvent, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type SyncResult = {
  ok: true
  runId: string
  status: string
  scope: {
    eventId: string | null
    from: string | null
    to: string | null
  }
  counts: {
    eventsScanned: number
    ordersFetched: number
    ordersUpserted: number
    ordersSkippedByScope: number
    normalizedFallbackCount: number
    failedItems: number
  }
  diagnostics: {
    fallbackNotes: string[]
    errors: string[]
  }
}

type SyncError = {
  error: {
    code: string
    message: string
  }
}

function toIsoOrNull(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function formatScopeDate(value: string | null) {
  if (!value) {
    return "Any"
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

export default function TicketTailorSyncPage() {
  const [eventId, setEventId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)

  const inlineDateValidationError = useMemo(() => {
    const fromDate = toIsoOrNull(from)
    const toDate = toIsoOrNull(to)

    if ((from && !fromDate) || (to && !toDate)) {
      return "Enter valid dates for from/to."
    }

    if (fromDate && toDate && new Date(fromDate).getTime() > new Date(toDate).getTime()) {
      return "From date must be before or equal to To date."
    }

    return null
  }, [from, to])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (inlineDateValidationError) {
      setErrorMessage(inlineDateValidationError)
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await fetch("/api/ticket-tailor/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: eventId.trim() || null,
          from: from.trim() || null,
          to: to.trim() || null,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as SyncError | null
        const fallbackMessage = `Sync failed with status ${response.status}`
        setResult(null)
        setErrorMessage(payload?.error?.message ?? fallbackMessage)
        return
      }

      const payload = (await response.json()) as SyncResult
      setResult(payload)
    } catch {
      setResult(null)
      setErrorMessage("Network error while starting sync. Please retry.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Ticket Tailor manual re-sync</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Trigger an on-demand sync for a specific event and/or date window.
        </p>
      </header>

      <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm font-medium">Event ID (optional)</span>
              <input
                type="text"
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                placeholder="e.g. ev_12345"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">From date (optional)</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">To date (optional)</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {inlineDateValidationError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              {inlineDateValidationError}
            </p>
          )}

          {errorMessage && (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
              {errorMessage}
            </p>
          )}

          <div>
            <Button type="submit" disabled={isSubmitting || Boolean(inlineDateValidationError)}>
              {isSubmitting ? "Syncing…" : "Run scoped sync"}
            </Button>
          </div>
        </form>
      </article>

      {result && (
        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Last run result</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Run <span className="font-mono">{result.runId}</span> completed with status <strong>{result.status}</strong>.
          </p>

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Scope event</dt>
              <dd className="mt-1 font-mono text-xs">{result.scope.eventId ?? "Any"}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Scope from</dt>
              <dd className="mt-1 font-mono text-xs">{formatScopeDate(result.scope.from)}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Scope to</dt>
              <dd className="mt-1 font-mono text-xs">{formatScopeDate(result.scope.to)}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Events scanned</dt>
              <dd className="mt-1 font-mono text-xs">{result.counts.eventsScanned}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Orders fetched</dt>
              <dd className="mt-1 font-mono text-xs">{result.counts.ordersFetched}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Orders upserted</dt>
              <dd className="mt-1 font-mono text-xs">{result.counts.ordersUpserted}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Skipped by scope</dt>
              <dd className="mt-1 font-mono text-xs">{result.counts.ordersSkippedByScope}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Fallback mappings</dt>
              <dd className="mt-1 font-mono text-xs">{result.counts.normalizedFallbackCount}</dd>
            </div>
            <div className="rounded-md border border-border/70 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Failed items</dt>
              <dd className="mt-1 font-mono text-xs">{result.counts.failedItems}</dd>
            </div>
          </dl>

          {(result.diagnostics.fallbackNotes.length > 0 || result.diagnostics.errors.length > 0) && (
            <div className="mt-4 space-y-2 rounded-md border border-border/70 p-3 text-sm">
              <p className="font-medium">Diagnostics</p>
              {result.diagnostics.fallbackNotes.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Fallback notes</p>
                  <ul className="mt-1 list-inside list-disc">
                    {result.diagnostics.fallbackNotes.slice(0, 5).map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.diagnostics.errors.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Errors</p>
                  <ul className="mt-1 list-inside list-disc">
                    {result.diagnostics.errors.slice(0, 5).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </article>
      )}
    </section>
  )
}
