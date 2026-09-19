"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConvex, useMutation } from "convex/react"
import { Loader2 } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { DonationAllocationAttendeePicker, type PickerRow } from "@/components/dashboard/finance/donation-allocation-attendee-picker"
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
import { formatMoney } from "@/lib/format"
import {
  ALLOCATION_METHOD_OPTIONS,
  allocationRefusalCopy,
  allocationSkipMessage,
  buildOrderAllocationRequest,
  nextAllocationKey,
  type AllocationKeyState,
  type AllocationMethod,
  type OrderAllocationRequest,
} from "@/lib/dashboard/donation-allocation-request"
import { cn } from "@/lib/utils"

/**
 * One row of the server-owned order-mode preview. The private anchor is never
 * part of this type or rendered by the order-first editor.
 */
type AllocationQuoteRow = {
  orderId: string
  scope: "whole_order"
  ceilingMinor: number
  amountMinor: number
  effectiveCapacityMinor: number
  exceedsCapacity: boolean
  extraMinorUnits: number
  skipped: boolean
  skipReason?: "zero_scope_balance" | "no_funds_remaining"
}

type AllocationQuote = {
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
  method: AllocationMethod
  totalAllocatedMinor: number
  leftoverMinor: number
  remainderMinor: number
  rows: AllocationQuoteRow[]
  previewOnly: true
}

type DonationAllocationSummary = {
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
}

/** The order-only identity accepted when the editor is launched from an order. */
export type DonationAllocationInitialOrder = PickerRow

export type DonationAllocationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  donationId: Id<"payments">
  eventId: Id<"events">
  payerName: string
  amountMinor: number
  currency: string
  /** Initial identity only; read by the lazy state initializer on first mount. */
  initialOrder?: DonationAllocationInitialOrder
  onAllocated: (result: {
    allocatedTotalMinor: number
    leftoverMinor: number
  }) => void
}

const QUOTE_DEBOUNCE_MS = 300
const UPPERCASE_LABEL =
  "text-xs font-semibold tracking-wide text-muted-foreground uppercase"
const MONEY_FIGURE = "font-mono text-sm font-semibold tabular-nums"
const FOOTER_BUTTON =
  "h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"
const DESTRUCTIVE_BAND =
  "rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"

function orderTitle(row: PickerRow | null) {
  return row?.bookerName?.trim() || row?.bookingRef || "Selected order"
}

function orderDetails(row: PickerRow | null) {
  if (!row) return ""
  return [row.bookingRef, row.providerOrderId, row.bookerEmail]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ")
}

