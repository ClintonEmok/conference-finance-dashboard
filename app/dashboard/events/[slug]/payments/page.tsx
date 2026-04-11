"use client"

import { use } from "react"
import { EventTikkieSection } from "@/components/dashboard/event-tikkie-section"
import { useEventBySlug } from "@/lib/convex/hooks/events"

export default function EventPaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  
  if (!event) return null

  return (
    <div className="space-y-6">
      <EventTikkieSection
        events={[{ eventId: event._id, title: event.title }]}
        selectedEventId={event._id}
      />
    </div>
  )
}
