"use client"

import LegacyAccommodationPage from "./legacy-hotels-surface"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"

export function AccommodationHotelsTab({ slug, event }: { slug: string; event: EventDashboardEvent }) {
  return <LegacyAccommodationPage params={Promise.resolve({ slug })} event={event} />
}
