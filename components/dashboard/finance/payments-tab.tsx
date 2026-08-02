"use client"

import LegacyPaymentsPage from "@/app/dashboard/events/[slug]/payments/page"

export function FinancePaymentsTab({ slug }: { slug: string }) {
  return <LegacyPaymentsPage params={Promise.resolve({ slug })} />
}
