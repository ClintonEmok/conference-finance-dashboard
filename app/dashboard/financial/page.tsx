"use client"

import Link from "next/link"
import { ArrowRight, FileOutput, HandCoins, ReceiptText, WalletCards } from "lucide-react"
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
          fetch(`/api/dashboard/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
          fetch(`/api/dashboard/reconciliation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
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
        detail: revenue ? `${revenue.statusCounts.paid} paid orders` : "Loading",
      },
      {
        label: "Net collected",
        value: revenue ? formatMoney(revenue.totals.netMinor) : "--",
        detail: revenue ? `${revenue.statusCounts.refunded} refunded` : "Loading",
      },
      {
        label: "Outstanding",
        value: balances ? formatMoney(balances.totals.outstandingMinor) : "--",
        detail: balances ? `${balances.totals.rows} rows need follow-up` : "Loading",
      },
      {
        label: "Pending orders",
        value: revenue ? revenue.statusCounts.pending.toLocaleString() : "--",
        detail: "Current collections queue",
      },
    ],
    [balances, revenue],
  )

  return (
    <section className="space-y-8">
      <section className="rounded-[1.75rem] border border-[#d7e6ff] bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#2c5da8]">Financial workspace</p>
            <h2 className="text-4xl font-semibold tracking-tight text-slate-950">Keep revenue, ledger, and balance follow-up in one place.</h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              This route gives operators a clear starting point for finance work before they jump into
              detailed order review or attendee follow-up.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-[#0d5ea8] px-5 text-white hover:bg-[#0a4f8d]">
              <Link href="/dashboard/orders">Open ledger</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-[#c9daf5] bg-white/80 px-5 text-[#0d5ea8]">
              <Link href="/dashboard/reconciliation">Review outstanding</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article key={card.label} className="rounded-[1.4rem] border border-white bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {errorMessage && <article className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</article>}

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <article className="rounded-[1.5rem] border border-white bg-white/92 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Daily finance loop</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Choose the next financial action</h3>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Link href="/dashboard/orders" className="rounded-[1.25rem] border border-[#d7e6ff] bg-[#f8fbff] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(13,94,168,0.12)]">
              <ReceiptText className="size-5 text-[#0d5ea8]" />
              <p className="mt-3 text-lg font-semibold text-slate-950">Ledger</p>
              <p className="mt-1 text-sm text-slate-600">Review transaction rows, statuses, and exports.</p>
            </Link>
            <Link href="/dashboard/reconciliation" className="rounded-[1.25rem] border border-[#d7e6ff] bg-[#f8fbff] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(13,94,168,0.12)]">
              <HandCoins className="size-5 text-[#0d5ea8]" />
              <p className="mt-3 text-lg font-semibold text-slate-950">Outstanding balances</p>
              <p className="mt-1 text-sm text-slate-600">Work the collection queue and push into attendee follow-up.</p>
            </Link>
            <Link href="/dashboard/orders" className="rounded-[1.25rem] border border-[#d7e6ff] bg-[#f8fbff] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(13,94,168,0.12)]">
              <FileOutput className="size-5 text-[#0d5ea8]" />
              <p className="mt-3 text-lg font-semibold text-slate-950">Export</p>
              <p className="mt-1 text-sm text-slate-600">Jump into the ledger and export the exact filtered scope you need.</p>
            </Link>
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-white bg-white/92 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[#e9f2ff] text-[#0d5ea8]">
              <WalletCards className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Collections queue</p>
              <h3 className="text-xl font-semibold text-slate-950">Priority rows</h3>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {isLoading && <p className="text-sm text-slate-500">Loading finance summary...</p>}
            {!isLoading && balances && balances.rows.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No outstanding rows in the current 30-day snapshot.</p>
            )}
            {!isLoading &&
              balances?.rows.slice(0, 5).map((row) => (
                <div key={row.providerOrderId} className="rounded-[1.1rem] border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{row.eventName ?? row.providerOrderId}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{row.normalizedStatus}</p>
                    </div>
                    <p className="text-sm font-semibold text-[#0d5ea8]">{formatMoney(row.outstandingMinor)}</p>
                  </div>
                </div>
              ))}
          </div>

          <Button asChild variant="ghost" className="mt-5 px-0 text-[#0d5ea8] hover:bg-transparent hover:text-[#0a4f8d]">
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
