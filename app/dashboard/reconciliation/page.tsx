"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"

import { Skeleton } from "@/components/ui/skeleton"
import { useEventsForLedger } from "@/lib/convex/hooks/events"

export default function ReconciliationBridgePage() {
  const router = useRouter()
  const events = useEventsForLedger() ?? []
  const firstEvent = events[0] ?? null

  const targetHref = useMemo(() => {
    if (!firstEvent) return null
    return `/dashboard/events/${firstEvent.slug}/reconciliation`
  }, [firstEvent])

  useEffect(() => {
    if (targetHref) {
      router.replace(targetHref)
    }
  }, [router, targetHref])

  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  )
}
