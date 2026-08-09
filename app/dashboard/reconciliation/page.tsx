"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
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
    <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
      <h1 className="text-2xl font-bold">No events yet</h1>
      <p className="mt-2 text-muted-foreground">
        Create an event before using reconciliation.
      </p>
      <Button asChild className="mt-6 rounded-xl">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  )
}
