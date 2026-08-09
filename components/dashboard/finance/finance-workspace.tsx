"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "convex/react"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { WorkspaceAttentionQueue } from "@/components/dashboard/workspace-attention-queue"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FinanceOrdersTab } from "./orders-tab"
import { FinancePaymentsTab } from "./payments-tab"
import { FinanceDonationsTab } from "./donations-tab"
import { FinanceReconciliationTab } from "./reconciliation-tab"
import { financeHref, parseFinanceTab } from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { api } from "@/lib/convex/api"
import {
  buildFinanceAttentionItems,
  type AttentionQueryState,
} from "@/lib/dashboard/workspace-attention"
import { deriveBalanceAmounts } from "@/lib/domain/finance/amounts"
import { formatMoney } from "@/lib/format"
import type { Doc } from "@/convex/_generated/dataModel"
import type { ReconciliationOrderRow } from "./legacy-reconciliation-surface"

function toQueryState<T>(value: T | Error | undefined): AttentionQueryState<T> {
  if (value instanceof Error) return { status: "error", message: value.message }
  if (value === undefined) return { status: "pending" }
  return { status: "ready", data: value }
}

function FinanceSummaryCards({
  reconciliation,
  payments,
}: {
  reconciliation: AttentionQueryState<ReadonlyArray<ReconciliationOrderRow>>
  payments: AttentionQueryState<ReadonlyArray<Doc<"payments">>>
}) {
  const isLoading = reconciliation.status === "pending" || payments.status === "pending"
  const hasError = reconciliation.status === "error" || payments.status === "error"
  const summary = !isLoading && !hasError && reconciliation.status === "ready" && payments.status === "ready"
    ? reconciliation.data.reduce(
        (totals, row) => {
          const balance = deriveBalanceAmounts(row.amountDueMinor, row.matchedAmountMinor)
          return {
            orderValueMinor: totals.orderValueMinor + balance.amountDueMinor,
            paidMinor: totals.paidMinor + balance.appliedAmountMinor,
            donationsMinor: totals.donationsMinor + balance.donationAmountMinor,
            outstandingMinor: totals.outstandingMinor + balance.outstandingAmountMinor,
            orderCount: totals.orderCount + 1,
            pendingCount: totals.pendingCount + (row.normalizedStatus === "pending" ? 1 : 0),
            outstandingOrderCount: totals.outstandingOrderCount + (balance.outstandingAmountMinor > 0 ? 1 : 0),
          }
        },
        {
          orderValueMinor: 0,
          paidMinor: 0,
          donationsMinor: 0,
          outstandingMinor: 0,
          orderCount: 0,
          pendingCount: 0,
          outstandingOrderCount: 0,
        }
      )
    : null

  if (summary && payments.status === "ready") {
    summary.donationsMinor += payments.data.reduce(
      (total, payment) =>
        total + (payment.status === "donation" && payment.donationKind === "standalone" ? payment.amountMinor : 0),
      0
    )
  }

  const value = (amount: number) => summary ? formatMoney(amount) : hasError ? "Unavailable" : "Loading…"
  const count = (amount: number, label: string) => summary ? `${amount} ${label}` : hasError ? "Unavailable" : "Loading…"
  const cards = [
    { label: "Order value", value: value(summary?.orderValueMinor ?? 0), detail: count(summary?.orderCount ?? 0, "orders") },
    { label: "Paid", value: value(summary?.paidMinor ?? 0), detail: "Applied to orders" },
    { label: "Donations", value: value(summary?.donationsMinor ?? 0), detail: "Overpayments and standalone" },
    { label: "Outstanding", value: value(summary?.outstandingMinor ?? 0), detail: count(summary?.outstandingOrderCount ?? 0, "orders") },
    { label: "Pending", value: summary ? summary.pendingCount.toLocaleString() : hasError ? "Unavailable" : "Loading…", detail: "Awaiting payment" },
  ]

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className="min-w-0 border-border/60 bg-card shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{card.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function FinanceWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const searchParams = useSearchParams()
  const activeTab = parseFinanceTab(searchParams)
  const orderId = searchParams.get("orderId") ?? undefined

  const reconciliationResult = useQuery(
    api.orders.getOrdersForReconciliation,
    { eventId: event._id, limit: 250 }
  )
  const unassignedPaymentsResult = useQuery(api.payments.getUnassignedPayments)
  const eventPaymentsResult = useQuery(api.payments.getPayments, { eventId: event._id })

  const reconciliationState = toQueryState(
    reconciliationResult as
      | ReadonlyArray<ReconciliationOrderRow>
      | Error
      | undefined
  )
  const unassignedPaymentsState = toQueryState(
    unassignedPaymentsResult as
      | ReadonlyArray<Doc<"payments">>
      | Error
      | undefined
  )
  const eventPaymentsState = toQueryState(
    eventPaymentsResult as ReadonlyArray<Doc<"payments">> | Error | undefined
  )
  const attention = useMemo(() => buildFinanceAttentionItems(
    {
      reconciliation: reconciliationState,
      unassignedPayments: unassignedPaymentsState,
    },
    {
      reconciliation: financeHref(slug, "reconciliation"),
      payments: financeHref(slug, "payments"),
    }
  ), [reconciliationState, unassignedPaymentsState, slug])
  const tabs = useMemo(() => [
    { value: "orders", label: "Orders", href: financeHref(slug, "orders") },
    { value: "payments", label: "Payments", href: financeHref(slug, "payments") },
    { value: "donations", label: "Donations", href: financeHref(slug, "donations") },
    { value: "reconciliation", label: "Reconciliation", href: financeHref(slug, "reconciliation") },
  ], [slug])

  return <WorkspaceFrame
    title="Finance"
    description="Resolve money exceptions for this event. Outstanding orders and unmatched payments appear here."
     eventLabel={event.title}
     workspaceLabel="Finance"
     workspaceId="finance"
     activeTab={activeTab}
      summary={
        <div className="space-y-4">
          <FinanceSummaryCards reconciliation={reconciliationState} payments={eventPaymentsState} />
          <WorkspaceAttentionQueue {...attention} />
        </div>
      }
     tabs={<WorkspaceTabs workspaceId="finance" tabs={tabs} activeTab={activeTab} />}
  >
     {activeTab === "orders" && <FinanceOrdersTab slug={slug} event={event} orderId={orderId} />}
     {activeTab === "payments" && <FinancePaymentsTab slug={slug} event={event} unassignedPayments={unassignedPaymentsState} />}
     {activeTab === "donations" && <FinanceDonationsTab slug={slug} event={event} />}
     {activeTab === "reconciliation" && <FinanceReconciliationTab slug={slug} event={event} reconciliation={reconciliationState} unassignedPayments={unassignedPaymentsState} />}
  </WorkspaceFrame>
}
