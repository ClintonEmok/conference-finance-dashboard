"use client"

import { use } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EventTikkieSection } from "@/components/dashboard/event-tikkie-section"
import { EventFinanceAssignmentSection } from "@/components/dashboard/event-finance-assignment-section"
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
      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <CardTitle>Finance</CardTitle>
          <CardDescription>
            Tikkie configuration, payment status, and manual matching.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use this page to manage event payment links and match incoming
          payments to orders.
        </CardContent>
      </Card>

      <EventTikkieSection
        events={[{ eventId: event._id, title: event.title }]}
        selectedEventId={event._id}
      />

      <EventFinanceAssignmentSection
        eventId={event._id}
        eventTitle={event.title}
      />
    </div>
  )
}
