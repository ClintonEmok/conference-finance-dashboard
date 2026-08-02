"use client"

import LegacyPaymentsPage from "./legacy-payments-surface"

export function FinancePaymentsTab({ slug }: { slug: string }) {
  return <LegacyPaymentsPage params={Promise.resolve({ slug })} />
}
