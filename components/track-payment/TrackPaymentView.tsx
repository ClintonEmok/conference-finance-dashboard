"use client"

import { type ComponentType, FormEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import {
  AlertCircle,
  ArrowRight,
  Bed,
  CheckCircle2,
  CreditCard,
  Search,
  Ticket,
  Wallet,
  Users,
} from "lucide-react"

import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { TikkieSection } from "@/components/signup/SuccessPage/TikkieSection"
import { TrackPaymentAccommodationEditor } from "@/components/track-payment/TrackPaymentAccommodationEditor"
import { formatMoney } from "@/lib/format"

function formatDateTime(value: number | null): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function TrackPaymentSkeleton() {
  return (
    <div className="animate-pulse space-y-8 duration-700">
      <div className="h-64 w-full rounded-3xl bg-muted/30" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="h-48 w-full rounded-3xl bg-muted/30" />
          <div className="h-32 w-full rounded-3xl bg-muted/30" />
        </div>
        <div className="h-64 w-full rounded-3xl bg-muted/30 lg:col-span-1" />
      </div>
    </div>
  )
}

/**
 * Shared buyer-facing track-payment presentation used by both the root
 * booking-reference search (`/track-payment`) and the durable permalink
 * (`/track-payment/[bookingRef]`). All money, payment status, receipt lines,
 * accommodation choices and overpayment values render server-provided fields
 * only — the client never derives a total, rate, night count, overpayment or
 * Tikkie amount.
 */
export function TrackPaymentView({
  initialBookingRef,
  initialEditToken,
}: {
  initialBookingRef?: string
  initialEditToken?: string
}) {
  const router = useRouter()
  const [draftBookingRef, setDraftBookingRef] = useState("")
  const [searchedBookingRef, setSearchedBookingRef] = useState<string | null>(
    initialBookingRef ?? null
  )

  const bookingRef = searchedBookingRef

  const submission = useQuery(
    api.signupSubmission.getByBookingRef,
    bookingRef ? { bookingRef } : "skip"
  )
  const tracking = useQuery(
    api.publicTracking.getByBookingRef,
    bookingRef ? { bookingRef } : "skip"
  )
  const editContext = useQuery(
    api.publicTracking.getTrackPaymentEditContext,
    bookingRef ? { bookingRef } : "skip"
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = draftBookingRef.trim().toUpperCase()
    if (!normalized) return
    router.push(`/track-payment/${encodeURIComponent(normalized)}`)
  }

  const isSearching =
    bookingRef !== null &&
    (submission === undefined ||
      tracking === undefined ||
      editContext === undefined)
  const result = submission && tracking ? { submission, tracking } : null
  const notFound =
    bookingRef !== null &&
    submission === null &&
    tracking === null &&
    editContext === null

  // Currency comes from the server edit context (the tracking projection does
  // not expose it); display-only, never used for arithmetic.
  const currency = editContext?.event.currency ?? "EUR"

  return (
    <div className="min-h-svh bg-[radial-gradient(ellipse_at_top,rgba(113,84,255,0.08),transparent_50%),linear-gradient(180deg,rgba(2,6,23,0.02),transparent_24%)] pt-12 md:pt-24">
      <main className="container mx-auto max-w-6xl px-4 pb-24 md:px-8">
        {initialBookingRef ? (
          <div className="mb-8 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              <Link
                href="/track-payment"
                className="underline-offset-4 hover:underline"
              >
                Search another booking
              </Link>
            </p>
          </div>
        ) : null}

        {/* HERO SEARCH (root entry only; the permalink never shows a second
            shell) */}
        {!initialBookingRef ? (
          <section className="mx-auto mb-16 max-w-xl text-center">
            <h1 className="mb-4 text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Track Booking
            </h1>
            <p className="mb-8 text-sm leading-6 text-muted-foreground md:text-base">
              Enter your booking reference to check your balance, submit pending
              payments, or view your ticket itinerary.
            </p>

            <form
              onSubmit={handleSubmit}
              className="relative mx-auto flex w-full max-w-md items-center justify-between overflow-hidden rounded-full border border-border/50 bg-background/50 p-1.5 shadow-sm ring-offset-backdrop backdrop-blur-xl transition-all focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
            >
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                <Search className="size-4 text-muted-foreground" />
              </div>
              <Input
                value={draftBookingRef}
                onChange={(event) =>
                  setDraftBookingRef(event.target.value.toUpperCase())
                }
                placeholder="BK-20260411-ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Booking reference"
                className="h-12 border-0 bg-transparent pl-11 font-mono text-sm uppercase focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-base"
              />
              <Button
                type="submit"
                size="sm"
                className="h-10 rounded-full px-6 font-semibold"
              >
                Find
              </Button>
            </form>
          </section>
        ) : null}

        <div className="animate-in space-y-8 delay-150 duration-700 fill-mode-both fade-in slide-in-from-bottom-4">
          {isSearching ? <TrackPaymentSkeleton /> : null}

          {notFound ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/20 bg-destructive/5 p-12 text-center text-destructive">
              <AlertCircle className="mb-4 size-10 opacity-80" />
              <h3 className="mb-2 text-xl font-bold">Booking not found</h3>
              <p className="max-w-sm text-sm text-destructive/80">
                We couldn't locate a booking with that reference. Please check
                your confirmation email and try again.
              </p>
            </div>
          ) : null}

          {result ? (
            <div className="animate-in space-y-8 duration-700 fade-in slide-in-from-bottom-4">
              {/* TOP ACTION BAR - PAYMENT OR SUCCESS */}
              {result.tracking.payment.remainingMinor > 0 ? (
                <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/60 shadow-lg ring-1 ring-white/5 backdrop-blur-2xl">
                  <TikkieSection
                    tikkieUrl={result.tracking.tikkieUrl}
                    eventName={result.tracking.event.title}
                  />
                </div>
              ) : result.tracking.payment.paymentStatus === "overpaid" ? (
                <div className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center shadow-lg backdrop-blur-xl sm:flex-row sm:items-start sm:p-8 sm:text-left">
                  <div className="rounded-full bg-emerald-500/20 p-3 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-6" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-xl font-bold text-emerald-800 dark:text-emerald-200">
                      Payment settled with donation
                    </h3>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-200/80">
                      You have paid{" "}
                      {formatMoney(result.tracking.payment.totalPaidMinor)}{" "}
                      against a due amount of{" "}
                      {formatMoney(result.tracking.payment.totalDueMinor)}.
                      Your donation is{" "}
                      {formatMoney(
                        result.tracking.payment.totalPaidMinor -
                          result.tracking.payment.totalDueMinor
                      )}
                      .
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center shadow-lg backdrop-blur-xl sm:flex-row sm:items-start sm:p-8 sm:text-left">
                  <div className="rounded-full bg-emerald-500/20 p-3 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-6" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-xl font-bold text-emerald-800 dark:text-emerald-200">
                      Payment settled
                    </h3>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-200/80">
                      You are fully paid up. No further payment is due for this
                      booking. You're all set!
                    </p>
                  </div>
                </div>
              )}

              {/* SPLIT SCREEN DATA */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <article className="group relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl transition-colors hover:border-border/80 sm:p-8">
                    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                      <div className="relative z-10 w-full space-y-1 pr-4 sm:w-auto">
                        <h2 className="max-w-sm text-xl font-bold text-foreground">
                          {result.tracking.event.title}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime(result.tracking.event.startsAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="font-mono text-xs font-semibold tracking-[0.1em] text-muted-foreground/80">
                          {result.tracking.bookingRef}
                        </span>
                      </div>
                    </div>

                    <div className="mb-8">
                      <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                          <p className="mb-1 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                            Progress
                          </p>
                          <p className="text-4xl font-black tracking-tight text-foreground">
                            {result.tracking.payment.progressPercent}%
                          </p>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">
                            {formatMoney(
                              result.tracking.payment.totalPaidMinor
                            )}{" "}
                            paid
                          </p>
                          <p className="opacity-80">
                            {formatMoney(
                              result.tracking.payment.remainingMinor
                            )}{" "}
                            remaining
                          </p>
                        </div>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-secondary/80">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-1000"
                          style={{
                            width: `${result.tracking.payment.progressPercent}%`,
                          }}
                        />
                      </div>
                      <p className="mt-3 text-[11px] text-muted-foreground/70">
                        Updates refresh automatically every 15 minutes.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MetricCard
                        label="Total"
                        value={formatMoney(
                          result.tracking.payment.totalDueMinor
                        )}
                        icon={CreditCard}
                      />
                      <MetricCard
                        label="Paid"
                        value={formatMoney(
                          result.tracking.payment.totalPaidMinor
                        )}
                        icon={CheckCircle2}
                      />
                      <MetricCard
                        label="Owed"
                        value={formatMoney(
                          result.tracking.payment.remainingMinor
                        )}
                        icon={Wallet}
                      />
                      <MetricCard
                        label="Txns"
                        value={String(result.tracking.payment.paymentCount)}
                        icon={ArrowRight}
                      />
                      {result.tracking.payment.paymentStatus === "overpaid" ? (
                        <MetricCard
                          label="Donation"
                          value={formatMoney(
                            result.tracking.payment.totalPaidMinor -
                              result.tracking.payment.totalDueMinor
                          )}
                          icon={Wallet}
                        />
                      ) : null}
                    </div>
                  </article>

                  <article className="rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl transition-colors hover:border-border/80 sm:p-8">
                    <h3 className="mb-6 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                      Digital Receipt
                    </h3>

                    <div className="mb-6 grid gap-3 text-sm">
                      <SummaryRow
                        icon={Users}
                        label="Attendees"
                        value={String(result.submission.attendees.length)}
                      />
                      <SummaryRow
                        icon={Bed}
                        label="Rooms"
                        value={String(result.submission.roomAssignments.length)}
                      />
                      <SummaryRow
                        icon={Ticket}
                        label="Tickets"
                        value={String(
                          result.submission.ticketSelections.reduce(
                            (sum, ticket) => sum + ticket.quantity,
                            0
                          )
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      {result.submission.ticketSelections.map((ticket) => (
                        <div
                          key={ticket.id}
                          className="flex items-center justify-between rounded-xl border border-border/30 bg-background/50 px-4 py-3 text-sm shadow-sm"
                        >
                          <span className="font-medium text-foreground">
                            {ticket.ticketTypeName}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {ticket.quantity} ×{" "}
                            {formatMoney(ticket.pricePerTicketMinor)}
                          </span>
                        </div>
                      ))}
                      {result.submission.accommodationLines?.map(
                        (line, index) => (
                          <div
                            key={`${line.kind}-${index}`}
                            className="flex items-center justify-between rounded-xl border border-border/30 bg-background/50 px-4 py-3 text-sm shadow-sm"
                          >
                            <span className="font-medium text-foreground">
                              {line.label}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {line.nights} × {formatMoney(line.ratePerNightMinor)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </article>
                </div>

                <div className="space-y-6 lg:col-span-1">
                  <article className="sticky top-8 rounded-3xl border border-border/40 bg-card/40 p-6 shadow-sm backdrop-blur-xl transition-colors hover:border-border/80 sm:p-8">
                    <h3 className="mb-6 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                      Purchaser
                    </h3>
                    <div className="space-y-5 text-sm">
                      <KeyValue
                        label="Name"
                        value={result.tracking.order.buyerName ?? "—"}
                      />
                      <Separator className="opacity-50" />
                      <KeyValue
                        label="Email"
                        value={result.tracking.order.buyerEmail ?? "—"}
                      />
                      <Separator className="opacity-50" />
                      <KeyValue
                        label="Phone"
                        value={result.tracking.order.buyerPhone ?? "—"}
                      />
                      <Separator className="opacity-50" />
                      <KeyValue
                        label="Booked"
                        value={formatDateTime(
                          result.tracking.order.submittedAt
                        )}
                      />
                    </div>
                  </article>

                  <div className="pt-4 text-center">
                    <p className="mb-4 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                      Need help?
                    </p>
                    <div className="w-full rounded-full border border-border/40 bg-card/40 py-2 text-sm text-muted-foreground backdrop-blur-xl">
                      Email us at{" "}
                      <span className="font-bold text-foreground">
                        it-support@deeperlife.nl
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACCOMMODATION PREFERENCES (Phase 43 permalink editor) */}
              <TrackPaymentAccommodationEditor
                bookingRef={bookingRef}
                currency={currency}
                editContext={editContext}
                initialEditToken={initialEditToken}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border/40 bg-background/50 p-4 transition-all hover:bg-muted/30">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
        <Icon className="size-3.5 text-primary" />
        {label}
      </div>
      <p className="font-mono text-lg font-black tracking-tight text-foreground tabular-nums sm:text-xl">
        {value}
      </p>
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 overflow-hidden">
      <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate font-semibold text-foreground" title={value}>
        {value}
      </span>
    </div>
  )
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/30 bg-background/50 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Icon className="size-4 text-primary opacity-80" />
        <span className="font-medium">{label}</span>
      </div>
      <span className="font-mono font-bold text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
