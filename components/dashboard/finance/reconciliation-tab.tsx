"use client"

import LegacyReconciliationPage from "@/app/dashboard/events/[slug]/reconciliation/page"

export function FinanceReconciliationTab({ slug }: { slug: string }) {
  return <LegacyReconciliationPage params={Promise.resolve({ slug })} />
}
