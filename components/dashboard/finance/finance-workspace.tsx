"use client"

import { use, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useQueries } from "convex/react"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { WorkspaceAttentionQueue } from "@/components/dashboard/workspace-attention-queue"
import { FinanceOrdersTab } from "./orders-tab"
import { FinancePaymentsTab } from "./payments-tab"
import { FinanceDonationsTab } from "./donations-tab"
import { FinanceReconciliationTab } from "./reconciliation-tab"
import { financeHref, parseFinanceTab } from "@/lib/dashboard/workspace-routes"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { api } from "@/lib/convex/api"
import {
  buildFinanceAttentionItems,
  type AttentionQueryState,
} from "@/lib/dashboard/workspace-attention"
import { Skeleton } from "@/components/ui/skeleton"

function toQueryState<T>(value: T | Error | undefined): AttentionQueryState<T> {
  if (value instanceof Error) return { status: "error", message: value.message }
  if (value === undefined) return { status: "pending" }
  return { status: "ready", data: value }
}

export function FinanceWorkspace({ slug }: { slug: string }) {
  const event = useEventBySlug(slug)
  const searchParams = useSearchParams()
  const activeTab = parseFinanceTab(searchParams)
  const orderId = searchParams.get("orderId") ?? undefined
  const attentionQueries = useQueries(event ? {
    reconciliation: {
      query: api.orders.getOrdersForReconciliation,
      args: { eventId: event._id },
    },
    unassignedPayments: {
      query: api.payments.getUnassignedPayments,
      args: {},
    },
  } : {})
  const attention = useMemo(() => buildFinanceAttentionItems(
    {
      reconciliation: toQueryState(
        attentionQueries.reconciliation as
          | Array<{ outstandingAmountMinor: number }>
          | Error
          | undefined
      ),
      unassignedPayments: toQueryState(
        attentionQueries.unassignedPayments as Array<unknown> | Error | undefined
      ),
    },
    {
      reconciliation: financeHref(slug, "reconciliation"),
      payments: financeHref(slug, "payments"),
    }
  ), [attentionQueries.reconciliation, attentionQueries.unassignedPayments, slug])
  const tabs = useMemo(() => [
    { value: "orders", label: "Orders", href: financeHref(slug, "orders") },
    { value: "payments", label: "Payments", href: financeHref(slug, "payments") },
    { value: "donations", label: "Donations", href: financeHref(slug, "donations") },
    { value: "reconciliation", label: "Reconciliation", href: financeHref(slug, "reconciliation") },
  ], [slug])

  if (event === undefined) return <Skeleton className="h-96 w-full rounded-xl" />
  if (event === null) return <div className="rounded-xl border p-8 text-center"><h1 className="font-semibold">Event not found</h1><p className="mt-2 text-sm text-muted-foreground">The slug “{slug}” does not exist.</p></div>

  return <WorkspaceFrame
    title="Finance"
    description="Resolve money exceptions in one event-scoped workspace. Canonical ledger values and existing actions remain in their focused operational surfaces."
     eventLabel={event.title}
     workspaceLabel="Finance"
     workspaceId="finance"
     activeTab={activeTab}
     summary={<WorkspaceAttentionQueue {...attention} />}
     tabs={<WorkspaceTabs workspaceId="finance" tabs={tabs} activeTab={activeTab} />}
  >
    {activeTab === "orders" && <FinanceOrdersTab slug={slug} orderId={orderId} />}
    {activeTab === "payments" && <FinancePaymentsTab slug={slug} />}
    {activeTab === "donations" && <FinanceDonationsTab slug={slug} />}
    {activeTab === "reconciliation" && <FinanceReconciliationTab slug={slug} />}
  </WorkspaceFrame>
}