function QuoteFigure({
  label,
  valueMinor,
  currency,
  tone,
}: {
  label: string
  valueMinor: number
  currency: string
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
        {formatMoney(valueMinor, currency)}
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
  currency,
  initialOrder,
  onAllocated,
}: DonationAllocationDialogProps) {
  const convex = useConvex()
  const allocateDonation = useMutation(api.donations.allocateDonation)

  const [method, setMethod] = useState<AllocationMethod>("equal")
  // INITIALIZER ONLY: order-detail launches are remounted per donation, while a
  // donation-side launch begins with no selected order.
  const [selectedOrder, setSelectedOrder] = useState<PickerRow | null>(
    () => initialOrder ?? null
  )
  const [manualAmount, setManualAmount] = useState("")
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
      buildOrderAllocationRequest({
        method,
        target: selectedOrder ? { orderId: selectedOrder.orderId } : null,
        amount: manualAmount,
      }),
    [manualAmount, method, selectedOrder]
  )

  const canonical = request.ok ? request.canonical : ""

  const runQuote = useCallback(
    async (requestId: number, built: OrderAllocationRequest, issuedFor: string) => {
      setIsQuoting(true)
      try {
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

  useEffect(() => {
    setKeyState((previous) =>
      nextAllocationKey(previous, String(donationId), canonical)
    )
  }, [canonical, donationId])

  const bandDonationMinor = summary ? summary.donationAmountMinor : amountMinor
  const bandAllocated = summary
    ? formatMoney(summary.recordedAllocatedMinor, currency)
    : summaryUnavailable
      ? "Unavailable"
      : "Loading…"
  const bandRemaining = summary
    ? formatMoney(summary.remainingMinor, currency)
    : summaryUnavailable
      ? "Unavailable"
      : "Loading…"

  const canSubmit =
    quote !== null &&
    request.ok &&
    quotedCanonical === canonical &&
    keyState !== null &&
    !isSubmitting

  function handleMethodChange(nextMethod: AllocationMethod) {
    setMethod(nextMethod)
    if (nextMethod !== "manual") setManualAmount("")
  }

  async function handleSubmit() {
    if (!quote || !request.ok || !keyState || isSubmitting) return
    setIsSubmitting(true)
    try {
      const result: { allocatedTotalMinor: number; remainingMinor: number } =
        await allocateDonation({
          donationId,
          eventId,
          idempotencyKey: keyState.key,
          request: request.request,
        })
      setKeyState((previous) =>
        nextAllocationKey(previous, String(donationId), canonical, {
          succeeded: true,
        })
      )
      onAllocated({
        allocatedTotalMinor: result.allocatedTotalMinor,
        leftoverMinor: result.remainingMinor,
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
        if (!nextOpen && isSubmitting) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl"
        showCloseButton={!isSubmitting}
      >
        <DialogHeader>
          <DialogTitle>Add donation to order</DialogTitle>
          <DialogDescription>
            {`Add ${formatMoney(amountMinor, currency)} from ${payerName} to one eligible order. The server prices the whole-order allocation before anything is written.`}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <p className={UPPERCASE_LABEL}>Donation</p>
              <p className={MONEY_FIGURE}>{formatMoney(bandDonationMinor, currency)}</p>
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
          <select
            aria-label="Distribution method"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={method}
            disabled={isSubmitting}
            onChange={(event) =>
              handleMethodChange(event.target.value as AllocationMethod)
            }
          >
            {ALLOCATION_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <DonationAllocationAttendeePicker
              eventId={eventId}
              selectedOrder={selectedOrder}
              onSelect={setSelectedOrder}
              onDeselect={() => setSelectedOrder(null)}
              disabled={isSubmitting}
            />

            {selectedOrder && method === "manual" ? (
              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={orderTitle(selectedOrder)}>
                    {orderTitle(selectedOrder)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {orderDetails(selectedOrder) || String(selectedOrder.orderId)}
                  </p>
                </div>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Amount for ${orderTitle(selectedOrder)}`}
                  value={manualAmount}
                  disabled={isSubmitting}
                  aria-invalid={
                    (!request.ok && request.reason === "invalid_amount") ||
                    undefined
                  }
                  onChange={(event) => setManualAmount(event.target.value)}
                />
                {!request.ok && request.reason === "invalid_amount" ? (
                  <p className="text-xs text-destructive">
                    Enter a positive amount with up to two decimal places.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-3">
            {!request.ok && request.reason === "no_order" ? (
              <p className="text-sm text-muted-foreground">
                Select one order to see the server-quoted plan.
              </p>
            ) : null}

            {quote ? (
              <>
                {quote.rows.map((row) => (
                  <div
                    key={row.orderId}
                    className="rounded-lg border border-border/60 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="min-w-0 truncate text-sm font-medium"
                        title={orderTitle(selectedOrder)}
                      >
                        {orderTitle(selectedOrder)}
                      </span>
                      <Badge variant="outline">Whole order</Badge>
                    </div>
                    {row.skipped ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {allocationSkipMessage({
                          name: orderTitle(selectedOrder),
                          skipReason: row.skipReason!,
                          scope: "whole_order",
                        })}
                      </p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <QuoteFigure
                          label="Writable now"
                          valueMinor={row.effectiveCapacityMinor}
                          currency={currency}
                          tone="primary"
                        />
                        <QuoteFigure
                          label="Will allocate"
                          valueMinor={row.amountMinor}
                          currency={currency}
                        />
                        <QuoteFigure
                          label="Whole-order balance"
                          valueMinor={row.ceilingMinor}
                          currency={currency}
                          tone="muted"
                        />
                        {row.effectiveCapacityMinor < row.ceilingMinor ? (
                          <p className="text-xs text-muted-foreground">
                            Limited by the order&apos;s shared remaining capacity.
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
                ))}

                {quote.remainderMinor > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Rounding remainder: {formatMoney(quote.remainderMinor, currency)}.
                  </p>
                ) : null}

                {quote.leftoverMinor > 0 ? (
                  <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={UPPERCASE_LABEL}>Cannot be placed</span>
                      <span className={MONEY_FIGURE}>
                        {formatMoney(quote.leftoverMinor, currency)}
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
                      {formatMoney(quote.totalAllocatedMinor, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={UPPERCASE_LABEL}>Leftover</span>
                    <span className={MONEY_FIGURE}>
                      {formatMoney(quote.leftoverMinor, currency)}
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
            {isSubmitting ? "Adding donation…" : "Add donation to order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
