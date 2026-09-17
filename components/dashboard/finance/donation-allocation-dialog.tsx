"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConvex, useMutation } from "convex/react"
import { Loader2 } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DonationAllocationAttendeePicker,
  type PickerRow,
} from "@/components/dashboard/finance/donation-allocation-attendee-picker"
import { formatMoney } from "@/lib/format"
import {
  ALLOCATION_METHOD_OPTIONS,
  ALLOCATION_SCOPE_INTENT_LABELS,
  DEFAULT_ALLOCATION_SCOPE,
  allocationRefusalCopy,
  allocationSkipMessage,
  buildAllocationRequest,
  nextAllocationKey,
  scopeIntentLabel,
  type AllocationKeyState,
  type AllocationMethod,
  type AllocationRequest,
  type AllocationScope,
} from "@/lib/dashboard/donation-allocation-request"
import { cn } from "@/lib/utils"

/**
 * The allocation editor dialog (Phase 58, plan 58-08) — SURF-02's editor in its
 * simplified presentation.
 *
 * Three properties are load-bearing and none of them is re-implemented here:
 *
 *   1. The preview is SERVER-QUOTED. Every figure comes from
 *      `previewDonationAllocation`; nothing is summed, subtracted or clamped
 *      client-side. The quote is issued IMPERATIVELY (see the quote effect) so
 *      a refusal renders as a band instead of crashing the dialog.
 *   2. The writable figure LEADS. `Writable now` renders the server's
 *      `effectiveCapacityMinor` (58-11) as the row's primary figure, the bare
 *      scope ceiling is demoted to muted `Scope balance`, and the manual
 *      amount helper is bounded by the writable figure only.
 *   3. Scope is presented as INTENT, never as the schema values, and both
 *      intents stay reachable in bulk and per row (DON-07).
 *
 * The money contract this component must never break: no client-side
 * arithmetic over money figures. Display comparisons (`<`, `===`) that gate
 * presentation are allowed; they produce no figure.
 */

/** One row of a `previewDonationAllocation` payload (58-11 extended it). */
type AllocationQuoteRow = {
  attendeeId: string
  orderId: string
  scope: AllocationScope
  ceilingMinor: number
  amountMinor: number
  effectiveCapacityMinor: number
  // Carried for symmetry with the record's row type. A successful quote has
  // already validated the plan, so this is always false here and no band is
  // rendered from it.
  exceedsCapacity: boolean
  extraMinorUnits: number
  skipped: boolean
  skipReason?: "zero_scope_balance" | "no_funds_remaining"
}

/** The server's quote. Every rendered number is a field of this payload. */
type AllocationQuote = {
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
  method: AllocationMethod
  totalAllocatedMinor: number
  leftoverMinor: number
  remainderMinor: number
  remainderRecipientAttendeeIds: string[]
  rows: AllocationQuoteRow[]
  // Stamped by the server so a payload can never be mistaken for a write.
  previewOnly: true
}

/** The dialog's own donation-band read (`getDonationAllocationSummary`). */
type DonationAllocationSummary = {
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
}

/** One selected target as the dialog holds it. */
type DraftTarget = {
  attendeeId: Id<"orderAttendees">
  scope: AllocationScope
  name: string
  orderRef: string | null
  ticketTypeLabel: string | null
}

export type DonationAllocationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  donationId: Id<"payments">
  eventId: Id<"events">
  payerName: string
  // The list row's face value (`getStandaloneDonations`).
  amountMinor: number
  onAllocated: (result: {
    allocatedTotalMinor: number
    leftoverMinor: number
  }) => void
}

const QUOTE_DEBOUNCE_MS = 300

/** The qualitative shared-order notice — no number, nothing summed. */
const SHARED_ORDER_NOTICE =
  "These attendees share one order. Allocations draw on that order's single remaining capacity, so the total placed can be less than the sum of their balances."

/**
 * `Writable now` is the server's own writable figure; this note appears when
 * it is smaller than the row's `Scope balance`.
 */
const LIMITED_BY_ORDER_NOTE =
  "Limited by the order's shared remaining capacity."

/** The chooser's two options, in the shared intent vocabulary's own order. */
const SCOPE_CHOICES = Object.keys(
  ALLOCATION_SCOPE_INTENT_LABELS
) as AllocationScope[]

const UPPERCASE_LABEL =
  "text-xs font-semibold tracking-wide text-muted-foreground uppercase"

