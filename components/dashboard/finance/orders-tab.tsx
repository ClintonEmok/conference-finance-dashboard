"use client"

import LegacyOrdersPage from "./legacy-orders-surface"
import LegacyOrderDetailPage from "./legacy-order-detail-surface"

export function FinanceOrdersTab({ slug, orderId }: { slug: string; orderId?: string }) {
  if (orderId) return <LegacyOrderDetailPage params={Promise.resolve({ slug, orderId })} />
  return <LegacyOrdersPage params={Promise.resolve({ slug })} />
}
