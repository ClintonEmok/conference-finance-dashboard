"use client"

import LegacyOrdersPage from "./legacy-orders-surface"
import LegacyOrderDetailPage from "./legacy-order-detail-surface"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"

export function FinanceOrdersTab({ slug, event, orderId }: { slug: string; event: EventDashboardEvent; orderId?: string }) {
  if (orderId) return <LegacyOrderDetailPage slug={slug} orderId={orderId} event={event} />
  return <LegacyOrdersPage slug={slug} event={event} />
}
