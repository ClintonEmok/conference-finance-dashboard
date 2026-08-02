"use client"

import LegacyPaymentsPage from "./legacy-payments-surface"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import type { Doc } from "@/convex/_generated/dataModel"

export function FinancePaymentsTab({
  slug,
  event,
  unassignedPayments,
}: {
  slug: string
  event: EventDashboardEvent
  unassignedPayments: AttentionQueryState<ReadonlyArray<Doc<"payments">>>
}) {
  return <LegacyPaymentsPage params={Promise.resolve({ slug })} event={event} unassignedPayments={unassignedPayments} />
}
