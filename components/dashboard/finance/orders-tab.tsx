"use client"

import LegacyOrdersPage from "./legacy-orders-surface"

export function FinanceOrdersTab({ slug }: { slug: string }) {
  return <LegacyOrdersPage params={Promise.resolve({ slug })} />
}
