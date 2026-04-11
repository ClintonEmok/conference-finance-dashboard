"use client"

import { type ComponentType, FormEvent, useState } from "react"
import Link from "next/link"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { TikkieSection } from "@/components/signup/SuccessPage/TikkieSection"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

function formatDateTime(value: number | null): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function paymentStatusLabel(
  status: "unpaid" | "partial" | "paid" | "overpaid"
) {
  switch (status) {
    case "paid":
      return "Paid"
    case "overpaid":
      return "Overpaid"
    case "partial":
      return "In progress"
    default:
      return "Awaiting payment"
  }
}

function statusBadgeClass(status: "unpaid" | "partial" | "paid" | "overpaid") {
  switch (status) {
    case "paid":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "overpaid":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    case "partial":
      return "border-primary/20 bg-primary/10 text-primary"
    default:
      return "border-muted-foreground/20 bg-muted/40 text-muted-foreground"
  }
}

export default function TrackPaymentPage() {
  const [draftBookingRef, setDraftBookingRef] = useState("")
  const [searchedBookingRef, setSearchedBookingRef] = useState<string | null>(
    null
  )

  const submission = useQuery(
    api.signupSubmission.getByBookingRef,
    searchedBookingRef ? { bookingRef: searchedBookingRef } : "skip"
  )
  const tracking = useQuery(
    api.publicTracking.getByBookingRef,
    searchedBookingRef ? { bookingRef: searchedBookingRef } : "skip"
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = draftBookingRef.trim().toUpperCase()
    if (!normalized) return
    setSearchedBookingRef(normalized)
  }

  const isSearching =
    searchedBookingRef !== null &&
    (submission === undefined || tracking === undefined)
  const result = submission && tracking ? { submission, tracking } : null
  const notFound =
    searchedBookingRef !== null && submission === null && tracking === null

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,rgba(113,84,255,0.10),transparent_42%),linear-gradient(180deg,rgba(2,6,23,0.02),transparent_24%)]">
      <main className="container mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
        <div className="space-y-8">
          <section className="space-y-4">
            <Badge
              variant="secondary"
              className="rounded-full px-3 py-1 text-[10px] font-black tracking-[0.2em] uppercase"
            >
              Public Payment Tracker
            </Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">
                Track your payment progress
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Enter your booking reference to see what has been paid, what is
                left, and your event booking details.
              </p>
            </div>
          </section>

          <Card className="overflow-hidden border-none bg-card/70 shadow-2xl ring-1 ring-border/50 backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <CardTitle>Find your booking</CardTitle>
              <CardDescription>
                Use the booking reference from your confirmation email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <Input
                  value={draftBookingRef}
                  onChange={(event) =>
                    setDraftBookingRef(event.target.value.toUpperCase())
                  }
                  placeholder="BK-20260411-ABC123"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono uppercase"
                />
                <Button type="submit" className="sm:w-auto">
                  <Search className="size-4" />
                  Track payment
                </Button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground">
                If you just registered, your reference is shown on the success
                page.
              </p>
            </CardContent>
          </Card>

          {isSearching ? (
            <Card className="border-none bg-card/70 shadow-xl ring-1 ring-border/50">
              <CardContent className="flex items-center gap-3 py-8">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Search className="size-4 animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    Looking up your booking
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Give us a moment.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {notFound ? (
            <Card className="border-destructive/20 bg-destructive/5 shadow-xl">
              <CardContent className="flex items-start gap-3 py-6">
                <AlertCircle className="mt-0.5 size-5 text-destructive" />
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">
                    Booking reference not found
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Double-check the reference and try again.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {result ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="overflow-hidden border-none bg-card/75 shadow-2xl ring-1 ring-border/50 backdrop-blur-xl lg:col-span-2">
                <CardHeader className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-black tracking-[0.2em] uppercase",
                        statusBadgeClass(result.tracking.payment.paymentStatus)
                      )}
                    >
                      {paymentStatusLabel(
                        result.tracking.payment.paymentStatus
                      )}
                    </Badge>
                    <span className="font-mono text-xs font-semibold tracking-[0.2em] text-muted-foreground">
                      {result.tracking.bookingRef}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-2xl">
                      {result.tracking.event.title}
                    </CardTitle>
                    <CardDescription>
                      {formatDateTime(result.tracking.event.startsAt)}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Payment progress
                        </p>
                        <p className="text-3xl font-black tracking-tight text-foreground">
                          {result.tracking.payment.progressPercent}%
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p>
                          {formatMoney(result.tracking.payment.totalPaidMinor)}{" "}
                          paid
                        </p>
                        <p>
                          {formatMoney(result.tracking.payment.remainingMinor)}{" "}
                          remaining
                        </p>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${result.tracking.payment.progressPercent}%`,
                        }}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Total due"
                      value={formatMoney(result.tracking.payment.totalDueMinor)}
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
                      label="Remaining"
                      value={formatMoney(
                        result.tracking.payment.remainingMinor
                      )}
                      icon={Wallet}
                    />
                    <MetricCard
                      label="Payments"
                      value={String(result.tracking.payment.paymentCount)}
                      icon={Ticket}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6 lg:col-span-1">
                <Card className="border-none bg-card/75 shadow-xl ring-1 ring-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Booking details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <KeyValue
                      label="Name"
                      value={result.tracking.order.buyerName ?? "—"}
                    />
                    <KeyValue
                      label="Email"
                      value={result.tracking.order.buyerEmail ?? "—"}
                    />
                    <KeyValue
                      label="Phone"
                      value={result.tracking.order.buyerPhone ?? "—"}
                    />
                    <KeyValue
                      label="Submitted"
                      value={formatDateTime(result.tracking.order.submittedAt)}
                    />
                    <KeyValue
                      label="Order total"
                      value={formatMoney(
                        result.tracking.order.totalAmountMinor ??
                          result.tracking.payment.totalDueMinor
                      )}
                    />
                  </CardContent>
                </Card>

                <Card className="border-none bg-card/75 shadow-xl ring-1 ring-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Your booking</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 text-sm">
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

                    <div className="space-y-3">
                      <p className="text-xs font-black tracking-[0.2em] text-muted-foreground uppercase">
                        Ticket summary
                      </p>
                      <div className="space-y-2">
                        {result.submission.ticketSelections.map((ticket) => (
                          <div
                            key={ticket.id}
                            className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-foreground">
                              {ticket.ticketTypeName}
                            </span>
                            <span className="text-muted-foreground">
                              {ticket.quantity} x{" "}
                              {formatMoney(ticket.pricePerTicketMinor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6 lg:col-span-3">
                {result.tracking.payment.remainingMinor > 0 ? (
                  <TikkieSection
                    tikkieUrl={result.tracking.tikkieUrl}
                    eventName={result.tracking.event.title}
                  />
                ) : (
                  <Card className="border-none bg-emerald-500/10 shadow-xl">
                    <CardContent className="flex items-start gap-3 py-6">
                      <CheckCircle2 className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" />
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">
                          You are fully paid up
                        </p>
                        <p className="text-sm text-muted-foreground">
                          No further payment is due for this booking.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ) : null}

          <Card className="border-none bg-card/70 shadow-xl ring-1 ring-border/50">
            <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">
                  Need to check later?
                </p>
                <p className="text-sm text-muted-foreground">
                  Save this page and use your booking reference anytime.
                </p>
              </div>
              <Button asChild variant="outline" className="sm:w-auto">
                <Link href="/signup">
                  Back to signup
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
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
    <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-xs font-black tracking-[0.2em] text-muted-foreground uppercase">
        <Icon className="size-3.5 text-primary" />
        {label}
      </div>
      <p className="mt-3 text-xl font-black tracking-tight text-foreground">
        {value}
      </p>
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
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
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/25 px-3 py-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <span>{label}</span>
      </div>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}
