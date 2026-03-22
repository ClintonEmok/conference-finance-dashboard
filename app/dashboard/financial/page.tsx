"use client"

import Link from "next/link"
import {
  ArrowRight,
  FileOutput,
  HandCoins,
  ReceiptText,
  WalletCards,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type RevenueResponse = {
  totals: {
    grossMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
  }
  statusCounts: {
    paid: number
    refunded: number
    cancelled: number
    pending: number
  }
}

type BalanceResponse = {
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: Array<{
    providerOrderId: string
    eventName: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    totalAmountMinor: number
    outstandingMinor: number
  }>
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

export default function FinancialPage() {
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null)
  const [balances, setBalances] = useState<BalanceResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const to = new Date().toISOString()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 30)
    const from = fromDate.toISOString()

    async function load() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const [revenueResponse, balancesResponse] = await Promise.all([
          fetch(
            `/api/dashboard/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
          ),
          fetch(
            `/api/dashboard/reconciliation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
          ),
        ])

        if (!revenueResponse.ok || !balancesResponse.ok) {
          setErrorMessage("Unable to load the financial workspace right now.")
          return
        }

        setRevenue((await revenueResponse.json()) as RevenueResponse)
        setBalances((await balancesResponse.json()) as BalanceResponse)
      } catch {
        setErrorMessage("Network error while loading the financial workspace.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  const cards = useMemo(
    () => [
      {
        label: "Total revenue",
        value: revenue ? formatMoney(revenue.totals.grossMinor) : "--",
        detail: revenue
          ? `${revenue.statusCounts.paid} paid orders`
          : "Loading",
      },
      {
        label: "Net collected",
        value: revenue ? formatMoney(revenue.totals.netMinor) : "--",
        detail: revenue
          ? `${revenue.statusCounts.refunded} refunded`
          : "Loading",
      },
      {
        label: "Outstanding",
        value: balances ? formatMoney(balances.totals.outstandingMinor) : "--",
        detail: balances
          ? `${balances.totals.rows} rows need follow-up`
          : "Loading",
      },
      {
        label: "Pending orders",
        value: revenue ? revenue.statusCounts.pending.toLocaleString() : "--",
        detail: "Current collections queue",
      },
    ],
    [balances, revenue]
  )

  return (
    <section className="space-y-8">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold tracking-[0.28em] text-primary uppercase">
              Financial workspace
            </p>
            <h2 className="text-4xl font-semibold tracking-tight text-foreground">
              Keep revenue, ledger, and balance follow-up in one place.
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              This route gives operators a clear starting point for finance work
              before they jump into detailed order review or attendee follow-up.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/orders">Open ledger</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/reconciliation">Review outstanding</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.label}
              className="rounded-lg border border-border bg-muted/40 p-5"
            >
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                {card.label}
              </p>
              <p className="mt-3 text-3xl font-semibold text-foreground">
                {card.value}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {card.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      {errorMessage && (
        <article className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </article>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <article className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Daily finance loop
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">
                Choose the next financial action
              </h3>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Link
              href="/dashboard/orders"
              className="rounded-lg border border-border bg-muted/40 p-4 transition hover:-translate-y-0.5 hover:bg-muted/60"
            >
              <ReceiptText className="size-5 text-primary" />
              <p className="mt-3 text-lg font-semibold text-foreground">
                Ledger
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Review transaction rows, statuses, and exports.
              </p>
            </Link>
            <Link
              href="/dashboard/reconciliation"
              className="rounded-lg border border-border bg-muted/40 p-4 transition hover:-translate-y-0.5 hover:bg-muted/60"
            >
              <HandCoins className="size-5 text-primary" />
              <p className="mt-3 text-lg font-semibold text-foreground">
                Outstanding balances
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Work the collection queue and push into attendee follow-up.
              </p>
            </Link>
            <Link
              href="/dashboard/orders"
              className="rounded-lg border border-border bg-muted/40 p-4 transition hover:-translate-y-0.5 hover:bg-muted/60"
            >
              <FileOutput className="size-5 text-primary" />
              <p className="mt-3 text-lg font-semibold text-foreground">
                Export
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Jump into the ledger and export the exact filtered scope you
                need.
              </p>
            </Link>
          </div>
        </article>

        <article className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-primary">
              <WalletCards className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Collections queue
              </p>
              <h3 className="text-xl font-semibold text-foreground">
                Priority rows
              </h3>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {isLoading && (
              <p className="text-sm text-muted-foreground">
                Loading finance summary...
              </p>
            )}
            {!isLoading && balances && balances.rows.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                No outstanding rows in the current 30-day snapshot.
              </p>
            )}
            {!isLoading &&
              balances?.rows.slice(0, 5).map((row) => (
                <div
                  key={row.providerOrderId}
                  className="rounded-lg border border-border bg-muted/40 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {row.eventName ?? row.providerOrderId}
                      </p>
                      <p className="mt-1 text-xs tracking-[0.18em] text-muted-foreground uppercase">
                        {row.normalizedStatus}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-primary">
                      {formatMoney(row.outstandingMinor)}
                    </p>
                  </div>
                </div>
              ))}
          </div>

          <Button
            asChild
            variant="ghost"
            className="mt-5 px-0 text-primary hover:bg-transparent hover:text-primary/80"
          >
            <Link href="/dashboard/reconciliation">
              Open the full outstanding balances board
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </article>
      </section>
    </section>
  )
}
