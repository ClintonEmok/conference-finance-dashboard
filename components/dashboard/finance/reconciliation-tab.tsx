"use client"

import LegacyReconciliationPage from "./legacy-reconciliation-surface"

export function FinanceReconciliationTab({ slug }: { slug: string }) {
  return <LegacyReconciliationPage params={Promise.resolve({ slug })} />
}
