"use client"

import LegacyReconciliationPage from "./legacy-reconciliation-surface"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import type { Doc } from "@/convex/_generated/dataModel"
import type { ReconciliationOrderRow } from "./legacy-reconciliation-surface"

export function FinanceReconciliationTab({
  slug,
  event,
  reconciliation,
  unassignedPayments,
}: {
  slug: string
  event: EventDashboardEvent
  reconciliation: AttentionQueryState<ReadonlyArray<ReconciliationOrderRow>>
  unassignedPayments: AttentionQueryState<ReadonlyArray<Doc<"payments">>>
}) {
  return <LegacyReconciliationPage params={Promise.resolve({ slug })} event={event} reconciliation={reconciliation} unassignedPayments={unassignedPayments} />
}