const MONEY_FIGURE = "font-mono text-sm font-semibold tabular-nums"

const FOOTER_BUTTON =
  "h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"

const DESTRUCTIVE_BAND =
  "rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"

/**
 * The plan ladder's ONE figure renderer: it formats a server field and nothing
 * else — no synthesis, no fallback, no clamping.
 *
 * `Writable now` is the server's own `effectiveCapacityMinor` (58-11) — the
 * amount a write can actually fit — and it LEADS each row. `Scope balance` is
 * the bare scope ceiling (`row.ceilingMinor`): supporting detail, muted, and
 * rendered last. These two bindings must never be swapped back: the bare
 * ceiling is exactly what misled the operator before the writable figure
 * existed.
 */
function QuoteFigure({
  label,
  valueMinor,
  tone,
}: {
  label: string
  valueMinor: number
  tone?: "primary" | "muted"
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          MONEY_FIGURE,
          tone === "primary" && "text-foreground",
          tone === "muted" && "font-normal text-muted-foreground"
        )}
      >
        {formatMoney(valueMinor)}
      </span>
    </div>
  )
}

export function DonationAllocationDialog({
  open,
  onOpenChange,
  donationId,
  eventId,
  payerName,
  amountMinor,
  onAllocated,
}: DonationAllocationDialogProps) {
  const convex = useConvex()
  const allocateDonation = useMutation(api.donations.allocateDonation)

  const [method, setMethod] = useState<AllocationMethod>("equal")
  const [targets, setTargets] = useState<DraftTarget[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [bulkScope, setBulkScope] = useState<AllocationScope>(
    DEFAULT_ALLOCATION_SCOPE
  )
  const [quote, setQuote] = useState<AllocationQuote | null>(null)
  const [quotedCanonical, setQuotedCanonical] = useState<string | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [summary, setSummary] = useState<DonationAllocationSummary | null>(null)
  const [summaryUnavailable, setSummaryUnavailable] = useState(false)
  const [keyState, setKeyState] = useState<AllocationKeyState | null>(null)

  const quoteRequestIdRef = useRef(0)
  const summaryRequestIdRef = useRef(0)

  /**
   * The donation band reads its OWN summary, so the row actions only ever hand
   * this dialog the row's face value. A superseded response (a different
   * donation on reopen) is dropped by the request-id guard.
   */
  useEffect(() => {
    if (!open) return
    const requestId = summaryRequestIdRef.current + 1
    summaryRequestIdRef.current = requestId
    setSummary(null)
    setSummaryUnavailable(false)

    void (async () => {
      try {
        const payload: DonationAllocationSummary = await convex.query(
          api.donations.getDonationAllocationSummary,
          { donationId }
        )
        if (summaryRequestIdRef.current !== requestId) return
        setSummary(payload)
      } catch {
        if (summaryRequestIdRef.current !== requestId) return
        setSummaryUnavailable(true)
      }
    })()
  }, [open, donationId, convex])

  const request = useMemo(
    () =>
      buildAllocationRequest({
        method,
        targets: targets.map(({ attendeeId, scope }) => ({
          attendeeId,
          scope,
        })),
        amounts,
      }),
    [method, targets, amounts]
  )

  const canonical = request.ok ? request.canonical : ""

  const runQuote = useCallback(
    async (requestId: number, built: AllocationRequest, issuedFor: string) => {
      setIsQuoting(true)
      try {
        // IMPERATIVE, NOT A SUBSCRIPTION: the hook form THROWS the refusal and
        // would crash the dialog, and the refusal band is a designed outcome.
        // A one-shot `useConvex().query(...)` rejects instead, and this handler
        // renders the mapped copy.
        const payload: AllocationQuote = await convex.query(
          api.donations.previewDonationAllocation,
          { donationId, eventId, request: built }
        )
        if (quoteRequestIdRef.current !== requestId) return
        setQuote(payload)
        setQuotedCanonical(issuedFor)
        setRefusal(null)
        setSessionExpired(false)
      } catch (error) {
        if (quoteRequestIdRef.current !== requestId) return
        setQuote(null)
        setQuotedCanonical(null)
        const message = error instanceof Error ? error.message : ""
        if (/^unauthorized/i.test(message)) {
          setRefusal(null)
          setSessionExpired(true)
        } else {
          setRefusal(allocationRefusalCopy(message))
        }
      } finally {
        if (quoteRequestIdRef.current === requestId) setIsQuoting(false)
      }
    },
    [convex, donationId, eventId]
  )

  /**
   * Debounced quoting. The request id is bumped BEFORE the timer is armed, so
   * an in-flight quote is superseded the moment the request changes and its
   * late response can never overwrite the current ladder. The last good quote
   * stays visible while the next resolves (marked `Updating…`).
   */
  useEffect(() => {
    if (!open) return
    const requestId = quoteRequestIdRef.current + 1
    quoteRequestIdRef.current = requestId

    if (!request.ok) {
      setQuote(null)
      setQuotedCanonical(null)
      setRefusal(null)
      setIsQuoting(false)
      return
    }

    const handle = setTimeout(() => {
      void runQuote(requestId, request.request, request.canonical)
    }, QUOTE_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [open, request, runQuote])

  /**
   * The idempotency key follows the pure policy: it is stable across retries
   * of the same request, regenerated only when the request or the donation
   * changes, or after a successful submission. The key is minted in the lib,
   * never here.
   */
  useEffect(() => {
    setKeyState((previous) =>
      nextAllocationKey(previous, String(donationId), canonical)
    )
  }, [donationId, canonical])

  const selectedIds = useMemo(
    () => new Set(targets.map((target) => String(target.attendeeId))),
    [targets]
  )

  const targetByAttendeeId = useMemo(() => {
    const map = new Map<string, DraftTarget>()
    for (const target of targets) {
      map.set(String(target.attendeeId), target)
    }
    return map
  }, [targets])

  const quoteOrderIds = quote?.rows.map((row) => row.orderId) ?? []
  const hasSharedOrder = quoteOrderIds.length !== new Set(quoteOrderIds).size

  const bandDonationMinor = summary ? summary.donationAmountMinor : amountMinor
  const bandAllocated = summary
    ? formatMoney(summary.recordedAllocatedMinor)
    : summaryUnavailable
      ? "Unavailable"
      : "Loading…"
  const bandRemaining = summary
    ? formatMoney(summary.remainingMinor)
    : summaryUnavailable
      ? "Unavailable"
      : "Loading…"

  const canSubmit =
    quote !== null &&
    request.ok &&
    quotedCanonical === canonical &&
    keyState !== null &&
    !isSubmitting

  function handleSelect(row: PickerRow) {
    setTargets((previous) => {
      if (
        previous.some(
          (target) => String(target.attendeeId) === String(row.attendeeId)
        )
      ) {
        return previous
      }
      // A newly selected target takes the CURRENT bulk scope; a per-row
      // override afterwards is never re-clobbered.
      return [
        ...previous,
        {
          attendeeId: row.attendeeId,
          scope: bulkScope,
          name: row.name,
          orderRef: row.orderRef,
          ticketTypeLabel: row.ticketTypeLabel,
        },
      ]
    })
  }

  function handleDeselect(attendeeId: Id<"orderAttendees">) {
    setTargets((previous) =>
      previous.filter(
        (target) => String(target.attendeeId) !== String(attendeeId)
      )
    )
    setAmounts((previous) => {
      const key = String(attendeeId)
      if (!(key in previous)) return previous
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

  function handleBulkScopeChange(scope: AllocationScope) {
    setBulkScope(scope)
    setTargets((previous) => previous.map((target) => ({ ...target, scope })))
  }

  function handleRowScopeChange(
    attendeeId: Id<"orderAttendees">,
    scope: AllocationScope
  ) {
    setTargets((previous) =>
      previous.map((target) =>
        String(target.attendeeId) === String(attendeeId)
          ? { ...target, scope }
          : target
      )
    )
  }

  function handleAmountChange(attendeeId: Id<"orderAttendees">, value: string) {
    setAmounts((previous) => ({ ...previous, [String(attendeeId)]: value }))
  }

  function handleMethodChange(next: AllocationMethod) {
    setMethod(next)
    // Switching to a distribution method clears the manual amounts the new
    // method does not use; switching to `manual` keeps scopes and targets.
    if (next !== "manual") {
      setAmounts({})
    }
  }

  async function handleSubmit() {
    if (!quote || !request.ok || !keyState || isSubmitting) return
    setIsSubmitting(true)
    try {
      const result: { allocatedTotalMinor: number } = await allocateDonation({
        donationId,
        eventId,
        idempotencyKey: keyState.key,
        request: request.request,
      })
      // The key is regenerated ONLY on this success path. The catch below must
      // never touch it — a retry has to replay the same submission.
      setKeyState((previous) =>
        nextAllocationKey(previous, String(donationId), canonical, {
          succeeded: true,
        })
      )
      onAllocated({
        allocatedTotalMinor: result.allocatedTotalMinor,
        leftoverMinor: quote.leftoverMinor,
      })
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (/^unauthorized/i.test(message)) {
        setRefusal(null)
        setSessionExpired(true)
      } else {
        setRefusal(allocationRefusalCopy(message))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Overlay/Escape cannot close the dialog while a submission is in
        // flight; the close affordance is hidden too.
        if (!nextOpen && isSubmitting) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl"
        showCloseButton={!isSubmitting}
      >
        <DialogHeader>
          <DialogTitle>Allocate donation</DialogTitle>
          <DialogDescription>
            {`Allocate ${formatMoney(amountMinor)} from ${payerName}. The server prices every plan before anything is written.`}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Donation band — the dialog's own summary read, three labelled
            figures, never a progress bar and never a computed remainder. */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <p className={UPPERCASE_LABEL}>Donation</p>
              <p className={MONEY_FIGURE}>{formatMoney(bandDonationMinor)}</p>
            </div>
            <div className="space-y-1">
              <p className={UPPERCASE_LABEL}>Recorded allocated</p>
              <p className={MONEY_FIGURE}>{bandAllocated}</p>
            </div>
            <div className="space-y-1">
              <p className={UPPERCASE_LABEL}>Remaining</p>
              <p className={MONEY_FIGURE}>{bandRemaining}</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Select
            value={method}
            onValueChange={(value) =>
              handleMethodChange(value as AllocationMethod)
            }
          >
            <SelectTrigger aria-label="Distribution method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALLOCATION_METHOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isQuoting && quote === null ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Quoting…
            </span>
          ) : null}
          {isQuoting && quote !== null ? (
            <span className="text-xs text-muted-foreground">Updating…</span>
          ) : null}
        </div>

        <Separator />

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden sm:grid-cols-2">
          {/* Left column: selection and the per-target controls. */}
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <DonationAllocationAttendeePicker
              eventId={eventId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onDeselect={handleDeselect}
              disabled={isSubmitting}
            />

            {targets.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className={UPPERCASE_LABEL}>Scope for all selected</p>
                  <Select
                    value={bulkScope}
                    onValueChange={(value) =>
                      handleBulkScopeChange(value as AllocationScope)
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label="Scope for all selected"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_CHOICES.map((scope) => (
                        <SelectItem key={scope} value={scope}>
                          {ALLOCATION_SCOPE_INTENT_LABELS[scope]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {targets.map((target) => {
                  const boundRow =
                    method === "manual"
                      ? quote?.rows.find(
                          (row) =>
                            row.attendeeId === String(target.attendeeId) &&
                            !row.skipped
                        )
                      : undefined
                  const fieldError =
                    !request.ok &&
                    request.reason === "invalid_amount" &&
                    String(request.attendeeId) === String(target.attendeeId)

                  return (
                    <div
                      key={target.attendeeId}
                      className="space-y-2 rounded-xl border border-border/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-medium"
                            title={target.name}
                          >
                            {target.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {target.orderRef ?? "No order reference"}
                            {target.ticketTypeLabel
                              ? ` · ${target.ticketTypeLabel}`
                              : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          aria-label={`Remove ${target.name}`}
                          disabled={isSubmitting}
                          onClick={() => handleDeselect(target.attendeeId)}
                        >
                          Remove
                        </Button>
                      </div>

                      <Select
                        value={target.scope}
                        onValueChange={(value) =>
                          handleRowScopeChange(
                            target.attendeeId,
                            value as AllocationScope
                          )
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Scope for ${target.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_CHOICES.map((scope) => (
                            <SelectItem key={scope} value={scope}>
                              {ALLOCATION_SCOPE_INTENT_LABELS[scope]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {method === "manual" ? (
                        <div className="space-y-1">
                          <Input
                            inputMode="decimal"
                            placeholder="0.00"
                            aria-label={`Amount for ${target.name}`}
                            value={amounts[target.attendeeId] ?? ""}
                            disabled={isSubmitting}
                            aria-invalid={fieldError || undefined}
                            onChange={(event) =>
                              handleAmountChange(
                                target.attendeeId,
                                event.target.value
                              )
                            }
                          />
                          {/* The bound helper shows the WRITABLE figure from the
                              current quote — and nothing when no row exists.
                              The bare scope ceiling never bounds this input;
                              the enforcing bound stays the server's refusal. */}
                          {boundRow ? (
                            <p className="text-xs text-muted-foreground">
                              {`Up to ${formatMoney(boundRow.effectiveCapacityMinor)}`}
                            </p>
                          ) : null}
                          {fieldError ? (
                            <p className="text-xs text-destructive">
                              Enter a positive amount with up to two decimal
                              places.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          {/* Right column: the server-quoted review. */}
          <div className="min-h-0 space-y-3 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-3">
            {!request.ok && request.reason === "no_targets" ? (
              <p className="text-sm text-muted-foreground">
                Select at least one attendee to see the plan.
              </p>
            ) : null}

            {quote ? (
              <>
                {hasSharedOrder ? (
                  <p className="rounded-lg border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
                    {SHARED_ORDER_NOTICE}
                  </p>
                ) : null}

                <div className="space-y-2">
                  {quote.rows.map((row) => {
                    const target = targetByAttendeeId.get(row.attendeeId)
                    const name = target?.name ?? "This attendee"
                    return (
                      <div
                        key={row.attendeeId}
                        className="rounded-lg border border-border/60 p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="min-w-0 truncate text-sm font-medium"
                            title={name}
                          >
                            {name}
                          </span>
                          <Badge variant="outline">
                            {scopeIntentLabel(row.scope)}
                          </Badge>
                        </div>
                        {row.skipped ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {allocationSkipMessage({
                              name,
                              skipReason: row.skipReason!,
                              scope: row.scope,
                            })}
                          </p>
                        ) : (
                          <div className="mt-1 space-y-1">
                            <QuoteFigure
                              label="Writable now"
                              valueMinor={row.effectiveCapacityMinor}
                              tone="primary"
                            />
                            <QuoteFigure
                              label="Will allocate"
                              valueMinor={row.amountMinor}
                            />
                            <QuoteFigure
                              label="Scope balance"
                              valueMinor={row.ceilingMinor}
                              tone="muted"
                            />
                            {row.effectiveCapacityMinor < row.ceilingMinor ? (
                              <p className="text-xs text-muted-foreground">
                                {LIMITED_BY_ORDER_NOTE}
                              </p>
                            ) : null}
                            {row.extraMinorUnits > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                +{row.extraMinorUnits} minor unit
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {quote.remainderMinor > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Rounding remainder: {formatMoney(quote.remainderMinor)} —
                    one minor unit each went to{" "}
                    {quote.remainderRecipientAttendeeIds.length}{" "}
                    {quote.remainderRecipientAttendeeIds.length === 1
                      ? "attendee"
                      : "attendees"}
                    .
                  </p>
                ) : null}

                {quote.leftoverMinor > 0 ? (
                  <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={UPPERCASE_LABEL}>Cannot be placed</span>
                      <span className={MONEY_FIGURE}>
                        {formatMoney(quote.leftoverMinor)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This stays unallocated and can be allocated later.
                    </p>
                  </div>
                ) : null}

                {quote.totalAllocatedMinor === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nothing to allocate
                  </p>
                ) : null}

                <div className="space-y-1 border-t border-border/60 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={UPPERCASE_LABEL}>Total allocated</span>
                    <span className={MONEY_FIGURE}>
                      {formatMoney(quote.totalAllocatedMinor)}
                    </span>
                  </div>
                  {/* `quote.remainingMinor` is the PRE-submission remainder and
                      is already the donation band's `Remaining`; on a first
                      allocation it equals the full donation, so a third
                      "remaining after this" line would be false. The
                      post-submission figure is `leftoverMinor`. Do not "fix"
                      the missing line back. */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={UPPERCASE_LABEL}>Leftover</span>
                    <span className={MONEY_FIGURE}>
                      {formatMoney(quote.leftoverMinor)}
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {sessionExpired ? (
          <div role="alert" aria-live="assertive" className={DESTRUCTIVE_BAND}>
            <p>Your session has expired</p>
            <p>Sign in again to continue.</p>
          </div>
        ) : refusal ? (
          <div role="alert" aria-live="assertive" className={DESTRUCTIVE_BAND}>
            {refusal}
          </div>
        ) : null}

        <DialogFooter aria-busy={isSubmitting}>
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            className={FOOTER_BUTTON}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className={FOOTER_BUTTON}
          >
            {isSubmitting ? "Allocating…" : "Allocate donation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
