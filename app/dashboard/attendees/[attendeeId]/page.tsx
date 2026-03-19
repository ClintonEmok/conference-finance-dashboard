"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

type AttendeeDetailPayload = {
  attendee: {
    id: string
    name: string | null
    email: string | null
    ticketTypeLabel: string | null
    ticketStatus: string | null
    checkedInAt: string | null
    providerIssuedTicketId: string | null
    providerOrderId: string
    providerEventId: string
  }
  event: {
    id: string
    name: string | null
  }
  order: {
    id: string
    providerOrderId: string
    providerEventId: string
    buyerName: string | null
    buyerEmail: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    orderedAt: string | null
    totalAmountMinor: number
  }
  finance: {
    outstandingAmountMinor: number
    paidAmountMinor: number
    installmentProgress: {
      totalLinks: number
      paidLinks: number
      openLinks: number
      expiredLinks: number
    }
  }
  paymentHistory: Array<{
    id: string
    type: "payment-link" | "status-transition"
    title: string
    status: string
    amountMinor: number | null
    happenedAt: string
    note: string | null
    url: string | null
  }>
  roomStatus:
    | {
        status: "assigned"
        roomLabel: string
        hotelName: string
        roomTypeLabel: string
      }
    | {
        status: "unassigned"
        roomLabel: null
        hotelName: null
        roomTypeLabel: null
      }
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-"
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

type PageProps = {
  params: Promise<{
    attendeeId: string
  }>
}

export default function AttendeeDetailPage({ params }: PageProps) {
  const searchParams = useSearchParams()
  const [attendeeId, setAttendeeId] = useState<string | null>(null)
  const [payload, setPayload] = useState<AttendeeDetailPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const attendeeSearch = searchParams.get("search")
  const eventId = searchParams.get("eventId")
  const source = searchParams.get("source")

  const backToAttendeesHref = (() => {
    const params = new URLSearchParams()

    if (attendeeSearch) {
      params.set("search", attendeeSearch)
    }

    if (eventId) {
      params.set("eventId", eventId)
    }

    if (source) {
      params.set("source", source)
    }

    const query = params.toString()
    return query ? `/dashboard/attendees?${query}` : "/dashboard/attendees"
  })()

  const manageRoomAssignmentHref = (() => {
    if (!attendeeId) {
      return "/dashboard/accommodation"
    }

    const params = new URLSearchParams({
      attendeeId,
      source: "attendee-detail",
    })

    if (payload?.attendee.name) {
      params.set("search", payload.attendee.name)
    } else if (attendeeSearch) {
      params.set("search", attendeeSearch)
    }

    if (eventId ?? payload?.attendee.providerEventId) {
      params.set("eventId", eventId ?? payload?.attendee.providerEventId ?? "")
    }

    return `/dashboard/accommodation?${params.toString()}`
  })()

  useEffect(() => {
    let cancelled = false

    async function resolveParamsAndLoad() {
      const resolved = await params

      if (cancelled) {
        return
      }

      setAttendeeId(resolved.attendeeId)
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const response = await fetch(`/api/dashboard/attendees/${resolved.attendeeId}`)
        const body = (await response.json().catch(() => null)) as
          | AttendeeDetailPayload
          | { error?: { message?: string } }
          | null

        if (!response.ok) {
          if (!cancelled) {
            setPayload(null)
            setErrorMessage(body && "error" in body ? body.error?.message ?? "Failed to load attendee detail." : "Failed to load attendee detail.")
          }
          return
        }

        if (!cancelled) {
          setPayload(body as AttendeeDetailPayload)
        }
      } catch {
        if (!cancelled) {
          setPayload(null)
          setErrorMessage("Network error while loading attendee detail.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void resolveParamsAndLoad()

    return () => {
      cancelled = true
    }
  }, [params])

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Attendee detail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Payment summary, installment progress, outstanding balance, and room-status context.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={manageRoomAssignmentHref}>Manage room assignment</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={backToAttendeesHref}>Back to attendees</Link>
          </Button>
        </div>
      </header>

      {errorMessage && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && isLoading && (
        <article className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Loading attendee detail…
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding balance</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(payload.finance.outstandingAmountMinor)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Order total {formatMoney(payload.order.totalAmountMinor)}</p>
            </article>
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid so far</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(payload.finance.paidAmountMinor)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{payload.finance.installmentProgress.paidLinks} paid links recorded</p>
            </article>
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Installment progress</p>
              <p className="mt-1 text-2xl font-semibold">{payload.finance.installmentProgress.totalLinks}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {payload.finance.installmentProgress.openLinks} open / {payload.finance.installmentProgress.expiredLinks} expired
              </p>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h3 className="text-base font-semibold">Attendee and order context</h3>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Attendee</dt>
                  <dd className="mt-1">{payload.attendee.name ?? "Unnamed attendee"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
                  <dd className="mt-1">{payload.attendee.email ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Ticket</dt>
                  <dd className="mt-1">{payload.attendee.ticketTypeLabel ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Ticket status</dt>
                  <dd className="mt-1">{payload.attendee.ticketStatus ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Event</dt>
                  <dd className="mt-1">{payload.event.name ?? payload.attendee.providerEventId}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Checked in</dt>
                  <dd className="mt-1">{formatDateTime(payload.attendee.checkedInAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Order</dt>
                  <dd className="mt-1 font-mono text-xs">{payload.order.providerOrderId}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Order status</dt>
                  <dd className="mt-1">{payload.order.normalizedStatus}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Buyer</dt>
                  <dd className="mt-1">{payload.order.buyerName ?? payload.order.buyerEmail ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Ordered at</dt>
                  <dd className="mt-1">{formatDateTime(payload.order.orderedAt)}</dd>
                </div>
              </dl>
            </article>

            <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h3 className="text-base font-semibold">Room status</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                {payload.roomStatus.status === "assigned"
                  ? `Assigned to ${payload.roomStatus.roomLabel} at ${payload.roomStatus.hotelName} (${payload.roomStatus.roomTypeLabel}).`
                  : "Unassigned. Use the accommodation workspace to place this attendee into a room when inventory is ready."}
              </p>
              <Button asChild className="mt-4" size="sm">
                <Link href={manageRoomAssignmentHref}>Manage room assignment</Link>
              </Button>
            </article>
          </section>

          <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="text-base font-semibold">Payment history</h3>
            {payload.paymentHistory.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No Tikkie payment activity recorded yet for this attendee&apos;s order.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {payload.paymentHistory.map((entry) => (
                  <article key={entry.id} className="rounded-md border border-border/70 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{entry.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(entry.happenedAt)}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>Status: {entry.status}</div>
                        <div>{entry.amountMinor === null ? "-" : formatMoney(entry.amountMinor)}</div>
                      </div>
                    </div>
                    {entry.note && <p className="mt-2 text-xs text-muted-foreground">{entry.note}</p>}
                    {entry.url && (
                      <p className="mt-2 text-xs">
                        <a className="text-primary underline" href={entry.url} target="_blank" rel="noreferrer">
                          Open payment link
                        </a>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </article>
        </>
      )}

      {!attendeeId && !isLoading && !payload && !errorMessage && (
        <article className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          No attendee selected.
        </article>
      )}
    </section>
  )
}
