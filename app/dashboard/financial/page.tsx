"use client"

import Link from "next/link"
import {
  ArrowRight,
  FileOutput,
  HandCoins,
  ReceiptText,
  Sparkles,
  WalletCards,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"

import { Button } from "@/components/ui/button"
import { EventTikkieSection } from "@/components/dashboard/event-tikkie-section"

type RevenueResponse = {
  totals: {
    orderValueMinor: number
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
  availableEvents: Array<{
    eventId: string
    title: string | null
  }>
  rows: Array<{
    eventName: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    totalAmountMinor: number
    outstandingMinor: number
  }>
}

import { formatMoney } from "@/lib/format"

function FinancialSkeleton() {
  return (
    <div className="animate-in space-y-8 duration-500 fade-in">
      <div className="rounded-2xl border border-border/50 bg-card/30 p-8 backdrop-blur-xl">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <Skeleton className="h-10 w-full max-w-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    </div>
  )
}

export default function FinancialPage() {
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null)
  const [balances, setBalances] = useState<BalanceResponse | null>(null)
  const [events, setEvents] = useState<
    Array<{ eventId: string; title: string | null }>
  >([])
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
        const balancesData = (await balancesResponse.json()) as BalanceResponse
        setBalances(balancesData)
        setEvents(balancesData.availableEvents ?? [])
      } catch {
        setErrorMessage("Network error while loading the financial workspace.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  if (isLoading) return <FinancialSkeleton />

  return (
    <section className="animate-in space-y-8 duration-700 fade-in slide-in-from-bottom-2">
      <header className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-xl">
        <div className="pointer-events-none absolute top-0 right-0 p-8 opacity-10">
          <WalletCards className="size-48 rotate-12" />
        </div>

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <h2 className="text-4xl font-bold tracking-tight text-foreground lg:text-5xl">
              Ledger, Revenue & <br className="hidden lg:block" />
              <span className="text-primary">Balance follow-up.</span>
            </h2>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="h-11 rounded-xl px-6 shadow-lg shadow-primary/20"
            >
              <Link href="/dashboard/orders">Open ledger</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl bg-background/50 px-6 backdrop-blur"
            >
              <Link href="/dashboard/reconciliation">Review outstanding</Link>
            </Button>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Order value",
              value: revenue
                ? formatMoney(revenue.totals.orderValueMinor)
                : "--",
              sub: revenue
                ? `${revenue.statusCounts.paid} paid orders`
                : "Calculated from order selections",
              trend: "up",
            },
            {
              label: "Net collected",
              value: revenue ? formatMoney(revenue.totals.netMinor) : "--",
              sub: revenue
                ? `${revenue.statusCounts.refunded} refunded`
                : "Final liquidity",
              trend: "stable",
            },
            {
              label: "Outstanding",
              value: balances
                ? formatMoney(balances.totals.outstandingMinor)
                : "--",
              sub: balances
                ? `${balances.totals.rows} rows pending`
                : "Reconciliation required",
              trend: "down",
              isWarning: balances && balances.totals.outstandingMinor > 0,
            },
            {
              label: "Pending",
              value: revenue
                ? revenue.statusCounts.pending.toLocaleString()
                : "--",
              sub: "Processing queue",
              trend: "none",
            },
          ].map((card) => (
            <article
              key={card.label}
              className={`group overflow-hidden rounded-2xl border transition-all hover:scale-[1.02] ${card.isWarning
                  ? "border-orange-500/20 bg-orange-500/5 shadow-[0_8px_30px_rgb(249,115,22,0.08)]"
                  : "border-[rgba(113,84,255,0.3)] bg-[linear-gradient(145deg,rgba(113,84,255,0.05),rgba(113,84,255,0.02))] shadow-sm"
                } p-6`}
            >
              <div className="flex items-center justify-between">
                <p
                  className={`text-[10px] font-bold tracking-[0.2em] uppercase ${card.isWarning ? "text-orange-600/70" : "text-primary/70"}`}
                >
                  {card.label}
                </p>
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-foreground">
                {card.value}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${card.isWarning ? "bg-orange-500" : "bg-primary"}`}
                />
                {card.sub}
              </p>
            </article>
          ))}
        </div>
      </header>

      {errorMessage && (
        <article className="animate-in rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-4 text-sm font-medium text-destructive slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="size-2 animate-pulse rounded-full bg-destructive" />
            {errorMessage}
          </div>
        </article>
      )}


      <article className="rounded-3xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-xl">
        <div className="mb-8">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Quick Actions
          </p>
          <h3 className="mt-2 text-2xl font-bold text-foreground">
            Execute financial workflows
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              href: "/dashboard/orders",
              icon: ReceiptText,
              title: "Ledger",
              desc: "Review logs & exports.",
            },
            {
              href: "/dashboard/reconciliation",
              icon: HandCoins,
              title: "Collections",
              desc: "Reconcile balances.",
            },
            {
              href: "/dashboard/orders",
              icon: FileOutput,
              title: "Bank Export",
              desc: "Generate exports.",
            },
          ].map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="group relative rounded-2xl border border-border/40 bg-background/50 p-6 transition-all hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                <action.icon className="size-5" />
              </div>
              <h4 className="mt-4 font-bold text-foreground">{action.title}</h4>
              <p className="mt-2 text-xs leading-relaxed font-medium text-muted-foreground">
                {action.desc}
              </p>
            </Link>
          ))}
        </div>
      </article>
    </section>
  )
}
