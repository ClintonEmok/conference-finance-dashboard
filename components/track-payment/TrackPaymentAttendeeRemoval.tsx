"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Trash2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type TrackPaymentRemovalSelection = {
  attendeeKey: string
  attendeeName: string
  ticketLabel: string
}

type RemoveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

/**
 * Buyer-facing attendee removal for the manage-booking permalink. Uses the
 * same ownership model as the accommodation editor: a signed edit-token link
 * grants access without re-entering the email, otherwise the normalized
 * booker email must be supplied. Every removal is sent to the rate-limited +
 * honeypot-gated API route, which mints the request signature over the exact
 * envelope; the Convex mutation re-verifies ownership and the minimum-attendee
 * guard and recomputes the order amount due through the canonical loader.
 */
export function TrackPaymentAttendeeRemoval({
  bookingRef,
  selections,
  initialEditToken,
}: {
  bookingRef: string
  selections: TrackPaymentRemovalSelection[]
  initialEditToken?: string
}) {
  const editToken = initialEditToken?.trim() ?? ""
  const [bookerEmail, setBookerEmail] = useState("")
  const [useEmailFallback, setUseEmailFallback] = useState(false)
  const activeEditToken = useEmailFallback ? "" : editToken
  const ownershipReady =
    Boolean(bookerEmail.trim()) || Boolean(activeEditToken)

  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [status, setStatus] = useState<RemoveStatus>({ kind: "idle" })

  if (!selections || selections.length === 0) {
    return null
  }

  const canRemove = selections.length > 1
  const pendingSelection = pendingKey
    ? selections.find((selection) => selection.attendeeKey === pendingKey) ?? null
    : null

  async function confirmRemove() {
    if (!pendingKey || status.kind === "saving") return
    setStatus({ kind: "saving" })
    try {
      const response = await fetch(
        `/api/track-payment/${encodeURIComponent(bookingRef)}/remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendeeKey: pendingKey,
            bookerEmail: bookerEmail.trim().toLowerCase() || undefined,
            editToken: activeEditToken || undefined,
            idempotencyKey: crypto.randomUUID(),
            website: "",
          }),
        }
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(
          body?.error?.message ?? "Failed to remove attendee."
        )
      }
      setStatus({
        kind: "success",
        message: "Attendee removed. Your booking summary is now updating.",
      })
      setPendingKey(null)
      // All server projections (summary, amounts, accommodation editor) must
      // reflect the removal; a reload re-fetches them from Convex.
      window.location.reload()
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to remove attendee.",
      })
    }
  }

  return (
    <article className="rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl sm:p-8">
      <h3 className="mb-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
        Attendees
      </h3>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        If someone is no longer coming, you can remove them here. Your amount
        due is recalculated automatically and existing payments stay on the
        booking.
      </p>

      <div className="space-y-3">
        {selections.map((selection) => (
          <div
            key={selection.attendeeKey}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/30 bg-background/50 px-4 py-3 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Users className="size-4 shrink-0 text-muted-foreground/60" />
              <span className="min-w-0 truncate font-medium text-foreground">
                {selection.attendeeName}
              </span>
              <span className="truncate text-muted-foreground">
                {selection.ticketLabel}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canRemove || status.kind === "saving"}
              onClick={() => {
                setStatus({ kind: "idle" })
                setPendingKey(selection.attendeeKey)
              }}
              className="h-8 rounded-lg border-destructive/30 text-[10px] font-bold tracking-wider text-destructive uppercase hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Remove
            </Button>
          </div>
        ))}
      </div>

      {!canRemove ? (
        <p className="mt-4 rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
          This booking has only one attendee, so they cannot be removed. Please
          contact the organizers if you need to cancel.
        </p>
      ) : null}

      {canRemove ? (
        <div
          className={
            !activeEditToken
              ? "mt-6 space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4"
              : "mt-6"
          }
        >
          {!activeEditToken ? (
            <>
              <p className="text-xs text-muted-foreground">
                To remove an attendee, confirm ownership with the email address
                used for this booking.
              </p>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="track-remove-email" className="text-sm font-medium">
                  Booking email
                </Label>
                <Input
                  id="track-remove-email"
                  type="email"
                  autoComplete="email"
                  value={bookerEmail}
                  onChange={(event) => setBookerEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="min-w-0"
                />
              </div>
            </>
          ) : null}

          {activeEditToken ? (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-xs text-muted-foreground">
              <p>
                This signed booking link grants access to manage your booking.
                Removing an attendee is validated and recalculated by the
                server.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div aria-live="polite" className="mt-4 min-w-0 text-sm">
        {status.kind === "saving" ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Removing attendee…
          </span>
        ) : status.kind === "success" ? (
          <span className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            {status.message}
          </span>
        ) : status.kind === "error" ? (
          <span
            role="alert"
            className="flex items-center gap-2 font-medium text-destructive"
          >
            <AlertCircle className="size-4" />
            {status.message}
          </span>
        ) : null}
      </div>

      <Dialog
        open={Boolean(pendingKey)}
        onOpenChange={(open) => {
          if (!open) setPendingKey(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove attendee</DialogTitle>
            <DialogDescription>
              Remove {pendingSelection?.attendeeName ?? "this attendee"} from
              this booking? Their ticket, accommodation, and room assignment
              will be cancelled and your amount due recalculated. Existing
              payments stay on the booking.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingKey(null)}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!ownershipReady || status.kind === "saving"}
              onClick={() => void confirmRemove()}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              {status.kind === "saving" ? "Removing…" : "Remove attendee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}