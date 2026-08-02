"use client"

import LegacyOrdersPage from "@/app/dashboard/events/[slug]/orders/page"

export function FinanceOrdersTab({ slug }: { slug: string }) {
  return <LegacyOrdersPage params={Promise.resolve({ slug })} />
}
