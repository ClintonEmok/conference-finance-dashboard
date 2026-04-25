"use client"

import { useEffect, useMemo } from "react"
import { useQuery } from "convex/react"
import { useRouter, useSearchParams } from "next/navigation"

import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/convex/api"
import { useEventsForLedger } from "@/lib/convex/hooks/events"

function RedirectTarget() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = searchParams.get("eventId")?.trim() || ""
  const eventById = useQuery(
    api.events.getEventById,
    eventId ? { eventId } : ("skip" as const)
  )
  const events = useEventsForLedger() ?? []

  const targetHref = useMemo(() => {
    const event = eventById ?? events[0] ?? null
    if (!event) return null

    const params = new URLSearchParams(searchParams.toString())
    params.delete("eventId")
    const query = params.toString()

    return `/dashboard/events/${event.slug}/orders${query ? `?${query}` : ""}`
  }, [eventById, events, searchParams])

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

export default function ManageOrdersBridgePage() {
  return <RedirectTarget />
}
