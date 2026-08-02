"use client"

import { useMemo } from "react"
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
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { api } from "@/lib/convex/api"
import {
  buildFinanceAttentionItems,
  type AttentionQueryState,
} from "@/lib/dashboard/workspace-attention"
import type { Doc } from "@/convex/_generated/dataModel"
import type { ReconciliationOrderRow } from "./legacy-reconciliation-surface"

function toQueryState<T>(value: T | Error | undefined): AttentionQueryState<T> {
  if (value instanceof Error) return { status: "error", message: value.message }
  if (value === undefined) return { status: "pending" }
  return { status: "ready", data: value }
}

export function FinanceWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const searchParams = useSearchParams()
  const activeTab = parseFinanceTab(searchParams)
  const orderId = searchParams.get("orderId") ?? undefined
  const attentionQueries = useQueries({
    reconciliation: {
      query: api.orders.getOrdersForReconciliation,
      args: { eventId: event._id },
    },
    unassignedPayments: {
      query: api.payments.getUnassignedPayments,
      args: {},
    },
  })
  const reconciliationState = toQueryState(
    attentionQueries.reconciliation as
      | ReadonlyArray<ReconciliationOrderRow>
      | Error
      | undefined
  )
  const unassignedPaymentsState = toQueryState(
    attentionQueries.unassignedPayments as
      | ReadonlyArray<Doc<"payments">>
      | Error
      | undefined
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
    description="Resolve money exceptions in one event-scoped workspace. Canonical ledger values and existing actions remain in their focused operational surfaces."
     eventLabel={event.title}
     workspaceLabel="Finance"
     workspaceId="finance"
     activeTab={activeTab}
     summary={<WorkspaceAttentionQueue {...attention} />}
     tabs={<WorkspaceTabs workspaceId="finance" tabs={tabs} activeTab={activeTab} />}
  >
     {activeTab === "orders" && <FinanceOrdersTab slug={slug} event={event} orderId={orderId} />}
     {activeTab === "payments" && <FinancePaymentsTab slug={slug} event={event} unassignedPayments={unassignedPaymentsState} />}
     {activeTab === "donations" && <FinanceDonationsTab slug={slug} event={event} />}
     {activeTab === "reconciliation" && <FinanceReconciliationTab slug={slug} event={event} reconciliation={reconciliationState} unassignedPayments={unassignedPaymentsState} />}
  </WorkspaceFrame>
}
