"use client"

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <DashboardErrorState error={error} reset={reset} />
}
