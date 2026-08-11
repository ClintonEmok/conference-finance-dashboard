"use client"

import { use, useEffect, useMemo } from "react"
import { useQuery } from "convex/react"
import { useRouter, useSearchParams } from "next/navigation"

import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/convex/api"
import { useEventsForLedger } from "@/lib/convex/hooks/events"
import { ordersHref } from "@/lib/dashboard/workspace-routes"

type PageProps = {
  params: Promise<{ orderId: string }>
}

function RedirectTarget({ orderId }: { orderId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventIdFromQuery = searchParams.get("eventId")?.trim() || ""

  const order = useQuery(
    api.orders.getOrderWithAttendees,
    orderId ? { orderId: orderId as any } : ("skip" as const)
  )
  const eventById = useQuery(
    api.events.getEventById,
    eventIdFromQuery ? { eventId: eventIdFromQuery } : ("skip" as const)
  )
  const events = useEventsForLedger() ?? []

  const targetHref = useMemo(() => {
    const resolvedEventId = eventById?._id ?? order?.order.eventId ?? null
    const event =
      (resolvedEventId
        ? events.find((candidate) => candidate.eventId === String(resolvedEventId))
        : null) ?? eventById ?? events[0] ?? null

    if (!event) return null

    return ordersHref(event.slug, { orderId })
  }, [eventById, events, order?.order.eventId, orderId])

  useEffect(() => {
    if (targetHref) {
      router.replace(targetHref)
    }
  }, [router, targetHref])

  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  )
}

export default function ManageOrderBridgePage({ params }: PageProps) {
  const { orderId } = use(params)
  return <RedirectTarget orderId={orderId} />
}
